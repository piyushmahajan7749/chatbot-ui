/**
 * The 4-section experiment-design pipeline, extracted from the inline
 * `case "design"` of app/api/design/[designid]/generate/route.ts so it can run
 * as discrete Inngest steps (each section is one gpt-5.5 call ≈ 2–3 min; four
 * serial sections blew Vercel's 300s function cap). Each `genX` is one
 * structured-output call; the Inngest worker wraps each in its own
 * `step.run(...)` so no single invocation exceeds the limit.
 *
 * Pure: no Firestore, no auth, no request context — inputs in, parsed sections
 * out. The azure-openai Proxy still coerces temperature / reasoning_effort /
 * max_completion_tokens.
 */
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import { v4 as uuidv4 } from "uuid"
import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import type {
  DesignContentV2,
  GeneratedDesign,
  Hypothesis,
  ProblemContext
} from "@/lib/design-agent"

// ── Schemas (one per section) ──────────────────────────────────────────────
const experimentSetupSchema = z.object({
  whatWillBeTested: z.string(),
  whatWillBeMeasured: z.string(),
  controlGroups: z.string(),
  experimentalGroups: z.string(),
  sampleTypes: z.string(),
  replicatesAndConditions: z.string(),
  specificRequirements: z.string()
})
const materialsSchema = z.object({
  toolsNeeded: z.string(),
  materialsList: z.string(),
  materialPreparation: z.string(),
  setupInstructions: z.string(),
  storageDisposal: z.string()
})
const protocolSchema = z.object({
  stepByStepProcedure: z.string(),
  timeline: z.string(),
  conditionsTable: z.string()
})
const analysisSchema = z.object({
  dataCollectionPlan: z.string(),
  statisticalAnalysis: z.string(),
  safetyNotes: z.string(),
  rationale: z.string()
})

export type SetupSection = z.infer<typeof experimentSetupSchema>
export type MaterialsSection = z.infer<typeof materialsSchema>
export type ProtocolSection = z.infer<typeof protocolSchema>
export type AnalysisSection = z.infer<typeof analysisSchema>

export interface DesignBlocks {
  problemBlock: string
  hypBlock: string
  litBlock: string
  papersBlock: string
}

const openai = () => getAzureOpenAIForDesign()
const MODEL = () => getDesignDeployment()

