/**
 * High-level retrieval entry point.
 *
 * Pipeline:
 *   1. Resolve scope → RPC filter args.
 *   2. Embed the query.
 *   3. Call `match_rag_items` (hybrid: dense + BM25).
 *   4. RRF-fuse dense rank + BM25 rank (k=60).
 *   5. Recency boost: score *= exp(-age_days / 90).
 *   6. Chat multiplier: chat_message rows × 0.7.
 *   7. Sort, slice top sourceCount.
 */
import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/supabase/types"
import { embedBatch } from "@/lib/rag/embed"
import type {
  MatchRagItemRow,
  RagItem,
  RetrieveQuery,
  SourceType
} from "@/lib/rag/types"

const RRF_K = 60
const RECENCY_HALF_LIFE_DAYS = 90
const CHAT_MESSAGE_MULTIPLIER = 0.7
const RPC_MATCH_COUNT_MULTIPLIER = 5 // pull a wider pool than we return

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface RpcFilters {
  p_workspace_id: string | null
  p_project_id: string | null
  p_source_types: SourceType[] | null
  p_only_source_ids: string[] | null
  // Always present — PostgREST resolves RPC overloads by exact named-arg
  // set, so we send every param the function declares (defaulting to
  // null) rather than relying on Postgres defaults.
  p_exclude_source_ids: string[] | null
}

/**
 * Map a chat scope into RPC filter arguments.
 *   - null               → workspace-wide
 *   - "project"          → workspace + scopeId as project filter
 *   - "design"/"report"  → tier-3 RAG fallback only; restrict to that one doc
 */
function resolveScope(q: RetrieveQuery): RpcFilters {
  const filters: RpcFilters = {
    p_workspace_id: q.workspaceId,
    p_project_id: null,
    p_source_types: null,
    p_only_source_ids: null,
    p_exclude_source_ids: null
  }

  if (q.scope === "project" && q.scopeId) {
    filters.p_project_id = q.scopeId
  } else if (q.scope === "design" && q.scopeId) {
    filters.p_source_types = ["design"]
    filters.p_only_source_ids = [q.scopeId]
  } else if (q.scope === "report" && q.scopeId) {
    filters.p_source_types = ["report"]
    filters.p_only_source_ids = [q.scopeId]
  }

  // Caller-restricted attached files take precedence over scope (when
  // present, they're the only thing the caller wants searched).
  if (q.fileIds && q.fileIds.length > 0) {
    filters.p_source_types = ["file"]
    filters.p_only_source_ids = q.fileIds
  }

  return filters
}

/**
 * Compute the post-fusion score for a single chunk given its dense + BM25
 * ranks (1-based; lower is better) and metadata. Pure function — exported
 * for unit tests.
 */
export function computeScore(opts: {
  denseRank: number | null
  bm25Rank: number | null
  ageDays: number
  sourceType: SourceType
}): number {
  const denseTerm = opts.denseRank == null ? 0 : 1 / (RRF_K + opts.denseRank)
  const sparseTerm = opts.bm25Rank == null ? 0 : 1 / (RRF_K + opts.bm25Rank)
  let score = denseTerm + sparseTerm
  // exp(-age/half_life) — caps at 1 for age=0, 0.37 at one half-life, etc.
  score *= Math.exp(-Math.max(0, opts.ageDays) / RECENCY_HALF_LIFE_DAYS)
  if (opts.sourceType === "chat_message") {
    score *= CHAT_MESSAGE_MULTIPLIER
  }
  return score
}

/**
 * Convert RPC rows to ranked RagItems. Exported for unit tests so the
 * fusion logic can be exercised without hitting Postgres.
 */
export function fuseAndScore(
  rows: MatchRagItemRow[],
  sourceCount: number
): RagItem[] {
  // Build dense + sparse rank tables. Lower rank = better. Rank only
  // considers rows that actually scored on that signal.
  const byDense = [...rows]
    .filter(r => r.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
  const bySparse = [...rows]
    .filter(r => r.bm25_rank > 0)
    .sort((a, b) => b.bm25_rank - a.bm25_rank)

  const denseRank = new Map<string, number>()
  byDense.forEach((r, i) => denseRank.set(r.id, i + 1))
  const sparseRank = new Map<string, number>()
  bySparse.forEach((r, i) => sparseRank.set(r.id, i + 1))

  const scored: RagItem[] = rows.map(row => ({
    ...row,
    score: computeScore({
      denseRank: denseRank.get(row.id) ?? null,
      bm25Rank: sparseRank.get(row.id) ?? null,
      ageDays: row.age_days,
      sourceType: row.source_type
    })
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, sourceCount)
}

export async function retrieve(q: RetrieveQuery): Promise<RagItem[]> {
  const sourceCount = Math.max(1, q.sourceCount ?? 8)
  const filters = resolveScope(q)

  const [embedding] = await embedBatch([q.query])
  if (!embedding) return []

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc("match_rag_items" as any, {
    query_embedding: embedding as any,
    query_text: q.query,
    match_count: sourceCount * RPC_MATCH_COUNT_MULTIPLIER,
    ...filters
  })

  if (error) {
    console.error("[rag/retrieve] match_rag_items failed:", error)
    throw error
  }

  const rows = (data ?? []) as unknown as MatchRagItemRow[]
  if (rows.length === 0) return []

  return fuseAndScore(rows, sourceCount)
}
