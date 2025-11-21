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
} from "@/app/api/design/draft/utils/persistence"
import {
  ResearchPlan,
  Hypothesis,
  AgentTask
} from "@/app/api/design/draft/types/interfaces"
import { checkPlan, checkHypothesis } from "@/app/api/design/draft/safety/gate"
import { v4 as uuidv4 } from "uuid"

const DEFAULT_CONCURRENCY = 4
const INITIAL_ELO = 1500

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

    // Step 2: Generate seed hypotheses
    const hypotheses = await step.run("generate-seed-hypotheses", async () => {
      const seedCount = plan.preferences?.max_hypotheses || 5
      const generationTasks: AgentTask[] = []

      for (let i = 0; i < seedCount; i++) {
        generationTasks.push({
          taskId: uuidv4(),
          planId: plan.planId,
          agentType: "GENERATION",
          n_candidates: 1,
          priority: 1,
          metadata: {
            plan: {
              title: plan.title,
              description: plan.description,
              constraints: plan.constraints
            }
          }
        })
      }

      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        message: `Created ${seedCount} generation tasks`,
        level: "info",
        context: { planId: plan.planId, taskCount: seedCount }
      })

      const generationResults = await runTasksWithConcurrency(
        generationTasks,
        DEFAULT_CONCURRENCY
      )

      const hypos: Hypothesis[] = []
      for (const result of generationResults) {
        if (
          result.status === "success" &&
          result.hypothesisId &&
          result.output
        ) {
          const hypothesis: Hypothesis = {
            hypothesisId: result.hypothesisId,
            planId: plan.planId,
            content: result.output.hypothesis || "",
            explanation: result.output.explanation,
            elo: INITIAL_ELO,
            createdAt: new Date().toISOString(),
            provenance: result.provenance || [],
            metadata: {
              feasibility_score: result.output.feasibility_score,
              novelty_score: result.output.novelty_score
            }
          }

          // Safety check
          const hypoSafety = checkHypothesis(hypothesis)
          if (hypoSafety.decision === "block") {
            await saveLog({
              timestamp: new Date().toISOString(),
              actor: "supervisor",
              message: `Hypothesis ${result.hypothesisId} blocked`,
              level: "warn",
              context: {
                planId: plan.planId,
                hypothesisId: result.hypothesisId
              }
            })
            continue
          }

          if (hypoSafety.decision === "flag") {
            hypothesis.needs_review = true
          }

          await saveHypothesis(hypothesis)
          hypos.push(hypothesis)
        }
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
      const topN = Math.min(10, hypotheses.length)
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

      // Update Elo scores
      let matchIndex = 0
      for (let i = 0; i < topHypotheses.length; i++) {
        for (let j = i + 1; j < topHypotheses.length; j++) {
          const result = rankingResults[matchIndex]
          if (result.status === "success" && result.output) {
            const winner = result.output.winner as "A" | "B"
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
          }
          matchIndex++
        }
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
