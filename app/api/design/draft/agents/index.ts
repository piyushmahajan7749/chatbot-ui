import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import {
  ExperimentDesignState,
  LiteratureScoutOutput,
  HypothesisBuilderOutput,
  ExperimentDesignerOutput,
  StatCheckOutput,
  PlannerOutput,
  ProcedureOutput,
  ReportWriterOutput,
  LiteratureScoutSchema,
  HypothesisBuilderSchema,
  ExperimentDesignerSchema,
  StatCheckSchema,
  PlannerSchema,
  ProcedureSchema,
  ReportAssemblyNotesSchema,
  CitationItem
} from "../types"
import {
  createLiteratureScoutPrompt,
  createHypothesisBuilderPrompt,
  createExperimentDesignerPrompt,
  createStatCheckPrompt,
  createPlannerPrompt,
  createProcedurePrompt,
  createReportWriterPrompt,
  getAgentUserPrompt
} from "../prompts/agent-prompts"
import {
  generateSearchQueriesWithLLM,
  optimizeSearchQuery,
  performMultiSourceSearch,
  type QueryIntent
} from "../utils/search-utils"
import {
  buildCuratedAggregatedResults,
  dedupeNormalize
} from "../utils/deepscholar-ops"
import {
  normalizePaperFinderResults,
  runPaperFinder
} from "../utils/paper-finder"
import { SearchResult } from "../types"
import { AgentPromptOverrides, AgentPromptUsage } from "@/types/design-prompts"

function buildCitationsDetailed(searchResults?: any): CitationItem[] {
  if (!searchResults) return []
  const collect = (list: any[], source: CitationItem["source"]) =>
    list.map((p: any, i: number) => ({
      index: i + 1,
      title: p.title,
      url: p.url,
      source,
      authors: p.authors || [],
      year: (p.publishedDate || "").toString(),
      journal: p.journal,
      doi: p.doi,
      apa: undefined,
      // Prefer the problem-aware summary (3-4 sentences tailored to
      // the user's question) when present; fall back to the raw
      // abstract if the LLM summariser wasn't run or failed. The
      // frontend reads this as `abstract` -> the paper card's
      // Summary field.
      abstract: p.problemAwareSummary || p.abstract,
      // Carry raw relevance score through to the frontend layer. The route
      // handler normalizes to [0, 1] when converting to Paper[].
      relevanceScore: p.relevanceScore ?? undefined
    })) as CitationItem[]

  const items: CitationItem[] = []
  items.push(...collect(searchResults.sources.pubmed || [], "pubmed"))
  items.push(...collect(searchResults.sources.arxiv || [], "arxiv"))
  items.push(
    ...collect(searchResults.sources.semanticScholar || [], "semantic_scholar")
  )
  items.push(...collect(searchResults.sources.scholar || [], "scholar"))
  items.push(...collect(searchResults.sources.tavily || [], "tavily"))
  items.push(...collect(searchResults.sources.openalex || [], "openalex"))

  // Sort by relevanceScore (desc) so the UI gets a pre-ranked list.
  items.sort(
    (a: any, b: any) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
  )

  // Re-number sequentially for consistent [X] references
  return items.map((it, idx) => ({ ...it, index: idx + 1 }))
}

const openai = () => getAzureOpenAIForDesign()
const MODEL_NAME = () => getDesignDeployment()

/**
 * Generate a problem-aware 3-4 sentence summary for each paper in one
 * batched LLM call. The scientist asked for cards that explain *why
 * this paper matters* for the user's problem - the raw upstream
 * abstract is too long, dry, and not anchored to the user's question.
 *
 * Implementation notes:
 *  - Single structured-output call instead of N per-paper calls; cuts
 *    cost + latency by ~10x for a typical list of 8-12 papers.
 *  - Inputs are truncated (title + 400-char abstract) so the prompt
 *    stays well under context limits even with 20+ candidates.
 *  - Best-effort: any failure falls back to the original abstract via
 *    the OR in `buildCitationsDetailed`.
 */
