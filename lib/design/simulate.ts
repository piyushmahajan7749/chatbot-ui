/**
 * Pre-lab simulation engine (Validate stage, step 5a) — "modeled" edition.
 *
 * Inspired by OpenScience (synthetic-sciences/openscience): rather than asking
 * the model to GUESS an outcome in prose, we make it pick a quantitative model
 * for the design, WRITE a self-contained Monte-Carlo program, RUN that program
 * on real numbers (in a hardened sandbox), and reason over the executed
 * distribution — then iterate on the numeric parameters to show what would
 * close the gap to the target.
 *
 * Pipeline:
 *   plan  → the model chooses a model family, names the design's tunable
 *           parameters (with base value + sweep bounds), the readout + target,
 *           and writes JS that reads globals PARAMS/SEED and sets RESULT.
 *   exec  → runSimSandbox runs the JS → { meetRate, distribution, sensitivity }.
 *   interp→ the model reads the executed numbers and returns the human-facing
 *           prediction, gotchas, prioritized design edits, and the NUMERIC
 *           parameter edits that should improve the next round.
 *   loop  → apply the numeric edits, re-run the SAME program (no re-codegen),
 *           record the round; repeat until the target is met or MAX rounds.
 *
 * If planning or round-1 execution fails for any reason, we fall back to a
 * reasoned (non-executed) prediction so the feature never hard-fails.
 *
 * Pure-ish: inputs in, structured result + the raw completions out (so the
 * caller meters token usage). No persistence here.
 */
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { runSimSandbox } from "@/lib/design/sandbox"
import type {
  PreLabSimulation,
  ProblemContext,
  SimDistribution,
  SimGotcha,
  SimRound,
  SimSensitivity
} from "@/lib/design-agent"

// A design "meets" the target when at least this share of Monte-Carlo trials
// clear the threshold. 0.8 = "reliably", not "occasionally got lucky".
const MEET_THRESHOLD = 0.8

function maxRounds(): number {
  const n = Number(process.env.DESIGN_SIM_MAX_ROUNDS)
  return Number.isFinite(n) && n >= 1 && n <= 6 ? Math.floor(n) : 3
}

function execEnabled(): boolean {
  // Default ON. Set DESIGN_SIM_EXEC=0 to force the reasoned (non-executed) path.
  return (process.env.DESIGN_SIM_EXEC ?? "1") !== "0"
}

// Deterministic-ish seed WITHOUT Math.random (unavailable in this runtime and
// it would break reproducibility). Derived from the plan text so different
// designs get different noise draws but the same design is reproducible.
function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2_000_000_000
}

export interface SimulateDesignArgs {
  problem: ProblemContext
  hypothesisText: string
  designText: string
  desiredOutcome: string
  /** Optional running memory from prior real-data rounds. */
  cumulativeInsights?: string
}

// ── Plan schema ──────────────────────────────────────────────────────────────
const planParamSchema = z.object({
  name: z.string(),
  value: z.number(),
  low: z.number(),
  high: z.number(),
  unit: z.string().nullable().optional()
})
const planSchema = z.object({
  model: z.string(),
  modelRationale: z.string(),
  targetMetric: z.string(),
  targetThreshold: z.number(),
  targetDirection: z.enum([">=", "<=", "==", "approx"]),
  unit: z.string(),
  nTrials: z.number().int().min(50).max(3000),
  params: z.array(planParamSchema).min(1).max(12),
  simCode: z.string()
})
type SimPlan = z.infer<typeof planSchema>

// ── Interpret schema ─────────────────────────────────────────────────────────
const interpretSchema = z.object({
  predictedResults: z.string(),
  meetsTarget: z.boolean(),
  confidence: z.number().min(0).max(1),
  gapAnalysis: z.string(),
  optimizedChanges: z.array(z.string()),
  gotchas: z.array(
    z.object({
      issue: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      fix: z.string()
    })
  ),
  paramEdits: z.array(z.object({ name: z.string(), newValue: z.number() }))
})
type Interpretation = z.infer<typeof interpretSchema>

