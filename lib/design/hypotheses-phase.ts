/**
 * Hypothesis-generation phase, extracted from the inline `case "hypotheses"` of
 * app/api/design/[designid]/generate/route.ts so it can run in the Inngest
 * worker (processDesignPhase). It's a 5-stage pipeline — generate → rank →
 * reflect → evolve → meta-review (~32 gpt-5.5 calls) — that can approach the
 * 300s serverless cap.
 *
 * Pure: inputs in, content patch out. Progress via the onProgress callback.
 */
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import { v4 as uuidv4 } from "uuid"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { runTasksWithConcurrency } from "@/app/api/design/draft/worker"
import type { AgentTask } from "@/app/api/design/draft/types/interfaces"
import type {
  DesignContentV2,
  Hypothesis,
  Paper,
  ProblemContext
} from "@/lib/design-agent"

const GENERATION_AGENT_COUNT = 5
const GENERATION_CONCURRENCY = 4
const FINAL_TOP_N = 5

interface RankedHypothesis {
  id: string
  text: string
  explanation: string
  rank: number
  feasibility: number
  novelty: number
}

type Progress = (ev: Record<string, unknown>) => void

export async function runHypothesesPhase(
  args: {
    ctx: ProblemContext
    existing: DesignContentV2
    body: { papers?: Paper[] }
    designId: string
  },
  onProgress: Progress
): Promise<Partial<DesignContentV2>> {
  const { ctx, existing, body, designId } = args
  const litCtx = existing.literatureContext
  const planMeta = {
    title: ctx.title || "Untitled",
    description: ctx.problemStatement || ctx.goal || "",
    constraints: {
      variables: (ctx as { variables?: string[] }).variables,
      constraints: (ctx as { constraints?: string[] }).constraints
    }
  }

  const selectedPapers = (body.papers ?? existing.papers ?? []).filter(
    p => p.selected
  )

  // ── Step 1: Generation (5 agents × 4 candidates) with one empty-pool retry ──
  onProgress({
    step: "generating",
    message: `Generating candidate hypotheses across ${GENERATION_AGENT_COUNT} agents...`
  })
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

  const pool: RankedHypothesis[] = []
  for (let attempt = 1; attempt <= 2 && pool.length === 0; attempt++) {
    if (attempt > 1) {
      onProgress({
        step: "generating",
        message: "Retrying hypothesis generation after a transient error..."
      })
    }
    const tasks =
      attempt === 1 ? genTasks : genTasks.map(t => ({ ...t, taskId: uuidv4() }))
    const genResults = await runTasksWithConcurrency(
      tasks,
      GENERATION_CONCURRENCY
    )
    for (const r of genResults) {
      if (r.status === "success" && Array.isArray(r.output)) {
        for (const item of r.output as any[]) {
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
  }

  if (pool.length === 0) {
    throw Object.assign(
      new Error(
        "No hypotheses generated after a retry. Check that Azure OpenAI is configured and try again."
      ),
      { status: 502 }
    )
  }
  onProgress({
    step: "generated",
    message: `Generated ${pool.length} candidate hypotheses`,
    count: pool.length
  })

  // ── Step 2: Batch ranking (single LLM call) ─────────────────────────────────
  const batchRankingSchema = z.object({
    ranked: z.array(
      z.object({
        index: z.number(),
        score: z.number().min(0).max(100),
        reasoning: z.string()
      })
    )
  })
  const numberedList = pool.map((h, i) => `[${i + 1}] ${h.text}`).join("\n")
  onProgress({
    step: "ranking",
    message: `Ranking ${pool.length} hypotheses by rigor, feasibility, novelty...`
  })
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
      response_format: zodResponseFormat(batchRankingSchema, "batchRanking")
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (parsed?.ranked) {
      for (const entry of parsed.ranked) {
        const idx = entry.index - 1
        if (idx >= 0 && idx < pool.length) pool[idx].rank = entry.score
      }
    }
  } catch (rankErr: any) {
    console.warn(
      `[hypotheses] batch ranking failed, falling back to feasibility+novelty: ${rankErr?.message}`
    )
    for (const h of pool) h.rank = Math.round((h.feasibility + h.novelty) * 50)
  }

  pool.sort((a, b) => b.rank - a.rank)
  const topHypotheses = pool.slice(0, FINAL_TOP_N)
  onProgress({
    step: "ranked",
    message: `Top ${FINAL_TOP_N} selected`,
    scores: topHypotheses.map(h => h.rank)
  })

  // ── Step 3: Reflection (critique top 5) ─────────────────────────────────────
  onProgress({
    step: "reflecting",
    message: `Critiquing top ${FINAL_TOP_N} - strengths, weaknesses, improvements...`
  })
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
  for (let i = 0; i < topHypotheses.length; i++) {
    const ref = reflectionResults[i]
    if (ref?.status === "success" && ref.output) {
      const o = ref.output as any
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

  // ── Step 4: Evolution (improved variants) ───────────────────────────────────
  onProgress({
    step: "evolving",
    message: `Evolving hypotheses - generating improved variants...`
  })
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
  for (let i = 0; i < topHypotheses.length; i++) {
    const evo = evoResults[i]
    if (evo?.status === "success" && (evo.output as any)?.variants?.length) {
      const best = (evo.output as any).variants[0]
      if (best?.hypothesis && best?.improvement_type) {
        topHypotheses[i].text = best.hypothesis
        topHypotheses[i].explanation +=
          `\n\nEvolved (${best.improvement_type}): ${best.explanation || ""}`
      }
    }
  }

  // ── Step 5: Meta-review (best-effort) ───────────────────────────────────────
  onProgress({
    step: "meta_review",
    message: "Meta-review and final polish..."
  })
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
  await runTasksWithConcurrency([metaTask], 1)

  // ── Assemble Hypothesis[] for the frontend ──────────────────────────────────
  const hypotheses: Hypothesis[] = topHypotheses.map(h => ({
    id: h.id,
    text: h.text,
    reasoning: h.explanation,
    basedOnPaperIds: [],
    selected: false
  }))

  const papers = body.papers ?? existing.papers ?? []
  // Downstream clear (wipe stale designs) is applied by the worker's finalize
  // step — `undefined` doesn't survive Inngest step serialization.
  return { problem: ctx, papers, hypotheses }
}
