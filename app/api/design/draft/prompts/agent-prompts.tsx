import { Fragment, type ReactElement, type ReactNode } from "react"
import {
  Context,
  Instructions,
  Constraints,
  Formatting,
  Output,
  Data,
  Documents,
  Document,
  Findings,
  Summary,
  Analysis,
  Result,
  Task,
  prompt
} from "react-prompt-kit"

import { designAgentPromptSchemas } from "@/lib/design/prompt-schemas"
import {
  AgentPromptOverrides,
  DesignAgentPromptId,
  PromptSectionOverrides,
  PromptSectionType
} from "@/types/design-prompts"

import { ExperimentDesignState } from "../types"

type SectionOverride = PromptSectionOverrides | undefined

const sectionComponentMap: Record<
  PromptSectionType,
  (props: { children: ReactNode }) => ReactElement
> = {
  context: Context,
  instructions: Instructions,
  constraints: Constraints,
  formatting: Formatting,
  output: Output
}

const defaultSectionComponent = Context

const sourceLabels: Record<string, string> = {
  pubmed: "PubMed",
  arxiv: "ArXiv",
  semanticScholar: "Semantic Scholar",
  scholar: "Google Scholar",
  tavily: "Recent Web"
}

const getSectionValue = (
  sectionId: string,
  overrides: SectionOverride,
  fallback: string
) => {
  const value = overrides?.sections?.[sectionId]
  return value && value.trim().length > 0 ? value : fallback
}

const buildEditableSections = (
  agentId: DesignAgentPromptId,
  overrides: SectionOverride
) => {
  const schema = designAgentPromptSchemas[agentId]
  return schema.sections.map(section => {
    const value = getSectionValue(section.id, overrides, section.defaultValue)
    const Component =
      sectionComponentMap[section.type] || defaultSectionComponent
    return (
      <Component key={`${agentId}-${section.id}`}>
        <p>{value}</p>
      </Component>
    )
  })
}

const renderList = (label: string, items?: string[]) => {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <>
      <p>{label}:</p>
      <ul>
        {items.map((item, index) => (
          <li key={`${label}-${index}`}>{item}</li>
        ))}
      </ul>
    </>
  )
}

const renderPlanContext = (state: ExperimentDesignState) => (
  <Data>
    <Task>
      <p>Research Problem: {state.problem || "Not specified"}</p>
    </Task>
    {renderList("Objectives", state.objectives)}
    {renderList("Variables", state.variables)}
    {renderList("Special Considerations", state.specialConsiderations)}
  </Data>
)

const renderLiteratureSummary = (
  state: ExperimentDesignState,
  options?: { includeCitations?: boolean }
) => {
  if (!state.literatureScoutOutput) {
    return null
  }

  const output = state.literatureScoutOutput
  return (
    <Findings>
      <p>What Others Have Done:</p>
      <p>{output.whatOthersHaveDone}</p>
      <p>Good Methods and Tools:</p>
      <p>{output.goodMethodsAndTools}</p>
      <p>Potential Pitfalls:</p>
      <p>{output.potentialPitfalls}</p>
      {options?.includeCitations && output.citations?.length > 0 && (
        <>
          <p>Citations:</p>
          <ul>
            {output.citations.map((citation, index) => (
              <li key={`citation-${index}`}>{citation}</li>
            ))}
          </ul>
        </>
      )}
    </Findings>
  )
}

const renderHypothesisData = (state: ExperimentDesignState) => {
  if (!state.hypothesisBuilderOutput) {
    return null
  }
  return (
    <Summary>
      <p>Hypothesis: {state.hypothesisBuilderOutput.hypothesis}</p>
      {state.hypothesisBuilderOutput.explanation && (
        <p>Explanation: {state.hypothesisBuilderOutput.explanation}</p>
      )}
    </Summary>
  )
}

