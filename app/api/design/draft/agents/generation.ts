import { AgentTask, AgentResult } from "../types/interfaces"
import type { LiteratureScoutOutput } from "../types"
import { getGenerationPrompt } from "./prompts/generation"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"

const SingleHypothesisSchema = z.object({
  hypothesis: z.string(),
  explanation: z.string(),
  provenance: z.array(z.string()).optional(),
  feasibility_score: z.number().min(0).max(1).optional(),
  novelty_score: z.number().min(0).max(1).optional()
})

const GenerationSchema = z.object({
  hypotheses: z.array(SingleHypothesisSchema)
})

const openai = () => getAzureOpenAIForDesign()
const MODEL_NAME = () => getDesignDeployment()

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

    const literatureContext = task.metadata?.literatureContext as
      | LiteratureScoutOutput
      | undefined

    const promptConfig = getGenerationPrompt(plan, literatureContext)

    // Call model using structured parsing (same approach as report pipeline).
    // This makes JSON-format failures far less likely and provides richer errors.
    const timeoutMs = task.timeoutMs || 60000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    let output: any
    try {
      const completion = await openai().beta.chat.completions.parse(
        {
          model: MODEL_NAME(),
          messages: [
            { role: "system", content: promptConfig.system },
            { role: "user", content: promptConfig.user }
          ],
          // gpt-4.1 supports variable temperature for better hypothesis diversity.
          temperature: 0.7,
          // Some newer Azure deployments require `max_completion_tokens` instead of `max_tokens`.
          ...(typeof promptConfig.maxTokens === "number"
            ? ({ max_completion_tokens: promptConfig.maxTokens } as any)
            : {}),
          response_format: zodResponseFormat(GenerationSchema, "generation")
        },
        { signal: controller.signal as any }
      )

      output = completion.choices[0]?.message?.parsed
      if (!output || !output.hypotheses || output.hypotheses.length === 0) {
        throw new Error("Empty parsed response from model")
      }
    } finally {
      clearTimeout(timeoutId)
    }

    console.debug(
      `[GENERATION] Completed task ${task.taskId} in ${Date.now() - startTime}ms — ${output.hypotheses.length} hypotheses`
    )

    return {
      taskId: task.taskId,
      status: "success",
      output: output.hypotheses,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        hypothesesCount: output.hypotheses.length
      }
    }
  } catch (error: any) {
    console.error(`[GENERATION] Error in task ${task.taskId}:`, error)
    const status = error?.status || error?.response?.status
    const msg =
      typeof error?.message === "string" ? error.message : "Unknown error"
    const errorText = status ? `HTTP ${status}: ${msg}` : msg
    return {
      taskId: task.taskId,
      status: "failure",
      error: errorText
    }
  }
}