/** Build the shared prompt context blocks for one hypothesis. */
export function buildDesignBlocks(
  ctx: ProblemContext,
  existing: DesignContentV2,
  hyp: Hypothesis
): DesignBlocks {
  const litCtx = existing.literatureContext
  const litBlock = litCtx
    ? `\nLiterature context:\n- What others have done: ${litCtx.whatOthersHaveDone}\n- Good methods: ${litCtx.goodMethodsAndTools}\n- Pitfalls: ${litCtx.potentialPitfalls}`
    : ""

  const selectedPapersForDesign = (existing.papers ?? []).filter(
    p => p.selected
  )
  const papersBlock =
    selectedPapersForDesign.length > 0
      ? `\nSelected papers (chosen by the researcher as most relevant):\n${selectedPapersForDesign.map((p, i) => `[${i + 1}] ${p.title}${p.summary ? ` - ${p.summary}` : ""}`).join("\n")}`
      : ""

  const userPlan = (
    (ctx as { userProvidedPlan?: string }).userProvidedPlan || ""
  ).trim()
  const userPlanBlock = userPlan
    ? `\n\nUser-supplied draft procedure (treat this as the SCAFFOLDING to adopt; preserve structure/wording where reasonable, fill gaps, correct scientific errors, and complete missing sections such as material quantities, stats, safety):\n<user-plan>\n${userPlan}\n</user-plan>`
    : ""

  const wantsReplicates =
    (ctx as { includeReplicates?: string }).includeReplicates === "yes"
  const replicateDirective = wantsReplicates
    ? `\n\nREPLICATES: The researcher WANTS replicates. Include a sensible biological/technical replicate scheme (state n per group) and factor it into every vial-count, the conditions-table "n" column, all material totals, and the statistical power calculation.`
    : `\n\nREPLICATES: The researcher does NOT want replicates — design a SINGLE run per condition (n = 1). Do NOT multiply any count by a replicate factor. State plainly in the replicates/conditions field: "No replicates — single run per condition (n = 1)". Every conditions-table "n" column = 1, and all material totals = conditions × 1 × volume-per-sample (dead-volume buffer only, no replicate multiplier). The statistics section must reflect n = 1 (no replicate-based power calc; note the single-run limitation).`

  const userSuppliedNote = hyp.userSupplied
    ? `\nNOTE: This hypothesis was provided directly by the researcher. Treat it as a fixed input - do NOT rewrite, soften, or re-scope it. Design the experiment around it exactly as written.`
    : ""
  const hypBlock =
    `Hypothesis: ${hyp.text}\nExplanation: ${hyp.reasoning}` + userSuppliedNote

  // Researcher-supplied operating parameters (mandatory Problem field) +
  // pre-generation design spec (molecule concentration, condition count,
  // notes). These are AUTHORITATIVE — the design must use these exact numbers,
  // not invent generic placeholders.
  const additional = (ctx.additionalDetails || "").trim()
  const spec = ctx.designSpec
  const specLines = [
    spec?.moleculeConcentration
      ? `- Molecule / operating concentration: ${spec.moleculeConcentration}`
      : "",
    spec?.conditions
      ? `- Number / type of conditions to design: ${spec.conditions}`
      : "",
    spec?.notes ? `- Additional design instructions: ${spec.notes}` : ""
  ]
    .filter(Boolean)
    .join("\n")
  const directivesBlock =
    additional || specLines
      ? `\n\nRESEARCHER-SUPPLIED SPECIFICS (authoritative — use these EXACT values; do not substitute generic placeholders, and do not leave ranges vague):${additional ? `\nOperating parameters: ${additional}` : ""}${specLines ? `\n${specLines}` : ""}`
      : ""

  const formatDirective = `\n\nOUTPUT FORMATTING (strict):\n- Write every procedure / list as DISTINCT point-wise lines. NEVER pack multiple actions into one run-on sentence. If a step has branches, split them into their own numbered sub-lines (4a, 4b, 4c …), one action per line.\n- Every conditions table must be a well-formed Markdown table with a header row and one row per arm; all numbers carry units; include explicit baseline + control rows.\n- For every calculation, show it LINE BY LINE: each line = one arithmetic step with the numbers and units, followed by a short rationale for where each number comes from (e.g. "moles = 0.020 M × 0.250 L = 5.0e-3 mol — 20 mM target × 250 mL batch volume"). Never present a bare result without its derivation.`

  const problemBlock =
    `Research problem: ${[ctx.title, ctx.problemStatement].filter(Boolean).join(" - ")}\nGoal: ${ctx.goal || "Not specified"}\nVariables: ${((ctx as { variables?: string[] }).variables ?? []).join(", ") || "Not specified"}\nConstraints: ${((ctx as { constraints?: string[] }).constraints ?? []).join(", ") || "Not specified"}` +
    directivesBlock +
    userPlanBlock +
    replicateDirective +
    formatDirective

  return { problemBlock, hypBlock, litBlock, papersBlock }
}

const setupSummaryOf = (s: SetupSection) =>
  `Experimental design:\n- Testing: ${s.whatWillBeTested}\n- Measuring: ${s.whatWillBeMeasured}\n- Controls: ${s.controlGroups}\n- Experimental groups: ${s.experimentalGroups}\n- Samples: ${s.sampleTypes}\n- Replicates: ${s.replicatesAndConditions}`
const materialsSummaryOf = (m: MaterialsSection) =>
  `Materials: ${m.toolsNeeded}\nPreparation: ${m.materialPreparation}`
const protocolSummaryOf = (p: ProtocolSection) =>
  `Procedure summary: ${p.stepByStepProcedure.slice(0, 500)}...\nTimeline: ${p.timeline}`

