import {
  ResearchPlan,
  AgentTask,
  Hypothesis,
  TournamentMatch
} from "./types/interfaces"
import { workerRunner, runTasksWithConcurrency } from "./worker"
import {
  saveResearchPlan,
  saveHypothesis,
  getHypothesesByPlanId,
  updateHypothesis,
  saveTournamentMatch,
  saveLog
} from "./utils/persistence"
import { checkPlan, checkHypothesis } from "./safety/gate"
import { v4 as uuidv4 } from "uuid"
import { callLiteratureScoutAgent } from "./agents"
import { ExperimentDesignState } from "./types"

const DEFAULT_SEED_COUNT = 10
const DEFAULT_CONCURRENCY = 4
const INITIAL_ELO = 1500

/**
 * Simple Elo rating update
 */
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

/**
 * Supervisor orchestrates the research plan execution
 */
export async function supervisorEnqueue(plan: ResearchPlan): Promise<{
  planId: string
  status: string
  hypothesesGenerated: number
}> {
  const startTime = Date.now()

  // Safety check on plan
  const safetyCheck = checkPlan(plan)
  if (safetyCheck.decision === "block") {
    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Plan ${plan.planId} blocked by safety gate`,
      level: "error",
      context: { planId: plan.planId, reasons: safetyCheck.reasons }
    })
    throw new Error(
      `Plan blocked by safety gate: ${safetyCheck.reasons.join("; ")}`
    )
  }

  if (safetyCheck.decision === "flag") {
    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Plan ${plan.planId} flagged by safety gate`,
      level: "warn",
      context: { planId: plan.planId, reasons: safetyCheck.reasons }
    })
  }

  // Save plan
  plan.status = "seed_in_progress"
  await saveResearchPlan(plan)

  await saveLog({
    timestamp: new Date().toISOString(),
    actor: "supervisor",
    message: `Starting research plan ${plan.planId}`,
    level: "info",
    context: { planId: plan.planId }
  })

  try {
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

    // Phase 0: Literature Scout
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
      specialConsiderations: ensureArray(planConstraints.specialConsiderations)
    }

    const literatureResult = await callLiteratureScoutAgent(state)

    // Store literature context in the plan
    plan.literatureContext = literatureResult.output
    await saveResearchPlan(plan)

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Literature scout completed for plan ${plan.planId}`,
      level: "info",
      context: {
        planId: plan.planId,
        citations: literatureResult.output.citations.length
      }
    })

    // Phase 1: Seed generation tasks
    const seedCount = plan.preferences?.max_hypotheses || DEFAULT_SEED_COUNT
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
          },
          literatureContext: literatureResult.output
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

    // Run generation tasks with concurrency limit
    const generationResults = await runTasksWithConcurrency(
      generationTasks,
      DEFAULT_CONCURRENCY
    )

    // Process generation results and save hypotheses
    const hypotheses: Hypothesis[] = []
    for (const result of generationResults) {
      if (result.status === "success" && result.hypothesisId && result.output) {
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

        // Safety check on hypothesis
        const hypoSafety = checkHypothesis(hypothesis)
        if (hypoSafety.decision === "block") {
          await saveLog({
            timestamp: new Date().toISOString(),
            actor: "supervisor",
            message: `Hypothesis ${result.hypothesisId} blocked by safety gate`,
            level: "warn",
            context: { planId: plan.planId, hypothesisId: result.hypothesisId }
          })
          continue // Skip blocked hypotheses
        }

        if (hypoSafety.decision === "flag") {
          hypothesis.needs_review = true
          await saveLog({
            timestamp: new Date().toISOString(),
            actor: "supervisor",
            message: `Hypothesis ${result.hypothesisId} flagged for review`,
            level: "warn",
            context: { planId: plan.planId, hypothesisId: result.hypothesisId }
          })
        }

        await saveHypothesis(hypothesis)
        hypotheses.push(hypothesis)
      }
    }

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Generated ${hypotheses.length} hypotheses`,
      level: "info",
      context: { planId: plan.planId, hypothesisCount: hypotheses.length }
    })

    if (hypotheses.length === 0) {
      throw new Error("No hypotheses generated")
    }

    // Phase 2: Run tournament (pairwise ranking)
    const topN = Math.min(10, hypotheses.length)
    const topHypotheses = hypotheses.slice(0, topN)

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Starting tournament with top ${topN} hypotheses`,
      level: "info",
      context: { planId: plan.planId, topN }
    })

    // Create ranking tasks for pairwise comparisons
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

    // Process ranking results and update Elo
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

          // Save tournament match
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

    // Re-fetch hypotheses with updated Elo
    const updatedHypotheses = await getHypothesesByPlanId(plan.planId)
    updatedHypotheses.sort((a, b) => (b.elo || 0) - (a.elo || 0))

    // Phase 3: Run reflection on top hypotheses
    const topM = Math.min(10, updatedHypotheses.length)
    const reflectionTasks: AgentTask[] = topHypotheses
      .slice(0, topM)
      .map(hypo => ({
        taskId: uuidv4(),
        planId: plan.planId,
        agentType: "REFLECTION",
        hypothesisId: hypo.hypothesisId,
        priority: 3,
        metadata: {
          hypothesis: {
            content: hypo.content,
            explanation: hypo.explanation
          }
        }
      }))

    await runTasksWithConcurrency(reflectionTasks, DEFAULT_CONCURRENCY)

    // Phase 4: Run evolution on top hypotheses
    const evolutionTasks: AgentTask[] = topHypotheses
      .slice(0, topM)
      .map(hypo => ({
        taskId: uuidv4(),
        planId: plan.planId,
        agentType: "EVOLUTION",
        hypothesisId: hypo.hypothesisId,
        priority: 4,
        metadata: {
          hypothesis: {
            content: hypo.content,
            explanation: hypo.explanation
          }
        }
      }))

    const evolutionResults = await runTasksWithConcurrency(
      evolutionTasks,
      DEFAULT_CONCURRENCY
    )

    // Save evolved variants as new hypotheses
    for (const result of evolutionResults) {
      if (result.status === "success" && result.output?.variants) {
        for (const variant of result.output.variants) {
          const evolvedHypo: Hypothesis = {
            hypothesisId: uuidv4(),
            planId: plan.planId,
            content: variant.hypothesis,
            explanation: variant.explanation,
            elo: INITIAL_ELO,
            createdAt: new Date().toISOString(),
            provenance: result.provenance || [],
            metadata: {
              evolved_from: result.hypothesisId,
              improvement_type: variant.improvement_type
            }
          }

          const hypoSafety = checkHypothesis(evolvedHypo)
          if (hypoSafety.decision !== "block") {
            if (hypoSafety.decision === "flag") {
              evolvedHypo.needs_review = true
            }
            await saveHypothesis(evolvedHypo)
          }
        }
      }
    }

    // Phase 5: Run meta review
    const metaReviewTask: AgentTask = {
      taskId: uuidv4(),
      planId: plan.planId,
      agentType: "META_REVIEW",
      priority: 5,
      metadata: {
        plan: {
          title: plan.title,
          description: plan.description
        },
        topHypotheses: updatedHypotheses.slice(0, topM).map(h => ({
          content: h.content
        }))
      }
    }

    await workerRunner(metaReviewTask)

    // Update plan status
    plan.status = "completed"
    await saveResearchPlan(plan)

    const totalTime = Date.now() - startTime
    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Research plan ${plan.planId} completed`,
      level: "info",
      context: { planId: plan.planId, totalTimeMs: totalTime }
    })

    return {
      planId: plan.planId,
      status: "completed",
      hypothesesGenerated: updatedHypotheses.length
    }
  } catch (error: any) {
    plan.status = "failed"
    await saveResearchPlan(plan)

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      message: `Research plan ${plan.planId} failed: ${error.message}`,
      level: "error",
      context: { planId: plan.planId, error: error.message }
    })

    throw error
  }
}