const renderExperimentDesignData = (state: ExperimentDesignState) => {
  if (!state.experimentDesignerOutput) {
    return null
  }

  const design = state.experimentDesignerOutput.experimentDesign
  const execution = state.experimentDesignerOutput.executionPlan

  return (
    <Result>
      <p>Experiment Design Overview:</p>
      <ul>
        <li>What Will Be Tested: {design.whatWillBeTested}</li>
        <li>What Will Be Measured: {design.whatWillBeMeasured}</li>
        <li>Control Groups: {design.controlGroups}</li>
        <li>Experimental Groups: {design.experimentalGroups}</li>
        <li>Sample Types: {design.sampleTypes}</li>
        <li>Tools Needed: {design.toolsNeeded}</li>
        <li>Replicates & Conditions: {design.replicatesAndConditions}</li>
        <li>Specific Requirements: {design.specificRequirements}</li>
      </ul>
      <p>Execution Plan:</p>
      <ul>
        <li>Materials List: {execution.materialsList}</li>
        <li>Material Preparation: {execution.materialPreparation}</li>
        <li>Step-by-Step Procedure: {execution.stepByStepProcedure}</li>
        <li>Timeline: {execution.timeline}</li>
        <li>Setup Instructions: {execution.setupInstructions}</li>
        <li>Data Collection Plan: {execution.dataCollectionPlan}</li>
        <li>Conditions Table: {execution.conditionsTable}</li>
        <li>Storage & Disposal: {execution.storageDisposal}</li>
        <li>Safety Notes: {execution.safetyNotes}</li>
      </ul>
      {state.experimentDesignerOutput.rationale && (
        <p>Rationale: {state.experimentDesignerOutput.rationale}</p>
      )}
    </Result>
  )
}

const renderStatCheckData = (state: ExperimentDesignState) => {
  if (!state.statCheckOutput) {
    return null
  }

  const review = state.statCheckOutput
  return (
    <Analysis>
      <p>What Looks Good:</p>
      <p>{review.whatLooksGood}</p>
      {review.problemsOrRisks?.length > 0 && (
        <>
          <p>Problems or Risks:</p>
          <ul>
            {review.problemsOrRisks.map((risk, index) => (
              <li key={`risk-${index}`}>{risk}</li>
            ))}
          </ul>
        </>
      )}
      {review.suggestedImprovements?.length > 0 && (
        <>
          <p>Suggested Improvements:</p>
          <ul>
            {review.suggestedImprovements.map((tip, index) => (
              <li key={`tip-${index}`}>{tip}</li>
            ))}
          </ul>
        </>
      )}
      <p>Overall Assessment: {review.overallAssessment}</p>
    </Analysis>
  )
}

const renderSearchDocuments = (searchResults: any) => {
  if (!searchResults || !searchResults.sources) {
    return null
  }

  const sourceOrder = [
    "pubmed",
    "arxiv",
    "semanticScholar",
    "scholar",
    "tavily"
  ]

  const sections = sourceOrder
    .map(source => {
      const items = searchResults.sources[source] || []
      if (!items.length) {
        return null
      }
      return (
        <Document key={source}>
          <p>
            {sourceLabels[source] || source} ({items.length} results)
          </p>
          <ul>
            {items.slice(0, 3).map((paper: any, index: number) => (
              <li key={`${source}-${index}`}>
                {`${index + 1}. ${paper.title || "Untitled"}`}
                {paper.authors?.length
                  ? ` | Authors: ${paper.authors.join(", ")}`
                  : ""}
                {paper.journal ? ` | Journal: ${paper.journal}` : ""}
                {paper.publishedDate ? ` | Year: ${paper.publishedDate}` : ""}
                {paper.url ? ` | URL: ${paper.url}` : ""}
                {paper.abstract
                  ? ` | Abstract: ${paper.abstract.substring(0, 200)}...`
                  : ""}
              </li>
            ))}
          </ul>
        </Document>
      )
    })
    .filter(Boolean)

  if (sections.length === 0) {
    return null
  }

  return (
    <Documents>
      <Document>
        <p>
          Total Papers Found: {searchResults.totalResults || sections.length}
        </p>
      </Document>
      {sections}
    </Documents>
  )
}