async function summarizePapersForProblem(
  state: ExperimentDesignState,
  papers: SearchResult[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (papers.length === 0) return out

  const PaperSummariesSchema = z.object({
    summaries: z.array(
      z.object({
        index: z.number().int(),
        summary: z.string()
      })
    )
  })

  // Cap to top 20 (sorted by relevance upstream). Anything past that
  // is unlikely to make the surface list anyway.
  const slice = papers.slice(0, 20)

  const numbered = slice
    .map((p, i) => {
      const abstract = (p.abstract || "").slice(0, 400).replace(/\s+/g, " ")
      const authors = p.authors?.slice(0, 3).join(", ") || "Unknown"
      const year = p.publishedDate || ""
      return [
        `[${i + 1}] Title: ${p.title}`,
        `    Authors: ${authors}${year ? ` (${year})` : ""}`,
        `    Abstract excerpt: ${abstract}`
      ].join("\n")
    })
    .join("\n\n")

  const objective =
    state.objectives?.filter(Boolean).join("; ") || "(not specified)"
  const variables =
    [
      ...(state.variables?.known ?? []),
      ...(state.variables?.unknown ?? [])
    ].join(", ") || "(not specified)"

  const systemPrompt =
    "You write tight, scientist-facing summaries of research papers. Each summary is EXACTLY 3-4 sentences. Sentence 1 says what the paper did (the actual experiment / method). Sentence 2-3 reports the key finding(s). The final sentence connects the paper's relevance to the user's stated problem, objective, or variables. No hedging, no marketing language, no 'In this paper, the authors…' filler. Plain text only - no markdown."

  const userPrompt = [
    `User's research problem:\n${state.problem}`,
    `Objective: ${objective}`,
    state.domain ? `Domain: ${state.domain}` : "",
    state.phase ? `Phase: ${state.phase}` : "",
    `Variables in play: ${variables}`,
    "",
    "Write one summary per paper below. Return JSON {summaries:[{index, summary}]} where each `index` matches the [N] label below.",
    "",
    numbered
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      response_format: zodResponseFormat(PaperSummariesSchema, "paperSummaries")
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (!parsed) return out
    for (const row of parsed.summaries) {
      const idx = row.index - 1
      if (idx >= 0 && idx < slice.length && row.summary?.trim()) {
        out.set(idx, row.summary.trim())
      }
    }
  } catch (err: any) {
    console.warn(
      "[LITERATURE_SCOUT_SUMMARIZE] Problem-aware summary failed:",
      err?.message ?? err
    )
  }
  return out
}

type AgentCallResult<T> = {
  output: T
  prompt: AgentPromptUsage
}

export type LiteratureScoutProgressEvent =
  | { step: "analyzing"; message: string }
  | { step: "optimizing_query"; message: string; primaryQuery?: string }
  | { step: "searching_sources"; message: string; detail?: string }
  /**
   * One emitted per per-round search call so the scientist sees the
   * agent actually working through the source list instead of staring
   * at a single "Searching sources" line for 30s. The `round` field
   * (1-based) is rendered as "Round N / total" in the UI.
   */
  | {
      step: "searching_round"
      message: string
      round: number
      totalRounds: number
      uniqueSoFar: number
      query?: string
      elapsedMs?: number
      /**
       * LLM-assigned intent label for this round when the query
       * generator used the LLM path. UI renders this alongside the
       * round number ("Round 2/4 · mechanism"). Falls back to "primary"
       * for every round in heuristic mode.
       */
      intent?: QueryIntent
    }
  | {
      step: "papers_found"
      message: string
      totalPapers: number
      sourceCounts: Record<string, number>
      /**
       * Total number of unique candidate papers the pipeline considered
       * BEFORE the top-N cut (i.e. after dedup + review filter, before
       * `mergedResults.slice(0, 40)`). The UI surfaces this in the
       * "N papers surfaced · ranked by relevance · from M searched"
       * header so the scientist sees the funnel — we didn't just find
       * 10 papers, we sifted through hundreds and these 10 are the
       * cream.
       */
      totalCandidates?: number
    }
  /**
   * Dedup funnel: raw count across all sources (PubMed/arXiv/OpenAlex/
   * PaperFinder rounds) → unique-after-dedup. Lets the user see "we
   * pulled 180 candidates from 9 sources, collapsed to 95 unique
   * papers".
   */
  | {
      step: "deduping"
      message: string
      rawCount: number
      uniqueCount: number
    }
  /**
   * Review-article filter (#paper-finder fix). Tells the user how many
   * survey papers were dropped so the surfaced list is primary research
   * - the "looks like the current papers found are review articles"
   * complaint.
   */
  | {
      step: "filtering_reviews"
      message: string
      dropped: number
      remaining: number
    }
  | {
      step: "ranking"
      message: string
      remaining: number
    }
  | {
      step: "summarizing_papers"
      message: string
      papersCount: number
    }
  | { step: "synthesizing"; message: string }
  | { step: "done"; message: string; papersCount: number }

export type LiteratureScoutProgressCallback = (
  event: LiteratureScoutProgressEvent
) => void

export interface LiteratureScoutSearchOptions {
  /** Target minimum unique papers before early-exit. Default 10. */
  minPapers?: number
  /** If true, bypass PaperFinder cache so repeat calls produce fresh results. */
  bypassCache?: boolean
  /** If true, shuffle the alternative queries before fanning out. */
  shuffleQueries?: boolean
  /** Exclude papers whose url (lowercased) appears in this list. */
  excludeUrls?: string[]
  /** Exclude papers whose title (lowercased) appears in this list. */
  excludeTitles?: string[]
}

export async function callLiteratureScoutAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["literatureScout"],
  onProgress?: LiteratureScoutProgressCallback,
  searchOptions: LiteratureScoutSearchOptions = {}
): Promise<AgentCallResult<LiteratureScoutOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📚 [LITERATURE_SCOUT_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  // Log input state
  console.log("📥 [LITERATURE_SCOUT_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log(
    "  🔬 Known variables:",
    JSON.stringify(state.variables?.known || [], null, 2)
  )
  console.log(
    "  ❓ Unknown variables:",
    JSON.stringify(state.variables?.unknown || [], null, 2)
  )

  onProgress?.({
    step: "analyzing",
    message: "Analyzing research problem..."
  })

  const combinedVariables = [
    ...(state.variables?.known || []),
    ...(state.variables?.unknown || [])
  ]

  // ── Query generation: LLM-first, heuristic fallback ──────────────────
  // The LLM generator takes the full structured design context (problem
  // + domain + phase + objectives + variables + constraints + special
  // considerations) and emits 3-4 complementary queries each labelled
  // with its intent (mechanism / methods / applications / etc.). The
  // intent labels flow through to per-round progress events so the user
  // sees "round 2/4 · mechanism · q: '…'" instead of guessing why two
  // rounds look almost identical.
  //
  // If the LLM call fails for any reason (network, parse, empty), we
  // fall back to the heuristic optimizeSearchQuery — same shape, less
  // intelligent, but always works.
  onProgress?.({
    step: "optimizing_query",
    message: "Generating literature-search queries from your problem context…"
  })
  const llmQueries = await generateSearchQueriesWithLLM({
    problem: state.problem,
    domain: state.domain,
    phase: state.phase,
    objectives: state.objectives,
    knownVariables: state.variables?.known,
    unknownVariables: state.variables?.unknown,
    constraints: state.constraints,
    specialConsiderations: state.specialConsiderations
  })

  let queryIntents: QueryIntent[] = []
  let queryData: {
    primaryQuery: string
    alternativeQueries: string[]
    keywords: string[]
  }
  if (llmQueries) {
    queryData = {
      primaryQuery: llmQueries.primaryQuery,
      alternativeQueries: llmQueries.alternativeQueries,
      keywords: llmQueries.keywords
    }
    // Track the LLM-assigned intent for each alternative so we can
    // show "round 2/4 · mechanism" in the UI progress feed.
    queryIntents = ["primary", ...llmQueries.alternativeIntents]
  } else {
    queryData = optimizeSearchQuery(
      state.problem,
      state.objectives,
      combinedVariables,
      "biomedical"
    )
    // Heuristic mode: tag everything as "primary" so the UI doesn't
    // claim intent we don't actually have.
    queryIntents = [
      "primary",
      ...queryData.alternativeQueries.map(() => "primary" as QueryIntent)
    ]
  }

  console.log("\n🔍 [LITERATURE_SCOUT_SEARCH] Search Query Optimization:")
  console.log(`  Source: ${llmQueries ? "LLM" : "heuristic-fallback"}`)
  console.log("  🎯 Primary Query:", queryData.primaryQuery)
  queryData.alternativeQueries.forEach((q, i) => {
    const intent = queryIntents[i + 1] ?? "primary"
    console.log(`  ↳ Alt ${i + 1} [${intent}]: ${q}`)
  })

  onProgress?.({
    step: "optimizing_query",
    message: llmQueries
      ? `Generated ${1 + queryData.alternativeQueries.length} complementary queries (LLM-planned). Each targets a different angle.`
      : `Built ${1 + queryData.alternativeQueries.length} search queries (fallback heuristic — LLM unavailable).`,
    primaryQuery: queryData.primaryQuery
  })

  try {
    const constraintsParts = [
      state.constraints?.material && `Material: ${state.constraints.material}`,
      state.constraints?.time && `Time: ${state.constraints.time}`,
      state.constraints?.equipment &&
        `Equipment: ${state.constraints.equipment}`
    ].filter(Boolean)

    const paperFinderQuery = [
      `Research problem: ${state.problem}`,
      state.domain ? `Domain: ${state.domain}` : null,
      state.phase ? `Phase: ${state.phase}` : null,
      state.objectives.length
        ? `Objectives: ${state.objectives.join("; ")}`
        : null,
      state.variables?.known?.length
        ? `Known variables: ${state.variables.known.join("; ")}`
        : null,
      state.variables?.unknown?.length
        ? `Unknown variables: ${state.variables.unknown.join("; ")}`
        : null,
      constraintsParts.length
        ? `Constraints: ${constraintsParts.join(" | ")}`
        : null,
      state.specialConsiderations.length
        ? `Additional considerations: ${state.specialConsiderations.join("; ")}`
        : null,
      queryData.primaryQuery
        ? `Optimized query: ${queryData.primaryQuery}`
        : null,
      queryData.alternativeQueries.length
        ? `Alternative queries: ${queryData.alternativeQueries.join(" | ")}`
        : null
    ]
      .filter(Boolean)
      .join("\n")

    // PaperFinder is best-effort: if it fails, we still run the pipeline
    // with no citations. Target 10 unique papers per round - keeps the
    // literature shortlist scannable while staying within the 8–10 band the
    // product asks for. Early-exit fires once we hit this threshold.
    const minPapers = searchOptions.minPapers ?? 10
    const excludeUrls = new Set(
      (searchOptions.excludeUrls ?? [])
        .filter(Boolean)
        .map(u => u.toLowerCase())
    )
    const excludeTitles = new Set(
      (searchOptions.excludeTitles ?? [])
        .filter(Boolean)
        .map(t => t.toLowerCase())
    )

    // Build the query list: primary + alternatives, each augmented with the
    // full context so PaperFinder has the same signal in every round.
    const contextSuffix = paperFinderQuery
      .split("\n")
      .filter(line => !line.startsWith("Optimized query:"))
      .join("\n")
    const buildRoundQuery = (q: string) =>
      `Optimized query: ${q}\n${contextSuffix}`

    const alternatives = [...queryData.alternativeQueries]
    if (searchOptions.shuffleQueries) {
      for (let i = alternatives.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[alternatives[i], alternatives[j]] = [alternatives[j], alternatives[i]]
      }
    }
    const roundQueries = [queryData.primaryQuery, ...alternatives].filter(
      Boolean
    )

    let curated = buildCuratedAggregatedResults([])
    const responseTexts: string[] = []
    const allResults: SearchResult[] = []

    onProgress?.({
      step: "searching_sources",
      message: "Casting a wide net across 6 paper indexes…",
      detail:
        "PubMed · arXiv · Semantic Scholar · Google Scholar · OpenAlex · the web — all in parallel"
    })

    // ── Pre-warm with keyless sources (PubMed + arXiv + S2-public + Scholar
    // + Tavily + OpenAlex) BEFORE the PaperFinder fan-out. This makes the
    // lit-scout resilient to PaperFinder outages: even if every PaperFinder
    // round 5xx's, we still surface real papers to the scientist. PubMed,
    // arXiv, and OpenAlex require no API key at all so they always work.
    // performMultiSourceSearch wraps each source in .catch() so one
    // failure never sinks the rest.
    const prewarmStart = Date.now()
    try {
      const multi = await performMultiSourceSearch(queryData.primaryQuery, 10)
      const prewarmed: SearchResult[] = [
        ...multi.sources.pubmed,
        ...multi.sources.arxiv,
        ...multi.sources.semanticScholar,
        ...multi.sources.scholar,
        ...multi.sources.tavily,
        ...multi.sources.openalex
      ]
      allResults.push(...prewarmed)
      const prewarmMs = Date.now() - prewarmStart
      // Per-source breakdown so the user actually sees which indexes
      // came back with results vs which struck out for this query.
      // Renders below the message line in PhaseProgressView's `detail`
      // slot.
      const perSource = [
        ["PubMed", multi.sources.pubmed.length],
        ["arXiv", multi.sources.arxiv.length],
        ["Semantic Scholar", multi.sources.semanticScholar.length],
        ["Google Scholar", multi.sources.scholar.length],
        ["OpenAlex", multi.sources.openalex.length],
        ["Web", multi.sources.tavily.length]
      ] as const
      const detail = perSource
        .map(([label, n]) => `${label}: ${n}`)
        .join("  ·  ")
      console.log(
        `🟢 [LITERATURE_SCOUT_PREWARM] Keyless sources returned ${prewarmed.length} papers in ${prewarmMs}ms (${detail})`
      )
      onProgress?.({
        step: "searching_sources",
        message: `Got ${prewarmed.length} candidate papers from the open indexes (in ${(prewarmMs / 1000).toFixed(1)}s). Refining with PaperFinder for snippet-level ranking…`,
        detail
      })
    } catch (e: any) {
      console.warn(
        `⚠️  [LITERATURE_SCOUT_PREWARM] Multi-source pre-warm failed:`,
        e?.message ?? e
      )
      onProgress?.({
        step: "searching_sources",
        message:
          "Open indexes had trouble responding — falling back to PaperFinder only.",
        detail: e?.message ? String(e.message).slice(0, 120) : undefined
      })
    }

    // ── Parallel PaperFinder fan-out (all-complete, no abort) ──────────
    // Round dispatch fires all queries in parallel against PaperFinder,
    // waits for ALL of them to complete, then merges + dedupes + ranks.
    //
    // Earlier versions of this code aborted in-flight rounds the moment
    // one round pushed the unique-paper count past `minPapers`. That
    // saved wall-clock time but at the cost of throwing away whole
    // rounds' worth of paper-finder responses that arrived 50ms after
    // the threshold was hit - and paper-finder had already paid the S2
    // quota for those calls server-side. Net effect: data loss for no
    // material wall-clock win (the longest round dominates total time
    // regardless of how many earlier rounds we cancel).
    //
    // Current design:
    //   - Per-round results collected into a local map keyed by index.
    //   - No shared AbortController; rounds finish or time out on
    //     their own per-call deadline (PAPER_FINDER_TIMEOUT_MS = 150s).
    //   - Per-round progress events still fire pre/post-call so the
    //     UI checklist updates in real time as each round completes.
    //   - Pre-round skip preserved at the dispatch site: if pre-warm
    //     already produced ≥ minPapers, we don't fire any rounds.
    //   - After Promise.allSettled, flatten all per-round papers into
    //     allResults in a single batched concat - guarantees the
    //     downstream dedup/rank/slice sees the FULL union of every
    //     round's contribution, in deterministic order.
    let roundsAttempted = 0
    let roundsServerError = 0
    let lastServerError: string | null = null

    // Always fire PaperFinder rounds when queries are present.
    //
    // We used to skip the PaperFinder fan-out when pre-warm already
    // produced ≥ minPapers (default 10) unique candidates. That made
    // sense when paper-finder was unreliable, slow, and used a single
    // arm — pre-warm's 6 keyless sources could outperform it.
    //
    // Today paper-finder runs 7 retrieval arms (S2 dense + S2 paper
    // search + OpenAlex + PubMed + arXiv + Scholar + Tavily) against
    // ALL of the LLM-planned queries (primary + mechanism + methods +
    // failure_modes + …). Skipping it costs us:
    //   - the 2-4 alternative queries' contributions entirely
    //   - Cohere rerank + LLM relevance judgement over the merged pool
    //   - ~5× the candidate count
    //
    // So we now always run paper-finder when there's at least one
    // query to send. Pre-warm becomes purely additive — visible-fast
    // baseline + safety net for when paper-finder is unreachable —
    // not a short-circuit.
    if (roundQueries.length > 0) {
      const preWarmCount = dedupeNormalize(allResults).length
      const fanOutStart = Date.now()
      console.log(
        `🚀 [LITERATURE_SCOUT_SEARCH] Firing ${roundQueries.length} PaperFinder rounds in parallel (pre-warm seeded ${preWarmCount} candidates; PaperFinder adds the multi-query, multi-arm coverage).`
      )

      // Per-round result slots, keyed by round index so we can stitch
      // results back together in deterministic order even though
      // completions arrive concurrently.
      type RoundResult = {
        papers: SearchResult[]
        responseText?: string
        error?: { message: string; isUpstreamFailure: boolean }
        elapsedMs: number
      }
      const roundResults: Array<RoundResult | null> = roundQueries.map(
        () => null
      )

      const runOneRound = async (q: string, idx: number): Promise<void> => {
        const shortQuery = q.length > 70 ? q.slice(0, 67) + "…" : q
        const intent = queryIntents[idx] ?? "primary"
        // Intent suffix renders next to the round number in the UI
        // ("Round 2/4 · mechanism") - helps the user understand WHY
        // we ran each round, not just "we ran another round".
        const intentSuffix = intent !== "primary" ? ` · ${intent}` : ""
        // Pre-call event - tells the UI this round has started.
        onProgress?.({
          step: "searching_round",
          message: `PaperFinder round ${idx + 1}/${roundQueries.length}${intentSuffix} · asking with snippet-level ranking…`,
          round: idx + 1,
          totalRounds: roundQueries.length,
          uniqueSoFar: dedupeNormalize(allResults).length,
          query: shortQuery,
          intent
        })
        const pfStart = Date.now()
        try {
          const response = await runPaperFinder(buildRoundQuery(q), {
            operationMode: "infer",
            readResultsFromCache: !searchOptions.bypassCache
          })
          const roundElapsedMs = Date.now() - pfStart
          console.log(
            `⏱️  [LITERATURE_SCOUT_SEARCH] Round ${idx + 1} responded in ${roundElapsedMs}ms`
          )

          const normalized = normalizePaperFinderResults(response)
          roundResults[idx] = {
            papers: normalized,
            responseText: response?.response_text,
            elapsedMs: roundElapsedMs
          }

          // Best-effort live progress: estimate the running unique
          // count by combining the prior allResults snapshot with
          // this round's contribution. This is for UX feedback only -
          // the AUTHORITATIVE dedup happens once after the gather.
          const provisionalUnique = dedupeNormalize([
            ...allResults,
            ...normalized
          ]).length
          onProgress?.({
            step: "searching_round",
            message: `PaperFinder round ${idx + 1}${intentSuffix} done · returned ${normalized.length} paper${normalized.length === 1 ? "" : "s"} (≈${provisionalUnique} unique so far)`,
            round: idx + 1,
            totalRounds: roundQueries.length,
            uniqueSoFar: provisionalUnique,
            query: shortQuery,
            elapsedMs: roundElapsedMs,
            intent
          })
        } catch (paperFinderError: any) {
          const msg = paperFinderError?.message ?? String(paperFinderError)
          console.warn(
            `⚠️  [LITERATURE_SCOUT_SEARCH] Round ${idx + 1} failed; continuing:`,
            msg
          )
          const isUpstreamFailure =
            /^(5\d{2}|PaperFinder failed)/i.test(msg) ||
            /failed to respond|no documents retrieved/i.test(msg)
          roundResults[idx] = {
            papers: [],
            elapsedMs: Date.now() - pfStart,
            error: { message: msg, isUpstreamFailure }
          }
        }
      }

      roundsAttempted = roundQueries.length
      await Promise.allSettled(
        roundQueries.map((q, idx) => runOneRound(q, idx))
      )

      // ── All rounds settled. Aggregate now. ──────────────────────────
      // Flatten per-round results into allResults in deterministic
      // order (round 0 first, round 1 next, ...). Order matters here
      // only for stable dedup behaviour (first occurrence wins) -
      // final ranking is by relevanceScore so visual order isn't
      // affected.
      for (const result of roundResults) {
        if (!result) continue
        if (result.papers.length > 0) {
          allResults.push(...result.papers)
        }
        if (result.responseText) {
          responseTexts.push(result.responseText)
        }
        if (result.error?.isUpstreamFailure) {
          roundsServerError++
          lastServerError = result.error.message
        }
      }

      console.log(
        `🏁 [LITERATURE_SCOUT_SEARCH] Parallel fan-out finished in ${Date.now() - fanOutStart}ms (${roundsAttempted} rounds, ${roundsServerError} server errors).`
      )
    }

    // ── Dedup funnel ────────────────────────────────────────────────────
    // Tell the user how many raw candidates we pulled across all
    // sources + how many remain after dedup. e.g. "Sifted 180 raw
    // candidates → 95 unique papers".
    const rawCandidateCount = allResults.length
    const deduped = dedupeNormalize(allResults).filter(p => {
      const url = (p.url || "").toLowerCase()
      const title = (p.title || "").toLowerCase()
      return !excludeUrls.has(url) && !excludeTitles.has(title)
    })
    onProgress?.({
      step: "deduping",
      message: `Collapsed ${rawCandidateCount} raw candidate${rawCandidateCount === 1 ? "" : "s"} to ${deduped.length} unique paper${deduped.length === 1 ? "" : "s"}.`,
      rawCount: rawCandidateCount,
      uniqueCount: deduped.length
    })

    // ── Filter review articles ──────────────────────────────────────────
    // Surveys, meta-analyses, and narrative reviews are theoretical -
    // the hypothesis pipeline needs primary research (actual data +
    // experiments) per the scientist's complaint. `isReview` was set in
    // paper-finder.ts/toSearchResult via publication-type tags + title
    // heuristic. We keep the dropped reviews around in a separate bucket
    // so we can re-introduce them if the primary list comes back empty.
    const primaryResearch = deduped.filter(p => !p.isReview)
    const droppedReviews = deduped.length - primaryResearch.length
    if (droppedReviews > 0) {
      console.log(
        `🚫 [LITERATURE_SCOUT_FILTER] Dropped ${droppedReviews} review article(s); ${primaryResearch.length} primary research papers remain.`
      )
    }
    onProgress?.({
      step: "filtering_reviews",
      message:
        droppedReviews > 0
          ? `Filtered ${droppedReviews} review article${droppedReviews === 1 ? "" : "s"}, kept ${primaryResearch.length} primary research paper${primaryResearch.length === 1 ? "" : "s"}.`
          : "No review articles to filter.",
      dropped: droppedReviews,
      remaining: primaryResearch.length
    })

    // Fall back to including reviews ONLY when the primary pool is
    // empty - better than blank UI. We still flag them as reviews
    // downstream so the LLM is told to treat them with caution.
    const filteredPool = primaryResearch.length > 0 ? primaryResearch : deduped

    onProgress?.({
      step: "ranking",
      message: `Ranking ${filteredPool.length} paper${filteredPool.length === 1 ? "" : "s"} by relevance to your problem…`,
      remaining: filteredPool.length
    })

    const mergedResults = [...filteredPool]
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, 40)

    // ── Problem-aware summaries ────────────────────────────────────────
    // Run AFTER ranking + filtering, so we only pay the LLM cost on
    // papers that will actually surface. Mutates `mergedResults` in
    // place by writing `problemAwareSummary` on each paper - that's
    // what buildCitationsDetailed picks up.
    if (mergedResults.length > 0) {
      onProgress?.({
        step: "summarizing_papers",
        message: `Summarising ${mergedResults.length} paper${mergedResults.length === 1 ? "" : "s"} against your problem statement…`,
        papersCount: mergedResults.length
      })
      const summaries = await summarizePapersForProblem(state, mergedResults)
      for (const [idx, summary] of Array.from(summaries.entries())) {
        if (idx < mergedResults.length) {
          mergedResults[idx].problemAwareSummary = summary
        }
      }
    }

    // Whether every attempted round 5xx'd from upstream - drives the
    // UI banner copy (retry vs broaden) AND the prompt-side "do NOT
    // invent citations" instruction. Computed once and reused.
    const allRoundsFailedUpstream =
      roundsAttempted > 0 && roundsServerError === roundsAttempted

    if (mergedResults.length === 0) {
      console.warn(
        "⚠️  [LITERATURE_SCOUT_SEARCH] All rounds returned zero unique papers."
      )
      onProgress?.({
        step: "papers_found",
        message: allRoundsFailedUpstream
          ? `Paper search service is unreachable right now (${roundsServerError}/${roundsAttempted} rounds returned errors). Please retry in a few minutes.`
          : "No papers found for this query. Try broadening the problem statement or upload PDFs manually.",
        totalPapers: 0,
        sourceCounts: {}
      })
      if (allRoundsFailedUpstream && lastServerError) {
        console.warn(
          `⚠️  [LITERATURE_SCOUT_SEARCH] Upstream signature: ${lastServerError}`
        )
      }
    } else {
      curated = buildCuratedAggregatedResults(mergedResults)
      curated.searchMetrics.relevanceScores = mergedResults
        .map(paper => paper.relevanceScore ?? 0)
        .filter(score => typeof score === "number" && score > 0)
      const sourceCounts: Record<string, number> = {
        pubmed: curated.sources.pubmed.length,
        arxiv: curated.sources.arxiv.length,
        semanticScholar: curated.sources.semanticScholar.length,
        scholar: curated.sources.scholar.length,
        tavily: curated.sources.tavily.length,
        openalex: curated.sources.openalex.length
      }
      // `totalCandidates` is the count BEFORE the .slice(0, 40) cut, so
      // the UI can show "10 surfaced · ranked by relevance · from
      // <totalCandidates> searched". This is `filteredPool.length`
      // which is post-dedup + post-review-filter (or post-dedup if
      // we fell back to including reviews).
      const totalCandidates = filteredPool.length
      onProgress?.({
        step: "papers_found",
        message:
          mergedResults.length < totalCandidates
            ? `Surfaced top ${mergedResults.length} of ${totalCandidates} ranked candidate${totalCandidates === 1 ? "" : "s"}.`
            : `Found ${mergedResults.length} paper${mergedResults.length === 1 ? "" : "s"}`,
        totalPapers: mergedResults.length,
        sourceCounts,
        totalCandidates
      })
    }

    curated.searchMetrics.queryOptimization = roundQueries

    // Stamp the upstream status so the synthesis prompt + UI both know
    // whether to say "service unreachable, retry" or "no matches,
    // broaden the query". Without this signal the LLM was inventing
    // citations to fill the gap (seen 2026-05-18 with Vespa 403s).
    curated.searchMetrics.searchStatus = {
      mode:
        mergedResults.length > 0
          ? "ok"
          : allRoundsFailedUpstream
            ? "upstream_unreachable"
            : "no_results",
      roundsAttempted,
      roundsServerError,
      lastServerError
    }

    if (responseTexts.length > 0) {
      curated.synthesizedFindings.novelInsights = [
        ...curated.synthesizedFindings.novelInsights,
        ...responseTexts
      ]
    }

    state.searchResults = curated

    console.log("\n🤖 [LITERATURE_SCOUT_AI] Calling OpenAI for synthesis...")
    onProgress?.({
      step: "synthesizing",
      message: "Synthesizing findings with AI..."
    })
    const systemPrompt = createLiteratureScoutPrompt(state, curated, overrides)
    const userPrompt = getAgentUserPrompt("literatureScout", overrides)

    console.log("📝 [LITERATURE_SCOUT_AI] Prompt lengths:")
    console.log("  📏 System prompt:", systemPrompt.length, "characters")
    console.log("  📏 User prompt:", userPrompt.length, "characters")

    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: zodResponseFormat(
        LiteratureScoutSchema,
        "literatureScout"
      )
    })

    const parsed = completion.choices[0].message.parsed!

    // Belt + suspenders: when the actual paper search returned zero
    // results, FORCE citations to []. The prompt already tells the
    // model not to invent any (see renderSearchDocuments zero-result
    // branch), but if it ever ignores that instruction we strip them
    // here so fabricated APA strings never reach the user. The cost
    // of being wrong here (dropping a real citation) is zero - there
    // are no real citations to drop, since totalResults is 0.
    const realPaperCount = state.searchResults?.totalResults ?? 0
    const sanitizedCitations =
      realPaperCount === 0 ? [] : parsed.citations || []
    if (realPaperCount === 0 && (parsed.citations?.length ?? 0) > 0) {
      console.warn(
        `🛡️  [LITERATURE_SCOUT_GUARD] Stripped ${parsed.citations!.length} model-fabricated citation(s) - no real papers were retrieved.`
      )
    }

    const output: LiteratureScoutOutput = {
      whatOthersHaveDone:
        parsed.whatOthersHaveDone || "No information available",
      goodMethodsAndTools:
        parsed.goodMethodsAndTools || "No information available",
      potentialPitfalls: parsed.potentialPitfalls || "No information available",
      citations: sanitizedCitations,
      citationsDetailed: buildCitationsDetailed(state.searchResults)
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [LITERATURE_SCOUT_OUTPUT] Agent Output:")
    console.log(
      "  📖 whatOthersHaveDone:",
      output.whatOthersHaveDone.length,
      "chars"
    )
    console.log(
      "  🛠️ goodMethodsAndTools:",
      output.goodMethodsAndTools.length,
      "chars"
    )
    console.log(
      "  ⚠️ potentialPitfalls:",
      output.potentialPitfalls.length,
      "chars"
    )
    console.log("  📎 citations:", output.citations.length, "items")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    onProgress?.({
      step: "done",
      message: `Literature search complete - ${output.citationsDetailed?.length ?? 0} papers`,
      papersCount: output.citationsDetailed?.length ?? 0
    })

    return {
      output,
      prompt: {
        agentId: "literatureScout",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [LITERATURE_SCOUT_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

export async function callHypothesisBuilderAgent(
  state: ExperimentDesignState
): Promise<HypothesisBuilderOutput> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("💡 [HYPOTHESIS_BUILDER_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  console.log("📥 [HYPOTHESIS_BUILDER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log(
    "  📚 Literature Scout Available:",
    state.literatureScoutOutput ? "✅" : "❌"
  )

  console.log(
    "\n🤖 [HYPOTHESIS_BUILDER_AI] Calling OpenAI for hypothesis generation..."
  )
  const systemPrompt = createHypothesisBuilderPrompt(state)
  const userPrompt = `Based on the research problem and literature insights provided, generate one clear, testable hypothesis with explanation.`

  console.log("📝 [HYPOTHESIS_BUILDER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: zodResponseFormat(
        HypothesisBuilderSchema,
        "hypothesisBuilder"
      )
    })

    const parsed = completion.choices[0].message.parsed!
    const result = {
      hypothesis: parsed.hypothesis || "No hypothesis generated",
      explanation: parsed.explanation || "No explanation available"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [HYPOTHESIS_BUILDER_OUTPUT] Agent Output:")
    console.log("  💡 Hypothesis:", result.hypothesis.length, "characters")
    console.log("  📝 Explanation:", result.explanation.length, "characters")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return result
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [HYPOTHESIS_BUILDER_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

export async function callExperimentDesignerAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["experimentDesigner"]
): Promise<AgentCallResult<ExperimentDesignerOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("🧪 [EXPERIMENT_DESIGNER_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  console.log("📥 [EXPERIMENT_DESIGNER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log(
    "  💡 Hypothesis Builder Available:",
    state.hypothesisBuilderOutput ? "✅" : "❌"
  )
  console.log(
    "  📚 Literature Scout Available:",
    state.literatureScoutOutput ? "✅" : "❌"
  )

  const systemPrompt = createExperimentDesignerPrompt(state, overrides)
  const userPrompt = getAgentUserPrompt("experimentDesigner", overrides)

  console.log("📝 [EXPERIMENT_DESIGNER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: zodResponseFormat(
        ExperimentDesignerSchema,
        "experimentDesigner"
      )
    })

    const parsed = completion.choices[0].message.parsed!
    const result: ExperimentDesignerOutput = {
      designSummary: parsed.designSummary || "No summary provided",
      experimentDesign: {
        whatWillBeTested:
          parsed.experimentDesign?.whatWillBeTested || "Not specified",
        whatWillBeMeasured:
          parsed.experimentDesign?.whatWillBeMeasured || "Not specified",
        controlGroups:
          parsed.experimentDesign?.controlGroups || "Not specified",
        experimentalGroups:
          parsed.experimentDesign?.experimentalGroups || "Not specified",
        sampleTypes: parsed.experimentDesign?.sampleTypes || "Not specified",
        toolsNeeded: parsed.experimentDesign?.toolsNeeded || "Not specified",
        replicatesAndConditions:
          parsed.experimentDesign?.replicatesAndConditions || "Not specified",
        specificRequirements:
          parsed.experimentDesign?.specificRequirements || "Not specified"
      },
      conditionsTable: parsed.conditionsTable || { headers: [], rows: [] },
      experimentalGroupsOverview:
        parsed.experimentalGroupsOverview || "Not specified",
      statisticalRationale: parsed.statisticalRationale || "Not specified",
      criticalTechnicalRequirements:
        parsed.criticalTechnicalRequirements || "Not specified",
      handoffNoteForPlanner: parsed.handoffNoteForPlanner || "Not specified",
      rationale: parsed.rationale || "No rationale provided"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [EXPERIMENT_DESIGNER_OUTPUT] Agent Output:")
    console.log(
      "  📝 Design Summary:",
      result.designSummary.length,
      "characters"
    )
    console.log(
      "  📋 Conditions Table:",
      `${result.conditionsTable.rows.length} rows × ${result.conditionsTable.headers.length} cols`
    )
    console.log(
      "  🤝 Handoff Note:",
      result.handoffNoteForPlanner.length,
      "characters"
    )
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return {
      output: result,
      prompt: {
        agentId: "experimentDesigner",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [EXPERIMENT_DESIGNER_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

export async function callStatCheckAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["statCheck"]
): Promise<AgentCallResult<StatCheckOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📊 [STAT_CHECK_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  console.log("📥 [STAT_CHECK_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log(
    "  🧪 Experiment Designer Available:",
    state.experimentDesignerOutput ? "✅" : "❌"
  )

  const systemPrompt = createStatCheckPrompt(state, overrides)
  const userPrompt = getAgentUserPrompt("statCheck", overrides)

  console.log("📝 [STAT_CHECK_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: zodResponseFormat(StatCheckSchema, "statCheck")
    })

    const parsed = completion.choices[0].message.parsed!
    const result: StatCheckOutput = {
      whatLooksGood: parsed.whatLooksGood || "No assessment available",
      problemsOrRisks: parsed.problemsOrRisks || [],
      suggestedImprovements: parsed.suggestedImprovements || [],
      correctedDesign: parsed.correctedDesign || "",
      changeLog: parsed.changeLog || [],
      improvementRationale: parsed.improvementRationale || "",
      overallAssessment:
        parsed.overallAssessment || "No overall assessment available",
      finalAssessment: parsed.finalAssessment || "",
      analysisPlan: parsed.analysisPlan
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [STAT_CHECK_OUTPUT] Agent Output:")
    console.log(
      "  ✅ What Looks Good:",
      result.whatLooksGood.length,
      "characters"
    )
    console.log("  ⚠️  Problems/Risks:", result.problemsOrRisks.length, "items")
    console.log(
      "  💡 Suggested Improvements:",
      result.suggestedImprovements.length,
      "items"
    )
    console.log(
      "  🔁 Corrected Design:",
      result.correctedDesign.length,
      "characters"
    )
    console.log("  🪵 Change Log:", result.changeLog.length, "items")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return {
      output: result,
      prompt: {
        agentId: "statCheck",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [STAT_CHECK_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

export async function callPlannerAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["planner"]
): Promise<AgentCallResult<PlannerOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("🗂️ [PLANNER_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  console.log("📥 [PLANNER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log(
    "  🧪 Experiment Designer Available:",
    state.experimentDesignerOutput ? "✅" : "❌"
  )
  console.log("  📊 Stat Check Available:", state.statCheckOutput ? "✅" : "❌")

  const systemPrompt = createPlannerPrompt(state, overrides)
  const userPrompt = getAgentUserPrompt("planner", overrides)

  console.log("📝 [PLANNER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      response_format: zodResponseFormat(PlannerSchema, "planner")
    })

    const parsed = completion.choices[0].message.parsed!
    const result: PlannerOutput = {
      feasibilityCheck: parsed.feasibilityCheck || "Not specified",
      summaryOfTotals: parsed.summaryOfTotals || "Not specified",
      materialsChecklist: parsed.materialsChecklist || "Not specified",
      reagents: parsed.reagents ?? [],
      stockSolutionPreparation:
        parsed.stockSolutionPreparation || "Not specified",
      masterMix: parsed.masterMix ?? {
        components: [],
        totalPerReactionUl: 0,
        totalBatchUl: 0,
        mixingOrder: [],
        notes: "Not specified"
      },
      workingSolutions: parsed.workingSolutions ?? [],
      tubeAndLabelPlanning: parsed.tubeAndLabelPlanning || "Not specified",
      consumablePrepAndQC: parsed.consumablePrepAndQC || "Not specified",
      studyLayout: parsed.studyLayout || "Not specified",
      prepSchedule: parsed.prepSchedule || "Not specified",
      kitPackList: parsed.kitPackList || "Not specified",
      criticalErrorPoints: parsed.criticalErrorPoints || "Not specified",
      materialOptimizationSummary:
        parsed.materialOptimizationSummary || "Not specified",
      assumptionsAndConfirmations:
        parsed.assumptionsAndConfirmations || "Not specified"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [PLANNER_OUTPUT] Agent Output:")
    console.log(
      "  📦 Materials Checklist:",
      result.materialsChecklist.length,
      "chars"
    )
    console.log("  🧪 Reagents:", result.reagents.length, "entries")
    console.log(
      "  🧯 Master Mix Components:",
      result.masterMix.components.length,
      "| Working Solutions:",
      result.workingSolutions.length,
      "rows"
    )
    console.log("  🗺️ Study Layout:", result.studyLayout.length, "chars")
    console.log("  ⏱️ Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return {
      output: result,
      prompt: {
        agentId: "planner",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [PLANNER_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

export async function callProcedureAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["procedure"]
): Promise<AgentCallResult<ProcedureOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("🧾 [PROCEDURE_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  console.log("📥 [PROCEDURE_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🌐 Domain:", state.domain || "(not specified)")
  console.log("  🧪 Phase:", state.phase || "(not specified)")
  console.log("  🗂️ Planner Available:", state.plannerOutput ? "✅" : "❌")

  const systemPrompt = createProcedurePrompt(state, overrides)
  const userPrompt = getAgentUserPrompt("procedure", overrides)

  console.log("📝 [PROCEDURE_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      response_format: zodResponseFormat(ProcedureSchema, "procedure")
    })

    const parsed = completion.choices[0].message.parsed!
    const result: ProcedureOutput = {
      preRunChecklist: parsed.preRunChecklist || "Not specified",
      benchSetupAndSafety: parsed.benchSetupAndSafety || "Not specified",
      sampleLabelingIdScheme: parsed.sampleLabelingIdScheme || "Not specified",
      instrumentSetupCalibration:
        parsed.instrumentSetupCalibration || "Not specified",
      criticalHandlingRules: parsed.criticalHandlingRules || "Not specified",
      samplePreparation: parsed.samplePreparation ?? [],
      measurementSteps: parsed.measurementSteps ?? [],
      experimentalConditionExecution:
        parsed.experimentalConditionExecution ?? [],
      dataRecordingProcessing:
        parsed.dataRecordingProcessing || "Not specified",
      acceptanceCriteria: parsed.acceptanceCriteria || "Not specified",
      troubleshootingGuide: parsed.troubleshootingGuide || "Not specified",
      runLogTemplate: parsed.runLogTemplate || "Not specified",
      cleanupDisposal: parsed.cleanupDisposal || "Not specified",
      dataHandoff: parsed.dataHandoff || "Not specified"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [PROCEDURE_OUTPUT] Agent Output:")
    console.log(
      "  🧪 Sample Preparation:",
      result.samplePreparation.length,
      "steps"
    )
    console.log(
      "  📊 Measurement Steps:",
      result.measurementSteps.length,
      "steps"
    )
    console.log(
      "  ⚗️ Condition Execution:",
      result.experimentalConditionExecution.length,
      "steps"
    )
    console.log(
      "  🛠️ Troubleshooting:",
      result.troubleshootingGuide.length,
      "chars"
    )
    console.log("  ⏱️ Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return {
      output: result,
      prompt: {
        agentId: "procedure",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [PROCEDURE_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}

const EMPTY_PLANNER: PlannerOutput = {
  feasibilityCheck: "Not specified",
  summaryOfTotals: "Not specified",
  materialsChecklist: "Not specified",
  reagents: [],
  stockSolutionPreparation: "Not specified",
  masterMix: {
    components: [],
    totalPerReactionUl: 0,
    totalBatchUl: 0,
    mixingOrder: [],
    notes: "Not specified"
  },
  workingSolutions: [],
  tubeAndLabelPlanning: "Not specified",
  consumablePrepAndQC: "Not specified",
  studyLayout: "Not specified",
  prepSchedule: "Not specified",
  kitPackList: "Not specified",
  criticalErrorPoints: "Not specified",
  materialOptimizationSummary: "Not specified",
  assumptionsAndConfirmations: "Not specified"
}

const EMPTY_PROCEDURE: ProcedureOutput = {
  preRunChecklist: "Not specified",
  benchSetupAndSafety: "Not specified",
  sampleLabelingIdScheme: "Not specified",
  instrumentSetupCalibration: "Not specified",
  criticalHandlingRules: "Not specified",
  samplePreparation: [],
  measurementSteps: [],
  experimentalConditionExecution: [],
  dataRecordingProcessing: "Not specified",
  acceptanceCriteria: "Not specified",
  troubleshootingGuide: "Not specified",
  runLogTemplate: "Not specified",
  cleanupDisposal: "Not specified",
  dataHandoff: "Not specified"
}

const EMPTY_LITERATURE: LiteratureScoutOutput = {
  whatOthersHaveDone: "No literature summary available",
  goodMethodsAndTools: "No literature summary available",
  potentialPitfalls: "No literature summary available",
  citations: []
}

const EMPTY_HYPOTHESIS: HypothesisBuilderOutput = {
  hypothesis: "No hypothesis available",
  explanation: "No explanation available"
}

const EMPTY_EXPERIMENT_DESIGN: ExperimentDesignerOutput = {
  designSummary: "No design summary available",
  experimentDesign: {
    whatWillBeTested: "Not specified",
    whatWillBeMeasured: "Not specified",
    controlGroups: "Not specified",
    experimentalGroups: "Not specified",
    sampleTypes: "Not specified",
    toolsNeeded: "Not specified",
    replicatesAndConditions: "Not specified",
    specificRequirements: "Not specified"
  },
  conditionsTable: { headers: [], rows: [] },
  experimentalGroupsOverview: "Not specified",
  statisticalRationale: "Not specified",
  criticalTechnicalRequirements: "Not specified",
  handoffNoteForPlanner: "Not specified",
  rationale: "No rationale provided"
}

const EMPTY_STAT_CHECK: StatCheckOutput = {
  whatLooksGood: "No assessment available",
  problemsOrRisks: [],
  suggestedImprovements: [],
  correctedDesign: "",
  changeLog: [],
  improvementRationale: "",
  overallAssessment: "No overall assessment available",
  finalAssessment: ""
}

/**
 * Report Writer runs in ASSEMBLY mode.
 *
 * It does NOT regenerate specialist agents' outputs. It makes a small LLM
 * call that ONLY produces the `researchObjective` (executive summary) and
 * `finalNotes` (closing reflection). Everything else - literature summary,
 * hypothesis, experiment design, statistical review, execution plan,
 * procedure - is passed through verbatim from `state`.
 *
 * This guarantees specialist detail is preserved, the statistical review
 * cannot be silently dropped, and ordering is controlled by the assembler
 * (not the LLM).
 */
export async function callReportWriterAgent(
  state: ExperimentDesignState,
  overrides?: AgentPromptOverrides["reportWriter"]
): Promise<AgentCallResult<ReportWriterOutput>> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📝 [REPORT_WRITER_AGENT] Starting Assembly")
  console.log("=".repeat(80))

  console.log("📥 [REPORT_WRITER_INPUT] Specialist outputs available:")
  console.log("  📚 Literature:", state.literatureScoutOutput ? "✅" : "❌")
  console.log("  💡 Hypothesis:", state.hypothesisBuilderOutput ? "✅" : "❌")
  console.log(
    "  🧪 Experiment Design:",
    state.experimentDesignerOutput ? "✅" : "❌"
  )
  console.log("  📊 Stat Check:", state.statCheckOutput ? "✅" : "❌")
  console.log("  🗂️ Planner:", state.plannerOutput ? "✅" : "❌")
  console.log("  🧾 Procedure:", state.procedureOutput ? "✅" : "❌")

  const systemPrompt = createReportWriterPrompt(state, overrides)
  const userPrompt = getAgentUserPrompt("reportWriter", overrides)

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      response_format: zodResponseFormat(
        ReportAssemblyNotesSchema,
        "reportAssemblyNotes"
      )
    })

    const parsed = completion.choices[0].message.parsed!

    const result: ReportWriterOutput = {
      researchObjective:
        parsed.researchObjective?.trim() || "No research objective available",
      literatureSummary: state.literatureScoutOutput ?? EMPTY_LITERATURE,
      hypothesis: state.hypothesisBuilderOutput ?? EMPTY_HYPOTHESIS,
      experimentDesign:
        state.experimentDesignerOutput ?? EMPTY_EXPERIMENT_DESIGN,
      statisticalReview: state.statCheckOutput ?? EMPTY_STAT_CHECK,
      executionPlan: state.plannerOutput ?? EMPTY_PLANNER,
      procedure: state.procedureOutput ?? EMPTY_PROCEDURE,
      finalNotes: parsed.finalNotes?.trim() || "No final notes available"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [REPORT_WRITER_OUTPUT] Assembly complete:")
    console.log(
      "  📋 Research Objective:",
      result.researchObjective.length,
      "chars (LLM-generated)"
    )
    console.log(
      "  📝 Final Notes:",
      result.finalNotes.length,
      "chars (LLM-generated)"
    )
    console.log("  🔗 Specialist outputs: passed through verbatim")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return {
      output: result,
      prompt: {
        agentId: "reportWriter",
        systemPrompt,
        userPrompt
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [REPORT_WRITER_ERROR] Assembly failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}
