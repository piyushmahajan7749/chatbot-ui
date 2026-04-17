import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import {
  PHASE_ORDER,
  runSimulation,
  type DesignContentV2,
  type GeneratedDesign,
  type Hypothesis,
  type Paper,
  type PhaseKey,
  type ProblemContext,
  type StoredLiteratureContext
} from "@/lib/design-agent"
import { callLiteratureScoutAgent } from "@/app/api/design/draft/agents"
import { runTasksWithConcurrency } from "@/app/api/design/draft/worker"
import type { ExperimentDesignState } from "@/app/api/design/draft/types"
import type { AgentTask } from "@/app/api/design/draft/types/interfaces"

const FINAL_TOP_N = 5

/** Internal hypothesis representation with scores for the pipeline. */
interface RankedHypothesis {
  id: string
  text: string
  explanation: string
  rank: number
  feasibility: number
  novelty: number
}

type Phase = "literature" | "hypotheses" | "design" | "simulation"

const GENERATION_AGENT_COUNT = 5
const GENERATION_CONCURRENCY = 4

interface Body {
  phase: Phase
  problem?: ProblemContext
  papers?: Paper[]
  hypotheses?: Hypothesis[]
  designId?: string
  approvedPhases?: PhaseKey[]
}

/**
 * Agentic generation endpoint. Each phase calls the real AI agents and
 * clears all downstream data to keep the pipeline consistent.
 */