function problemBlock(problem: ProblemContext): string {
  return [
    `Research problem: ${[problem.title, problem.problemStatement].filter(Boolean).join(" - ") || "Not specified"}`,
    problem.objective ? `Objective: ${problem.objective}` : "",
    problem.domain ? `Domain: ${problem.domain}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

// The contract the generated program must satisfy. Kept verbatim in the prompt.
const CODE_CONTRACT = `Write the simulation as pure synchronous JavaScript that this runtime executes directly. STRICT rules:
- NO imports, require, async, I/O, eval, Function(), process, or globalThis.
- Read two injected globals: SEED (an integer) and PARAMS (an object mapping each parameter NAME (exactly as in "params") to its current numeric value). ALWAYS read tunable values from PARAMS[name] — never hard-code them — so the harness can re-run your code with edited parameters.
- Define your own seeded PRNG from SEED (e.g. mulberry32). Do NOT call Math.random (forbidden / non-deterministic).
- Run nTrials Monte-Carlo replicates of the primary readout under the model + PARAMS, injecting realistic biological/measurement noise (e.g. lognormal/normal CV). Count a trial as meeting the target using targetDirection vs targetThreshold.
- Compute a one-factor-at-a-time sensitivity: for each parameter, hold others at PARAMS and evaluate the mean readout at its low and high bound; report a 0..1 normalized "effect" (that factor's swing ÷ the largest factor's swing) and whether raising it "increases" | "decreases" | "nonmonotonic" the readout.
- Assign the result to the global RESULT as EXACTLY:
  RESULT = {
    meetRate: <0..1 fraction of trials meeting target>,
    distribution: { mean, sd, median, p10, p90 },
    sensitivity: [ { factor: <param name>, effect: <0..1>, direction: "increases"|"decreases"|"nonmonotonic", recommendedChange: <short text, e.g. "raise to 40"> } ],
    sampleReadouts: [ up to 15 example readout values ],
    note: <one short sentence on the model + assumptions>
  }
Keep it under ~150 lines. It must run in well under 3 seconds.`

export async function planSimulation(args: SimulateDesignArgs): Promise<{
  plan: SimPlan | null
  completion: any
  model: string
  reason?: string
}> {
  const { problem, hypothesisText, designText, desiredOutcome } = args
  const system = `You are a quantitative experimental scientist building an IN-SILICO model of a proposed experiment so it can be simulated BEFORE the bench.

Pick the simplest quantitative model that captures how this design's readout responds to its knobs. Common families: dose_response_hill, michaelis_menten, growth_logistic, binding_kd, two_group_effect (effect size + noise + n → power), dilution_series, enzyme_kinetics, or a custom mechanistic model. Choose ONE and justify it briefly.

Identify the design's TUNABLE parameters (concentrations, temperature, time, replicate count n, factor levels, etc.). For each give a realistic base value grounded in the design/domain, plus a plausible low/high sweep bound. Define the primary readout, its unit, and the numeric target (threshold + direction) implied by the desired outcome.

${CODE_CONTRACT}

Return ONLY the structured fields. Ground every number in the design text and domain priors; never invent lab data.`

  const user = `${problemBlock(problem)}

HYPOTHESIS:
${hypothesisText || "Not specified"}

DESIRED OUTCOME (defines the numeric target):
${desiredOutcome || "Not specified — infer a sensible quantitative success target from the objective."}

PROPOSED DESIGN TO MODEL:
${designText.slice(0, 14_000) || "(design text unavailable)"}
${args.cumulativeInsights ? `\nWHAT PRIOR REAL ROUNDS TAUGHT US (use to set realistic params/noise):\n${args.cumulativeInsights}` : ""}

Choose the model, name the parameters with bounds, set the target, and write the Monte-Carlo program.`

  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()
  let completion: any = null
  let reason: string | undefined
  try {
    completion = await openai.beta.chat.completions.parse({
      model,
      temperature: 0.2,
      max_completion_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: zodResponseFormat(planSchema, "simulationPlan")
    })
  } catch (e: any) {
    reason = `plan call failed: ${e?.status ? `HTTP ${e.status} ` : ""}${e?.message ?? e}`
  }
  const parsed = completion?.choices?.[0]?.message?.parsed ?? null
  if (!parsed && !reason) {
    reason =
      completion?.choices?.[0]?.message?.refusal ||
      `no plan (finish_reason: ${completion?.choices?.[0]?.finish_reason})`
  }
  return { plan: parsed, completion, model, reason }
}

async function interpretRun(args: {
  problem: ProblemContext
  desiredOutcome: string
  plan: SimPlan
  currentParams: Record<string, number>
  run: SandboxNumbers
  roundIndex: number
  cumulativeInsights?: string
}): Promise<{ interp: Interpretation | null; completion: any; model: string }> {
  const { plan, run, currentParams, roundIndex } = args
  const openai = getAzureOpenAIForDesign()
  const model = getDesignDeployment()

  const paramLines = plan.params
    .map(
      p =>
        `- ${p.name} = ${currentParams[p.name] ?? p.value}${p.unit ? " " + p.unit : ""} (range ${p.low}–${p.high})`
    )
    .join("\n")
  const sens = (run.sensitivity ?? [])
    .slice()
    .sort((a, b) => (b.effect ?? 0) - (a.effect ?? 0))
    .map(
      s =>
        `- ${s.factor}: leverage ${Math.round((s.effect ?? 0) * 100)}%, raising it ${s.direction} the readout`
    )
    .join("\n")

  const system = `You are a rigorous experimental scientist interpreting an EXECUTED Monte-Carlo simulation of a proposed design. The numbers below came from actually running the model — treat them as the simulated evidence, not a guess.

Judge whether the CURRENT design reliably hits the target (meetRate ≥ ${MEET_THRESHOLD} means "reliably"). Then:
- Explain the predicted result in plain language, citing the meet-rate, the distribution, and the target.
- List GOTCHAS: feasibility/soundness problems the design has (underpowered n given the observed spread, readout near its detection floor, working concentration outside the responsive range, missing control/blank, confounded factor, wide variance swamping the effect). Each with a severity and a concrete fix.
- Give prioritized, concrete design CHANGES (text) that would raise the meet-rate — anchored in the sensitivity ranking (spend effort on high-leverage knobs).
- Give paramEdits: the NUMERIC edits to the named parameters (name + newValue, within/only slightly beyond the stated range) that should improve the NEXT simulated round. [] if the design already meets the target.

Be honest and quantitative. Never claim real lab data — this is simulation.`

  const user = `TARGET: ${plan.targetMetric} ${plan.targetDirection} ${plan.targetThreshold} ${plan.unit}
MODEL: ${plan.model} — ${plan.modelRationale}
DESIRED OUTCOME (researcher's words): ${args.desiredOutcome || "(infer from objective)"}

CURRENT PARAMETERS (round ${roundIndex}):
${paramLines}

EXECUTED SIMULATION RESULTS (nTrials=${plan.nTrials}):
- meetRate = ${run.meetRate.toFixed(3)} (${Math.round(run.meetRate * 100)}% of trials met the target)
- distribution: mean ${round4(run.distribution.mean)}, sd ${round4(run.distribution.sd)}, median ${round4(run.distribution.median)}, p10 ${round4(run.distribution.p10)}, p90 ${round4(run.distribution.p90)} ${plan.unit}
- sample readouts: ${(run.sampleReadouts ?? []).slice(0, 12).map(round4).join(", ") || "n/a"}
${sens ? `- factor sensitivity (leverage):\n${sens}` : ""}
${run.note ? `- model note: ${run.note}` : ""}
${args.cumulativeInsights ? `\nPRIOR REAL-ROUND MEMORY:\n${args.cumulativeInsights}` : ""}

Interpret these results and return the structured judgment.`

  let completion: any = null
  try {
    completion = await openai.beta.chat.completions.parse({
      model,
      temperature: 0.2,
      max_completion_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: zodResponseFormat(interpretSchema, "simInterpretation")
    })
  } catch {
    return { interp: null, completion: null, model }
  }
  return {
    interp: completion?.choices?.[0]?.message?.parsed ?? null,
    completion,
    model
  }
}

// Normalized numbers coming back from the sandbox program.
interface SandboxNumbers {
  meetRate: number
  distribution: SimDistribution
  sensitivity: SimSensitivity[]
  sampleReadouts: number[]
  note: string
}

function coerceDist(d: any): SimDistribution {
  const n = (x: any) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
  return {
    mean: n(d?.mean),
    sd: n(d?.sd),
    median: n(d?.median),
    p10: n(d?.p10),
    p90: n(d?.p90)
  }
}

function coerceSandbox(out: any): SandboxNumbers | null {
  if (!out || typeof out !== "object") return null
  const meetRate =
    typeof out.meetRate === "number" && Number.isFinite(out.meetRate)
      ? Math.min(1, Math.max(0, out.meetRate))
      : null
  if (meetRate === null) return null
  const sensitivity: SimSensitivity[] = Array.isArray(out.sensitivity)
    ? out.sensitivity
        .filter((s: any) => s && typeof s.factor === "string")
        .slice(0, 12)
        .map((s: any) => ({
          factor: String(s.factor),
          effect:
            typeof s.effect === "number"
              ? Math.min(1, Math.max(0, s.effect))
              : 0,
          direction: ["increases", "decreases", "nonmonotonic"].includes(
            s.direction
          )
            ? s.direction
            : "nonmonotonic",
          recommendedChange:
            typeof s.recommendedChange === "string" ? s.recommendedChange : ""
        }))
    : []
  const sampleReadouts: number[] = Array.isArray(out.sampleReadouts)
    ? out.sampleReadouts
        .filter((x: any) => typeof x === "number" && Number.isFinite(x))
        .slice(0, 15)
    : []
  return {
    meetRate,
    distribution: coerceDist(out.distribution),
    sensitivity,
    sampleReadouts,
    note: typeof out.note === "string" ? out.note : ""
  }
}

function round4(x: any): number {
  const n = typeof x === "number" ? x : Number(x)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * Orchestrate the modeled simulation with the improve-loop. Returns the
 * PreLabSimulation plus every completion (so the route meters all model calls)
 * and whether real code executed.
 */
export async function simulateDesign(args: SimulateDesignArgs): Promise<{
  result: PreLabSimulation | null
  completions: any[]
  model: string
  reason?: string
  executed: boolean
}> {
  const completions: any[] = []
  const model = getDesignDeployment()

  if (!execEnabled()) {
    const r = await simulateReasoned(args)
    return {
      result: r.result,
      completions: r.completion ? [r.completion] : [],
      model,
      reason: r.reason,
      executed: false
    }
  }

  // 1) Plan + generate the program.
  const { plan, completion: planCompletion, reason: planReason } =
    await planSimulation(args)
  if (planCompletion) completions.push(planCompletion)
  if (!plan) {
    const r = await simulateReasoned(args)
    if (r.completion) completions.push(r.completion)
    return {
      result: r.result,
      completions,
      model,
      reason: `plan unavailable (${planReason ?? "unknown"}) — used reasoned fallback`,
      executed: false
    }
  }

  const seed = seedFrom(plan.simCode + plan.model)
  const rounds: SimRound[] = []
  const currentParams: Record<string, number> = {}
  for (const p of plan.params) currentParams[p.name] = p.value

  // 2) Round 1: the design AS WRITTEN.
  const firstRun = runSimSandbox(plan.simCode, {
    seed,
    params: currentParams,
    timeoutMs: 4000
  })
  const firstNums = firstRun.ok ? coerceSandbox(firstRun.output) : null
  if (!firstNums) {
    // Codegen ran but produced nothing usable → reasoned fallback.
    const r = await simulateReasoned(args)
    if (r.completion) completions.push(r.completion)
    return {
      result: r.result,
      completions,
      model,
      reason: `sim exec failed (${firstRun.error ?? "no numbers"}) — used reasoned fallback`,
      executed: false
    }
  }

  let latestNums = firstNums
  rounds.push({
    round: 1,
    changesApplied: [],
    meetRate: firstNums.meetRate,
    distribution: firstNums.distribution,
    summary: firstNums.note || "Design as currently written."
  })

  // 3) Interpret round 1 (drives the loop + supplies human-facing fields).
  const firstInterp = await interpretRun({
    problem: args.problem,
    desiredOutcome: args.desiredOutcome,
    plan,
    currentParams,
    run: firstNums,
    roundIndex: 1,
    cumulativeInsights: args.cumulativeInsights
  })
  if (firstInterp.completion) completions.push(firstInterp.completion)

  let interp: Interpretation | null = firstInterp.interp
  const baseMeetsTarget = firstNums.meetRate >= MEET_THRESHOLD

  // 4) Improve-loop: apply numeric edits, re-run the SAME program, until the
  //    target is met (by simulation) or MAX rounds. No re-codegen — cheap.
  const limit = maxRounds()
  let round = 1
  while (
    interp &&
    !isMet(latestNums.meetRate) &&
    round < limit &&
    interp.paramEdits.length > 0
  ) {
    const applied: string[] = []
    for (const edit of interp.paramEdits) {
      const spec = plan.params.find(p => p.name === edit.name)
      if (!spec || typeof edit.newValue !== "number") continue
      // Allow a little beyond the stated bounds (the model may propose pushing a
      // knob), but clamp to a sane multiple so a bad edit can't explode the sim.
      const span = Math.max(1e-9, spec.high - spec.low)
      const lo = spec.low - span
      const hi = spec.high + span
      const v = Math.min(hi, Math.max(lo, edit.newValue))
      if (v !== currentParams[spec.name]) {
        applied.push(
          `${spec.name}: ${round4(currentParams[spec.name])} → ${round4(v)}${spec.unit ? " " + spec.unit : ""}`
        )
        currentParams[spec.name] = v
      }
    }
    if (applied.length === 0) break

    round += 1
    const rerun = runSimSandbox(plan.simCode, {
      seed,
      params: currentParams,
      timeoutMs: 4000
    })
    const nums = rerun.ok ? coerceSandbox(rerun.output) : null
    if (!nums) break // keep what we have; stop optimizing
    latestNums = nums
    rounds.push({
      round,
      changesApplied: applied,
      meetRate: nums.meetRate,
      distribution: nums.distribution,
      summary: nums.note || "Re-simulated with optimized parameters."
    })
    const next = await interpretRun({
      problem: args.problem,
      desiredOutcome: args.desiredOutcome,
      plan,
      currentParams,
      run: nums,
      roundIndex: round,
      cumulativeInsights: args.cumulativeInsights
    })
    if (next.completion) completions.push(next.completion)
    if (next.interp) interp = next.interp
    else break
  }

  const gotchas: SimGotcha[] = (interp?.gotchas ?? []).map(g => ({
    issue: g.issue,
    severity: g.severity,
    fix: g.fix
  }))
  const bestRound = rounds[rounds.length - 1]
  const improved =
    rounds.length > 1 && bestRound.meetRate > rounds[0].meetRate + 0.001

  const predicted =
    interp?.predictedResults ||
    `Simulated ${plan.nTrials} runs of a ${plan.model} model: ${Math.round(firstNums.meetRate * 100)}% met the target (${plan.targetMetric} ${plan.targetDirection} ${plan.targetThreshold} ${plan.unit}).`

  const result: PreLabSimulation = {
    predictedResults: predicted,
    meetsTarget: baseMeetsTarget,
    confidence:
      typeof interp?.confidence === "number"
        ? interp.confidence
        : firstNums.meetRate,
    gapAnalysis: baseMeetsTarget ? "" : interp?.gapAnalysis || "",
    optimizedChanges: interp?.optimizedChanges ?? [],
    iterationsReasoned: rounds.length,
    createdAt: new Date().toISOString(),
    executed: true,
    modelUsed: plan.model,
    modelRationale: plan.modelRationale,
    nTrials: plan.nTrials,
    meetRate: firstNums.meetRate,
    distribution: { ...firstNums.distribution, unit: plan.unit },
    sensitivity: firstNums.sensitivity,
    gotchas,
    rounds,
    targetMetric: plan.targetMetric,
    targetThreshold: plan.targetThreshold,
    targetDirection: plan.targetDirection
  }

  return {
    result,
    completions,
    model,
    reason: improved
      ? `optimized across ${rounds.length} simulated rounds (${Math.round(rounds[0].meetRate * 100)}%→${Math.round(bestRound.meetRate * 100)}% meet-rate)`
      : undefined,
    executed: true
  }
}

function isMet(meetRate: number): boolean {
  return meetRate >= MEET_THRESHOLD
}

// ── Reasoned fallback (the original non-executed prediction) ─────────────────
const reasonedSchema = z.object({
  predictedResults: z.string(),
  meetsTarget: z.boolean(),
  confidence: z.number().min(0).max(1),
  gapAnalysis: z.string(),
  optimizedChanges: z.array(z.string()),
  iterationsReasoned: z.number().int().min(1)
})

export async function simulateReasoned(args: SimulateDesignArgs): Promise<{
  result: PreLabSimulation | null
  completion: any
  model: string
  reason?: string
}> {
  const { problem, hypothesisText, designText, desiredOutcome } = args
  const system = `You are a rigorous experimental scientist running a PRE-LAB simulation. Given a hypothesis, a proposed experimental design, and the researcher's DESIRED OUTCOME, predict — grounded in domain knowledge and typical effect sizes — what running this design would most likely yield, and whether that hits the target.

Then ITERATE INTERNALLY: if the current design would NOT reach the desired outcome, mentally revise it (conditions, ranges, controls, replication, readouts, factor levels) and re-predict, repeating until you either reach a design that plausibly hits the target or conclude the target is out of reach. Report how many internal iterations you reasoned through.

Return JSON with exactly:
- predictedResults — 2-4 sentences: the most likely outcome of the CURRENT design, with rough directions/magnitudes. Be concrete and honest, not optimistic.
- meetsTarget — true only if the CURRENT design (as written) plausibly achieves the desired outcome.
- confidence — 0..1 that the design (after your proposed changes) reaches the target.
- gapAnalysis — if meetsTarget is false, exactly what falls short and why. Empty string if it already meets the target.
- optimizedChanges — the concrete, prioritized design changes that would make the target reachable. EMPTY array only if meetsTarget is already true.
- iterationsReasoned — integer ≥ 1: how many what-if design revisions you worked through internally.

Never claim data you don't have — this is a prediction, clearly reasoned from the design and domain priors.`

  const user = `${problemBlock(problem)}

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
      response_format: zodResponseFormat(reasonedSchema, "simulation")
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
        createdAt: new Date().toISOString(),
        executed: false
      }
    : null

  return { result, completion, model, reason }
}
