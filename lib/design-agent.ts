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
}

export interface Hypothesis {
  id: string
  text: string
  reasoning: string
  basedOnPaperIds: string[]
  selected: boolean
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
  /** Structured v3 constraints — Material/Time/Equipment. */
  constraintsStructured?: ProblemContextConstraints
  /** Structured v3 variables — known vs unknown open text. */
  variablesStructured?: ProblemContextVariables

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
// Phase tracking — controls the step-by-step gated flow
// ─────────────────────────────────────────────────────────────────────────

export type PhaseKey =
  | "problem"
  | "literature"
  | "hypotheses"
  | "design"
  | "simulation"

export const PHASE_ORDER: PhaseKey[] = [
  "problem",
  "literature",
  "hypotheses",
  "design",
  "simulation"
]

// ─────────────────────────────────────────────────────────────────────────
// Persisted content shape — what we store in designs.content
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
}

export function emptyDesignContent(): DesignContentV2 {
  return { schemaVersion: 2 }
}
