export type DesignPlanStatusType =
  | "pending"
  | "seed_in_progress"
  | "completed"
  | "failed"

export interface DesignPlanProgress {
  generated: number
  seedCount: number
  completed: number
  failed: number
}

export interface DesignPlanHypothesis {
  hypothesisId: string
  planId: string
  content: string
  explanation?: string
  elo?: number
  createdAt: string
  provenance?: any[]
  needs_review?: boolean
  metadata?: Record<string, any>
}

export interface DesignPlanLogEntry {
  timestamp: string
  actor: string
  message: string
  level: "info" | "warn" | "error" | "debug"
  context?: Record<string, any>
}

export interface DesignPlanStatus {
  planId: string
  status: DesignPlanStatusType
  progress: DesignPlanProgress
  top_hypotheses?: DesignPlanHypothesis[]
  logs?: DesignPlanLogEntry[]
  createdAt: string
  completedAt?: string
  literatureContext?: {
    whatOthersHaveDone: string
    goodMethodsAndTools: string
    potentialPitfalls: string
    citations: string[]
    citationsDetailed?: Array<{
      index: number
      title: string
      url: string
      source: string
      authors: string[]
      year?: string
      journal?: string
      doi?: string
    }>
  }
}

export interface DesignPlanMetadata {
  planId: string
  statusUrl: string
  createdAt: string
  request?: {
    title: string
    description: string
    constraints?: {
      objectives?: string[]
      variables?: string[]
      specialConsiderations?: string[]
    }
    preferences?: Record<string, any>
  }
}
