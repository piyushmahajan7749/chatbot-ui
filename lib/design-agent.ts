/**
 * Design-agent stubs. These are the server-side placeholders for the
 * agentic system that will eventually drive literature search, hypothesis
 * generation, experiment design, and simulation. They live here so the
 * client never hard-codes mock data and the real implementation can be
 * dropped in behind the same interface.
 */

export type PaperSource =
  | "pubmed"
  | "arxiv"
  | "semantic_scholar"
  | "scholar"
  | "tavily"
  | "user"

export interface Paper {
  id: string
  title: string
  summary: string
  sourceUrl?: string
  userAdded: boolean
  selected: boolean
  authors?: string[]
  year?: string
  journal?: string
  /** Which upstream search source surfaced the paper (pubmed, arxiv, …). */
  source?: PaperSource
  /**
   * Relevance score vs the user's research problem. Higher = more relevant.
   * Normalized to [0, 1] in the API layer so UI can compare across sources.
   */
  relevanceScore?: number
  /** Citation count (impact). Used as a secondary key in the lit-list sort. */
  citationCount?: number
}

export interface Hypothesis {
  id: string
  text: string
  reasoning: string
  basedOnPaperIds: string[]
  selected: boolean
  /**
   * True if the user typed this hypothesis directly (via the
   * "Design from a hypothesis" entry-point). The design agent should
   * not re-critique or re-word a user-supplied hypothesis - it should
   * treat it as a fixed input and design around it.
   */
  userSupplied?: boolean
}

export interface DesignSection {
  heading: string
  body: string
}

export interface SimulationResult {
  summary: string
  metrics: { name: string; value: string }[]
}

export interface GeneratedDesign {
  id: string
  hypothesisId: string
  title: string
  sections: DesignSection[]
  simulation?: SimulationResult
  saved: boolean
}

export const DESIGN_DOMAIN_OPTIONS = [
  { value: "formulation_development", label: "Formulation development" },
  {
    value: "discovery_biology",
    label: "Discovery biology / target identification"
  },
  { value: "molecular_biology", label: "Molecular biology / genomics" },
  {
    value: "protein_expression",
    label: "Protein expression and purification"
  },
  { value: "cell_culture", label: "Cell culture / upstream" },
  { value: "fermentation", label: "Fermentation / bioprocess" },
  { value: "analytics_qc", label: "Analytics / QC" }
] as const

export type DesignDomain = (typeof DESIGN_DOMAIN_OPTIONS)[number]["value"]

export const DESIGN_PHASE_OPTIONS = [
  { value: "screening", label: "Screening" },
  { value: "optimization", label: "Optimization" },
  { value: "robustness", label: "Robustness" },
  { value: "scale_up", label: "Scale-up" },
  { value: "validation", label: "Validation" }
] as const

export type DesignPhase = (typeof DESIGN_PHASE_OPTIONS)[number]["value"]

export interface ProblemContextConstraints {
  material?: string
  time?: string
  equipment?: string
}

export interface ProblemContextVariables {
  known?: string
  unknown?: string
}

export interface ProblemContext {
  title?: string
  problemStatement?: string
  domain?: DesignDomain
  phase?: DesignPhase
  objective?: string
  /** Structured v3 constraints - Material/Time/Equipment. */
  constraintsStructured?: ProblemContextConstraints
  /** Structured v3 variables - known vs unknown open text. */
  variablesStructured?: ProblemContextVariables
  /**
   * When the user enters via the "Structure an existing plan" mode, the
   * free-form draft procedure they pasted is stashed here. Design-generation
   * agents must treat this as a scaffolding they adopt (not just reference)
   * so the final SOP tracks the user's intent.
   */
  userProvidedPlan?: string

  /**
   * Whether the researcher wants replicates in the generated design. Only
   * "yes" turns on a replicate scheme; "no" / unset → single run per
   * condition (n=1). Drives the design-phase replicate directive.
   */
  includeReplicates?: "yes" | "no" | ""
  /** Optional success criteria the researcher specified for the design. */
  successCriteria?: string
  /**
   * Mandatory free-text operating parameters captured on the Problem step -
   * molecule operating concentration range, buffer systems, temperatures, pH,
   * sample matrix, equipment on hand, etc. Threaded into the literature,
   * hypotheses, and design prompts to keep their output specific.
   */
  additionalDetails?: string
  /**
   * Extra design directives collected in the pre-generation popup (molecule
   * concentration, number/type of conditions, free-form notes). Drives how the
   * design phase builds conditions + calculations so output is user-specific.
   */
  designSpec?: {
    moleculeConcentration?: string
    conditions?: string
    notes?: string
  }

  // ── Legacy v2 fields (kept so older saved designs still load) ──────────
  goal?: string
  variables?: string[]
  constraints?: string[]
}

// ─────────────────────────────────────────────────────────────────────────
// Literature search
// ─────────────────────────────────────────────────────────────────────────

