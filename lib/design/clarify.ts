/**
 * "Refine" clarifying-question engine. At two checkpoints — after the problem
 * (before literature) and after the chosen hypothesis (before design) — a sharp
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
      ? "(skipped — assume a sensible default)"
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
      ? "Your questions will steer a LITERATURE SEARCH and the downstream design. Focus on what's needed to find the RIGHT primary research and to scope the study: target system/molecule + operating concentrations, the specific variable(s) under test and their ranges, the readouts/endpoints, key constraints (material available, time, equipment), and what 'success' looks like."
      : checkpoint === "hypothesis"
        ? "Your questions will drive HYPOTHESIS GENERATION from the selected literature. Go deep on what shapes a sharp, testable hypothesis: the proposed mechanism / direction of effect, which variable(s) the hypothesis should center on, the comparison/baseline it's framed against, the expected magnitude or threshold of effect, what result would FALSIFY it, and which findings from the selected papers it should build on or challenge."
        : "Your questions will drive EXPERIMENTAL DESIGN GENERATION. Focus on what makes the design concrete and runnable: working/stock concentrations, exact factor levels + how many conditions (an upper bound, not a quota), controls that must be included, stress/parameter settings (e.g. temperature, agitation/rotation speed, pH, time), replicate intent, and measurement methods."

  const system = `You are a sharp, senior experimental-design reviewer (think rigorous PI in a group meeting). ${aim}

Rules:
- Ask ONLY the highest-value questions — the ones whose answers most change the outcome. Quality over quantity.
- Each question is multiple-choice with 2–6 CONCRETE, domain-appropriate options (real values/levels, not vague labels). A free-text answer is always available to the user on top, so don't add an "Other" option yourself.
- kind = "single" when one answer fits, "multi" when several can apply.
- Be specific to THIS problem${checkpoint === "design" ? " and the chosen hypothesis" : checkpoint === "hypothesis" ? " and the selected literature" : ""} — reference the actual system, not generic placeholders.
- ${round > 1 ? "This is a follow-up round: ask ONLY questions still genuinely needed to remove design ambiguity after the prior answers. If nothing material remains, return done=true with an empty questions array." : "Return 3–5 questions."}
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
