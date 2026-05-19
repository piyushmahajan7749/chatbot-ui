import { SearchResult } from "../types"
import { dedupeNormalize } from "./deepscholar-ops"

type OperationMode = "infer" | "fast" | "diligent"

export interface PaperFinderOptions {
  operationMode?: OperationMode
  insertedBefore?: string | null
  readResultsFromCache?: boolean
  /**
   * Optional caller-supplied AbortSignal. When the caller aborts (e.g.
   * because parallel rounds have already gathered enough papers and
   * remaining rounds are wasted work), the in-flight fetch is cancelled
   * AND the internal timeout signal is still respected. Implemented via
   * `AbortSignal.any([...])` so whichever signal fires first wins.
   */
  signal?: AbortSignal
}

export interface PaperFinderResponse {
  doc_collection?:
    | {
        documents?: PaperFinderDocument[]
        docs?: PaperFinderDocument[]
        items?: PaperFinderDocument[]
        results?: PaperFinderDocument[]
        doc_results?: PaperFinderDocument[]
      }
    | PaperFinderDocument[]
  response_text?: string
  [key: string]: any
}

export interface PaperFinderDocument {
  id?: string
  score?: number
  metadata?: Record<string, any>
  document?: {
    metadata?: Record<string, any>
    [key: string]: any
  }
  paper?: Record<string, any>
  content?: string
  text?: string
  chunk?: string
  chunk_text?: string
  chunk_content?: string
  [key: string]: any
}

export async function runPaperFinder(
  description: string,
  options: PaperFinderOptions = {}
): Promise<PaperFinderResponse> {
  const rawUrl = process.env.PAPER_FINDER_URL
  if (!rawUrl) {
    throw new Error(
      "PAPER_FINDER_URL is not configured. Please set it in your environment."
    )
  }

  const url = resolvePaperFinderEndpoint(rawUrl)

  const payload = {
    paper_description: description,
    operation_mode: options.operationMode ?? "infer",
    inserted_before: options.insertedBefore ?? null,
    read_results_from_cache: options.readResultsFromCache ?? true
  }

  // Default 150s. paper-finder takes 30-90s server-side on most queries
  // once S2's 1 req/s rate limit serialises the dense + s2_search arms,
  // and complex queries with rich relevance criteria (e.g. the bispecific-
  // antibody viscosity one we used in regression tests) routinely hit 90-
  // 120s. The previous 30s default was set before the S2 rate-limit
  // change and caused every parallel round in the lit-scout agent to
  // abort, falling back to just the pre-warm pool of ~3-10 papers (the
  // 2026-05-19 "only 3 papers shown in UI" regression). Override via
  // PAPER_FINDER_TIMEOUT_MS in env if you need a tighter or looser cap.
  const timeoutMs = Number(process.env.PAPER_FINDER_TIMEOUT_MS || 150000)
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)

  // If the caller passed a signal (parallel-rounds cancel path),
  // combine it with our timeout signal so EITHER source can abort
  // the fetch. AbortSignal.any is Node 20+ / modern-browsers; Vercel
  // runtime is on Node 20.
  const signal = options.signal
    ? AbortSignal.any([timeoutController.signal, options.signal])
    : timeoutController.signal

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal
  }).finally(() => clearTimeout(timer))

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(
      `PaperFinder failed (${response.status}): ${
        detail?.error ?? response.statusText ?? "unknown error"
      }`
    )
  }

  return (await response.json()) as PaperFinderResponse
}

function resolvePaperFinderEndpoint(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("PAPER_FINDER_URL is empty.")
  }
  const hasRoundsPath = /\/api\/\d+\/rounds\/?$/i.test(trimmed)
  if (hasRoundsPath) {
    return trimmed
  }
  return `${trimmed.replace(/\/$/, "")}/api/2/rounds`
}

