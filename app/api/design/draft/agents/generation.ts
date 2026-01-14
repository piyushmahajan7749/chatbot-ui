import { AgentTask, AgentResult } from "../types/interfaces"
import { LiteratureScoutOutput } from "../types"
import { getGenerationPrompt } from "./prompts/generation"
import { v4 as uuidv4 } from "uuid"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { GenerationSchema } from "../types"

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

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
          temperature: promptConfig.temperature,
          max_tokens: promptConfig.maxTokens,
          response_format: zodResponseFormat(GenerationSchema, "generation")
        },
        { signal: controller.signal as any }
      )

      output = completion.choices[0]?.message?.parsed
      if (!output) {
        throw new Error("Empty parsed response from model")
      }
    } finally {
      clearTimeout(timeoutId)
    }

    // Generate hypothesis ID
    const hypothesisId = uuidv4()

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