const buildSystemPrompt = (
  agentId: DesignAgentPromptId,
  overrides: SectionOverride,
  ...extra: Array<ReactNode | null>
) => {
  const editableSections = buildEditableSections(agentId, overrides)
  const additionalSections = extra.filter((section): section is ReactNode =>
    Boolean(section)
  )
  return prompt(
    <>
      {editableSections}
      {additionalSections.map((section, index) => (
        <Fragment key={`${agentId}-extra-${index}`}>{section}</Fragment>
      ))}
    </>
  )
}

export const getAgentUserPrompt = (
  agentId: DesignAgentPromptId,
  overrides?: PromptSectionOverrides
) => {
  const schema = designAgentPromptSchemas[agentId]
  const override = overrides?.userPrompt?.trim()
  if (override) {
    return override
  }
  return schema.userPrompt?.defaultValue || ""
}

export const createLiteratureScoutPrompt = (
  state: ExperimentDesignState,
  searchResults: any,
  overrides?: AgentPromptOverrides["literatureScout"]
): string => {
  return buildSystemPrompt(
    "literatureScout",
    overrides,
    renderPlanContext(state),
    renderSearchDocuments(searchResults)
  )
}

export const createHypothesisBuilderPrompt = (
  state: ExperimentDesignState
): string => {
  return `You are **Hypothesis Builder**, a senior scientific reasoning agent.

Your mission is to generate high-quality, testable research hypotheses based strictly on:
- The research problem
- The research objective
- Defined variables and constraints
- Synthesized insights from the Literature Scout Agent

IMPORTANT: This system uses structured JSON output. You must return a JSON object matching:
{ "hypothesis": string, "explanation": string }
Return exactly ONE best hypothesis in \`hypothesis\` (do not return a list), and a brief justification in \`explanation\`.

<Inputs>
Research problem: ${state.problem}
Research objective(s): ${state.objectives.join("; ") || "(not specified)"}
Key variables: ${state.variables.join("; ") || "(not specified)"}
Constraints / special considerations: ${
    state.specialConsiderations.join("; ") || "(not specified)"
  }
Literature Scout summary:
${
  state.literatureScoutOutput
    ? `Key scientific findings (mapped): ${state.literatureScoutOutput.whatOthersHaveDone}
Relevant methods/strategies/tools (mapped): ${state.literatureScoutOutput.goodMethodsAndTools}
Pitfalls/watch-outs (mapped): ${state.literatureScoutOutput.potentialPitfalls}`
    : "(not available)"
}
</Inputs>

<Instructions>
- Produce a specific, testable hypothesis that combines two or more experimental dimensions when possible (e.g., multiple variables, conditions, or interacting factors) while staying coherent.
- Define (implicitly or explicitly) the independent variables and the dependent outcome(s), and ensure constraints are respected.
- Avoid single-variable or vague hypotheses; avoid speculation beyond the provided literature summary.
- If key details are missing, state what clarification is needed in \`explanation\` instead of guessing.
</Instructions>

<Tone and style>
- Confident, senior-scientist tone
- Precise and technical, but readable
- No filler
</Tone and style>`
}

export const createExperimentDesignerPrompt = (
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["experimentDesigner"]
): string => {
  return buildSystemPrompt(
    "experimentDesigner",
    overrides,
    renderPlanContext(state),
    renderLiteratureSummary(state),
    renderHypothesisData(state)
  )
}

export const createStatCheckPrompt = (
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["statCheck"]
): string => {
  return buildSystemPrompt(
    "statCheck",
    overrides,
    renderPlanContext(state),
    renderHypothesisData(state),
    renderExperimentDesignData(state)
  )
}

export const createReportWriterPrompt = (
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["reportWriter"]
): string => {
  return buildSystemPrompt(
    "reportWriter",
    overrides,
    renderPlanContext(state),
    renderLiteratureSummary(state, { includeCitations: true }),
    renderHypothesisData(state),
    renderExperimentDesignData(state),
    renderStatCheckData(state)
  )
}
