import { NextResponse } from "next/server"

import {
  callExperimentDesignerAgent,
  callLiteratureScoutAgent,
  callReportWriterAgent,
  callStatCheckAgent
} from "../../../agents"
import { ExperimentDesignState } from "../../../types"
import {
  getHypothesisById,
  getResearchPlan,
  saveLog
} from "../../../utils/persistence"
import { AgentPromptOverrides } from "@/types/design-prompts"
import { designAgentPromptOrder } from "@/lib/design/prompt-schemas"

const agentKeys = designAgentPromptOrder

const sanitizePromptOverrides = (
  rawOverrides: unknown
): AgentPromptOverrides | undefined => {
  if (!rawOverrides || typeof rawOverrides !== "object") {
    return undefined
  }

  const cleanOverrides: AgentPromptOverrides = {}
  let hasAnyOverrides = false

  for (const key of agentKeys) {
    const agentOverride = (rawOverrides as Record<string, unknown>)[key]
    if (!agentOverride || typeof agentOverride !== "object") {
      continue
    }

    const sectionsInput = (agentOverride as Record<string, unknown>).sections
    const userPromptInput = (agentOverride as Record<string, unknown>)
      .userPrompt

    const cleanSections =
      sectionsInput && typeof sectionsInput === "object"
        ? Object.entries(sectionsInput as Record<string, unknown>).reduce<
            Record<string, string>
          >((acc, [sectionId, value]) => {
            if (typeof value === "string") {
              acc[sectionId] = value
            }
            return acc
          }, {})
        : undefined

    const cleanUserPrompt =
      typeof userPromptInput === "string" ? userPromptInput : undefined

    if (
      (cleanSections && Object.keys(cleanSections).length > 0) ||
      cleanUserPrompt
    ) {
      cleanOverrides[key] = {
        ...(cleanSections ? { sections: cleanSections } : {}),
        ...(cleanUserPrompt ? { userPrompt: cleanUserPrompt } : {})
      }
      hasAnyOverrides = true
    }
  }

  return hasAnyOverrides ? cleanOverrides : undefined
}

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

    let requestBody: any = {}
    try {
      requestBody = await req.json()
    } catch (error) {
      requestBody = {}
    }
    const instructions =
      typeof requestBody.instructions === "string"
        ? requestBody.instructions.trim()
        : undefined
    const promptOverrides = sanitizePromptOverrides(requestBody.promptOverrides)

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

    const stepTimings: { step: string; durationMs: number }[] = []
    const trackStep = async <T>(step: string, fn: () => Promise<T>) => {
      const start = Date.now()
      const result = await fn()
      stepTimings.push({ step, durationMs: Date.now() - start })
      return result
    }

    const planConstraints = plan.constraints || {}
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

    const pipelineStart = Date.now()

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      level: "info",
      message: `Starting sequential experiment design pipeline for hypothesis ${hypothesis.hypothesisId}`,
      context: {
        planId: plan.planId,
        hypothesisId: hypothesis.hypothesisId
      }
    })

    const state: ExperimentDesignState = {
      problem: plan.title || plan.description || "Untitled research problem",
      objectives: ensureArray(planConstraints.objectives),
      variables: ensureArray(planConstraints.variables),
      specialConsiderations: ensureArray(planConstraints.specialConsiderations)
    }

    if (instructions && instructions.length > 0) {
      state.specialConsiderations = [
        ...state.specialConsiderations,
        `User instructions: ${instructions}`
      ]
      await saveLog({
        timestamp: new Date().toISOString(),
        actor: "supervisor",
        level: "info",
        message: `Applying user instructions for hypothesis ${hypothesis.hypothesisId}`,
        context: {
          planId: plan.planId,
          hypothesisId: hypothesis.hypothesisId,
          instructions
        }
      })
    }

    state.literatureScoutOutput = await trackStep(
      "literature_scout",
      async () =>
        callLiteratureScoutAgent(state, promptOverrides?.literatureScout)
    )

    state.hypothesisBuilderOutput = {
      hypothesis: hypothesis.content,
      explanation:
        hypothesis.explanation ||
        "User-selected hypothesis from tournament stage."
    }

    state.experimentDesignerOutput = await trackStep(
      "experiment_designer",
      async () =>
        callExperimentDesignerAgent(state, promptOverrides?.experimentDesigner)
    )

    state.statCheckOutput = await trackStep("stat_check", async () =>
      callStatCheckAgent(state, promptOverrides?.statCheck)
    )

    state.reportWriterOutput = await trackStep("report_writer", async () =>
      callReportWriterAgent(state, promptOverrides?.reportWriter)
    )

    const totalTimeMs = Date.now() - pipelineStart

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      level: "info",
      message: `Experiment design pipeline completed for hypothesis ${hypothesis.hypothesisId}`,
      context: {
        planId: plan.planId,
        hypothesisId: hypothesis.hypothesisId,
        totalTimeMs
      }
    })

    return NextResponse.json({
      success: true,
      planId: plan.planId,
      hypothesisId: hypothesis.hypothesisId,
      report: state.reportWriterOutput,
      literatureSummary: state.literatureScoutOutput,
      experimentDesign: state.experimentDesignerOutput,
      statReview: state.statCheckOutput,
      metrics: {
        totalTimeMs,
        steps: stepTimings
      }
    })
  } catch (error: any) {
    console.error("[HYPOTHESIS-DESIGN] Error generating design:", error)

    await saveLog({
      timestamp: new Date().toISOString(),
      actor: "supervisor",
      level: "error",
      message: `Experiment design pipeline failed for hypothesis ${params.hypothesisId}`,
      context: {
        hypothesisId: params.hypothesisId,
        error: error?.message || "Unknown error"
      }
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate experiment design"
      },
      { status: 500 }
    )
  }
}
