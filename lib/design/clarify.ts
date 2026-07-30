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
    .max(8)
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
        ? "Your questions give the hypothesis agent a CLEAR DIRECTION so it can propose sharp, testable hypotheses and the downstream design is effective. The user is building THEIR OWN hypothesis here, so think like a senior bench scientist helping a colleague sharpen it into something concrete and runnable. Draw on the SELECTED PAPERS. Crucially: do NOT ask paper-by-paper 'based on paper X, take approach Y' one at a time. Instead, offer questions whose OPTIONS are sensible COMBINATIONAL approaches synthesized ACROSS the selected literature (e.g. 'Combine the pH-stabilization finding from [A] with the excipient screen from [B]'), and let the user pick MULTIPLE. Cover: the mechanism/direction of effect to pursue, which cross-paper approach combination to build on, the WORKING CONCENTRATION(S) of the molecule and the operating condition(s) the hypothesis assumes (ALWAYS ask this — the hypothesis and the downstream design both hinge on it), the PRIMARY READOUT that would measure the effect, the comparison/baseline, the expected magnitude or threshold, and what would falsify it. Keep it about scientific direction and the quantities the hypothesis commits to — leave the full prep/reagent/plate-layout detail to the design stage."
        : `Your questions make the EXPERIMENTAL DESIGN concrete and runnable for THIS lab. You are planning it step by step like a senior scientist so the user can follow your output as a bench protocol without confusion.

ASK ABOUT MATERIAL AVAILABILITY FIRST — how much material the researcher actually has on hand — because run count, working concentrations, and replication all follow from it. Make it the first question, and ASK IN THE UNITS THAT FIT THIS KIND OF STUDY:
- purified protein / small molecule / formulation work → mass (mg / g) AND the stock concentration (e.g. mg/mL)
- cell-based assays → number of vials/flasks, cell count (e.g. ×10^6 cells), passage number, plate format
- tissue/animal work → number of samples/animals, tissue mass
- nucleic acid work → µg of DNA/RNA and ng/µL concentration
Pick the units that match the domain/phase and the chosen hypothesis; never ask for "mg" of a cell line.

ASK SEPARATELY (its own question, not bundled into the one above) for the STOCK CONCENTRATION(S) of what they have (the as-supplied/as-stored concentration) — this is what the dilution and volume calculations key off. Frame it so free text is natural (e.g. "e.g. 50 mg/mL in 20 mM histidine, pH 5.5").

THEN cover, thinking like a senior bench scientist who has to PREP, CALCULATE, and SET UP this experiment tomorrow morning — every answer must be something you'd need before you could pipette:
- MAIN MOLECULE: how much is on hand, at what working concentration(s) the experiment runs, and the stock it's diluted from (already asked above — carry it through).
- NUMBER OF CONDITIONS and NUMBER OF REPLICATES the researcher wants (technical vs biological), since these set the plate/tube count and total material draw.
- OTHER CHEMICALS / REAGENTS / CONSUMABLES the experiment needs — buffers, diluents, excipients, stains, standards, kits, cell media, plates/tubes — what they already have vs must order, and at what grade/concentration. Do not assume; ask what's in the bench inventory.
- READOUT(S): the exact measurement(s) that answer the hypothesis (e.g. absorbance at X nm, fluorescence channel, %monomer by SEC, Ct, viability %), the instrument that produces each, and its key settings.
- CONTROLS / BLANKS / REFERENCE STANDARDS, and the comparison/baseline each condition is scored against.
- how much material must remain AFTER the first study (so later design iterations stay feasible), instruments/equipment actually available, number of runs feasible, success criteria (what result counts as a win), the intended statistical approach (test + power/replication), any secondary properties that must NOT be degraded, time constraints, and any other constraints.

GO DEEPER WHERE IT MAKES THE PROTOCOL EXECUTABLE. The bar is: someone who has never seen this project should be able to read the FINAL design and run it end-to-end without asking a question. Do not hold back on question count if the extra answer removes a real ambiguity in the prep or the calculations — ask what you need to get the dilution series, volumes, buffer/diluent, controls/blanks, replicate structure, plate/tube layout, incubation time+temperature, and readout instrument settings right. Every question must earn its place by changing a number, a reagent, or a step in the final protocol. Where the design legitimately supports several choices at once (multiple instruments, multiple readouts, multiple stressors), let the user select multiple.`

  const system = `You are a sharp, senior experimental-design reviewer (think rigorous PI in a group meeting). ${aim}

Rules:
- ONE ASK PER QUESTION. This is the most important rule. A question must request exactly ONE piece of information. NEVER bundle several parameters into one prompt - "How much material do you have, at what stock concentration, and how many conditions do you want?" is THREE questions and is unanswerable as one. If a prompt contains "and", "as well as", or more than one question mark, split it.
- Ask ONLY the highest-value questions - the ones whose answers most change the outcome. Quality over quantity.
- Each question is multiple-choice with 2–6 CONCRETE, domain-appropriate options (real values/levels/approaches, not vague labels). A free-text box is ALWAYS shown under the options, so don't add an "Other" option yourself.
- OPTIONS MUST BE SPECIFIC AND SUBSTANTIVE. Give real, pickable values for THIS system - actual concentrations with units, named buffers/excipients, named instruments, concrete counts. Generic filler ("Low / Medium / High", "Standard", "Typical", "Not sure", "Other", "Varies", "Depends") is FORBIDDEN as an option. If a quantity is genuinely continuous, offer realistic bracketed ranges instead (e.g. "10-25 mg/mL", "25-75 mg/mL", "75-150 mg/mL") so a pick still pins a number down.
- Give the FULL set of plausible answers, not two token choices: when the realistic answer space has 4-6 sensible values, list 4-6. Only drop to 2-3 options when the choice really is binary or ternary.
- FREE TEXT IS AUTHORITATIVE: the user may pick option(s) AND type extra context in the box. Downstream agents are told to honor BOTH — so phrase options so they compose cleanly with added free text, never as mutually exclusive when they needn't be.
- kind = "single" ONLY when exactly one answer can physically apply (e.g. one primary readout). Use kind = "multi" for anything a researcher might combine: study approaches, mechanisms, cross-paper approach combinations, instruments/equipment, stressors, assay formats, endpoint panels, controls. When in doubt, default to "multi".
- Be specific to THIS problem${checkpoint === "design" ? " and the chosen hypothesis" : checkpoint === "hypothesis" ? " and the selected literature" : ""} - reference the actual system, not generic placeholders.
- ${round > 1 ? "This is a follow-up round: ask ONLY questions still genuinely needed to remove ambiguity after the prior answers. If nothing material remains, return done=true with an empty questions array." : "Return 4–7 questions, each a SINGLE ask. Prefer fewer. Because every question is now one ask, spend the budget on the details that most change a number or a step in the final protocol, and let the free-text box collect the rest - do not try to cover everything."}
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
