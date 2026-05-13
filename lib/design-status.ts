/**
 * Derived design-status helpers for list-view chips.
 *
 * The Firestore `designs` doc stores its progression inside the
 * JSON-encoded `content` blob (`content.approvedPhases`). List APIs
 * return the raw doc - i.e. `content` as a stringified JSON - so the
 * dashboard / Designs list had no easy way to tell whether a design
 * was finalised. Before this, both surfaces fell back to a "touched
 * in last 14 days" heuristic which mislabelled every saved-and-shipped
 * design as "In progress" (reported as issue #31).
 *
 * `getDesignProgress` is a pure function over the raw design row. It
 * returns the approvedPhases list, a derived completion flag, and a
 * short human-readable "stage" label that the list slabs render as a
 * chip ("Stage: Hypotheses").
 */

export type DesignPhase =
  | "problem"
  | "literature"
  | "hypotheses"
  | "design"
  | "simulation"

const PHASE_ORDER: DesignPhase[] = [
  "problem",
  "literature",
  "hypotheses",
  "design",
  "simulation"
]

/** Human-readable label for each phase - used in the "Stage" chip. */
const PHASE_LABEL: Record<DesignPhase, string> = {
  problem: "Problem",
  literature: "Literature",
  hypotheses: "Hypotheses",
  design: "Design",
  simulation: "Simulation"
}

export interface DesignProgress {
  approvedPhases: DesignPhase[]
  /** True once the user has approved-and-finalised the Design phase. */
  isCompleted: boolean
  /**
   * The phase the user is most likely on right now - the first
   * non-approved phase. `undefined` once everything is finalised.
   */
  currentPhase?: DesignPhase
  /** Pre-rendered label like "Hypotheses" or "Design". */
  currentStageLabel?: string
}

/**
 * Tolerantly parse `content` (string | object | null) and return the
 * status snapshot. We never throw - a row with broken JSON should still
 * render as "In progress" rather than blowing up the whole list.
 */
export function getDesignProgress(raw: {
  content?: string | Record<string, unknown> | null
}): DesignProgress {
  let parsed: Record<string, unknown> | null = null
  const content = raw?.content
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content)
    } catch {
      parsed = null
    }
  } else if (content && typeof content === "object") {
    parsed = content as Record<string, unknown>
  }

  const rawApproved = (parsed?.approvedPhases ?? []) as unknown[]
  const approvedPhases = Array.isArray(rawApproved)
    ? rawApproved.filter((p): p is DesignPhase =>
        PHASE_ORDER.includes(p as DesignPhase)
      )
    : []

  // "Completed" = the user has explicitly approved the Design phase
  // (the Approve & Finalize Design button). We deliberately do NOT
  // require the simulation phase since most users stop at Design.
  const isCompleted = approvedPhases.includes("design")

  const currentPhase = PHASE_ORDER.find(p => !approvedPhases.includes(p))

  return {
    approvedPhases,
    isCompleted,
    currentPhase,
    currentStageLabel: currentPhase ? PHASE_LABEL[currentPhase] : undefined
  }
}
