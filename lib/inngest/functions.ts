import { inngest } from "./client"
import { runTasksWithConcurrency } from "@/app/api/design/draft/worker"
import {
  getResearchPlan,
  saveResearchPlan,
  saveHypothesis,
  getHypothesesByPlanId,
  updateHypothesis,
  saveTournamentMatch,
  saveLog
} from "@/app/api/design/draft/utils/persistence-firestore"
import {
  ResearchPlan,
  Hypothesis,
  AgentTask
} from "@/app/api/design/draft/types/interfaces"
import { checkPlan, checkHypothesis } from "@/app/api/design/draft/safety/gate"
import { v4 as uuidv4 } from "uuid"
import { callLiteratureScoutAgent } from "@/app/api/design/draft/agents"
import { ExperimentDesignState } from "@/app/api/design/draft/types"

const DEFAULT_CONCURRENCY = 4
const INITIAL_ELO = 1500
const DEFAULT_AGENT_COUNT = 5
const HYPOTHESES_PER_AGENT = 4

function updateElo(
  eloA: number,
  eloB: number,
  winner: "A" | "B",
  k: number = 32
): [number, number] {
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
  const expectedB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400))
  const scoreA = winner === "A" ? 1 : 0
  const scoreB = winner === "B" ? 1 : 0
  const newEloA = eloA + k * (scoreA - expectedA)
  const newEloB = eloB + k * (scoreB - expectedB)
  return [newEloA, newEloB]
}