export function runLiteratureSearch(_ctx: ProblemContext): Paper[] {
  return [
    {
      id: "p1",
      title: "Scaling laws for viscosity in concentrated polymer solutions",
      summary:
        "Examines how polymer concentration and molecular weight shift zero-shear viscosity; reports a power-law regime transition at c*.",
      sourceUrl: "https://example.com/papers/p1",
      userAdded: false,
      selected: false
    },
    {
      id: "p2",
      title: "Rheology of biopolymer blends under shear",
      summary:
        "Compares shear-thinning behavior across xanthan, guar, and alginate at varying temperatures and pH.",
      sourceUrl: "https://example.com/papers/p2",
      userAdded: false,
      selected: false
    },
    {
      id: "p3",
      title: "Temperature dependence of apparent viscosity in gel systems",
      summary:
        "Arrhenius-type fits for thermo-reversible gels; useful for predicting formulation stability over processing windows.",
      sourceUrl: "https://example.com/papers/p3",
      userAdded: false,
      selected: false
    }
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// Hypothesis generation
// ─────────────────────────────────────────────────────────────────────────

export function generateHypotheses(
  _ctx: ProblemContext,
  papers: Paper[]
): Hypothesis[] {
  const paperIds = papers.filter(p => p.selected).map(p => p.id)
  return [
    {
      id: `h-${Date.now()}-1`,
      text: "Increasing polymer concentration above c* will raise zero-shear viscosity following a 3.4-power scaling.",
      reasoning:
        "Derived from classical scaling laws in the selected literature; the exponent matches entanglement-dominated regimes.",
      basedOnPaperIds: paperIds.slice(0, 2),
      selected: false
    },
    {
      id: `h-${Date.now()}-2`,
      text: "A xanthan/guar blend at 0.4% total solids will show stronger shear-thinning than either polymer alone at equivalent concentration.",
      reasoning:
        "Synergistic network formation between xanthan and guar chains is a recurring theme in the blend rheology papers.",
      basedOnPaperIds: paperIds,
      selected: false
    },
    {
      id: `h-${Date.now()}-3`,
      text: "Apparent viscosity will follow an Arrhenius fit across 20–60 °C with activation energy between 25–40 kJ/mol.",
      reasoning:
        "Aligns with thermoreversible-gel reports in the uploaded literature.",
      basedOnPaperIds: paperIds.slice(-2),
      selected: false
    }
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// Experiment design
// ─────────────────────────────────────────────────────────────────────────

export function generateDesignForHypothesis(
  _ctx: ProblemContext,
  hypothesis: Hypothesis
): GeneratedDesign {
  return {
    id: `d-${hypothesis.id}`,
    hypothesisId: hypothesis.id,
    title: hypothesis.text.slice(0, 80),
    sections: [
      {
        heading: "Experimental Setup",
        body: "Prepare test samples at five concentration levels spanning the expected c* transition. Use a cone-and-plate rheometer at constant 25 °C."
      },
      {
        heading: "Procedure",
        body: "Measure steady shear viscosity across 0.1–1000 s⁻¹ per sample. Three replicates. Pre-shear 30 s at 100 s⁻¹ to erase history."
      },
      {
        heading: "Analysis",
        body: "Fit Cross model to shear curves. Report zero-shear viscosity η₀ vs concentration; overlay scaling-law prediction."
      },
      {
        heading: "Controls & Risks",
        body: "Monitor sample evaporation during measurement. Include solvent-only control. Blind-label sample order to prevent operator bias."
      }
    ],
    saved: false
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────────────────

export function runSimulation(
  _ctx: ProblemContext,
  _design: GeneratedDesign
): SimulationResult {
  return {
    summary:
      "Monte Carlo rollout over the concentration sweep. Predicted η₀ rises from 12 → 480 mPa·s between c=0.1% and c=0.6%; shear-thinning exponent estimated at 0.72 ± 0.04.",
    metrics: [
      { name: "Predicted η₀ range", value: "12 → 480 mPa·s" },
      { name: "Shear-thinning exp.", value: "0.72 ± 0.04" },
      { name: "Runs", value: "1,000" },
      { name: "Simulated duration", value: "4.2 h wall-clock" }
    ]
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase tracking - controls the step-by-step gated flow
// ─────────────────────────────────────────────────────────────────────────

export type PhaseKey =
  | "problem"
  | "literature"
  | "hypotheses"
  | "design"
  | "validate"
  | "simulation"

export const PHASE_ORDER: PhaseKey[] = [
  "problem",
  "literature",
  "hypotheses",
  "design",
  "validate",
  "simulation"
]

// ─────────────────────────────────────────────────────────────────────────
// Persisted content shape - what we store in designs.content
// ─────────────────────────────────────────────────────────────────────────

/** Literature context stored from the real Literature Scout agent for use by downstream phases. */
export interface StoredLiteratureContext {
  whatOthersHaveDone: string
  goodMethodsAndTools: string
  potentialPitfalls: string
  citations: string[]
}

export interface DesignVersionSnapshot {
  id: string
  versionNumber: number
  designs: GeneratedDesign[]
  createdAt: string
  note?: string
}

/** How a round of lab data landed against the hypothesis under test. */
export type ValidationVerdict =
  | "supported"
  | "partially_supported"
  | "refuted"
  | "inconclusive"

/**
 * The scientist's lab data, extracted into a reviewable table BEFORE the
 * hypothesis is judged — "here's the data I read, and what I understood from
 * it". Extraction and judgment are separate steps so a bad parse (unreadable
 * PDF, missing columns) is visible and fixable instead of silently producing
 * an "inconclusive" verdict.
 */
export interface ParsedLabData {
  /** Plain-English recap of what the data shows. */
  summary: string
  /** Table headers (e.g. Condition, Readout, Value, Unit, n). */
  columns: string[]
  /** One array of cell strings per row, aligned to `columns`. */
  rows: string[][]
  /** Data-quality caveats: missing controls, low n, high variance, etc. */
  caveats: string[]
}

/**
 * One design → run-in-lab → analyze cycle. The scientist runs the current
 * design, brings back data, and the Validate agent judges the hypothesis and
 * proposes what to change. Iterations accumulate so later rounds reason over
 * the full history (job story: "at iteration 17 it knows every pattern so far").
 */
export interface ExperimentIteration {
  id: string
  /** 1-based round number. */
  index: number
  /** The design that was actually run this round (snapshot, not a live ref). */
  designSnapshot: GeneratedDesign[]
  /** The hypothesis being tested when this data was collected. */
  hypothesisText?: string
  /** The scientist's lab results for this round. */
  data: {
    /** Free-text results / observations they typed or pasted. */
    raw?: string
    /** Uploaded data-file metadata (content resolved server-side at run time). */
    files?: { id?: string; name: string; size?: number; type?: string }[]
  }
  /** The parsed, structured view of this round's data (from the parse step). */
  structuredData?: ParsedLabData
  verdict: ValidationVerdict
  /** 0..1 model confidence in the verdict. */
  confidence?: number
  /** The agent's reasoning for the verdict. */
  reasoning?: string
  /** New patterns / findings surfaced this round. */
  insights: string[]
  /** Concrete changes to try next (design and/or hypothesis level). */
  suggestedChanges: string[]
  /** If refuted, a sharper hypothesis the data points toward. */
  revisedHypothesis?: string
  createdAt: string
}

/**
 * The running validation loop for a design. `cumulativeInsights` is the
 * synthesis the agent refines every round — the compact "memory" fed back into
 * hypothesis + design regeneration so each iteration gets more focused.
 */
export interface ValidationState {
  iterations: ExperimentIteration[]
  cumulativeInsights?: string
}

export interface DesignContentV2 {
  schemaVersion: 2
  approvedPhases?: PhaseKey[]
  literatureContext?: StoredLiteratureContext
  problem?: ProblemContext
  papers?: Paper[]
  hypotheses?: Hypothesis[]
  designs?: GeneratedDesign[]
  /**
   * History of previously generated design sets, newest first. When the user
   * clicks "Revise" or "Regenerate", the current `designs` are snapshotted
   * here before the new version overwrites `designs`.
   */
  designVersions?: DesignVersionSnapshot[]
  /**
   * Aggregate stats captured during the most recent literature search. Lives
   * in the persisted content so the Literature tab can keep showing
   * "from N searched" after the user navigates away and back - previously
   * that number lived only on the in-memory progress stream and vanished
   * on remount.
   */
  literatureStats?: {
    totalCandidates?: number
  }
  /**
   * Answers to the "Refine" clarifying questions at each checkpoint. Persisted
   * for auditability (job story 4) and re-shown when the user re-opens a
   * checkpoint. `problem` = before literature; `hypothesis` = before hypothesis
   * generation (after paper selection); `design` = before design generation.
   */
  clarifications?: {
    problem?: ClarifyAnswer[]
    hypothesis?: ClarifyAnswer[]
    design?: ClarifyAnswer[]
  }
  /**
   * The validate-and-iterate loop: lab-data-driven rounds that test the
   * hypothesis and steer the next design. Empty/absent until the scientist
   * reaches the Validate stage and runs their first round.
   */
  validation?: ValidationState
}

/** A clarifying question shown at a Refine checkpoint (MCQ + free-text other). */
export interface ClarifyQuestion {
  id: string
  prompt: string
  kind: "single" | "multi"
  options: string[]
  rationale?: string
}

/** A scientist's answer to one clarifying question. */
export interface ClarifyAnswer {
  id: string
  prompt: string
  selected: string[]
  other?: string
  skipped?: boolean
}

export function emptyDesignContent(): DesignContentV2 {
  return { schemaVersion: 2 }
}
