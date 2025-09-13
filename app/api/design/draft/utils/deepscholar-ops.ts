import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { AggregatedSearchResults, SearchResult } from "../types"
import { optimizeSearchQuery, performMultiSourceSearch } from "./search-utils"

const MODEL_NAME = "gpt-4o-2024-08-06"
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })

export async function generateQueries(
  problem: string,
  objectives: string[],
  variables: string[],
  rounds: number = 2,
  queriesPerRound: number = 2
): Promise<string[]> {
  const t0 = Date.now()
  const base = optimizeSearchQuery(problem, objectives, variables, "biomedical")
  const seeds = [base.primaryQuery, ...base.alternativeQueries]
  const queries: string[] = []
  for (let r = 0; r < rounds; r++) {
    const start = r * queriesPerRound
    queries.push(...seeds.slice(start, start + queriesPerRound).filter(Boolean))
  }
  const out = Array.from(new Set(queries))
  console.log("🧩 [DEEPSCHOLAR][QUERIES] Generated queries:")
  out.forEach((q, i) => console.log(`  ${i + 1}. ${q}`))
  console.log(
    `⏱️  [DEEPSCHOLAR][QUERIES] Time: ${Date.now() - t0}ms, Count: ${out.length}`
  )
  return out
}

export function dedupeNormalize(papers: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return papers.filter(p => {
    const key = (p.doi || p.url || p.title).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const RelevanceSchema = z.object({
  relevance: z.enum(["0", "1", "2"]),
  rationale: z.string().optional()
})

export async function semFilter(
  papers: SearchResult[],
  userProblem: string,
  objectives: string[],
  variables: string[]
): Promise<SearchResult[]> {
  const t0 = Date.now()
  console.log(
    `🧪 [DEEPSCHOLAR][FILTER] Starting filter on ${papers.length} candidates`
  )
  const filtered: SearchResult[] = []
  for (const p of papers) {
    const sys =
      "Return JSON with fields: relevance (0/1/2) and rationale. Consider strict topical relevance to problem/objectives/variables."
    const user = `Problem: ${userProblem}\nObjectives: ${objectives.join(", ")}\nVariables: ${variables.join(", ")}\n\nTitle: ${p.title}\nAbstract: ${p.abstract}`
    try {
      const res = await openai.beta.chat.completions.parse({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        response_format: zodResponseFormat(RelevanceSchema, "rel")
      })
      const parsed = res.choices[0].message.parsed as z.infer<
        typeof RelevanceSchema
      >
      const rel = Number(parsed.relevance)
      if (rel > 0) filtered.push({ ...p, relevanceScore: rel })
    } catch (e) {
      // On failure, keep conservative (drop)
    }
  }
  const bySource: Record<string, number> = {}
  filtered.forEach(f => {
    bySource[f.source] = (bySource[f.source] || 0) + 1
  })
  console.log(
    `✅ [DEEPSCHOLAR][FILTER] Kept ${filtered.length}/${papers.length} candidates`
  )
  Object.entries(bySource).forEach(([src, n]) =>
    console.log(`  📦 ${src}: ${n}`)
  )
  console.log(`⏱️  [DEEPSCHOLAR][FILTER] Time: ${Date.now() - t0}ms`)
  return filtered
}

export function semTopK(
  papers: SearchResult[],
  k: number = 30
): SearchResult[] {
  const t0 = Date.now()
  const weights = { llm: 0.6, src: 0.2, recency: 0.1, cites: 0.1 }
  const srcW: Record<string, number> = {
    pubmed: 0.9,
    arxiv: 0.8,
    semantic_scholar: 0.85,
    scholar: 0.75,
    tavily: 0.7
  }
  const now = Date.now()
  const scored = papers.map(p => {
    const llm = p.relevanceScore ?? 0
    const src = srcW[p.source] ?? 0.5
    const recency = (() => {
      const d = Date.parse(p.publishedDate || "")
      if (Number.isNaN(d)) return 0.3
      const years = (now - d) / (1000 * 60 * 60 * 24 * 365)
      return Math.max(0, 1 - years / 5) // full credit if <=1y, decays to 0 by 5y
    })()
    const cites = p.citationCount
      ? Math.min(1, Math.log1p(p.citationCount) / 10)
      : 0.2
    const finalRank =
      weights.llm * llm +
      weights.src * src +
      weights.recency * recency +
      weights.cites * cites
    return { ...p, relevanceScore: finalRank }
  })
  const ranked = scored
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, k)
  console.log(
    `🏆 [DEEPSCHOLAR][TOPK] Selected top ${ranked.length} of ${papers.length}`
  )
  ranked
    .slice(0, 5)
    .forEach((p, i) =>
      console.log(
        `  ${i + 1}. ${(p.title || "").slice(0, 120)}  [src=${p.source}] [score=${
          p.relevanceScore?.toFixed(3) || "0.000"
        }]`
      )
    )
  console.log(`⏱️  [DEEPSCHOLAR][TOPK] Time: ${Date.now() - t0}ms`)
  return ranked
}

export function buildCuratedAggregatedResults(
  topPapers: SearchResult[]
): AggregatedSearchResults {
  const toAgg = (src: SearchResult["source"]) =>
    topPapers.filter(p => p.source === src)
  const agg: AggregatedSearchResults = {
    totalResults: topPapers.length,
    sources: {
      pubmed: toAgg("pubmed"),
      arxiv: toAgg("arxiv"),
      semanticScholar: toAgg("semantic_scholar"),
      scholar: toAgg("scholar"),
      tavily: toAgg("tavily")
    },
    synthesizedFindings: {
      keyMethodologies: [],
      commonPitfalls: [],
      recommendedApproaches: [],
      novelInsights: []
    },
    searchMetrics: {
      queryOptimization: [],
      relevanceScores: [],
      sourceWeights: {
        pubmed: 0.9,
        arxiv: 0.8,
        semanticScholar: 0.85,
        scholar: 0.75,
        tavily: 0.7
      }
    }
  }
  console.log(
    `📊 [DEEPSCHOLAR][AGG] Distribution - PubMed: ${agg.sources.pubmed.length}, ArXiv: ${agg.sources.arxiv.length}, Semantic Scholar: ${agg.sources.semanticScholar.length}, Scholar: ${agg.sources.scholar.length}, Tavily: ${agg.sources.tavily.length}`
  )
  return agg
}

export async function deepScholarRetrieveAndCurate(
  problem: string,
  objectives: string[],
  variables: string[],
  rounds: number = 2,
  queriesPerRound: number = 2,
  maxPerSource: number = 10,
  topK: number = 30
): Promise<AggregatedSearchResults> {
  const T0 = Date.now()
  console.log(
    `🚀 [DEEPSCHOLAR] Starting retrieval pipeline (rounds=${rounds}, q/round=${queriesPerRound}, perSource=${maxPerSource}, topK=${topK})`
  )
  const queries = await generateQueries(
    problem,
    objectives,
    variables,
    rounds,
    queriesPerRound
  )

  let candidates: SearchResult[] = []
  for (const q of queries) {
    const tq = Date.now()
    const r = await performMultiSourceSearch(q, maxPerSource)
    const merged: SearchResult[] = [
      ...r.sources.pubmed,
      ...r.sources.arxiv,
      ...r.sources.semanticScholar,
      ...r.sources.scholar,
      ...r.sources.tavily
    ]
    candidates.push(...merged)
    console.log(
      `🔎 [DEEPSCHOLAR][QUERY] "${q}" -> PubMed:${r.sources.pubmed.length} ArXiv:${r.sources.arxiv.length} SemSch:${r.sources.semanticScholar.length} Scholar:${r.sources.scholar.length} Tavily:${r.sources.tavily.length} (Time ${Date.now() - tq}ms)`
    )
  }
  console.log(
    `📥 [DEEPSCHOLAR][MERGE] Collected candidates: ${candidates.length}`
  )
  candidates = dedupeNormalize(candidates)
  console.log(
    `🧹 [DEEPSCHOLAR][DEDUPE] After dedupe: ${candidates.length} unique`
  )
  const filtered = await semFilter(candidates, problem, objectives, variables)
  const top = semTopK(filtered, topK)
  const result = buildCuratedAggregatedResults(top)
  console.log(
    `🏁 [DEEPSCHOLAR] Completed in ${Date.now() - T0}ms. Top papers: ${
      result.totalResults
    }`
  )
  return result
}
