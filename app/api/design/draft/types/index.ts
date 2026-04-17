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

export interface CitationItem {
  index: number
  title: string
  url: string
  source: "pubmed" | "arxiv" | "scholar" | "semantic_scholar" | "tavily"
  authors: string[]
  year?: string
  journal?: string
  doi?: string
  apa?: string
}

// Scientific domains supported by the pipeline (must stay in sync with
// designAgentPromptSchemas domain-aware prompts and ProblemTab UI).
export const DESIGN_DOMAINS = [
  "formulation_development",
  "discovery_biology",
  "molecular_biology",
  "protein_expression",
  "cell_culture",
  "fermentation",
  "analytics_qc"
] as const
export type Domain = (typeof DESIGN_DOMAINS)[number]

// Development phases.
export const DESIGN_PHASES = [
  "screening",
  "optimization",
  "robustness",
  "scale_up",
  "validation"
] as const
export type Phase = (typeof DESIGN_PHASES)[number]

export interface DesignConstraintsInput {
  material: string
  time: string
  equipment: string
}

export interface DesignVariablesInput {
  known: string[]
  unknown: string[]
}

// New agent output interfaces
export interface LiteratureScoutOutput {
  whatOthersHaveDone: string
  goodMethodsAndTools: string
  potentialPitfalls: string
  citations: string[]
  citationsDetailed?: CitationItem[]
}

export interface HypothesisBuilderOutput {
  hypothesis: string
  explanation: string
}

export interface ExperimentDesignerOutput {
  designSummary: string
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
  conditionsTable: string
  experimentalGroupsOverview: string
  statisticalRationale: string
  criticalTechnicalRequirements: string
  handoffNoteForPlanner: string
  rationale: string
}

export interface PlannerOutput {
  feasibilityCheck: string
  summaryOfTotals: string
  materialsChecklist: string
  reagentAndBufferPreparation: string
  stockSolutionPreparation: string
  masterMixStrategy: string
  workingSolutionTables: string
  tubeAndLabelPlanning: string
  consumablePrepAndQC: string
  studyLayout: string
  prepSchedule: string
  kitPackList: string
  criticalErrorPoints: string
  materialOptimizationSummary: string
  assumptionsAndConfirmations: string
}

export interface ProcedureOutput {
  preRunChecklist: string
  benchSetupAndSafety: string
  sampleLabelingIdScheme: string
  instrumentSetupCalibration: string
  criticalHandlingRules: string
  samplePreparation: string
  measurementSteps: string
  experimentalConditionExecution: string
  dataRecordingProcessing: string
  acceptanceCriteria: string
  troubleshootingGuide: string
  runLogTemplate: string
  cleanupDisposal: string
  dataHandoff: string
}

export interface StatCheckOutput {
  whatLooksGood: string
  problemsOrRisks: string[]
  suggestedImprovements: string[]
  correctedDesign: string
  changeLog: string[]
  improvementRationale: string
  overallAssessment: string
  finalAssessment: string
}

export interface ReportWriterOutput {
  researchObjective: string
  literatureSummary: LiteratureScoutOutput
  hypothesis: HypothesisBuilderOutput
  experimentDesign: ExperimentDesignerOutput
  statisticalReview: StatCheckOutput
  executionPlan: PlannerOutput
  procedure: ProcedureOutput
  finalNotes: string
}

export type ExperimentDesignState = {
  problem: string
  domain?: Domain
  phase?: Phase
  objectives: string[]
  variables: DesignVariablesInput
  constraints: DesignConstraintsInput
  specialConsiderations: string[]
  // Agent outputs
  literatureScoutOutput?: LiteratureScoutOutput
  hypothesisBuilderOutput?: HypothesisBuilderOutput
  experimentDesignerOutput?: ExperimentDesignerOutput
  statCheckOutput?: StatCheckOutput
  plannerOutput?: PlannerOutput
  procedureOutput?: ProcedureOutput
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

// Design/draft "GENERATION" agent output — each agent returns an array of hypotheses.
const SingleHypothesisGenerationSchema = z.object({
  hypothesis: z.string(),
  explanation: z.string(),
  provenance: z.array(z.string()).optional(),
  feasibility_score: z.number().min(0).max(1).optional(),
  novelty_score: z.number().min(0).max(1).optional()
})

export const GenerationSchema = z.object({
  hypotheses: z.array(SingleHypothesisGenerationSchema)
})

export const ExperimentDesignerSchema = z.object({
  designSummary: z.string().min(40),
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
  conditionsTable: z.string().min(100),
  experimentalGroupsOverview: z.string().min(80),
  statisticalRationale: z.string().min(60),
  criticalTechnicalRequirements: z.string().min(40),
  handoffNoteForPlanner: z.string().min(40),
  rationale: z.string()
})

export const PlannerSchema = z.object({
  feasibilityCheck: z.string().min(80),
  summaryOfTotals: z.string().min(60),
  materialsChecklist: z.string().min(150),
  reagentAndBufferPreparation: z.string().min(200),
  stockSolutionPreparation: z.string().min(100),
  masterMixStrategy: z.string().min(80),
  workingSolutionTables: z.string().min(80),
  tubeAndLabelPlanning: z.string().min(60),
  consumablePrepAndQC: z.string().min(60),
  studyLayout: z.string().min(80),
  prepSchedule: z.string().min(60),
  kitPackList: z.string().min(60),
  criticalErrorPoints: z.string().min(60),
  materialOptimizationSummary: z.string().min(60),
  assumptionsAndConfirmations: z.string().min(40)
})

export const ProcedureSchema = z.object({
  preRunChecklist: z.string().min(60),
  benchSetupAndSafety: z.string().min(60),
  sampleLabelingIdScheme: z.string().min(40),
  instrumentSetupCalibration: z.string().min(60),
  criticalHandlingRules: z.string().min(40),
  samplePreparation: z.string().min(150),
  measurementSteps: z.string().min(120),
  experimentalConditionExecution: z.string().min(150),
  dataRecordingProcessing: z.string().min(80),
  acceptanceCriteria: z.string().min(40),
  troubleshootingGuide: z.string().min(80),
  runLogTemplate: z.string().min(60),
  cleanupDisposal: z.string().min(40),
  dataHandoff: z.string().min(40)
})

export const StatCheckSchema = z.object({
  whatLooksGood: z.string(),
  problemsOrRisks: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
  correctedDesign: z.string(),
  changeLog: z.array(z.string()),
  improvementRationale: z.string(),
  overallAssessment: z.string(),
  finalAssessment: z.string()
})

export const ReportWriterSchema = z.object({
  researchObjective: z.string(),
  literatureSummary: LiteratureScoutSchema,
  hypothesis: HypothesisBuilderSchema,
  experimentDesign: ExperimentDesignerSchema,
  statisticalReview: StatCheckSchema,
  executionPlan: PlannerSchema,
  procedure: ProcedureSchema,
  finalNotes: z.string()
})
