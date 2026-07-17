/**
 * "Refine" clarifying-question engine. At two checkpoints - after the problem
 * (before literature) and after the chosen hypothesis (before design) - a sharp
 * experimental-design reviewer asks the highest-value questions to remove
 * ambiguity, so literature is on-target and the design is specific (job stories
 * 1, 2, 3). Questions are MCQ (model-picked options) + an always-allowed
 * free-text "other". Adaptive: a second round drills in if answers are vague,
 * capped so it never drags.
 *
 * Pure-ish: inputs in, questions out. The Azure Proxy coerces reasoning params.
 */
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import type {
  ClarifyAnswer,
  ClarifyQuestion,
  ProblemContext
} from "@/lib/design-agent"
import type { ClarifyCheckpoint } from "./clarify-shared"

export type { ClarifyCheckpoint } from "./clarify-shared"
export {
  CLARIFY_MAX_ROUNDS,
  CLARIFY_MAX_TOTAL,
  clarifyAnswersToText
} from "./clarify-shared"

const questionSchema = z.object({
  done: z.boolean(),
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        kind: z.enum(["single", "multi"]),
        options: z.array(z.string()).min(2).max(6),
        rationale: z.string().optional()
      })
    )
    .max(5)
})

const openai = () => getAzureOpenAIForDesign()
const MODEL = () => getDesignDeployment()

function rid(): string {
  // Stable-ish id without Date.now/Math.random restrictions (server route is
  // a normal Node runtime, but keep it cheap + collision-safe enough per call).
  return `q-${Math.random().toString(36).slice(2, 10)}`
}

function priorBlock(answers: ClarifyAnswer[] | undefined): string {
  if (!answers || answers.length === 0) return ""
  const lines = answers.map(a => {
    const val = a.skipped
      ? "(skipped - assume a sensible default)"
      : [a.selected.join(", "), a.other].filter(Boolean).join(" · ") ||
        "(blank)"
    return `- ${a.prompt} → ${val}`
  })
  return `\n\nAlready answered:\n${lines.join("\n")}`
}

export interface GenerateClarifyArgs {
  checkpoint: ClarifyCheckpoint
  ctx: ProblemContext
  /** Chosen hypothesis text (design checkpoint only). */
  hypothesis?: string
  /** Short literature context summary (design checkpoint, optional). */
  literature?: string
  priorAnswers?: ClarifyAnswer[]
  /** Round index (1-based). Round > 1 only drills in if needed. */
  round?: number
}

/**
 * Ask the model for the next batch of clarifying questions. `done: true` means
 * the model judges there's nothing material left to ask. The caller enforces
 * the round / total caps regardless.
 */
