import { LiteratureScoutOutput } from "../../types"

// Generation agent prompt template
export interface GenerationPromptConfig {
  system: string
  user: string
  temperature: number
  maxTokens: number
}

export interface SelectedPaper {
  index: number
  title: string
  summary: string
  sourceUrl?: string
}

export function getGenerationPrompt(
  plan: {
    title: string
    description: string
    constraints?: Record<string, any>
  },
  literatureContext?: LiteratureScoutOutput,
  selectedPapers?: SelectedPaper[]
): GenerationPromptConfig {
  const hasPapers = selectedPapers && selectedPapers.length > 0
  const hasLitContext = !!literatureContext

  const system = `You are a **Hypothesis Generation Agent** specialized in creating testable scientific hypotheses for biopharma research.

Your task is to generate clear, specific, and testable hypotheses based on the research plan provided. Each hypothesis should:
- Be directly testable in a laboratory setting
- Clearly define the relationship or effect being tested
- Use correct scientific terminology
- Be grounded in scientific principles
${hasLitContext || hasPapers ? "- Leverage insights from the provided literature and selected papers" : ""}

Output format: Return a JSON object with a "hypotheses" array containing exactly 4 distinct hypotheses:
{
  "hypotheses": [
    {
      "hypothesis": "string - the testable hypothesis statement",
      "explanation": "string - brief explanation of why this hypothesis is scientifically sound",
      "provenance": ["For EACH source, reference the paper by its [N] index and title. Format: '[N] Paper Title - how this paper informed the hypothesis'. If no papers were provided, describe your scientific reasoning instead."],
      "feasibility_score": number (0-1),
      "novelty_score": number (0-1)
    }
  ]
}

# DIVERSITY REQUIREMENTS (CRITICAL)

Each of the 4 hypotheses MUST differ from the others on at least ONE of these axes, and no two hypotheses may pick the same combination:
- **Mechanism** (e.g. thermodynamic vs. kinetic, electrostatic vs. hydrophobic, enzymatic vs. non-enzymatic)
- **Independent variable** (e.g. pH vs. ionic strength vs. temperature vs. excipient concentration)
- **Intervention modality** (e.g. formulation change vs. process change vs. analytical readout change)
- **Assay readout** (e.g. SEC vs. DLS vs. DSC vs. mass spectrometry)

Hypotheses MUST NOT share more than ONE noun-phrase core. If two hypotheses differ only in wording (e.g. "higher salt reduces aggregation" vs. "increased ionic strength decreases aggregate formation"), COLLAPSE them — they count as ONE hypothesis, and you must replace the duplicate with a genuinely different angle.

Examples:
- ❌ REJECTED (paraphrases of the same idea):
  1. "Increasing sucrose concentration reduces protein aggregation during freeze-thaw."
  2. "Higher levels of sucrose result in less aggregation after freeze-thaw cycles."
- ✅ ACCEPTED (genuinely distinct angles):
  1. "Increasing sucrose concentration reduces protein aggregation during freeze-thaw." (excipient / thermodynamic stabilization)
  2. "Lowering pH below the pI accelerates colloidal instability, measurable by DLS." (pH / colloidal / DLS)
  3. "Adding polysorbate-80 mitigates interfacial aggregation at the air-liquid interface." (surfactant / interfacial / visual inspection)
  4. "Controlled freezing rate (<1°C/min) reduces ice-interface damage, measurable by SEC." (process / cryo-kinetics / SEC)

IMPORTANT: Each hypothesis must explore a DIFFERENT angle, variable, or mechanism. Do not produce minor variations of the same idea.`

  let user = `Research Plan:
Title: ${plan.title}
Description: ${plan.description}
Constraints: ${JSON.stringify(plan.constraints || {})}`

  // Include the actual selected papers the user chose
  if (hasPapers) {
    user += `\n\nSelected Papers (the researcher chose these as most relevant):`
    for (const p of selectedPapers!) {
      user += `\n[${p.index}] ${p.title}`
      if (p.summary) user += `\n    Summary: ${p.summary}`
      if (p.sourceUrl) user += `\n    URL: ${p.sourceUrl}`
    }
  }

  // Include the synthesized literature insights
  if (hasLitContext) {
    user += `\n\nLiterature Insights (synthesized from broader search):
What Others Have Done: ${literatureContext!.whatOthersHaveDone}
Good Methods & Tools: ${literatureContext!.goodMethodsAndTools}
Potential Pitfalls: ${literatureContext!.potentialPitfalls}`
  }

  user += `\n\nGenerate 4 distinct testable hypotheses for this research plan. Each should explore a different angle.`

  if (hasPapers) {
    user += ` Ground each hypothesis in the selected papers — reference them by [N] index in the provenance array.`
  }

  return {
    system,
    user,
    temperature: 0.7,
    maxTokens: 1000
  }
}
