import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

import { workerRunner } from "../../../worker"
import { AgentTask } from "../../../types/interfaces"
import {
  getHypothesisById,
  getResearchPlan,
  saveLog
} from "../../../utils/persistence"

export async function POST(
  req: Request,
  { params }: { params: { hypothesisId: string } }
) {
  try {
    const hypothesisId = params.hypothesisId
    if (!hypothesisId) {
      return NextResponse.json(
        { success: false, error: "Hypothesis ID is required" },
        { status: 400 }
      )
    }

    const hypothesis = await getHypothesisById(hypothesisId)
    if (!hypothesis) {
      return NextResponse.json(
        { success: false, error: "Hypothesis not found" },
        { status: 404 }
      )
    }

    const plan = await getResearchPlan(hypothesis.planId)
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Research plan not found" },
        { status: 404 }
      )
    }

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      level: "info",
      message: `Generating experiment design for hypothesis ${hypothesis.hypothesisId}`,
      context: {
        planId: plan.planId,
        hypothesisId: hypothesis.hypothesisId
      }
    })

    const reportTask: AgentTask = {
      taskId: uuidv4(),
      planId: plan.planId,
      agentType: "REPORT",
      priority: 6,
      metadata: {
        plan: {
          title: plan.title,
          description: plan.description,
          constraints: plan.constraints,
          preferences: plan.preferences
        },
        topHypotheses: [
          {
            content: hypothesis.content,
            explanation: hypothesis.explanation,
            elo: hypothesis.elo
          }
        ]
      }
    }

    const reportResult = await workerRunner(reportTask)

    if (reportResult.status !== "success" || !reportResult.output) {
      throw new Error(
        reportResult.error || "Failed to generate experiment design"
      )
    }

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      level: "info",
      message: `Experiment design generated for hypothesis ${hypothesis.hypothesisId}`,
      context: {
        planId: plan.planId,
        hypothesisId: hypothesis.hypothesisId
      }
    })

    return NextResponse.json({
      success: true,
      planId: plan.planId,
      hypothesisId: hypothesis.hypothesisId,
      report: reportResult.output,
      metrics: reportResult.metrics
    })
  } catch (error: any) {
    console.error("[HYPOTHESIS-DESIGN] Error generating design:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate experiment design"
      },
      { status: 500 }
    )
  }
}