export async function generateClarifyingQuestions(
  args: GenerateClarifyArgs
): Promise<{ questions: ClarifyQuestion[]; done: boolean }> {
  const { checkpoint, ctx, hypothesis, literature, priorAnswers } = args
  const round = args.round ?? 1

  const problemBlock = [
    `Research problem: ${[ctx.title, ctx.problemStatement].filter(Boolean).join(" - ") || "Not specified"}`,
    ctx.objective ? `Goal: ${ctx.objective}` : "",
    ctx.domain ? `Domain: ${ctx.domain}` : "",
    ctx.phase ? `Phase: ${ctx.phase}` : ""
  ]
    .filter(Boolean)
    .join("\n")

  const aim =
    checkpoint === "problem"
      ? "Your questions FINE-TUNE a LITERATURE SEARCH so it surfaces the primary research most relevant to THIS problem statement and the stated objective. Anchor EVERY question on the PROBLEM + OBJECTIVE the researcher gave — sharpen the SAME direction, do not widen it. Capture only what changes WHICH papers get found: (a) the specific target system/molecule/material in play; (b) the mechanism or methodological approach family the objective implies (e.g. which formulation route, which assay family, which stabilization strategy); (c) the primary readout/endpoint that marks progress toward the objective.\n\nRULES SPECIFIC TO SEARCH TUNING:\n- STAY ON the problem + objective. Do NOT ask about downstream design trade-offs — secondary properties that must not be affected, 'what else shouldn't be impacted', instruments, run counts, statistics, material budgets. Those belong to the DESIGN stage, not the search. Asking them here dilutes the search and hurts result quality.\n- Every answer is a STEERING SIGNAL, not a hard filter. Numeric values (concentrations, ranges) guide direction only; the literature agent must still surface strong methodologically-relevant adjacent work. Frame options as 'best represents your system', never 'only'.\n- Prefer questions whose answers change the KIND of paper found (system, mechanism family, approach, readout) over minor numeric details."
      : checkpoint === "hypothesis"
        ? "Your questions give the hypothesis agent a CLEAR DIRECTION so it can propose sharp, testable hypotheses and the downstream design is effective. Draw on the SELECTED PAPERS. Crucially: do NOT ask paper-by-paper 'based on paper X, take approach Y' one at a time. Instead, offer questions whose OPTIONS are sensible COMBINATIONAL approaches synthesized ACROSS the selected literature (e.g. 'Combine the pH-stabilization finding from [A] with the excipient screen from [B]'), and let the user pick MULTIPLE. Cover: the mechanism/direction of effect to pursue, which cross-paper approach combination to build on, the WORKING CONCENTRATION(S) of the molecule and the operating condition(s) the hypothesis assumes (ALWAYS ask this — the hypothesis and the downstream design both hinge on it), the comparison/baseline, the expected magnitude or threshold, and what would falsify it."
        : "Your questions make the EXPERIMENTAL DESIGN concrete and runnable for THIS lab. ASK ABOUT MATERIAL AVAILABILITY FIRST — how much of the molecule/sample/reagent the researcher actually has on hand — because the number of runs, working concentrations, and replication all follow from it; make that the first question. THEN cover: how much material must remain AFTER the first study (so later design iterations stay feasible), instruments/equipment actually available, number of runs/experiments feasible, working concentration(s), success criteria (what result counts as a win), the intended statistical approach (test + power/replication), any secondary properties that must NOT be degraded by the intervention (the 'what else shouldn't be impacted' concerns), time constraints, and any other constraints the researcher flags. Where the design legitimately supports several choices at once (multiple instruments, multiple readouts, multiple stressors), let the user select multiple."

  const system = `You are a sharp, senior experimental-design reviewer (think rigorous PI in a group meeting). ${aim}

Rules:
- Ask ONLY the highest-value questions - the ones whose answers most change the outcome. Quality over quantity.
- Each question is multiple-choice with 2–6 CONCRETE, domain-appropriate options (real values/levels/approaches, not vague labels). A free-text box is ALWAYS shown under the options, so don't add an "Other" option yourself.
- FREE TEXT IS AUTHORITATIVE: the user may pick option(s) AND type extra context in the box. Downstream agents are told to honor BOTH — so phrase options so they compose cleanly with added free text, never as mutually exclusive when they needn't be.
- kind = "single" ONLY when exactly one answer can physically apply (e.g. one primary readout). Use kind = "multi" for anything a researcher might combine: study approaches, mechanisms, cross-paper approach combinations, instruments/equipment, stressors, assay formats, endpoint panels, controls. When in doubt, default to "multi".
- Be specific to THIS problem${checkpoint === "design" ? " and the chosen hypothesis" : checkpoint === "hypothesis" ? " and the selected literature" : ""} - reference the actual system, not generic placeholders.
- ${round > 1 ? "This is a follow-up round: ask ONLY questions still genuinely needed to remove ambiguity after the prior answers. If nothing material remains, return done=true with an empty questions array." : "Return 3–5 questions."}
- This is a BENCH / wet-lab program ONLY. NEVER ask whether the work is computational vs bench, in-silico vs experimental, or dry-lab vs wet-lab — always assume bench.
- Never ask for information already provided.`

  const user = `${problemBlock}${
    hypothesis ? `\n\nChosen hypothesis: ${hypothesis}` : ""
  }${literature ? `\n\nLiterature context: ${literature}` : ""}${priorBlock(
    priorAnswers
  )}\n\nReturn the clarifying questions as structured JSON.`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL(),
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: zodResponseFormat(questionSchema, "clarify")
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (!parsed) return { questions: [], done: true }
    return {
      done: parsed.done,
      questions: parsed.questions.map(q => ({
        id: rid(),
        prompt: q.prompt,
        kind: q.kind,
        options: q.options,
        rationale: q.rationale
      }))
    }
  } catch (e) {
    console.error("[clarify] generation failed", e)
    return { questions: [], done: true }
  }
}
