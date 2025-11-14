import { AgentTask, AgentResult } from "../types/interfaces"
import { callModelJson } from "../utils/model"
import { getGenerationPrompt } from "./prompts/generation"
import { v4 as uuidv4 } from "uuid"

export async function generationAdapter(task: AgentTask): Promise<AgentResult> {
  const startTime = Date.now()
  console.debug(`[GENERATION] Starting task ${task.taskId}`)

  try {
    // Get prompt template
    const plan = task.metadata?.plan as {
      title: string
      description: string
      constraints?: Record<string, any>
    }
    if (!plan) {
      throw new Error("Plan metadata required for generation")
    }

    const promptConfig = getGenerationPrompt(plan)

    // Call model
    const result = await callModelJson(promptConfig.user, promptConfig.system, {
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.maxTokens,
      timeoutMs: task.timeoutMs || 60000
    })

    if (!result.ok || !result.json) {
      console.error(`[GENERATION] Failed to get valid JSON: ${result.error}`)
      return {
        taskId: task.taskId,
        status: "failure",
        error: result.error || "non-json-output",
        output: { raw: result.raw }
      }
    }

    // Generate hypothesis ID
    const hypothesisId = uuidv4()

    // Extract output
    const output = result.json
    const provenance = output.provenance || []

    console.debug(
      `[GENERATION] Completed task ${task.taskId} in ${Date.now() - startTime}ms`
    )

    return {
      taskId: task.taskId,
      status: "success",
      hypothesisId,
      output,
      provenance,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        feasibility_score: output.feasibility_score || 0,
        novelty_score: output.novelty_score || 0
      }
    }
  } catch (error: any) {
    console.error(`[GENERATION] Error in task ${task.taskId}:`, error)
    return {
      taskId: task.taskId,
      status: "failure",
      error: error.message || "Unknown error"
    }
  }
}
