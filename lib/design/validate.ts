/**
 * Validation agent — the engine behind the Validate-and-iterate stage.
 *
 * A scientist runs the current design in the lab, brings back data, and this
 * agent judges the hypothesis against that data. Crucially it's given the FULL
 * history of prior iterations plus a running `cumulativeInsights` synthesis, so
 * round N reasons over everything learned in rounds 1..N-1 and gets more
 * focused each time (job story: "at iteration 17 it knows every pattern so
 * far"). It returns a verdict, fresh insights, a REFRESHED cumulative synthesis
 * to carry forward, concrete next changes, and — when the data refutes the
 * hypothesis — a sharper hypothesis to test next.
 *
 * Pure-ish: inputs in, structured result + the raw completion out (so the
 * caller meters token usage). No persistence here.
 */
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import type {
  ExperimentIteration,
  ProblemContext,
  ValidationVerdict
} from "@/lib/design-agent"

export const validationResultSchema = z.object({
  verdict: z.enum([
    "supported",
    "partially_supported",
    "refuted",
    "inconclusive"
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  insights: z.array(z.string()),
  cumulativeInsights: z.string(),
  suggestedChanges: z.array(z.string()),
  revisedHypothesis: z.string().nullable()
})

export type ValidationResult = {
  verdict: ValidationVerdict
  confidence: number
  reasoning: string
  insights: string[]
  cumulativeInsights: string
  suggestedChanges: string[]
  revisedHypothesis: string | null
}

export interface RunValidationArgs {
  problem: ProblemContext
  /** The hypothesis being tested in the round whose data we're judging. */
  hypothesisText: string
  /** Concatenated section text of the design that was run this round. */
  designText: string
  /** This round's lab results: the scientist's free text + extracted file text. */
  roundData: string
  /** Prior iterations, oldest → newest, for the running memory. */
  priorIterations: ExperimentIteration[]
  /** The running synthesis refined so far (empty on round 1). */
  cumulativeInsights?: string
}

function priorBlock(
  iterations: ExperimentIteration[],
  cumulative: string | undefined
): string {
  if (iterations.length === 0 && !cumulative) {
    return "This is ITERATION 1 — no prior rounds yet."
  }
  const lines = iterations.map(it => {
    const verdictLabel = it.verdict.replace(/_/g, " ")
    return [
      `── Iteration ${it.index} (${verdictLabel}) ──`,
      it.hypothesisText ? `Hypothesis tested: ${it.hypothesisText}` : "",
      it.insights.length ? `Insights: ${it.insights.join("; ")}` : "",
      it.suggestedChanges.length
        ? `Changes tried after: ${it.suggestedChanges.join("; ")}`
        : ""
    ]
      .filter(Boolean)
      .join("\n")
  })
  return [
    cumulative
      ? `CUMULATIVE SYNTHESIS SO FAR (your running memory across all rounds):\n${cumulative}`
      : "",
    iterations.length ? `\nPER-ROUND HISTORY:\n${lines.join("\n\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Judge one round of lab data against the hypothesis, in the context of every
 * prior round. Returns the structured result plus the raw completion so the
 * caller can meter token usage against the design owner.
 */
export async function runValidation(args: RunValidationArgs) {
  const {
    problem,
    hypothesisText,
    designText,
    roundData,
    priorIterations,
    cumulativeInsights
  } = args

  const round = priorIterations.length + 1

  const problemBlock = [
    `Research problem: ${[problem.title, problem.problemStatement].filter(Boolean).join(" - ") || "Not specified"}`,
    problem.objective ? `Objective: ${problem.objective}` : "",
    problem.domain ? `Domain: ${problem.domain}` : ""
  ]
    .filter(Boolean)
    .join("\n")

  const system = `You are a rigorous experimental scientist reviewing whether lab data supports a hypothesis, across an ITERATIVE design-build-test loop. You are now judging ITERATION ${round}.

Your judgment must be grounded ONLY in the data provided — never assume a result the data doesn't show. Weigh effect direction, magnitude, controls, replication, and noise. Distinguish "supported", "partially_supported" (some but not all predictions held), "refuted" (data contradicts the hypothesis), and "inconclusive" (data too noisy / incomplete / underpowered to decide).

Use the FULL prior history: your job is to get sharper each round, not to restart. Reference specific earlier rounds when a pattern repeats or reverses.

Return JSON with exactly:
- verdict — one of supported | partially_supported | refuted | inconclusive.
- confidence — 0..1, how sure you are given the data quality.
- reasoning — 2-4 sentences citing the specific numbers/observations that drove the verdict.
- insights — NEW, concrete patterns learned THIS round (each a short specific sentence; e.g. "Response saturates above 20 mM — higher doses add noise, not signal", not "the experiment went well"). [] if none.
- cumulativeInsights — REWRITE the running synthesis: merge the prior synthesis with this round's insights into a compact, deduplicated memory (<= ~200 words) that a future iteration can act on. Keep the durable patterns, drop dead ends, sharpen the live hypothesis space.
- suggestedChanges — concrete, prioritized changes to try next (design conditions, controls, ranges, readouts, and/or the hypothesis itself). [] only if the hypothesis is conclusively supported and nothing remains.
- revisedHypothesis — if the data refutes or reshapes the hypothesis, state a sharper hypothesis to test next; otherwise null.`

  const user = `${problemBlock}

HYPOTHESIS UNDER TEST (this round):
${hypothesisText || "Not specified"}

DESIGN THAT WAS RUN (this round):
${designText.slice(0, 12_000) || "(design text unavailable)"}

${priorBlock(priorIterations, cumulativeInsights)}

LAB DATA FROM THIS ROUND:
${roundData.slice(0, 20_000) || "(no data provided)"}

Judge the hypothesis against this round's data, update your cumulative memory, and propose what to try next.`

  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()

  const completion = await openai.beta.chat.completions.parse({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: zodResponseFormat(validationResultSchema, "validation")
  })

  const parsed = completion.choices[0]?.message?.parsed
  const result: ValidationResult | null = parsed
    ? {
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        insights: parsed.insights ?? [],
        cumulativeInsights: parsed.cumulativeInsights ?? "",
        suggestedChanges: parsed.suggestedChanges ?? [],
        revisedHypothesis: parsed.revisedHypothesis ?? null
      }
    : null

  return { result, completion, model }
}