export function normalizePaperFinderResults(
  response: PaperFinderResponse
): SearchResult[] {
  const docs = extractDocuments(response.doc_collection)
  const normalized = docs
    .map(doc => toSearchResult(doc))
    .filter(Boolean) as SearchResult[]

  const deduped = dedupeNormalize(normalized)
  return deduped.sort(
    (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
  )
}

function extractDocuments(
  collection: PaperFinderResponse["doc_collection"]
): PaperFinderDocument[] {
  if (!collection) return []
  if (Array.isArray(collection)) return collection
  if (Array.isArray(collection.documents)) return collection.documents
  if (Array.isArray(collection.docs)) return collection.docs
  if (Array.isArray(collection.items)) return collection.items
  if (Array.isArray(collection.results)) return collection.results
  if (Array.isArray(collection.doc_results)) return collection.doc_results
  return []
}

type LooseRecord = Record<string, any>

function isLooseRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null
}

function toSearchResult(doc: PaperFinderDocument): SearchResult | null {
  const candidates: LooseRecord[] = [
    doc.metadata,
    doc.document?.metadata,
    doc.document,
    doc.paper,
    doc
  ].filter(isLooseRecord)

  const title = getFirstString(
    candidates,
    "title",
    "paper_title",
    "name",
    "display_name"
  )
  const doi = getFirstString(candidates, "doi", "DOI")
  const rawUrl = getFirstString(
    candidates,
    "url",
    "paper_url",
    "source_url",
    "link",
    "pdf_url"
  )
  const url = rawUrl || (doi ? `https://doi.org/${doi}` : "")

  const authorsRaw =
    getFirstValue(candidates, "authors", "author_list", "creators") ?? []
  const authors = normalizeAuthors(authorsRaw)
  const abstract =
    getFirstString(
      candidates,
      "abstract",
      "summary",
      "description",
      "content",
      "chunk",
      "chunk_text",
      "chunk_content"
    ) || "Abstract not available."
  const publishedDate =
    getFirstString(
      candidates,
      "published_date",
      "publication_date",
      "year",
      "publication_year",
      "date"
    ) || ""
  const journal =
    getFirstString(candidates, "journal", "publication", "venue", "source") ||
    undefined
  const sourceRaw =
    getFirstString(candidates, "source", "provider", "origin", "collection") ||
    journal
  const citationCountRaw = getFirstValue(
    candidates,
    "citation_count",
    "cited_by_count",
    "citations"
  )
  const citationCount = normalizeNumber(citationCountRaw)
  const keywordsRaw = getFirstValue(candidates, "keywords", "tags")
  const keywords = normalizeKeywords(keywordsRaw)
  // PubMed, Semantic Scholar, and OpenAlex surface a `publication_type` /
  // `publicationTypes` array tagging review / meta-analysis papers. We
  // pull whichever shape arrives + fall back to a title heuristic.
  const publicationTypesRaw =
    getFirstValue(
      candidates,
      "publication_types",
      "publicationTypes",
      "publication_type",
      "publicationType",
      "pub_types"
    ) ?? []
  const publicationTypes = normalizeKeywords(publicationTypesRaw)
  const isReview = detectReviewArticle(title, abstract, publicationTypes ?? [])
  const relevanceScore =
    normalizeNumber(
      doc.score ??
        doc.metadata?.score ??
        doc.metadata?.relevance ??
        doc.document?.score ??
        doc.document?.relevance ??
        doc.document?.metadata?.score
    ) ?? undefined
  const fullText =
    getFirstString(
      [doc as LooseRecord],
      "content",
      "text",
      "chunk",
      "chunk_text",
      "chunk_content"
    ) || undefined

  if (!title && !url && !abstract) {
    return null
  }

  let resolvedTitle = title
  if (!resolvedTitle && abstract) {
    // Fallback: first sentence of the abstract (up to 160 chars).
    const firstSentence =
      abstract
        .split(/(?<=[.!?])\s+/)[0]
        ?.trim()
        .slice(0, 160) || ""
    if (firstSentence.length > 10) {
      resolvedTitle = firstSentence
    }
  }

  return {
    title: resolvedTitle || "Untitled Research Result",
    authors: authors.length ? authors : ["Unknown"],
    abstract,
    doi,
    url: url || "",
    publishedDate: publishedDate ? String(publishedDate) : "",
    journal,
    citationCount,
    source: normalizeSource(sourceRaw),
    relevanceScore,
    keywords,
    fullText,
    publicationTypes: publicationTypes?.length ? publicationTypes : undefined,
    isReview
  }
}

