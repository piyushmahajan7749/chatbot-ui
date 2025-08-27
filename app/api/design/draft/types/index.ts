import { z } from "zod"

// Enhanced search result interface with relevance scoring
export interface SearchResult {
  title: string
  authors: string[]
  abstract: string
  doi?: string
  url: string
  publishedDate: string
  journal?: string
  citationCount?: number
  source: "pubmed" | "arxiv" | "scholar" | "semantic_scholar" | "tavily"
  relevanceScore?: number
  keywords?: string[]
  fullText?: string
}

export interface AggregatedSearchResults {
  totalResults: number
  sources: {
    pubmed: SearchResult[]
    arxiv: SearchResult[]
    scholar: SearchResult[]
    semanticScholar: SearchResult[]
    tavily: SearchResult[]
  }
  synthesizedFindings: {
    keyMethodologies: string[]
    commonPitfalls: string[]
    recommendedApproaches: string[]
    novelInsights: string[]
  }
  searchMetrics: {
    queryOptimization: string[]
    relevanceScores: number[]
    sourceWeights: Record<string, number>
  }
}

// New agent output interfaces
export interface LiteratureScoutOutput {
  whatOthersHaveDone: string
  goodMethodsAndTools: string
  potentialPitfalls: string
  citations: string[]
}

export interface HypothesisBuilderOutput {
  hypothesis: string
  explanation: string
}

export interface ExperimentDesignerOutput {
  experimentDesign: {
    whatWillBeTested: string
    whatWillBeMeasured: string
    controlGroups: string
    experimentalGroups: string
    sampleTypes: string
    toolsNeeded: string
    replicatesAndConditions: string
    specificRequirements: string
  }
  executionPlan: {
    materialsList: string
    materialPreparation: string
    stepByStepProcedure: string
    timeline: string
    setupInstructions: string
    dataCollectionPlan: string
    conditionsTable: string
    storageDisposal: string
    safetyNotes: string
  }
  rationale: string
}

export interface StatCheckOutput {
  whatLooksGood: string
  problemsOrRisks: string[]
  suggestedImprovements: string[]
  overallAssessment: string
}

export interface ReportWriterOutput {
  researchObjective: string
  literatureSummary: LiteratureScoutOutput
  hypothesis: HypothesisBuilderOutput
  experimentDesign: ExperimentDesignerOutput
  statisticalReview: StatCheckOutput
  finalNotes: string
}

export type ExperimentDesignState = {
  problem: string
  objectives: string[]
  variables: string[]
  specialConsiderations: string[]
  // Agent outputs
  literatureScoutOutput?: LiteratureScoutOutput
  hypothesisBuilderOutput?: HypothesisBuilderOutput
  experimentDesignerOutput?: ExperimentDesignerOutput
  statCheckOutput?: StatCheckOutput
  reportWriterOutput?: ReportWriterOutput
  // Keep search results for literature scout
  searchResults?: AggregatedSearchResults
}

// New Zod schemas for each agent output
export const LiteratureScoutSchema = z.object({
  whatOthersHaveDone: z.string(),
  goodMethodsAndTools: z.string(),
  potentialPitfalls: z.string(),
  citations: z.array(z.string())
})

export const HypothesisBuilderSchema = z.object({
  hypothesis: z.string(),
  explanation: z.string()
})

export const ExperimentDesignerSchema = z.object({
  experimentDesign: z.object({
    whatWillBeTested: z.string(),
    whatWillBeMeasured: z.string(),
    controlGroups: z.string(),
    experimentalGroups: z.string(),
    sampleTypes: z.string(),
    toolsNeeded: z.string(),
    replicatesAndConditions: z.string(),
    specificRequirements: z.string()
  }),
  executionPlan: z.object({
    materialsList: z.string(),
    materialPreparation: z.string(),
    stepByStepProcedure: z.string(),
    timeline: z.string(),
    setupInstructions: z.string(),
    dataCollectionPlan: z.string(),
    conditionsTable: z.string(),
    storageDisposal: z.string(),
    safetyNotes: z.string()
  }),
  rationale: z.string()
})

export const StatCheckSchema = z.object({
  whatLooksGood: z.string(),
  problemsOrRisks: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
  overallAssessment: z.string()
})

export const ReportWriterSchema = z.object({
  researchObjective: z.string(),
  literatureSummary: LiteratureScoutSchema,
  hypothesis: HypothesisBuilderSchema,
  experimentDesign: ExperimentDesignerSchema,
  statisticalReview: StatCheckSchema,
  finalNotes: z.string()
})
