import { AgentTask, AgentResult } from "../types/interfaces"
import type { LiteratureScoutOutput } from "../types"
import { getGenerationPrompt, type SelectedPaper } from "./prompts/generation"
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

    const selectedPapers = task.metadata?.selectedPapers as
      | SelectedPaper[]
      | undefined

    const promptConfig = getGenerationPrompt(
      plan,
      literatureContext,
      selectedPapers
    )

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

    const deduped = dedupeAndRankHypotheses(output.hypotheses)

    console.debug(
      `[GENERATION] Completed task ${task.taskId} in ${Date.now() - startTime}ms — ${deduped.length}/${output.hypotheses.length} hypotheses after dedup`
    )

    return {
      taskId: task.taskId,
      status: "success",
      output: deduped,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        hypothesesCount: deduped.length,
        droppedDuplicates: output.hypotheses.length - deduped.length
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

type ParsedHypothesis = z.infer<typeof SingleHypothesisSchema>

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "this",
  "these",
  "those",
  "than"
])

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// Filter near-duplicates by token-set Jaccard (>= 0.7 = paraphrase) and then
// rank by novelty_score (desc) with feasibility_score (desc) as tiebreaker.
function dedupeAndRankHypotheses(
  hypotheses: ParsedHypothesis[]
): ParsedHypothesis[] {
  const SIMILARITY_THRESHOLD = 0.7
  const withTokens = hypotheses.map(h => ({
    h,
    tokens: tokenize(h.hypothesis)
  }))

  const kept: { h: ParsedHypothesis; tokens: Set<string> }[] = []
  for (const candidate of withTokens) {
    const isDup = kept.some(
      k => jaccard(k.tokens, candidate.tokens) >= SIMILARITY_THRESHOLD
    )
    if (!isDup) kept.push(candidate)
  }

  // Stable sort by novelty desc, then feasibility desc.
  return kept
    .map(k => k.h)
    .sort((a, b) => {
      const noveltyDiff = (b.novelty_score ?? 0) - (a.novelty_score ?? 0)
      if (Math.abs(noveltyDiff) > 0.001) return noveltyDiff
      return (b.feasibility_score ?? 0) - (a.feasibility_score ?? 0)
    })
}