/**
 * Mark a result as a "review" so it can be dropped from primary-
 * research literature surfaces. Three signals, any one sufficient:
 *
 *  1. Explicit publication-type tag from PubMed / Semantic Scholar
 *     ("review", "systematic review", "meta-analysis", etc).
 *  2. Title keyword match - covers sources that don't expose the
 *     publication type (Tavily web hits, generic Google Scholar).
 *  3. Abstract opening phrase match ("This review summarises…") as a
 *     last-resort hint when title is generic but body explicitly
 *     describes itself as a review.
 *
 * Conservative on purpose: false positives push a useful primary paper
 * out of the list, which is worse than letting one review through. The
 * agent's LLM synthesis is a final guardrail.
 */
function detectReviewArticle(
  title: string | undefined,
  abstract: string | undefined,
  publicationTypes: string[]
): boolean {
  const REVIEW_TYPE_RE =
    /\b(review|systematic.review|meta.analysis|narrative.review|scoping.review)\b/i
  if (publicationTypes.some(t => REVIEW_TYPE_RE.test(t))) return true

  const titleStr = (title ?? "").toLowerCase()
  // Title heuristic - match whole-word "review" / "meta-analysis"
  // anywhere in the title. "A review of …" / "Systematic review …" /
  // "… : a meta-analysis" all hit. Avoid "peer-reviewed" by requiring a
  // word boundary on both sides.
  if (
    /\b(review|meta-analysis|systematic review|scoping review|narrative review|umbrella review)\b/.test(
      titleStr
    )
  ) {
    return true
  }

  const abstractHead = (abstract ?? "").slice(0, 200).toLowerCase()
  if (
    /^(?:this|the present|in this) (?:review|meta-analysis|systematic review)/.test(
      abstractHead
    )
  ) {
    return true
  }
  return false
}

function getFirstString(
  sources: Record<string, any>[],
  ...paths: string[]
): string | undefined {
  const value = getFirstValue(sources, ...paths)
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value)
  }
  return undefined
}

function getFirstValue(
  sources: Record<string, any>[],
  ...paths: string[]
): any {
  for (const source of sources) {
    if (!source) continue
    for (const path of paths) {
      const value = getNested(source, path)
      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
      ) {
        return value
      }
    }
  }
  return undefined
}

function getNested(obj: Record<string, any>, path: string): any {
  return path.split(".").reduce((acc: any, key: string) => acc?.[key], obj)
}

function normalizeAuthors(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === "string") {
          return item.trim()
        }
        if (item && typeof item === "object") {
          return (
            item.name ||
            item.full_name ||
            [item.first_name, item.last_name].filter(Boolean).join(" ").trim()
          )
        }
        return undefined
      })
      .filter((name): name is string => Boolean(name && name.length > 0))
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]+/)
      .map(part => part.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeKeywords(value: any): string[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) {
    const keywords = value
      .map(item => (typeof item === "string" ? item.trim() : undefined))
      .filter((kw): kw is string => Boolean(kw && kw.length > 0))
    return keywords.length ? keywords : undefined
  }
  if (typeof value === "string") {
    const keywords = value
      .split(/[,;]+/)
      .map(part => part.trim())
      .filter(Boolean)
    return keywords.length ? keywords : undefined
  }
  return undefined
}

function normalizeNumber(value: any): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function normalizeSource(raw?: string | null): SearchResult["source"] {
  if (!raw) return "scholar"
  const value = raw.toLowerCase()
  if (value.includes("pubmed")) return "pubmed"
  if (value.includes("arxiv")) return "arxiv"
  if (value.includes("semantic")) return "semantic_scholar"
  if (value.includes("tavily")) return "tavily"
  // Match both `openalex` and OpenAlex work-IDs (URLs like
  // `https://openalex.org/Wxxxxxxx`).
  if (value.includes("openalex")) return "openalex"
  return "scholar"
}