// ── Phase 1: Experimental Setup ─────────────────────────────────────────────
export async function genSetup(blocks: DesignBlocks): Promise<SetupSection> {
  const completion = await openai().beta.chat.completions.parse({
    model: MODEL(),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are an expert experiment design scientist writing SOP-grade output. Every field is Markdown. Each section must use bolded lead-in labels and bullet / numbered lists - never walls of prose. Be specific: concentrations with units, temperatures in °C, volumes in mL/µL, durations in h/min, replicate counts, equipment grades.

Fields to produce:

- **whatWillBeTested** - one short paragraph stating the concrete test objective, then a bulleted list of the 2–4 specific variables / factors being manipulated.
- **whatWillBeMeasured** - bullet list. Each bullet: \`**Readout** - method - unit - expected range\`.
- **controlGroups** - bullet list. Each bullet: \`**Control name** - composition / condition - what it isolates\`.
- **experimentalGroups** - bullet list. Each bullet: \`**Group name** - condition - expected effect\`.
- **sampleTypes** - bulleted. Describe sample matrix, concentration, container (material, volume, cap type), aliquot strategy.
- **replicatesAndConditions** - bullet list. Give n per group (biological / technical), total vial count math, and any blocking / randomization scheme. Example line: \`n = 3 biological × 5 formulation × 2 temperatures = 30 vials\`.
- **specificRequirements** - anything out-of-ordinary: BSL level, cold-chain, light-sensitive handling, certified reference standards, specific instrument calibration. Bullet list with bold hazard / requirement class.

Do not output plain paragraphs. Every field uses bullets and/or bolded labels.`
      },
      {
        role: "user",
        content: `${blocks.problemBlock}\n\n${blocks.hypBlock}${blocks.litBlock}${blocks.papersBlock}\n\nDesign the experimental setup per the SOP format. Reference specific methods or findings from the selected papers where relevant, citing as [Author, Year].`
      }
    ],
    response_format: zodResponseFormat(experimentSetupSchema, "experimentSetup")
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error("Empty response from Phase 1 (setup)")
  return parsed
}

// ── Phase 2: Materials & Setup ──────────────────────────────────────────────
export async function genMaterials(
  blocks: DesignBlocks,
  setup: SetupSection
): Promise<MaterialsSection> {
  const completion = await openai().beta.chat.completions.parse({
    model: MODEL(),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are a lab materials planner writing SOP-grade output. All five fields are Markdown. Be concrete: numbers, units, vendors, catalog numbers, grades - not prose.

1. **toolsNeeded** - Markdown bullet list. Each bullet: **Tool** - model / spec - example vendor (e.g. *Thermo Fisher*) - quantity needed.

2. **materialsList** - Return a Markdown TABLE with columns:
   \`| Material | Grade / Spec | Example Vendor | Cat. # (example) | Amount per condition | Total needed | Calculation |\`
   Rules:
   - Compute **Total needed** for every row from the experimental plan's conditions × replicates × volume-per-replicate (plus a 10–15% dead-volume buffer). Show the math in the **Calculation** column (e.g. *30 vials × 1.0 mL × 1.15 = 34.5 mL*).
   - Include every buffer, excipient, consumable, and sample-handling item needed end-to-end.
   - After the table, add a bullet list **"Raw-material totals"** consolidating bulk-ordered items (e.g. *L-arginine·HCl powder: ~12 g covering all formulation prep + 2× overage*).

3. **materialPreparation** - For EACH buffer, stock solution, or reagent that must be prepared, write a Markdown sub-section like:
   \`### Buffer name (e.g. 20 mM Histidine, pH 6.0)\`
   - **Volume needed:** 250 mL (covers X mL × Y conditions × 1.2 dead-volume)
   - **Target concentration / pH:** 20 mM, pH 6.0 at 25 °C
   - **Stock used:** histidine base (MW 155.16), 1 N HCl for pH, WFI
   - **Calculation:** show the math step by step using \`C1V1 = C2V2\` where applicable, e.g.
     - moles needed = 0.020 M × 0.250 L = 5.0 × 10⁻³ mol
     - mass = 5.0 × 10⁻³ × 155.16 = 0.776 g histidine base
   - **Step-by-step prep:**
     1. Weigh 0.776 g L-histidine base on analytical balance.
     2. Dissolve in 200 mL WFI in a 250 mL volumetric flask.
     3. Titrate to pH 6.0 at 25 °C with 1 N HCl (expect ~3–4 mL).
     4. QS to 250 mL with WFI. Invert 10× to mix.
     5. Filter through 0.22 µm PES. Label with date + initials + lot. Store 2–8 °C, use within 14 days.
   Do one subsection per buffer/reagent. Be quantitative.

4. **setupInstructions** - Numbered Markdown list describing workstation / equipment setup (balance calibration, pH-meter cal, biosafety cabinet setup, vial labeling scheme, temperature blocks). Each step has a bolded lead-in verb.

5. **storageDisposal** - Markdown bullets. For each material class: storage condition, container type, disposal stream (e.g. *Aqueous biowaste - 10% bleach, 30-min soak, rinse down sink; log in biohazard register*). Use bold labels.

Never use placeholder text like "TBD" - if a spec is reasonable to infer, infer it and mark the assumption.`
      },
      {
        role: "user",
        content: `${blocks.problemBlock}\n\n${blocks.hypBlock}\n\n${setupSummaryOf(setup)}${blocks.papersBlock}\n\nProduce the five fields in the SOP format above. Base material quantities on the conditions × replicates you see in the experimental setup summary.`
      }
    ],
    response_format: zodResponseFormat(materialsSchema, "materials")
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error("Empty response from Phase 2 (materials)")
  return parsed
}