// Inngest function broken into multiple checkpointed steps
export const processDesignDraft = inngest.createFunction(
  {
    id: "process-design-draft",
    name: "Process Design Draft",
    retries: 2
  },
  { event: "design/draft.requested" },
  async ({ event, step }) => {
    const { planId } = event.data

    // Step 1: Fetch and validate plan
    const plan = await step.run("fetch-and-validate-plan", async () => {
      const fetchedPlan = await getResearchPlan(planId)
      if (!fetchedPlan) {
        throw new Error(`Research plan ${planId} not found`)
      }

      // Safety check
      const safetyCheck = checkPlan(fetchedPlan)
      if (safetyCheck.decision === "block") {
        await saveLog({
          timestamp: new Date().toISOString(),
          actor: "supervisor",
          message: `Plan ${planId} blocked by safety gate`,
          level: "error",
          context: { planId, reasons: safetyCheck.reasons }
        })
        throw new Error(
          `Plan blocked by safety gate: ${safetyCheck.reasons.join("; ")}`
        )
      }

      // Update status
      fetchedPlan.status = "seed_in_progress"
      await saveResearchPlan(fetchedPlan)
      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Starting research plan ${planId}`,
        level: "info",
        context: { planId }
      })

      return fetchedPlan
    })

    // Helper to ensure array
    const ensureArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      }
      if (typeof value === "string" && value.trim().length > 0) {
        return [value.trim()]
      }
      return []
    }

    // Step 1.5: Literature Scout
    const literatureContext = await step.run("literature-scout", async () => {
      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Starting literature scout for plan ${plan.planId}`,
        level: "info",
        context: { planId: plan.planId }
      })

      const planConstraints = plan.constraints || {}
      const state: ExperimentDesignState = {
        problem: plan.title || plan.description || "Untitled research problem",
        objectives: ensureArray(planConstraints.objectives),
        variables: ensureArray(planConstraints.variables),
        specialConsiderations: ensureArray(
          planConstraints.specialConsiderations
        )
      }

      const result = await callLiteratureScoutAgent(state)

      // Store literature context in the plan
      plan.literatureContext = result.output
      await saveResearchPlan(plan)

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Literature scout completed for plan ${plan.planId}`,
        level: "info",
        context: {
          planId: plan.planId,
          citations: result.output.citations.length
        }
      })

      return result.output
    })

    // Step 2: Generate seed hypotheses
    const hypotheses = await step.run("generate-seed-hypotheses", async () => {
      const agentCount = DEFAULT_AGENT_COUNT
      const generationTasks: AgentTask[] = []

      for (let i = 0; i < agentCount; i++) {
        generationTasks.push({
          taskId: uuidv4(),
          planId: plan.planId,
          agentType: "GENERATION",
          n_candidates: HYPOTHESES_PER_AGENT,
          priority: 1,
          metadata: {
            plan: {
              title: plan.title,
              description: plan.description,
              constraints: plan.constraints
            },
            literatureContext
          }
        })
      }

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Created ${agentCount} generation tasks (${HYPOTHESES_PER_AGENT} hypotheses each, ${agentCount * HYPOTHESES_PER_AGENT} total)`,
        level: "info",
        context: {
          planId: plan.planId,
          taskCount: agentCount,
          hypothesesPerAgent: HYPOTHESES_PER_AGENT
        }
      })

      const generationResults = await runTasksWithConcurrency(
        generationTasks,
        DEFAULT_CONCURRENCY
      )

      // Each result now contains an array of hypotheses
      const hypos: Hypothesis[] = []
      const failureSummaries: Array<{
        taskId: string
        error?: string
        raw?: string
      }> = []
      for (const result of generationResults) {
        if (result.status === "success" && Array.isArray(result.output)) {
          for (const item of result.output) {
            const hypothesisId = uuidv4()
            const hypothesis: Hypothesis = {
              hypothesisId,
              planId: plan.planId,
              content: item.hypothesis || "",
              explanation: item.explanation,
              elo: INITIAL_ELO,
              createdAt: new Date().toISOString(),
              provenance: item.provenance || [],
              metadata: {
                feasibility_score: item.feasibility_score,
                novelty_score: item.novelty_score
              }
            }

            // Safety check
            const hypoSafety = checkHypothesis(hypothesis)
            if (hypoSafety.decision === "block") {
              await saveLog({
                timestamp: new Date().toISOString(),
                actor: "supervisor",
                message: `Hypothesis ${hypothesisId} blocked`,
                level: "warn",
                context: {
                  planId: plan.planId,
                  hypothesisId
                }
              })
              continue
            }

            await saveHypothesis(hypothesis)
            hypos.push(hypothesis)
          }
        } else {
          // Capture failure details so the status endpoint can explain why
          // "No hypotheses generated" occurred (timeouts, Azure 400, parsing, etc.)
          const raw =
            typeof (result as any)?.output?.raw === "string"
              ? ((result as any).output.raw as string)
              : undefined
          failureSummaries.push({
            taskId: result.taskId,
            error: result.error,
            raw: raw ? raw.slice(0, 800) : undefined
          })
        }
      }

      if (failureSummaries.length > 0) {
        await saveLog({
          timestamp: new Date().toISOString(),
          actor: "supervisor",
          message: `Generation failures: ${failureSummaries.length}/${generationResults.length}`,
          level: "warn",
          context: {
            planId: plan.planId,
            failureCount: failureSummaries.length,
            totalTasks: generationResults.length,
            failures: failureSummaries.slice(0, 3)
          }
        })
      }

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Generated ${hypos.length} hypotheses`,
        level: "info",
        context: { planId: plan.planId, hypothesisCount: hypos.length }
      })

      if (hypos.length === 0) {
        throw new Error("No hypotheses generated")
      }

      return hypos
    })

    // Step 3: Run tournament (pairwise ranking)
    await step.run("run-tournament", async () => {
      const topN = Math.min(5, hypotheses.length)
      const topHypotheses = hypotheses.slice(0, topN)

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Starting tournament with top ${topN} hypotheses`,
        level: "info",
        context: { planId: plan.planId, topN }
      })

      // Create ranking tasks
      const rankingTasks: AgentTask[] = []
      for (let i = 0; i < topHypotheses.length; i++) {
        for (let j = i + 1; j < topHypotheses.length; j++) {
          rankingTasks.push({
            taskId: uuidv4(),
            planId: plan.planId,
            agentType: "RANKING",
            priority: 2,
            metadata: {
              hypothesisA: topHypotheses[i].content,
              hypothesisB: topHypotheses[j].content
            }
          })
        }
      }

      const rankingResults = await runTasksWithConcurrency(
        rankingTasks,
        DEFAULT_CONCURRENCY
      )

      // Update Elo scores — skip failed pairs instead of aborting the whole pipeline
      let matchIndex = 0
      let skippedMatches = 0
      for (let i = 0; i < topHypotheses.length; i++) {
        for (let j = i + 1; j < topHypotheses.length; j++) {
          const result = rankingResults[matchIndex]

          if (!result) {
            console.warn(
              `[TOURNAMENT] Ranking task ${matchIndex} returned no result, skipping`
            )
            matchIndex++
            skippedMatches++
            continue
          }

          if (result.status !== "success" || !result.output) {
            const errorDetails =
              result.error ||
              (result.output
                ? JSON.stringify(result.output)
                : "no-ranking-output")

            console.warn(
              `[TOURNAMENT] Ranking task ${rankingTasks[matchIndex]?.taskId} failed (pair ${i}-${j}), skipping: ${errorDetails}`
            )
            matchIndex++
            skippedMatches++
            continue
          }

          const winner = result.output.winner as "A" | "B"
          if (winner !== "A" && winner !== "B") {
            console.warn(
              `[TOURNAMENT] Invalid winner (${winner}) for pair ${i}-${j}, skipping`
            )
            matchIndex++
            skippedMatches++
            continue
          }

          const hypoA = topHypotheses[i]
          const hypoB = topHypotheses[j]

          const [newEloA, newEloB] = updateElo(
            hypoA.elo || INITIAL_ELO,
            hypoB.elo || INITIAL_ELO,
            winner
          )

          await updateHypothesis(hypoA.hypothesisId, { elo: newEloA })
          await updateHypothesis(hypoB.hypothesisId, { elo: newEloB })

          await saveTournamentMatch({
            matchId: uuidv4(),
            planId: plan.planId,
            hypothesisA: hypoA.hypothesisId,
            hypothesisB: hypoB.hypothesisId,
            winner: winner === "A" ? hypoA.hypothesisId : hypoB.hypothesisId,
            createdAt: new Date().toISOString(),
            rankingOutput: result.output
          })
          matchIndex++
        }
      }

      if (skippedMatches > 0) {
        await saveLog({
          timestamp: new Date().toISOString(),
          actor: "supervisor",
          message: `Tournament completed with ${skippedMatches}/${rankingResults.length} ranking failures (skipped)`,
          level: "warn",
          context: {
            planId: plan.planId,
            skippedMatches,
            totalMatches: rankingResults.length
          }
        })
      }

      return { success: true }
    })

    // Step 4: Complete plan
    await step.run("complete-plan", async () => {
      plan.status = "completed"
      await saveResearchPlan(plan)

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Research plan ${plan.planId} completed`,
        level: "info",
        context: { planId: plan.planId }
      })

      return { success: true }
    })

    const finalHypotheses = await getHypothesesByPlanId(planId)

    return {
      success: true,
      planId: plan.planId,
      hypothesesGenerated: finalHypotheses.length,
      status: "completed"
    }
  }
)