export async function POST(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const designId = params.designid
    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json({ error: "Invalid design ID" }, { status: 400 })
    }

    const body = (await request.json()) as Body
    if (!body?.phase) {
      return NextResponse.json({ error: "Missing phase" }, { status: 400 })
    }

    const docRef = adminDb.collection("designs").doc(designId)
    const doc = await docRef.get()
    if (!doc.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    const design = doc.data() as any
    if (design?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const existing = parseContent(design.content) ?? { schemaVersion: 2 }
    const ctx: ProblemContext = body.problem ?? existing.problem ?? {}

    let patch: Partial<DesignContentV2> = {}

    const clearDownstream = (
      currentPhase: PhaseKey
    ): Partial<DesignContentV2> => {
      const idx = PHASE_ORDER.indexOf(currentPhase)
      const downstream = PHASE_ORDER.slice(idx + 1)
      const clear: Partial<DesignContentV2> = {}
      for (const phase of downstream) {
        if (phase === "literature") {
          clear.papers = undefined
          clear.literatureContext = undefined
        }
        if (phase === "hypotheses") clear.hypotheses = undefined
        if (phase === "design") clear.designs = undefined
      }
      return clear
    }

    // Build ExperimentDesignState from ProblemContext for the real agents
    const toAgentState = (
      litCtx?: StoredLiteratureContext
    ): ExperimentDesignState => ({
      problem:
        [ctx.title, ctx.problemStatement].filter(Boolean).join(" — ") ||
        "Untitled",
      objectives: ctx.goal ? [ctx.goal] : [],
      variables: ctx.variables ?? [],
      specialConsiderations: ctx.constraints ?? [],
      ...(litCtx
        ? {
            literatureScoutOutput: {
              ...litCtx,
              citationsDetailed: []
            }
          }
        : {})
    })

    switch (body.phase) {
      // ── Literature: real Literature Scout agent ─────────────────────
      case "literature": {
        console.log("[GENERATE] Running real Literature Scout agent...")
        const agentState = toAgentState()
        const result = await callLiteratureScoutAgent(agentState)
        const litOutput = result.output

        // Convert detailed citations to Paper[] for the frontend
        const papers: Paper[] = (litOutput.citationsDetailed ?? []).map(
          (c, i) => ({
            id: `lit-${i}-${Date.now()}`,
            title: c.title || `Paper ${i + 1}`,
            summary: [
              c.source ? `Source: ${c.source}` : null,
              c.journal ? `Journal: ${c.journal}` : null,
              c.year ? `Year: ${c.year}` : null,
              c.authors?.length ? `Authors: ${c.authors.join(", ")}` : null
            ]
              .filter(Boolean)
              .join(" | "),
            sourceUrl: c.url || undefined,
            userAdded: false,
            selected: false
          })
        )

        // If no detailed citations, create papers from the string citations
        if (papers.length === 0 && litOutput.citations.length > 0) {
          litOutput.citations.forEach((cite, i) => {
            papers.push({
              id: `lit-${i}-${Date.now()}`,
              title: cite,
              summary: "Citation from literature search",
              userAdded: false,
              selected: false
            })
          })
        }

        const literatureContext: StoredLiteratureContext = {
          whatOthersHaveDone: litOutput.whatOthersHaveDone,
          goodMethodsAndTools: litOutput.goodMethodsAndTools,
          potentialPitfalls: litOutput.potentialPitfalls,
          citations: litOutput.citations
        }

        const downstreamClear = clearDownstream("literature")
        patch = {
          problem: ctx,
          papers,
          literatureContext,
          ...downstreamClear
        }
        console.log(
          `[GENERATE] Literature Scout done — ${papers.length} papers found`
        )
        break
      }

      // ── Hypotheses: full pipeline (generate → rank → reflect → evolve → top 5) ──
      case "hypotheses": {
        const litCtx = existing.literatureContext
        const planMeta = {
          title: ctx.title || "Untitled",
          description: ctx.problemStatement || ctx.goal || "",
          constraints: {
            variables: ctx.variables,
            constraints: ctx.constraints
          }
        }

        // ── Step 1: Generate 20 hypotheses (5 agents x 4 each) ──────
        // Include the user's selected papers so hypotheses are grounded in them
        const selectedPapers = (body.papers ?? existing.papers ?? []).filter(
          p => p.selected
        )
        console.log(
          `[GENERATE] Step 1/5: Running ${GENERATION_AGENT_COUNT} generation agents (${selectedPapers.length} selected papers as context)...`
        )
        const genTasks: AgentTask[] = []
        for (let i = 0; i < GENERATION_AGENT_COUNT; i++) {
          genTasks.push({
            taskId: uuidv4(),
            planId: designId,
            agentType: "GENERATION",
            n_candidates: 4,
            priority: 1,
            metadata: {
              plan: planMeta,
              ...(litCtx ? { literatureContext: litCtx } : {}),
              selectedPapers: selectedPapers.map((p, idx) => ({
                index: idx + 1,
                title: p.title,
                summary: p.summary,
                sourceUrl: p.sourceUrl
              }))
            }
          })
        }

        const genResults = await runTasksWithConcurrency(
          genTasks,
          GENERATION_CONCURRENCY
        )

        const pool: RankedHypothesis[] = []
        for (const r of genResults) {
          if (r.status === "success" && Array.isArray(r.output)) {
            for (const item of r.output) {
              pool.push({
                id: `h-${uuidv4()}`,
                text: item.hypothesis || "",
                explanation: item.explanation || "",
                rank: 0,
                feasibility: item.feasibility_score ?? 0,
                novelty: item.novelty_score ?? 0
              })
            }
          }
        }

        if (pool.length === 0) {
          return NextResponse.json(
            {
              error:
                "No hypotheses generated. Check that Azure OpenAI is configured."
            },
            { status: 502 }
          )
        }
        console.log(`[GENERATE] Generated ${pool.length} hypotheses`)

        // ── Step 2: Batch ranking (single LLM call) ─────────────────
        console.log(
          `[GENERATE] Step 2/5: Batch ranking ${pool.length} hypotheses (1 LLM call)...`
        )

        const batchRankingSchema = z.object({
          ranked: z.array(
            z.object({
              index: z.number(),
              score: z.number().min(0).max(100),
              reasoning: z.string()
            })
          )
        })

        const numberedList = pool
          .map((h, i) => `[${i + 1}] ${h.text}`)
          .join("\n")

        try {
          const openai = getAzureOpenAIForDesign()
          const model = getDesignDeployment()
          const completion = await openai.beta.chat.completions.parse({
            model,
            messages: [
              {
                role: "system",
                content: `You are a scientific hypothesis ranking agent. You will receive a numbered list of hypotheses and must score each one from 0-100 based on:
- Scientific rigor and testability (30%)
- Feasibility and practicality (25%)
- Novelty and potential impact (25%)
- Clarity and specificity (20%)

Return every hypothesis with its original index number, a score, and a one-sentence reasoning.`
              },
              {
                role: "user",
                content: `Rank these ${pool.length} hypotheses:\n\n${numberedList}`
              }
            ],
            temperature: 0.3,
            response_format: zodResponseFormat(
              batchRankingSchema,
              "batchRanking"
            )
          })

          const parsed = completion.choices[0]?.message?.parsed
          if (parsed?.ranked) {
            for (const entry of parsed.ranked) {
              const idx = entry.index - 1
              if (idx >= 0 && idx < pool.length) {
                pool[idx].rank = entry.score
              }
            }
          }
        } catch (rankErr: any) {
          console.warn(
            `[GENERATE] Batch ranking failed, falling back to feasibility+novelty scores: ${rankErr?.message}`
          )
          // Fallback: use generation scores
          for (const h of pool) {
            h.rank = Math.round((h.feasibility + h.novelty) * 50)
          }
        }

        pool.sort((a, b) => b.rank - a.rank)
        const topHypotheses = pool.slice(0, FINAL_TOP_N)
        console.log(
          `[GENERATE] Ranking done — top ${FINAL_TOP_N} selected (scores: ${topHypotheses.map(h => h.rank).join(", ")})`
        )

        // ── Step 3: Reflection (critique top 5) ─────────────────────
        console.log(`[GENERATE] Step 3/5: Reflecting on top ${FINAL_TOP_N}...`)
        const reflectionTasks: AgentTask[] = topHypotheses.map(h => ({
          taskId: uuidv4(),
          planId: designId,
          agentType: "REFLECTION" as const,
          priority: 3,
          metadata: {
            hypothesis: { content: h.text, explanation: h.explanation }
          }
        }))

        const reflectionResults = await runTasksWithConcurrency(
          reflectionTasks,
          GENERATION_CONCURRENCY
        )

        // Enrich reasoning with reflection
        for (let i = 0; i < topHypotheses.length; i++) {
          const ref = reflectionResults[i]
          if (ref?.status === "success" && ref.output) {
            const o = ref.output
            const parts: string[] = [topHypotheses[i].explanation]
            if (o.strengths?.length)
              parts.push(
                `\nStrengths:\n${o.strengths.map((s: string) => `- ${s}`).join("\n")}`
              )
            if (o.weaknesses?.length)
              parts.push(
                `\nWeaknesses:\n${o.weaknesses.map((s: string) => `- ${s}`).join("\n")}`
              )
            if (o.improvements?.length)
              parts.push(
                `\nSuggested improvements:\n${o.improvements.map((s: string) => `- ${s}`).join("\n")}`
              )
            topHypotheses[i].explanation = parts.join("\n")
          }
        }
        console.log(`[GENERATE] Reflection done`)

        // ── Step 4: Evolution (generate improved variants) ───────────
        console.log(
          `[GENERATE] Step 4/5: Evolving top ${FINAL_TOP_N} hypotheses...`
        )
        const evolutionTasks: AgentTask[] = topHypotheses.map(h => ({
          taskId: uuidv4(),
          planId: designId,
          agentType: "EVOLUTION" as const,
          hypothesisId: h.id,
          priority: 4,
          metadata: {
            hypothesis: { content: h.text, explanation: h.explanation }
          }
        }))

        const evoResults = await runTasksWithConcurrency(
          evolutionTasks,
          GENERATION_CONCURRENCY
        )

        // Collect evolved variants and fold the best improvements back into the top 5
        let evolvedCount = 0
        for (let i = 0; i < topHypotheses.length; i++) {
          const evo = evoResults[i]
          if (evo?.status === "success" && evo.output?.variants?.length) {
            // Pick the best variant (first one) and upgrade the hypothesis if it's clearer
            const best = evo.output.variants[0]
            if (best?.hypothesis && best?.improvement_type) {
              topHypotheses[i].text = best.hypothesis
              topHypotheses[i].explanation +=
                `\n\nEvolved (${best.improvement_type}): ${best.explanation || ""}`
            }
            evolvedCount += evo.output.variants.length
          }
        }
        console.log(
          `[GENERATE] Evolution done — ${evolvedCount} variants produced`
        )

        // ── Step 5: Meta-review ──────────────────────────────────────
        console.log(`[GENERATE] Step 5/5: Meta-review...`)
        const metaTask: AgentTask = {
          taskId: uuidv4(),
          planId: designId,
          agentType: "META_REVIEW",
          priority: 5,
          metadata: {
            plan: planMeta,
            topHypotheses: topHypotheses.map(h => ({ content: h.text }))
          }
        }

        // Fire-and-forget style: run but don't block the response on failure
        const [metaResult] = await runTasksWithConcurrency([metaTask], 1)
        if (metaResult?.status === "success" && metaResult.output) {
          console.log(
            `[GENERATE] Meta-review done — ${metaResult.output.prompt_patches?.length ?? 0} patches suggested`
          )
        }

        // ── Build final Hypothesis[] for the frontend ────────────────
        const hypotheses: Hypothesis[] = topHypotheses.map(h => ({
          id: h.id,
          text: h.text,
          reasoning: `Score: ${h.rank}/100 | Feasibility: ${(h.feasibility * 100).toFixed(0)}% | Novelty: ${(h.novelty * 100).toFixed(0)}%\n\n${h.explanation}`,
          basedOnPaperIds: [],
          selected: false
        }))

        const papers = body.papers ?? existing.papers ?? []
        const downstreamClear = clearDownstream("hypotheses")
        patch = {
          problem: ctx,
          papers,
          hypotheses,
          ...downstreamClear
        }
        console.log(
          `[GENERATE] Full hypothesis pipeline done — returning top ${hypotheses.length}`
        )
        break
      }

      // ── Design: 4-phase generation per hypothesis ─────────────────
      case "design": {
        const allHypotheses = body.hypotheses ?? existing.hypotheses ?? []
        const selected = allHypotheses.filter(h => h.selected)
        if (selected.length === 0) {
          return NextResponse.json(
            { error: "No hypotheses selected" },
            { status: 400 }
          )
        }

        console.log(
          `[GENERATE] Running 4-phase design for ${selected.length} hypotheses (${selected.length * 4} LLM calls)...`
        )

        const litCtx = existing.literatureContext
        const openai = getAzureOpenAIForDesign()
        const model = getDesignDeployment()
        const designs: GeneratedDesign[] = []

        // Shared context blocks for all prompts
        const litBlock = litCtx
          ? `\nLiterature context:\n- What others have done: ${litCtx.whatOthersHaveDone}\n- Good methods: ${litCtx.goodMethodsAndTools}\n- Pitfalls: ${litCtx.potentialPitfalls}`
          : ""

        const selectedPapersForDesign = (existing.papers ?? []).filter(
          p => p.selected
        )
        const papersBlock =
          selectedPapersForDesign.length > 0
            ? `\nSelected papers (chosen by the researcher as most relevant):\n${selectedPapersForDesign.map((p, i) => `[${i + 1}] ${p.title}${p.summary ? ` — ${p.summary}` : ""}`).join("\n")}`
            : ""

        // ── Schemas for each sub-phase ──────────────────────────────

        const experimentSetupSchema = z.object({
          whatWillBeTested: z.string(),
          whatWillBeMeasured: z.string(),
          controlGroups: z.string(),
          experimentalGroups: z.string(),
          sampleTypes: z.string(),
          replicatesAndConditions: z.string(),
          specificRequirements: z.string()
        })

        const materialsSchema = z.object({
          toolsNeeded: z.string(),
          materialsList: z.string(),
          materialPreparation: z.string(),
          setupInstructions: z.string(),
          storageDisposal: z.string()
        })

        const protocolSchema = z.object({
          stepByStepProcedure: z.string(),
          timeline: z.string(),
          conditionsTable: z.string()
        })

        const analysisSchema = z.object({
          dataCollectionPlan: z.string(),
          safetyNotes: z.string(),
          rationale: z.string()
        })

        for (const hyp of selected) {
          try {
            const hypBlock = `Hypothesis: ${hyp.text}\nExplanation: ${hyp.reasoning}`
            const problemBlock = `Research problem: ${[ctx.title, ctx.problemStatement].filter(Boolean).join(" — ")}\nGoal: ${ctx.goal || "Not specified"}\nVariables: ${(ctx.variables ?? []).join(", ") || "Not specified"}\nConstraints: ${(ctx.constraints ?? []).join(", ") || "Not specified"}`

            // ── Phase 1: Experimental Setup ────────────────────────
            console.log(
              `[DESIGN 1/4] Experimental setup for: ${hyp.text.slice(0, 50)}...`
            )
            const phase1 = await openai.beta.chat.completions.parse({
              model,
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: `You are an expert experiment design scientist. Design the experimental setup for a biopharma hypothesis. Be specific about what will be tested, measured, which groups are needed, sample types, replication strategy, and any special requirements. Write detailed, lab-ready descriptions.`
                },
                {
                  role: "user",
                  content: `${problemBlock}\n\n${hypBlock}${litBlock}${papersBlock}\n\nDesign the experimental setup. Reference specific methods or findings from the selected papers where relevant.`
                }
              ],
              response_format: zodResponseFormat(
                experimentSetupSchema,
                "experimentSetup"
              )
            })
            const setup = phase1.choices[0]?.message?.parsed
            if (!setup) throw new Error("Empty response from Phase 1")

            // ── Phase 2: Materials & Setup ─────────────────────────
            console.log(
              `[DESIGN 2/4] Materials & setup for: ${hyp.text.slice(0, 50)}...`
            )
            const setupSummary = `Experimental design:\n- Testing: ${setup.whatWillBeTested}\n- Measuring: ${setup.whatWillBeMeasured}\n- Controls: ${setup.controlGroups}\n- Experimental groups: ${setup.experimentalGroups}\n- Samples: ${setup.sampleTypes}\n- Replicates: ${setup.replicatesAndConditions}`

            const phase2 = await openai.beta.chat.completions.parse({
              model,
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: `You are a lab materials and logistics planner. Given an experimental design, specify every tool, material, and preparation step needed. Include complete materials lists with quantities/sources, detailed preparation protocols, setup instructions, and storage/disposal requirements.`
                },
                {
                  role: "user",
                  content: `${problemBlock}\n\n${hypBlock}\n\n${setupSummary}${papersBlock}\n\nSpecify all materials, tools, and setup needed. Reference specific tools or protocols from the selected papers where applicable.`
                }
              ],
              response_format: zodResponseFormat(materialsSchema, "materials")
            })
            const materials = phase2.choices[0]?.message?.parsed
            if (!materials) throw new Error("Empty response from Phase 2")

            // ── Phase 3: Protocol & Timeline ──────────────────────
            console.log(
              `[DESIGN 3/4] Protocol & timeline for: ${hyp.text.slice(0, 50)}...`
            )
            const materialsSummary = `Materials: ${materials.toolsNeeded}\nPreparation: ${materials.materialPreparation}`

            const phase3 = await openai.beta.chat.completions.parse({
              model,
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: `You are an experimental protocol writer. Given the experimental design and materials, write a detailed step-by-step procedure that a lab technician can follow exactly. Include a realistic timeline (day-by-day or phase-by-phase) and a structured conditions table showing all experimental conditions.`
                },
                {
                  role: "user",
                  content: `${problemBlock}\n\n${hypBlock}\n\n${setupSummary}\n\n${materialsSummary}\n\nWrite the step-by-step protocol, timeline, and conditions table.`
                }
              ],
              response_format: zodResponseFormat(protocolSchema, "protocol")
            })
            const protocol = phase3.choices[0]?.message?.parsed
            if (!protocol) throw new Error("Empty response from Phase 3")

            // ── Phase 4: Analysis & Safety ─────────────────────────
            console.log(
              `[DESIGN 4/4] Analysis & safety for: ${hyp.text.slice(0, 50)}...`
            )
            const protocolSummary = `Procedure summary: ${protocol.stepByStepProcedure.slice(0, 500)}...\nTimeline: ${protocol.timeline}`

            const phase4 = await openai.beta.chat.completions.parse({
              model,
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: `You are a data analysis and safety review specialist. Given a complete experimental plan, specify the data collection strategy (what to record, when, how, which statistical tests), safety notes (PPE, chemical handling, biosafety), and a rationale explaining why this overall design is sound and what it will prove.`
                },
                {
                  role: "user",
                  content: `${problemBlock}\n\n${hypBlock}\n\n${setupSummary}\n\n${materialsSummary}\n\n${protocolSummary}\n\nSpecify the data collection plan, safety measures, and rationale.`
                }
              ],
              response_format: zodResponseFormat(analysisSchema, "analysis")
            })
            const analysis = phase4.choices[0]?.message?.parsed
            if (!analysis) throw new Error("Empty response from Phase 4")

            // ── Assemble all 4 phases into sections ───────────────
            designs.push({
              id: `d-${uuidv4()}`,
              hypothesisId: hyp.id,
              title: hyp.text.slice(0, 80),
              sections: [
                {
                  heading: "What Will Be Tested",
                  body: setup.whatWillBeTested
                },
                {
                  heading: "What Will Be Measured",
                  body: setup.whatWillBeMeasured
                },
                { heading: "Control Groups", body: setup.controlGroups },
                {
                  heading: "Experimental Groups",
                  body: setup.experimentalGroups
                },
                { heading: "Sample Types", body: setup.sampleTypes },
                {
                  heading: "Replicates & Conditions",
                  body: setup.replicatesAndConditions
                },
                {
                  heading: "Special Requirements",
                  body: setup.specificRequirements
                },
                {
                  heading: "Tools & Equipment",
                  body: materials.toolsNeeded
                },
                { heading: "Materials List", body: materials.materialsList },
                {
                  heading: "Material Preparation",
                  body: materials.materialPreparation
                },
                {
                  heading: "Setup Instructions",
                  body: materials.setupInstructions
                },
                {
                  heading: "Storage & Disposal",
                  body: materials.storageDisposal
                },
                {
                  heading: "Step-by-Step Procedure",
                  body: protocol.stepByStepProcedure
                },
                { heading: "Timeline", body: protocol.timeline },
                {
                  heading: "Conditions Table",
                  body: protocol.conditionsTable
                },
                {
                  heading: "Data Collection Plan",
                  body: analysis.dataCollectionPlan
                },
                { heading: "Safety Notes", body: analysis.safetyNotes },
                { heading: "Rationale", body: analysis.rationale }
              ],
              saved: false
            })
            console.log(
              `[GENERATE] Design complete for: ${hyp.text.slice(0, 50)}...`
            )
          } catch (err: any) {
            console.error(
              `[GENERATE] Failed to generate design for hypothesis ${hyp.id}:`,
              err?.message
            )
          }
        }

        if (designs.length === 0) {
          return NextResponse.json(
            {
              error:
                "Design generation failed for all hypotheses. Check agent configuration."
            },
            { status: 502 }
          )
        }

        const downstreamClear = clearDownstream("design")
        patch = {
          problem: ctx,
          hypotheses: allHypotheses,
          designs,
          ...downstreamClear
        }
        console.log(
          `[GENERATE] Experiment Design done — ${designs.length} designs (${designs.length * 4} LLM calls)`
        )
        break
      }

      // ── Simulation: stub (no real simulation engine yet) ───────────
      case "simulation": {
        if (!body.designId) {
          return NextResponse.json(
            { error: "simulation phase requires designId" },
            { status: 400 }
          )
        }
        // TODO: replace with real simulation agent when available
        const designs = (existing.designs ?? []).map(d =>
          d.id === body.designId
            ? { ...d, simulation: runSimulation(ctx, d) }
            : d
        )
        patch = { designs }
        break
      }

      default:
        return NextResponse.json({ error: "Unknown phase" }, { status: 400 })
    }

    if (body.approvedPhases) {
      patch.approvedPhases = body.approvedPhases
    }

    const next: DesignContentV2 = {
      ...existing,
      ...patch,
      schemaVersion: 2
    }

    const cleaned = JSON.parse(JSON.stringify(next))

    await docRef.update({
      content: JSON.stringify(cleaned),
      updated_at: new Date().toISOString()
    })

    return NextResponse.json({ content: cleaned, phase: body.phase })
  } catch (error: any) {
    console.error("❌ [DESIGN_GENERATE] Error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to run generation" },
      { status: 500 }
    )
  }
}

function parseContent(raw: unknown): DesignContentV2 | null {
  if (!raw) return null
  try {
    if (typeof raw === "string") return JSON.parse(raw)
    if (typeof raw === "object") return raw as DesignContentV2
  } catch {
    return null
  }
  return null
}
