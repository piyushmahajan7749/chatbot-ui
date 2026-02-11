import { NextResponse } from "next/server"
import {
  getResearchPlan,
  getHypothesesByPlanId,
  getLogsByPlanId
} from "../../utils/persistence-firestore"
import { PlanStatus } from "../../types/interfaces"

export async function GET(
  req: Request,
  { params }: { params: { planId: string } }
) {
  try {
    const planId = params.planId

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      )
    }

    // Get plan
    const plan = await getResearchPlan(planId)
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    // Get hypotheses
    const allHypotheses = await getHypothesesByPlanId(planId)

    // Filter out hypotheses that need review (unless explicitly requested)
    const approvedHypotheses = allHypotheses.filter(h => !h.needs_review)

    // Sort by Elo (descending)
    approvedHypotheses.sort((a, b) => (b.elo || 0) - (a.elo || 0))

    // Get top N hypotheses
    const topN = 10
    const topHypotheses = approvedHypotheses.slice(0, topN)

    // Get logs
    const logs = await getLogsByPlanId(planId, 20)

    // Calculate progress
    const seedCount = plan.preferences?.max_hypotheses || 10
    const progress = {
      generated: allHypotheses.length,
      seedCount,
      completed: allHypotheses.filter(h => h.elo !== undefined).length,
      failed: 0, // Could track failed tasks separately
      phase: plan.currentPhase || undefined,
      phaseMessage: plan.currentPhaseMessage || undefined
    }

    const status: PlanStatus = {
      planId: plan.planId,
      status: plan.status || "pending",
      progress,
      top_hypotheses: topHypotheses,
      logs,
      createdAt: plan.createdAt,
      completedAt:
        plan.status === "completed" ? new Date().toISOString() : undefined,
      literatureContext: plan.literatureContext
    }

    return NextResponse.json(status)
  } catch (error: any) {
    console.error("[STATUS] Error fetching plan status:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch plan status"
      },
      { status: 500 }
    )
  }
}
