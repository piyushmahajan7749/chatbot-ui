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
