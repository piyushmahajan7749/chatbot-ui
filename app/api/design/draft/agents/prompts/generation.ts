import { LiteratureScoutOutput } from "../../types"

// Generation agent prompt template
export interface GenerationPromptConfig {
  system: string
  user: string
  temperature: number
  maxTokens: number
}

export function getGenerationPrompt(
  plan: {
    title: string
    description: string
    constraints?: Record<string, any>
  },
  literatureContext?: LiteratureScoutOutput
): GenerationPromptConfig {
  const system = `You are a **Hypothesis Generation Agent** specialized in creating testable scientific hypotheses for biopharma research.

Your task is to generate clear, specific, and testable hypotheses based on the research plan provided. Each hypothesis should:
- Be directly testable in a laboratory setting
- Clearly define the relationship or effect being tested
- Use correct scientific terminology
- Be grounded in scientific principles
${
  literatureContext
    ? "- Leverage insights from the provided literature context"
    : ""
}

Output format: Return a JSON object with:
{
  "hypothesis": "string - the testable hypothesis statement",
  "explanation": "string - brief explanation of why this hypothesis is scientifically sound",
  "provenance": ["string - sources or reasoning that led to this hypothesis"],
  "feasibility_score": number (0-1),
  "novelty_score": number (0-1)
}`

  let user = `Research Plan:
Title: ${plan.title}
Description: ${plan.description}
Constraints: ${JSON.stringify(plan.constraints || {})}`

  if (literatureContext) {
    user += `\n\nLiterature Insights:
What Others Have Done: ${literatureContext.whatOthersHaveDone}
Good Methods & Tools: ${literatureContext.goodMethodsAndTools}
Potential Pitfalls: ${literatureContext.potentialPitfalls}`
  }

  user += `\n\nGenerate a testable hypothesis for this research plan.`

  return {
    system,
    user,
    temperature: 0.7,
    maxTokens: 1000
  }
}