// ── Phase 3: Protocol & Timeline ────────────────────────────────────────────
export async function genProtocol(
  blocks: DesignBlocks,
  setup: SetupSection,
  materials: MaterialsSection
): Promise<ProtocolSection> {
  const completion = await openai().beta.chat.completions.parse({
    model: MODEL(),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are an experimental protocol writer producing SOP-grade Markdown. All three fields must be scannable and copy-exec ready.

- **stepByStepProcedure** - A single numbered Markdown list. Each step begins with a **bold imperative verb** ("**Weigh**", "**Dissolve**", "**Filter**", "**Incubate**", "**Aliquot**") followed by concrete quantities + times + temperatures + equipment. Group steps under Markdown sub-headings like \`### Day 1 - Buffer prep\`, \`### Day 2 - Formulation\`, \`### Day 3–28 - Stress incubation\`, \`### Day 28 - Readouts\`. When a step has multiple actions or branches, ALWAYS split them into separate sub-step lines (\`4a.\`, \`4b.\`, \`4c.\` …) — each on its OWN line, one action per line. NEVER combine several actions into one run-on sentence. Include a short **"Checkpoint"** bold callout after each major phase listing what the operator should verify before continuing (e.g. *Checkpoint: pH reads 6.00 ± 0.05 on calibrated meter; monomer content by SEC ≥ 99% pre-stress*).

- **timeline** - Markdown table:
  \`| Day | Activity | Duration | Notes |\`
  One row per scheduled day / phase. Notes column carries dependencies, decision points, and who performs the step.

- **conditionsTable** - Markdown table describing every experimental arm. At minimum:
  \`| Group | Condition / composition | Variable 1 | Variable 2 | T (°C) | Time | n | Read-outs |\`
  Include baseline and stressed controls explicitly as their own rows. All numbers must have units. Add a short paragraph above the table summarizing the factorial structure (e.g. "5 arginine levels × 2 temperatures × 3 biological replicates = 30 vials"). Do not return prose in place of a table.`
      },
      {
        role: "user",
        content: `${blocks.problemBlock}\n\n${blocks.hypBlock}\n\n${setupSummaryOf(setup)}\n\n${materialsSummaryOf(materials)}\n\nWrite the step-by-step protocol (by day, with Checkpoints), timeline table, and conditions table per the SOP format.`
      }
    ],
    response_format: zodResponseFormat(protocolSchema, "protocol")
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error("Empty response from Phase 3 (protocol)")
  return parsed
}

