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
  ParsedLabData,
  ProblemContext,
  PreLabSimulation,
  ValidationVerdict
} from "@/lib/design-agent"

// ── Pre-lab simulation (5a) ──────────────────────────────────────────────────
// The reasoning model iterates INTERNALLY: predict results → compare to the
// desired outcome → if short, revise the design in its head and re-predict,
// looping until the target is reachable — then returns the prediction, whether
// the CURRENT design already meets it, and the concrete changes that would.
const simulationSchema = z.object({
  predictedResults: z.string(),
  meetsTarget: z.boolean(),
  confidence: z.number().min(0).max(1),
  gapAnalysis: z.string(),
  optimizedChanges: z.array(z.string()),
  iterationsReasoned: z.number().int().min(1)
})

export interface SimulateDesignArgs {
  problem: ProblemContext
  hypothesisText: string
  designText: string
  desiredOutcome: string
  /** Optional running memory from prior real-data rounds. */
  cumulativeInsights?: string
}

export async function simulateDesign(args: SimulateDesignArgs) {
  const { problem, hypothesisText, designText, desiredOutcome } = args

  const problemBlock = [
    `Research problem: ${[problem.title, problem.problemStatement].filter(Boolean).join(" - ") || "Not specified"}`,
    problem.objective ? `Objective: ${problem.objective}` : "",
    problem.domain ? `Domain: ${problem.domain}` : ""
  ]
    .filter(Boolean)
    .join("\n")

  const system = `You are a rigorous experimental scientist running a PRE-LAB simulation. Given a hypothesis, a proposed experimental design, and the researcher's DESIRED OUTCOME, predict — grounded in domain knowledge and typical effect sizes — what running this design would most likely yield, and whether that hits the target.

Then ITERATE INTERNALLY: if the current design would NOT reach the desired outcome, mentally revise it (conditions, ranges, controls, replication, readouts, factor levels) and re-predict, repeating until you either reach a design that plausibly hits the target or conclude the target is out of reach. Report how many internal iterations you reasoned through.

Return JSON with exactly:
- predictedResults — 2-4 sentences: the most likely outcome of the CURRENT design, with rough directions/magnitudes. Be concrete and honest, not optimistic.
- meetsTarget — true only if the CURRENT design (as written) plausibly achieves the desired outcome.
- confidence — 0..1 that the design (after your proposed changes) reaches the target.
- gapAnalysis — if meetsTarget is false, exactly what falls short and why (underpowered, wrong range, missing control, insensitive readout, etc.). Empty string if it already meets the target.
- optimizedChanges — the concrete, prioritized design changes that would make the target reachable (each a specific actionable change: a range, a control, a readout, an n, a factor level). EMPTY array only if meetsTarget is already true.
- iterationsReasoned — integer ≥ 1: how many what-if design revisions you worked through internally.

Never claim data you don't have — this is a prediction, clearly reasoned from the design and domain priors.`

  const user = `${problemBlock}

HYPOTHESIS:
${hypothesisText || "Not specified"}

DESIRED OUTCOME (the target to optimize toward):
${desiredOutcome || "Not specified — infer a sensible success target from the objective."}

PROPOSED DESIGN TO SIMULATE:
${designText.slice(0, 14_000) || "(design text unavailable)"}
${args.cumulativeInsights ? `\nWHAT PRIOR REAL ROUNDS TAUGHT US:\n${args.cumulativeInsights}` : ""}

Simulate the design, iterate internally toward the desired outcome, and return the prediction + the changes that would get there.`

  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()

  let completion: any = null
  let reason: string | undefined
  try {
    completion = await openai.beta.chat.completions.parse({
      model,
      temperature: 0.3,
      max_completion_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: zodResponseFormat(simulationSchema, "simulation")
    })
  } catch (e: any) {
    reason = `model call failed: ${e?.status ? `HTTP ${e.status} ` : ""}${e?.message ?? e}`
  }
  const parsed = completion?.choices?.[0]?.message?.parsed
  if (!parsed && !reason) {
    reason =
      completion?.choices?.[0]?.message?.refusal ||
      `no structured output (finish_reason: ${completion?.choices?.[0]?.finish_reason})`
  }
  const result: PreLabSimulation | null = parsed
    ? {
        predictedResults: parsed.predictedResults ?? "",
        meetsTarget: !!parsed.meetsTarget,
        confidence: parsed.confidence ?? 0,
        gapAnalysis: parsed.gapAnalysis ?? "",
        optimizedChanges: parsed.optimizedChanges ?? [],
        iterationsReasoned: parsed.iterationsReasoned ?? 1,
        createdAt: new Date().toISOString()
      }
    : null

  return { result, completion, model, reason }
}

// ── Parse step ─────────────────────────────────────────────────────────────
// Extract the scientist's raw data (typed notes + PDF/CSV text) into a compact
// table + summary so they can SEE what was read before it drives a verdict.
export const parsedDataSchema = z.object({
  summary: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caveats: z.array(z.string())
})

export interface ParseLabDataArgs {
  hypothesisText: string
  designText: string
  /** Free text + extracted file text for this round. */
  roundData: string
  /** Image data URLs (gel photos, screenshots, scans) for the vision model. */
  images?: string[]
}

export async function parseLabData(args: ParseLabDataArgs) {
  const { hypothesisText, designText, roundData, images = [] } = args

  const system = `You are a meticulous lab-data extractor. Given a scientist's raw results — typed notes, text extracted from an uploaded PDF/CSV, and/or IMAGES (gel photos, instrument screenshots, scanned result sheets, photos of a notebook page) — pull the QUANTITATIVE data into a single clean table and summarize what it shows. Read numbers, axes, legends, and table cells directly from any images. Do NOT judge the hypothesis — only organize and describe the data faithfully.

Return JSON with exactly:
- summary — 2-4 plain sentences: what was measured, the headline numbers, and the apparent trend. State only what the data shows.
- columns — the table header cells. Choose the columns that best fit the data (e.g. Condition, Readout, Value, Unit, n, Notes). Keep it tight (3-7 columns).
- rows — one array of cell strings per data point, each aligned to columns. Numbers as strings with units where relevant. If the source has an actual table, preserve its rows. If the data is only prose, extract every measurement you can into rows.
- caveats — data-quality flags a reviewer needs: missing controls, low/absent replication (n), high variance, unclear units, or "no numeric data found". [] if none.

If there is genuinely no usable data, return summary explaining that, empty rows, and a caveat.`

  const userText = `HYPOTHESIS BEING TESTED:
${hypothesisText || "Not specified"}

DESIGN THAT WAS RUN (for context on expected readouts):
${designText.slice(0, 6_000) || "(unavailable)"}

RAW LAB DATA TO EXTRACT (text):
${roundData.slice(0, 24_000) || "(none — read the attached image(s))"}
${images.length ? `\n${images.length} image(s) attached below — read the data out of them.` : ""}

Extract the data into a table and summarize it.`

  // Multimodal message when images are present: text part + one image_url part
  // each. The design deployment (gpt-5.x) is multimodal.
  const userContent: any[] = [{ type: "text", text: userText }]
  for (const url of images.slice(0, 6)) {
    userContent.push({ type: "image_url", image_url: { url, detail: "high" } })
  }

  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()

  let completion: any = null
  let reason: string | undefined
  try {
    completion = await openai.beta.chat.completions.parse({
      model,
      temperature: 0.1,
      max_completion_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: images.length ? userContent : userText }
      ],
      response_format: zodResponseFormat(parsedDataSchema, "parsedData")
    })
  } catch (e: any) {
    // finish_reason:"length"/content_filter can make .parse() THROW rather than
    // return null — capture the real cause instead of a generic failure.
    reason = `model call failed: ${e?.status ? `HTTP ${e.status} ` : ""}${e?.message ?? e}`
  }

  const choice = completion?.choices?.[0]
  const parsed = choice?.message?.parsed
  if (!parsed && !reason) {
    reason =
      choice?.message?.refusal ||
      (choice?.finish_reason
        ? `no structured output (finish_reason: ${choice.finish_reason})`
        : "the model returned no structured output")
  }
  const structured: ParsedLabData | null = parsed
    ? {
        summary: parsed.summary ?? "",
        columns: parsed.columns ?? [],
        rows: parsed.rows ?? [],
        caveats: parsed.caveats ?? []
      }
    : null

  return { structured, completion, model, reason }
}

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
  /** The parsed table (from the parse step), if available — sharpens judgment. */
  structured?: ParsedLabData | null
}

function structuredBlock(s: ParsedLabData | null | undefined): string {
  if (!s || (s.rows.length === 0 && !s.summary)) return ""
  const table = s.columns.length
    ? [s.columns.join(" | "), ...s.rows.map(r => r.join(" | "))].join("\n")
    : ""
  return [
    "PARSED DATA TABLE (already extracted from this round's data):",
    s.summary ? `Summary: ${s.summary}` : "",
    table,
    s.caveats.length ? `Caveats: ${s.caveats.join("; ")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
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
    cumulativeInsights,
    structured
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

${structuredBlock(structured)}

RAW LAB DATA FROM THIS ROUND:
${roundData.slice(0, 20_000) || "(no data provided)"}

Judge the hypothesis against this round's data, update your cumulative memory, and propose what to try next.`

  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()

  const completion = await openai.beta.chat.completions.parse({
    model,
    temperature: 0.3,
    max_completion_tokens: 16000,
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