// ── Phase 4: Analysis & Safety ──────────────────────────────────────────────
export async function genAnalysis(
  blocks: DesignBlocks,
  setup: SetupSection,
  materials: MaterialsSection,
  protocol: ProtocolSection
): Promise<AnalysisSection> {
  const completion = await openai().beta.chat.completions.parse({
    model: MODEL(),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are a data analysis and safety review specialist. Given a complete experimental plan, produce four SEPARATE sections as Markdown. Each section must start with a bolded lead-in sentence and use clear bullet lists - do not return walls of prose.

1. **dataCollectionPlan** - capture mechanics ONLY. What measurements are recorded, when (timepoints), how (instrument / method / file format), by whom, and how they're stored. Do NOT talk about statistics here.

2. **statisticalAnalysis** - the dedicated stats plan. Structure it with these labeled sub-bullets:
   - **Primary endpoint & test** - name the specific test (e.g. two-way ANOVA with Tukey HSD; mixed-effects model; Mann–Whitney). Justify the choice vs the data type and replicate structure.
   - **Sample size / power** - state assumed effect size and variance, target power (e.g. 0.8), alpha (usually 0.05), and the computed n per group. Show a short power calculation.
   - **Secondary endpoints** - list and their tests.
   - **Multiple comparisons** - correction method (Bonferroni / BH-FDR / Tukey).
   - **Outlier / missing-data handling** - rule (e.g. Grubbs, ROUT, or pre-registered exclusion).
   - **Software** - concrete tools / packages (GraphPad Prism, R + lme4, Python + scipy.stats / statsmodels).

3. **safetyNotes** - bulleted. Cover PPE, chemical hazards, biosafety level, waste stream, spill response. Start each bullet with a **bold hazard class** then the mitigation.

4. **rationale** - 3–5 short paragraphs explaining why this design answers the hypothesis, what confounders it controls, and what the pass/fail decision criteria are.`
      },
      {
        role: "user",
        content: `${blocks.problemBlock}\n\n${blocks.hypBlock}\n\n${setupSummaryOf(setup)}\n\n${materialsSummaryOf(materials)}\n\n${protocolSummaryOf(protocol)}\n\nReturn the four sections (dataCollectionPlan, statisticalAnalysis, safetyNotes, rationale) per the system-prompt format.`
      }
    ],
    response_format: zodResponseFormat(analysisSchema, "analysis")
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error("Empty response from Phase 4 (analysis)")
  return parsed
}

/** Assemble the 4 parsed sections into a GeneratedDesign (canonical SOP order). */
export function assembleDesign(
  hyp: Hypothesis,
  setup: SetupSection,
  materials: MaterialsSection,
  protocol: ProtocolSection,
  analysis: AnalysisSection
): GeneratedDesign {
  return {
    id: `d-${uuidv4()}`,
    hypothesisId: hyp.id,
    title: hyp.text.slice(0, 80),
    sections: [
      { heading: "What Will Be Tested", body: setup.whatWillBeTested },
      { heading: "What Will Be Measured", body: setup.whatWillBeMeasured },
      { heading: "Control Groups", body: setup.controlGroups },
      { heading: "Experimental Groups", body: setup.experimentalGroups },
      { heading: "Sample Types", body: setup.sampleTypes },
      {
        heading: "Replicates & Conditions",
        body: setup.replicatesAndConditions
      },
      { heading: "Conditions Table", body: protocol.conditionsTable },
      { heading: "Special Requirements", body: setup.specificRequirements },
      { heading: "Tools & Equipment", body: materials.toolsNeeded },
      { heading: "Materials List", body: materials.materialsList },
      { heading: "Material Preparation", body: materials.materialPreparation },
      { heading: "Setup Instructions", body: materials.setupInstructions },
      { heading: "Storage & Disposal", body: materials.storageDisposal },
      { heading: "Step-by-Step Procedure", body: protocol.stepByStepProcedure },
      { heading: "Timeline", body: protocol.timeline },
      { heading: "Data Collection Plan", body: analysis.dataCollectionPlan },
      { heading: "Statistical Analysis", body: analysis.statisticalAnalysis },
      { heading: "Safety Notes", body: analysis.safetyNotes },
      { heading: "Rationale", body: analysis.rationale }
    ],
    saved: false
  }
}
