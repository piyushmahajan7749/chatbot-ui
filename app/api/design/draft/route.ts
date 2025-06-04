import { StateGraph, END, START } from "@langchain/langgraph"
import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar"
import { TavilySearchResults } from "@langchain/community/tools/tavily_search"
import axios from "axios"

import { NextResponse } from "next/server"

// Add model constant
const MODEL_NAME = "gpt-4o-2024-08-06"

process.env.GOOGLE_SCHOLAR_API_KEY = process.env.SERPAPI_API_KEY

// Initialize enhanced search tools
const scholarTool = new SERPGoogleScholarAPITool({
  apiKey: process.env.SERPAPI_API_KEY
})

// Initialize Tavily for comprehensive web search (if API key available)
let tavilyTool: TavilySearchResults | null = null
if (process.env.TAVILY_API_KEY) {
  tavilyTool = new TavilySearchResults({
    apiKey: process.env.TAVILY_API_KEY,
    maxResults: 10
  })
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
})

// Enhanced search result interface with relevance scoring
interface SearchResult {
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

interface AggregatedSearchResults {
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

// Enhanced rate limiting with backoff strategy
class EnhancedRateLimiter {
  private requests: { [key: string]: number[] } = {}
  private backoffDelays: { [key: string]: number } = {}

  async checkAndWait(
    source: string,
    maxRequestsPerMinute: number = 10
  ): Promise<void> {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    if (!this.requests[source]) {
      this.requests[source] = []
      this.backoffDelays[source] = 1000 // Start with 1 second
    }

    // Clean old requests
    this.requests[source] = this.requests[source].filter(
      time => time > oneMinuteAgo
    )

    if (this.requests[source].length >= maxRequestsPerMinute) {
      const waitTime = this.backoffDelays[source]
      console.log(`⏳ [RATE_LIMIT] Backing off ${waitTime}ms for ${source}`)
      await new Promise(resolve => setTimeout(resolve, waitTime))

      // Exponential backoff with max cap
      this.backoffDelays[source] = Math.min(waitTime * 1.5, 30000)
    } else {
      // Reset backoff on successful request
      this.backoffDelays[source] = 1000
    }

    this.requests[source].push(now)
  }
}

const rateLimiter = new EnhancedRateLimiter()

// Enhanced query optimization
function optimizeSearchQuery(
  problem: string,
  objectives: string[],
  variables: string[],
  domain: "biomedical" | "technical" | "general" = "biomedical"
): {
  primaryQuery: string
  alternativeQueries: string[]
  keywords: string[]
} {
  const keywords = [
    ...problem.split(/\s+/).filter(word => word.length > 3),
    ...objectives.flatMap(obj =>
      obj.split(/\s+/).filter(word => word.length > 3)
    ),
    ...variables.flatMap(variable =>
      variable.split(/\s+/).filter(word => word.length > 3)
    )
  ]

  // Domain-specific query enhancement
  const domainTerms = {
    biomedical: [
      "clinical trial",
      "experimental design",
      "biomarker",
      "therapeutic",
      "efficacy",
      "safety"
    ],
    technical: [
      "methodology",
      "algorithm",
      "optimization",
      "analysis",
      "validation"
    ],
    general: ["research", "study", "analysis", "method", "approach"]
  }

  const enhancedKeywords = [...new Set([...keywords, ...domainTerms[domain]])]

  const primaryQuery = `${problem} ${objectives.join(" ")} ${variables.join(" ")} experimental design`

  const alternativeQueries = [
    `"${problem}" methodology research design`,
    `${enhancedKeywords.slice(0, 5).join(" ")} clinical study`,
    `${variables.join(" ")} ${domainTerms[domain].slice(0, 3).join(" ")}`,
    `experimental design ${problem.split(" ").slice(0, 3).join(" ")}`
  ]

  return {
    primaryQuery: primaryQuery.trim(),
    alternativeQueries,
    keywords: enhancedKeywords
  }
}

// Enhanced PubMed search with direct API calls
async function searchPubMedEnhanced(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    await rateLimiter.checkAndWait("pubmed", 3)
    console.log(`🔍 [PUBMED_ENHANCED] Searching for: ${query}`)

    // First, search for PMIDs
    const searchResponse = await axios.get(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
      {
        params: {
          db: "pubmed",
          term: query,
          retmax: maxResults,
          retmode: "json",
          tool: "chatbot-ui",
          email: "research@example.com"
        }
      }
    )

    const pmids = searchResponse.data.esearchresult?.idlist || []
    if (pmids.length === 0) return []

    await rateLimiter.checkAndWait("pubmed", 3)

    // Fetch detailed information
    const detailsResponse = await axios.get(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
      {
        params: {
          db: "pubmed",
          id: pmids.join(","),
          rettype: "xml",
          retmode: "xml",
          tool: "chatbot-ui",
          email: "research@example.com"
        }
      }
    )

    // Parse XML response (simplified - in production, use proper XML parser)
    const results: SearchResult[] = []
    const articles =
      detailsResponse.data.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/g) ||
      []

    articles.forEach((article: string, index: number) => {
      try {
        const title =
          article.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1] ||
          "No title"
        const abstract =
          article.match(/<AbstractText[^>]*>(.*?)<\/AbstractText>/)?.[1] ||
          "No abstract"
        const journal =
          article.match(/<Title>(.*?)<\/Title>/)?.[1] || "Unknown journal"
        const year =
          article.match(/<Year>(\d{4})<\/Year>/)?.[1] || "Unknown year"
        const authors =
          article
            .match(/<LastName>(.*?)<\/LastName>/g)
            ?.map(m => m.replace(/<\/?LastName>/g, "")) || []

        results.push({
          title: title.replace(/<[^>]*>/g, ""),
          authors,
          abstract: abstract.replace(/<[^>]*>/g, ""),
          publishedDate: year,
          journal,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmids[index]}/`,
          source: "pubmed",
          relevanceScore: 0.8 + index * -0.05, // Decreasing relevance
          keywords: query.split(" ").filter(word => word.length > 3)
        })
      } catch (error) {
        console.error("Error parsing PubMed article:", error)
      }
    })

    console.log(`✅ [PUBMED_ENHANCED] Found ${results.length} results`)
    return results
  } catch (error) {
    console.error("❌ [PUBMED_ENHANCED] Search error:", error)
    return []
  }
}

// Enhanced ArXiv search
async function searchArXivEnhanced(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    await rateLimiter.checkAndWait("arxiv", 3)
    console.log(`🔍 [ARXIV_ENHANCED] Searching for: ${query}`)

    const response = await axios.get("http://export.arxiv.org/api/query", {
      params: {
        search_query: `all:${query}`,
        start: 0,
        max_results: maxResults,
        sortBy: "relevance",
        sortOrder: "descending"
      }
    })

    const results: SearchResult[] = []
    const entries = response.data.match(/<entry>[\s\S]*?<\/entry>/g) || []

    entries.forEach((entry: string, index: number) => {
      try {
        const title =
          entry
            .match(/<title>(.*?)<\/title>/)?.[1]
            ?.replace(/\s+/g, " ")
            .trim() || "No title"
        const summary =
          entry
            .match(/<summary>(.*?)<\/summary>/)?.[1]
            ?.replace(/\s+/g, " ")
            .trim() || "No abstract"
        const published =
          entry.match(/<published>(.*?)<\/published>/)?.[1] || "Unknown date"
        const id = entry.match(/<id>(.*?)<\/id>/)?.[1] || ""
        const authors =
          entry
            .match(/<name>(.*?)<\/name>/g)
            ?.map(m => m.replace(/<\/?name>/g, "")) || []

        results.push({
          title,
          authors,
          abstract: summary,
          publishedDate: published.split("T")[0],
          url: id,
          source: "arxiv",
          relevanceScore: 0.75 + index * -0.05,
          keywords: query.split(" ").filter(word => word.length > 3)
        })
      } catch (error) {
        console.error("Error parsing ArXiv entry:", error)
      }
    })

    console.log(`✅ [ARXIV_ENHANCED] Found ${results.length} results`)
    return results
  } catch (error) {
    console.error("❌ [ARXIV_ENHANCED] Search error:", error)
    return []
  }
}

// Enhanced Tavily search for comprehensive web coverage
async function searchTavilyEnhanced(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  if (!tavilyTool) {
    console.log("⚠️ [TAVILY] Tavily API key not configured, skipping...")
    return []
  }

  try {
    await rateLimiter.checkAndWait("tavily", 5)
    console.log(`🔍 [TAVILY_ENHANCED] Searching for: ${query}`)

    const searchResults = await tavilyTool.invoke({
      query: `${query} research paper academic study`,
      maxResults
    })

    const results: SearchResult[] = []

    if (typeof searchResults === "string") {
      try {
        const parsed = JSON.parse(searchResults)
        const webResults = parsed.results || []

        webResults.forEach((result: any, index: number) => {
          results.push({
            title: result.title || `Tavily Result ${index + 1}`,
            authors: [], // Tavily doesn't typically provide author info
            abstract: result.content?.substring(0, 500) || result.snippet || "",
            url: result.url || "",
            publishedDate: "Recent", // Tavily focuses on recent/real-time
            source: "tavily" as const,
            relevanceScore: result.score || 0.7 + index * -0.05,
            keywords: query.split(" ").filter(word => word.length > 3)
          })
        })
      } catch (parseError) {
        console.error("❌ [TAVILY] Parse error:", parseError)
      }
    }

    console.log(`✅ [TAVILY_ENHANCED] Found ${results.length} results`)
    return results
  } catch (error) {
    console.error("❌ [TAVILY_ENHANCED] Search error:", error)
    return []
  }
}

// Semantic Scholar search integration
async function searchSemanticScholar(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    await rateLimiter.checkAndWait("semantic_scholar", 2)

    console.log(`🔍 [SEMANTIC_SCHOLAR] Searching for: ${query}`)

    const response = await axios.get(
      "https://api.semanticscholar.org/graph/v1/paper/search",
      {
        params: {
          query,
          limit: Math.min(maxResults, 5),
          fields: "title,authors,abstract,year,url,citationCount,journal,doi"
        },
        headers: {
          "User-Agent": "chatbot-ui (research@example.com)"
        },
        timeout: 10000
      }
    )

    const results: SearchResult[] =
      response.data.data?.map((paper: any) => ({
        title: paper.title || "No title",
        authors: paper.authors?.map((author: any) => author.name) || [],
        abstract: paper.abstract || "No abstract",
        publishedDate: paper.year?.toString() || "Unknown year",
        journal: paper.journal?.name || "Unknown journal",
        url:
          paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        doi: paper.doi,
        citationCount: paper.citationCount,
        source: "semantic_scholar" as const
      })) || []

    console.log(`✅ [SEMANTIC_SCHOLAR] Found ${results.length} results`)
    return results
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.warn("⚠️ [SEMANTIC_SCHOLAR] Rate limited (429), backing off...")
      // Add extra delay for rate limiting
      await new Promise(resolve => setTimeout(resolve, 60000)) // Wait 1 minute
      return []
    }
    console.error("❌ [SEMANTIC_SCHOLAR] Search error:", error.message || error)
    return []
  }
}

// Enhanced Google Scholar search with better parsing
async function searchGoogleScholar(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    await rateLimiter.checkAndWait("scholar", 2)

    console.log(`🔍 [SCHOLAR] Searching for: ${query}`)

    const results = await scholarTool.invoke({
      query,
      num: maxResults
    })

    const parsedResults: SearchResult[] = []

    if (results && typeof results === "string") {
      try {
        const data = JSON.parse(results)
        const organicResults = data.organic_results || []

        organicResults.forEach((result: any) => {
          parsedResults.push({
            title: result.title || "No title",
            authors:
              result.publication_info?.authors
                ?.split(",")
                .map((a: string) => a.trim()) || [],
            abstract: result.snippet || "No abstract",
            publishedDate:
              result.publication_info?.summary?.match(/\d{4}/)?.[0] ||
              "Unknown year",
            journal: result.publication_info?.summary || "",
            url: result.link || "",
            citationCount: result.inline_links?.cited_by?.total || 0,
            source: "scholar" as const
          })
        })
      } catch (parseError) {
        console.error("Error parsing Scholar results:", parseError)
      }
    }

    console.log(`✅ [SCHOLAR] Found ${parsedResults.length} results`)
    return parsedResults
  } catch (error) {
    console.error("❌ [SCHOLAR] Search error:", error)
    return []
  }
}

// Multi-source search aggregator with enhanced capabilities
async function performMultiSourceSearch(
  query: string,
  maxResultsPerSource: number = 10
): Promise<AggregatedSearchResults> {
  console.log(`🚀 [MULTI_SEARCH] Starting comprehensive search for: ${query}`)

  const searchPromises = [
    searchPubMedEnhanced(query, maxResultsPerSource).catch(err => {
      console.error("PubMed search failed:", err)
      return []
    }),
    searchArXivEnhanced(query, maxResultsPerSource).catch(err => {
      console.error("ArXiv search failed:", err)
      return []
    }),
    searchSemanticScholar(query, maxResultsPerSource).catch(err => {
      console.error("Semantic Scholar search failed:", err)
      return []
    }),
    searchGoogleScholar(query, maxResultsPerSource).catch(err => {
      console.error("Google Scholar search failed:", err)
      return []
    }),
    searchTavilyEnhanced(query, maxResultsPerSource).catch(err => {
      console.error("Tavily search failed:", err)
      return []
    })
  ]

  const [
    pubmedResults,
    arxivResults,
    semanticScholarResults,
    scholarResults,
    tavilyResults
  ] = await Promise.allSettled(searchPromises)

  const aggregatedResults: AggregatedSearchResults = {
    totalResults: 0,
    sources: {
      pubmed: pubmedResults.status === "fulfilled" ? pubmedResults.value : [],
      arxiv: arxivResults.status === "fulfilled" ? arxivResults.value : [],
      semanticScholar:
        semanticScholarResults.status === "fulfilled"
          ? semanticScholarResults.value
          : [],
      scholar:
        scholarResults.status === "fulfilled" ? scholarResults.value : [],
      tavily: tavilyResults.status === "fulfilled" ? tavilyResults.value : []
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
        pubmed: 0.9, // Highest weight for biomedical
        arxiv: 0.8, // High for technical papers
        semanticScholar: 0.85, // High for cross-disciplinary
        scholar: 0.75, // Good general coverage
        tavily: 0.7 // Recent/real-time content
      }
    }
  }

  aggregatedResults.totalResults =
    aggregatedResults.sources.pubmed.length +
    aggregatedResults.sources.arxiv.length +
    aggregatedResults.sources.semanticScholar.length +
    aggregatedResults.sources.scholar.length +
    aggregatedResults.sources.tavily.length

  console.log(
    `✅ [MULTI_SEARCH] Completed. Total results: ${aggregatedResults.totalResults}`
  )
  console.log(
    `📊 [MULTI_SEARCH] Distribution - PubMed: ${aggregatedResults.sources.pubmed.length}, ArXiv: ${aggregatedResults.sources.arxiv.length}, Semantic Scholar: ${aggregatedResults.sources.semanticScholar.length}, Scholar: ${aggregatedResults.sources.scholar.length}, Tavily: ${aggregatedResults.sources.tavily.length}`
  )

  return aggregatedResults
}

// AI-powered synthesis of search results
async function synthesizeSearchResults(
  searchResults: AggregatedSearchResults,
  researchProblem: string
): Promise<AggregatedSearchResults> {
  console.log(
    `🧠 [SYNTHESIS] Analyzing ${searchResults.totalResults} papers for insights`
  )

  const allResults = [
    ...searchResults.sources.pubmed,
    ...searchResults.sources.arxiv,
    ...searchResults.sources.semanticScholar,
    ...searchResults.sources.scholar
  ]

  if (allResults.length === 0) {
    console.log(`⚠️ [SYNTHESIS] No results to synthesize`)
    return searchResults
  }

  const synthesispapers = allResults.slice(0, 20) // Limit for token constraints

  const synthesisPrompt = `You are an expert research analyst. Analyze the following research papers and extract key insights for the research problem: "${researchProblem}"

Papers to analyze:
${synthesispapers
  .map(
    (paper, idx) => `
${idx + 1}. Title: ${paper.title}
   Authors: ${paper.authors.join(", ")}
   Abstract: ${paper.abstract.substring(0, 300)}...
   Source: ${paper.source}
   Year: ${paper.publishedDate}
`
  )
  .join("\n")}

Extract and categorize insights into:
1. Key methodologies used across papers
2. Common pitfalls mentioned or implied
3. Recommended approaches based on successful studies
4. Novel insights or emerging trends

Provide specific, actionable insights relevant to experimental design.`

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content:
            "You are an expert research analyst who extracts actionable insights from academic literature."
        },
        { role: "user", content: synthesisPrompt }
      ],
      temperature: 0.3
    })

    const response = completion.choices[0].message.content || ""

    // Parse the response to extract categorized insights
    const methodologies =
      response
        .match(
          /methodologies?:?\s*(.*?)(?=pitfalls?|recommended|novel|$)/is
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const pitfalls =
      response
        .match(
          /pitfalls?:?\s*(.*?)(?=methodologies?|recommended|novel|$)/is
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const approaches =
      response
        .match(
          /recommended.*?approaches?:?\s*(.*?)(?=methodologies?|pitfalls?|novel|$)/is
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const insights =
      response
        .match(
          /novel.*?insights?:?\s*(.*?)(?=methodologies?|pitfalls?|recommended|$)/is
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []

    searchResults.synthesizedFindings = {
      keyMethodologies: methodologies
        .map(m => m.trim())
        .filter(m => m.length > 10),
      commonPitfalls: pitfalls.map(p => p.trim()).filter(p => p.length > 10),
      recommendedApproaches: approaches
        .map(a => a.trim())
        .filter(a => a.length > 10),
      novelInsights: insights.map(i => i.trim()).filter(i => i.length > 10)
    }

    console.log(
      `✅ [SYNTHESIS] Extracted insights - Methodologies: ${searchResults.synthesizedFindings.keyMethodologies.length}, Pitfalls: ${searchResults.synthesizedFindings.commonPitfalls.length}, Approaches: ${searchResults.synthesizedFindings.recommendedApproaches.length}, Insights: ${searchResults.synthesizedFindings.novelInsights.length}`
    )
  } catch (error) {
    console.error("❌ [SYNTHESIS] Error:", error)
  }

  return searchResults
}

type ReportTheoryType = z.infer<typeof ReportTheorySchema>

const ReportTheorySchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string()
  })
  .required()

const VisualizationSchema = z.object({
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number()
    })
  )
})

type VisualizationType = z.infer<typeof VisualizationSchema>
type ReportExecutorType = z.infer<typeof ReportExecutorSchema>

const ReportExecutorSchema = z
  .object({
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string()
  })
  .required()

type DataAnalysisType = z.infer<typeof DataAnalysisSchema>

const DataAnalysisSchema = z
  .object({
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()

type ReportOutputType = z.infer<typeof ReportOutputSchema>

const ReportOutputSchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string(),
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string(),
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()

type ExperimentDesignState = {
  problem: string
  objectives: string[]
  variables: string[]
  specialConsiderations: string[]
  literatureFindings: {
    papers: Array<{
      title: string
      summary: string
      relevance: string
      methodology: string
      pitfalls: string[]
    }>
    searchResults?: AggregatedSearchResults
    synthesizedInsights?: {
      keyMethodologies: string[]
      commonPitfalls: string[]
      recommendedApproaches: string[]
      novelInsights: string[]
    }
  }
  dataAnalysis: {
    correlations: string[]
    outliers: string[]
    keyFindings: string[]
    metrics: string[]
  }
  experimentDesign: {
    hypothesis: string
    factors: Array<{
      name: string
      levels: string[]
    }>
    randomization: string
    statisticalPlan: {
      methods: string[]
      significance: string
    }
  }
  finalReport: {
    introduction: string
    literatureSummary: string
    dataInsights: string
    hypothesis: string
    designOfExperiments: string
    statisticalAnalysis: string
    recommendations: string
  }
}

type ExperimentDesignUpdate = Partial<ExperimentDesignState> & {
  userData: any
}

const ExperimentDesignSchema = z
  .object({
    problem: z.string(),
    objectives: z.array(z.string()),
    variables: z.array(z.string()),
    specialConsiderations: z.array(z.string()),
    literatureFindings: z.object({
      papers: z.array(
        z.object({
          title: z.string(),
          summary: z.string(),
          relevance: z.string(),
          methodology: z.string(),
          pitfalls: z.array(z.string())
        })
      )
    }),
    dataAnalysis: z.object({
      correlations: z.array(z.string()),
      outliers: z.array(z.string()),
      keyFindings: z.array(z.string()),
      metrics: z.array(z.string())
    }),
    experimentDesign: z.object({
      hypothesis: z.string(),
      factors: z.array(
        z.object({
          name: z.string(),
          levels: z.array(z.string())
        })
      ),
      randomization: z.string(),
      statisticalPlan: z.object({
        methods: z.array(z.string()),
        significance: z.string()
      })
    }),
    finalReport: z.object({
      introduction: z.string(),
      literatureSummary: z.string(),
      dataInsights: z.string(),
      hypothesis: z.string(),
      designOfExperiments: z.string(),
      statisticalAnalysis: z.string(),
      recommendations: z.string()
    })
  })
  .required()

// Define interfaces
interface DesignState {
  problem?: string
  finalOutput: ReportOutputType
  hypothesis: string
  introduction: string
  principle: string
  material: string
  preparation: string
  procedure: string
  setup: string
  dataAnalysis: string
  results: string
  discussion: string
  conclusion: string
  nextSteps: string
}

async function callScholarAgent(state: DesignState): Promise<ReportTheoryType> {
  const results = await scholarTool.invoke({
    query: state.problem,
    maxResults: 10
  })

  return results
}

// Define the workflow
const workflow = new StateGraph<ExperimentDesignState>({
  channels: {
    problem: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    objectives: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    variables: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    specialConsiderations: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    literatureFindings: {
      value: (left?: any, right?: any) => right ?? left ?? { papers: [] },
      default: () => ({ papers: [] })
    },
    dataAnalysis: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          correlations: [],
          outliers: [],
          keyFindings: [],
          metrics: []
        },
      default: () => ({
        correlations: [],
        outliers: [],
        keyFindings: [],
        metrics: []
      })
    },
    experimentDesign: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          hypothesis: "",
          factors: [],
          randomization: "",
          statisticalPlan: {
            methods: [],
            significance: ""
          }
        },
      default: () => ({
        hypothesis: "",
        factors: [],
        randomization: "",
        statisticalPlan: {
          methods: [],
          significance: ""
        }
      })
    },
    finalReport: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          introduction: "",
          literatureSummary: "",
          dataInsights: "",
          hypothesis: "",
          designOfExperiments: "",
          statisticalAnalysis: "",
          recommendations: ""
        },
      default: () => ({
        introduction: "",
        literatureSummary: "",
        dataInsights: "",
        hypothesis: "",
        designOfExperiments: "",
        statisticalAnalysis: "",
        recommendations: ""
      })
    }
  }
})
  .addNode("plannerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running plannerAgent node")
      const result = await callPlannerAgent(state)
      console.log("✅ [WORKFLOW] plannerAgent node completed")
      return {
        ...state,
        experimentDesign: result.experimentDesign
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in plannerAgent node:", error)
      throw error
    }
  })
  .addNode("literatureResearchAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running literatureResearchAgent node")
      const result = await callLiteratureResearchAgent(state)
      console.log("✅ [WORKFLOW] literatureResearchAgent node completed")
      return {
        ...state,
        literatureFindings: result.literatureFindings
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error(
        "❌ [WORKFLOW] Error in literatureResearchAgent node:",
        error
      )
      throw error
    }
  })
  .addNode("dataAnalyzerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running dataAnalyzerAgent node")
      const result = await callDataAnalyzerAgent(state)
      console.log("✅ [WORKFLOW] dataAnalyzerAgent node completed")
      return {
        ...state,
        dataAnalysis: result.dataAnalysis
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in dataAnalyzerAgent node:", error)
      throw error
    }
  })
  .addNode("doeAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running doeAgent node")
      const result = await callDOEAgent(state)
      console.log("✅ [WORKFLOW] doeAgent node completed")
      return {
        ...state,
        experimentDesign: result.experimentDesign
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in doeAgent node:", error)
      throw error
    }
  })
  .addNode("reportWriterAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running reportWriterAgent node")
      const result = await callReportWriterAgent(state)
      console.log("✅ [WORKFLOW] reportWriterAgent node completed")
      return {
        ...state,
        finalReport: result.finalReport
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in reportWriterAgent node:", error)
      throw error
    }
  })
  .addEdge(START, "plannerAgent")
  .addEdge("plannerAgent", "literatureResearchAgent")
  .addEdge("literatureResearchAgent", "dataAnalyzerAgent")
  .addEdge("dataAnalyzerAgent", "doeAgent")
  .addEdge("doeAgent", "reportWriterAgent")
  .addEdge("reportWriterAgent", END)

export async function POST(req: Request) {
  console.log("\n🚀 [DESIGN_DRAFT] Request received")

  try {
    const requestData = await req.json()
    console.log(
      "📥 [DESIGN_DRAFT] Request data:",
      JSON.stringify(requestData, null, 2)
    )

    const { problem, objectives, variables, specialConsiderations } =
      requestData

    // Add detailed validation logging
    console.log("🔍 [DESIGN_DRAFT] Extracted fields:")
    console.log("  Problem:", problem)
    console.log(
      "  Objectives:",
      Array.isArray(objectives) ? objectives : "Not an array",
      objectives?.length || 0
    )
    console.log(
      "  Variables:",
      Array.isArray(variables) ? variables : "Not an array",
      variables?.length || 0
    )
    console.log(
      "  Special Considerations:",
      Array.isArray(specialConsiderations)
        ? specialConsiderations
        : "Not an array",
      specialConsiderations?.length || 0
    )

    // Validate that required data is present
    if (!problem) {
      console.error("❌ [DESIGN_DRAFT] No problem provided")
      return NextResponse.json(
        { success: false, error: "Problem is required" },
        { status: 400 }
      )
    }

    console.log("🔧 [DESIGN_DRAFT] Creating initial state")
    const initialState: ExperimentDesignState = {
      problem: problem || "",
      objectives: Array.isArray(objectives) ? objectives : [],
      variables: Array.isArray(variables) ? variables : [],
      specialConsiderations: Array.isArray(specialConsiderations)
        ? specialConsiderations
        : [],
      literatureFindings: { papers: [] },
      dataAnalysis: {
        correlations: [],
        outliers: [],
        keyFindings: [],
        metrics: []
      },
      experimentDesign: {
        hypothesis: "",
        factors: [],
        randomization: "",
        statisticalPlan: {
          methods: [],
          significance: ""
        }
      },
      finalReport: {
        introduction: "",
        literatureSummary: "",
        dataInsights: "",
        hypothesis: "",
        designOfExperiments: "",
        statisticalAnalysis: "",
        recommendations: ""
      }
    }

    console.log("📋 [DESIGN_DRAFT] Initial state created:")
    console.log("  State objectives:", initialState.objectives?.length || 0)
    console.log("  State variables:", initialState.variables?.length || 0)
    console.log(
      "  State special considerations:",
      initialState.specialConsiderations?.length || 0
    )

    console.log("🔄 [DESIGN_DRAFT] Starting workflow execution")
    let finalState: ExperimentDesignState | undefined

    // return NextResponse.json({
    //   experimentDesign: {
    //     hypothesis:
    //       "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
    //     factors: [
    //       {
    //         name: "Dosage levels",
    //         levels: ["Low", "Medium", "High"]
    //       },
    //       {
    //         name: "Patient age groups",
    //         levels: ["18-30", "31-50", "51-70"]
    //       },
    //       {
    //         name: "Genetic marker presence",
    //         levels: ["Present", "Absent"]
    //       }
    //     ],
    //     randomization:
    //       "Use a stratified randomization process to ensure balanced subgroups across age and genetic factors.",
    //     statisticalPlan: {
    //       methods: [
    //         "ANOVA for dosage level comparison",
    //         "Regression analysis for pharmacokinetics",
    //         "Chi-square tests for adverse event rates"
    //       ],
    //       significance:
    //         "A p-value of less than 0.05 will be considered statistically significant."
    //     }
    //   },
    //   finalReport: {
    //     introduction:
    //       "This study aims to evaluate a novel treatment for enhanced efficacy and safety across diverse patient subgroups defined by dosage, age, and genetic markers. This represents a critical step toward personalized medicine.",
    //     literatureSummary:
    //       "Current literature underscores the complexity of demonstrating treatment efficacy and safety across heterogeneous populations. Insights from genetic and age-related variability studies are leveraged to inform the experimental design, particularly concerning stratification and subgroup analysis.",
    //     dataInsights:
    //       "Analyses will focus on correlations between genetic markers, dosage levels, and treatment efficacy. Monitoring outliers and considering subgroup variability will refine safety profiling and optimize dosage recommendations.",
    //     hypothesis:
    //       "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
    //     designOfExperiments:
    //       "A stratified randomization process will ensure balanced representation across patient subgroups by dosage, age groups, and genetic marker presence. This design will facilitate robust comparative analysis and personalized treatment insights.",
    //     statisticalAnalysis:
    //       "Analyses will apply ANOVA for dosage comparisons, regression for pharmacokinetic profiling, and Chi-square tests to evaluate adverse event rates, with significance established at p<0.05.",
    //     recommendations:
    //       "Implement stratified randomization to mitigate subgroup bias and focus on refining genetic component analysis to enhance the predictability of treatment outcomes, thus advancing personalized treatment strategies."
    //   }
    // })

    try {
      for await (const event of await app.stream(initialState)) {
        for (const [key, value] of Object.entries(event)) {
          console.log(`✅ [DESIGN_DRAFT] Completed node: ${key}`)
          finalState = value as ExperimentDesignState
        }
      }
    } catch (error) {
      console.error("❌ [DESIGN_DRAFT] Error in workflow execution:", error)
      throw error
    }

    if (finalState) {
      console.log("🏁 [DESIGN_DRAFT] Workflow completed successfully")
      console.log("📤 [DESIGN_DRAFT] Returning complete design state")

      return NextResponse.json(finalState)
    }

    console.error("❌ [DESIGN_DRAFT] No final state produced")
    return new NextResponse("Failed to generate experiment design", {
      status: 500
    })
  } catch (error) {
    console.error("❌ [DESIGN_DRAFT_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

const app = workflow.compile()

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}

async function callPlannerAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("🔍 [PLANNER_AGENT] Starting...")
  const systemPrompt = `You are an experiment design and planning assistant for biopharma research. 
  Your task is to understand the research problem and key initial parameters needed for coming up with an experiment design. 
  Ensure that your suggestions are comprehensive and easy to follow for further processing.`

  const userPrompt = `Research Problem: ${state.problem}
Initial Parameters:
- Objectives: ${state.objectives.join("\n")}
- Variables: ${state.variables.join("\n")}
- Special Considerations: ${state.specialConsiderations.join("\n")}`

  try {
    console.log("📝 [PLANNER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [PLANNER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [PLANNER_AGENT] Error:", error)
    throw error
  }
}

async function callLiteratureResearchAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log(
    "📚 [LITERATURE_AGENT] Starting enhanced comprehensive literature search..."
  )

  // Enhanced query optimization using the new function
  const queryData = optimizeSearchQuery(
    state.problem,
    state.objectives,
    state.variables,
    "biomedical"
  )

  console.log(`🎯 [LITERATURE_AGENT] Primary query: ${queryData.primaryQuery}`)
  console.log(
    `🔄 [LITERATURE_AGENT] Alternative queries: ${queryData.alternativeQueries.length}`
  )
  console.log(
    `📝 [LITERATURE_AGENT] Enhanced keywords: ${queryData.keywords.slice(0, 10).join(", ")}`
  )

  try {
    // Perform multi-query search for better coverage
    console.log(
      "🚀 [LITERATURE_AGENT] Executing multi-query search strategy..."
    )

    const searchPromises = [
      // Primary query with highest weight
      performMultiSourceSearch(queryData.primaryQuery, 8),
      // Alternative queries with reduced results
      ...queryData.alternativeQueries
        .slice(0, 2)
        .map(altQuery => performMultiSourceSearch(altQuery, 4))
    ]

    const allSearchResults = await Promise.allSettled(searchPromises)

    // Aggregate results from all queries
    const consolidatedResults: AggregatedSearchResults = {
      totalResults: 0,
      sources: {
        pubmed: [],
        arxiv: [],
        semanticScholar: [],
        scholar: [],
        tavily: []
      },
      synthesizedFindings: {
        keyMethodologies: [],
        commonPitfalls: [],
        recommendedApproaches: [],
        novelInsights: []
      },
      searchMetrics: {
        queryOptimization: queryData.alternativeQueries,
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

    // Merge results with deduplication by URL
    const seenUrls = new Set<string>()

    allSearchResults.forEach(result => {
      if (result.status === "fulfilled") {
        const searchResult = result.value

        Object.keys(searchResult.sources).forEach(sourceKey => {
          const source = sourceKey as keyof typeof searchResult.sources
          searchResult.sources[source].forEach(paper => {
            if (!seenUrls.has(paper.url) && paper.url) {
              seenUrls.add(paper.url)
              consolidatedResults.sources[source].push({
                ...paper,
                // Boost relevance score for papers matching multiple queries
                relevanceScore: (paper.relevanceScore || 0) + 0.1
              })
            }
          })
        })
      }
    })

    // Sort results by relevance within each source
    Object.keys(consolidatedResults.sources).forEach(sourceKey => {
      const source = sourceKey as keyof typeof consolidatedResults.sources
      consolidatedResults.sources[source].sort(
        (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
      )
      // Keep top results per source
      consolidatedResults.sources[source] = consolidatedResults.sources[
        source
      ].slice(0, 12)
    })

    consolidatedResults.totalResults =
      consolidatedResults.sources.pubmed.length +
      consolidatedResults.sources.arxiv.length +
      consolidatedResults.sources.semanticScholar.length +
      consolidatedResults.sources.scholar.length +
      consolidatedResults.sources.tavily.length

    console.log(
      `📊 [LITERATURE_AGENT] Consolidated ${consolidatedResults.totalResults} unique papers`
    )

    // Enhanced AI synthesis with domain expertise
    console.log("🧠 [LITERATURE_AGENT] Performing AI-powered synthesis...")
    const synthesizedResults = await synthesizeSearchResults(
      consolidatedResults,
      state.problem
    )

    // Store the search results in the state
    const updatedState = {
      ...state,
      literatureFindings: {
        ...state.literatureFindings,
        searchResults: synthesizedResults,
        synthesizedInsights: synthesizedResults.synthesizedFindings,
        papers: [] // Will be populated by AI analysis below
      }
    }

    // Enhanced system prompt with comprehensive search insights
    const systemPrompt = `You are an expert senior scientist and literature researcher specializing in biopharma experiments. You have completed a state-of-the-art multi-source literature search using optimized queries and advanced search strategies.

ENHANCED SEARCH OVERVIEW:
- Total unique papers analyzed: ${synthesizedResults.totalResults}
- Search strategy: Multi-query approach with ${queryData.alternativeQueries.length + 1} optimized queries
- Primary query: "${queryData.primaryQuery}"
- Enhanced keywords: ${queryData.keywords.slice(0, 15).join(", ")}

SOURCE DISTRIBUTION & WEIGHTS:
- PubMed (biomedical, weight: 0.9): ${synthesizedResults.sources.pubmed.length} papers
- ArXiv (technical preprints, weight: 0.8): ${synthesizedResults.sources.arxiv.length} papers  
- Semantic Scholar (cross-disciplinary, weight: 0.85): ${synthesizedResults.sources.semanticScholar.length} papers
- Google Scholar (comprehensive, weight: 0.75): ${synthesizedResults.sources.scholar.length} papers
- Tavily (recent/real-time, weight: 0.7): ${synthesizedResults.sources.tavily.length} papers

AI-SYNTHESIZED INSIGHTS:
Key Methodologies: ${synthesizedResults.synthesizedFindings.keyMethodologies.join("; ")}
Common Pitfalls: ${synthesizedResults.synthesizedFindings.commonPitfalls.join("; ")}
Recommended Approaches: ${synthesizedResults.synthesizedFindings.recommendedApproaches.join("; ")}
Novel Insights: ${synthesizedResults.synthesizedFindings.novelInsights.join("; ")}

TOP PAPERS BY RELEVANCE (Multi-Source):

PubMed Results (Biomedical Literature):
${synthesizedResults.sources.pubmed
  .slice(0, 5)
  .map(
    (paper, idx) => `
${idx + 1}. ${paper.title} (Relevance: ${paper.relevanceScore?.toFixed(2)})
   Authors: ${paper.authors.join(", ")}
   Journal: ${paper.journal} | Year: ${paper.publishedDate}
   URL: ${paper.url}
   Abstract: ${paper.abstract.substring(0, 400)}...
`
  )
  .join("\n")}

ArXiv Results (Technical Preprints):
${synthesizedResults.sources.arxiv
  .slice(0, 3)
  .map(
    (paper, idx) => `
${idx + 1}. ${paper.title} (Relevance: ${paper.relevanceScore?.toFixed(2)})
   Authors: ${paper.authors.join(", ")}
   Year: ${paper.publishedDate}
   URL: ${paper.url}
   Abstract: ${paper.abstract.substring(0, 400)}...
`
  )
  .join("\n")}

Semantic Scholar Results (Cross-disciplinary):
${synthesizedResults.sources.semanticScholar
  .slice(0, 3)
  .map(
    (paper, idx) => `
${idx + 1}. ${paper.title} (Relevance: ${paper.relevanceScore?.toFixed(2)})
   Authors: ${paper.authors.join(", ")}
   Journal: ${paper.journal} | Year: ${paper.publishedDate}
   Citations: ${paper.citationCount || "N/A"}
   DOI: ${paper.doi || "N/A"}
   URL: ${paper.url}
   Abstract: ${paper.abstract.substring(0, 400)}...
`
  )
  .join("\n")}

Google Scholar Results (Comprehensive Coverage):
${synthesizedResults.sources.scholar
  .slice(0, 3)
  .map(
    (paper, idx) => `
${idx + 1}. ${paper.title} (Relevance: ${paper.relevanceScore?.toFixed(2)})
   Authors: ${paper.authors.join(", ")}
   Year: ${paper.publishedDate}
   Citations: ${paper.citationCount || "N/A"}
   URL: ${paper.url}
   Abstract: ${paper.abstract.substring(0, 400)}...
`
  )
  .join("\n")}

Tavily Results (Recent Developments):
${synthesizedResults.sources.tavily
  .slice(0, 2)
  .map(
    (paper, idx) => `
${idx + 1}. ${paper.title} (Relevance: ${paper.relevanceScore?.toFixed(2)})
   URL: ${paper.url}
   Content: ${paper.abstract.substring(0, 400)}...
`
  )
  .join("\n")}

Your expert task is to:
1. Analyze ALL search results from multiple sources with their relevance scores
2. Prioritize high-impact, recent, and highly-cited papers
3. Extract cutting-edge methodologies and latest developments
4. Identify cross-disciplinary insights and novel approaches
5. Provide evidence-based recommendations for experimental design
6. Synthesize findings across different academic sources

Research Context:
- Problem: ${state.problem}
- Objectives: ${state.objectives.join("; ")}
- Variables: ${state.variables.join("; ")}
- Special Considerations: ${state.specialConsiderations.join("; ")}

Requirements:
- Prioritize papers with highest relevance scores and citation counts
- Focus on experimental design methodologies relevant to biomedical research
- Highlight methodological innovations and recent breakthroughs
- Identify potential challenges based on latest research findings
- Provide specific citations with URLs for full traceability
- Consider both established practices and emerging approaches
- Maintain scientific rigor while incorporating diverse perspectives

Format your response to include:
1. Executive summary of most impactful findings
2. Evidence-based methodological recommendations
3. Critical analysis of potential pitfalls with mitigation strategies
4. Novel insights and emerging trends
5. Comprehensive bibliography with relevance scoring`

    console.log(
      "📝 [LITERATURE_AGENT] Sending enhanced analysis to AI model..."
    )
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Please analyze these ${synthesizedResults.totalResults} research papers from ${Object.keys(synthesizedResults.sources).length} sources and provide comprehensive insights for experimental design. Focus on evidence-based methodologies and cutting-edge approaches.`
        }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })

    const aiAnalysis = completion.choices[0].message.parsed!
    console.log(
      "✅ [LITERATURE_AGENT] Enhanced AI analysis completed successfully"
    )

    // Merge the AI analysis with our enhanced search results
    const finalState = {
      ...aiAnalysis,
      literatureFindings: {
        ...aiAnalysis.literatureFindings,
        searchResults: synthesizedResults,
        synthesizedInsights: synthesizedResults.synthesizedFindings
      }
    }

    console.log(
      `📊 [LITERATURE_AGENT] Enhanced Summary - Papers: ${synthesizedResults.totalResults}, Queries: ${queryData.alternativeQueries.length + 1}, Methodologies: ${synthesizedResults.synthesizedFindings.keyMethodologies.length}, Pitfalls: ${synthesizedResults.synthesizedFindings.commonPitfalls.length}`
    )

    return finalState
  } catch (error) {
    console.error(
      "❌ [LITERATURE_AGENT] Error during enhanced search and analysis:",
      error
    )

    // Enhanced fallback with query optimization
    console.log(
      "🔄 [LITERATURE_AGENT] Falling back to optimized single-query search..."
    )
    try {
      const fallbackResults = await performMultiSourceSearch(
        queryData.primaryQuery,
        10
      )

      const fallbackPrompt = `You are an experienced senior scientist and literature researcher. Based on the following optimized search results, provide comprehensive insights for experimental design.

Enhanced Search Query: ${queryData.primaryQuery}
Keywords: ${queryData.keywords.slice(0, 10).join(", ")}

Search Results Summary:
- Total papers: ${fallbackResults.totalResults}
- PubMed: ${fallbackResults.sources.pubmed.length}
- ArXiv: ${fallbackResults.sources.arxiv.length}
- Semantic Scholar: ${fallbackResults.sources.semanticScholar.length}
- Google Scholar: ${fallbackResults.sources.scholar.length}
- Tavily: ${fallbackResults.sources.tavily.length}

Research Problem: ${state.problem}
Objectives: ${state.objectives.join("; ")}
Variables: ${state.variables.join("; ")}
Constraints: ${state.specialConsiderations.join("; ")}

Provide actionable insights for experimental design including evidence-based methodologies, potential pitfalls, and cutting-edge recommendations.`

      const fallbackCompletion = await openai.beta.chat.completions.parse({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: fallbackPrompt },
          { role: "user", content: JSON.stringify(state) }
        ],
        response_format: zodResponseFormat(
          ExperimentDesignSchema,
          "experimentDesign"
        )
      })

      console.log("✅ [LITERATURE_AGENT] Enhanced fallback analysis completed")
      return {
        ...fallbackCompletion.choices[0].message.parsed!,
        literatureFindings: {
          ...fallbackCompletion.choices[0].message.parsed!.literatureFindings,
          searchResults: fallbackResults
        }
      }
    } catch (fallbackError) {
      console.error(
        "❌ [LITERATURE_AGENT] Enhanced fallback also failed:",
        fallbackError
      )
      throw fallbackError
    }
  }
}

async function callDataAnalyzerAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("📊 [DATA_ANALYZER_AGENT] Starting...")
  const systemPrompt = `You are an experienced data analyst specializing in biopharma research, tasked with analyzing datasets uploaded by the user to uncover relevant insights from past experiments. Your role is to extract actionable information to guide the design of experiments (DOE), ensuring the new experiment is informed by historical data and findings.
Your primary responsibilities include:
Data Review and Relevance:
Examine all uploaded datasets (all data files) and identify information relevant to the current research problem.
Focus on datasets that align with the user-provided objective, key variables, and constraints.
Analysis and Insight Extraction:
Identify correlations, trends, outliers, and key metrics that provide insights into the relationships between variables in past experiments.
Highlight findings that could influence experimental design choices, such as optimal ranges for variables, conditions to avoid, or unexpected patterns in previous results.
Data Presentation:
Summarize the relevant findings in an easy-to-understand format, showing how past experiments and their results connect to the current objective.
Include any relevant visualizations (e.g., charts, graphs) extracted from the datasets or generate simple summaries of key trends.
Source Referencing:
Provide links or references to the original datasets or experiment reports so the user can trace back the findings if necessary.
Constraints:
Focus solely on analyzing and summarizing existing user data; do not perform new statistical analyses beyond extracting trends and correlations.
Ensure all findings are tied back to the current research problem and experiment parameters for relevance.
Maintain a neutral, scientific tone and ensure all insights are actionable and concise.
Output:
Provide:
A clear and concise summary of findings, organized by relevance to the experiment's objective, key variables, and constraints.
Any visualizations present in the data files or generated to illustrate key trends.
Links to sources or datasets where the findings were derived for traceability.
To perform your task, use the following:
Research Problem: ${state.problem} 
Key variables: ${state.variables.join("\n")}
constraints: ${state.specialConsiderations.join("\n")}


###Output example - Relevant Findings from Uploaded Datasets
Dataset 1: Protein-Excipients Screening Results (File: Protein_Excipients_Screening_2020.xlsx)
Correlations and Trends:
Addition of sorbitol (2-6% w/v) resulted in a 15-40% viscosity reduction at protein concentrations above 100 mg/mL.
Higher concentrations of polysorbate 80 (>0.1%) caused protein aggregation, even though viscosity reduction was observed.
Optimal Conditions Identified:
Sorbitol at 4% w/v reduced viscosity by 30% without adversely affecting protein stability.
Visualization:
Line graph showing viscosity reduction trends across different sorbitol concentrations.(See Figure 1 below, extracted from Dataset 1)
Source: Dataset Link

Dataset 2: High-Protein Stability Results (File: High_Protein_Stability_2021.csv)
Correlations and Trends:
Sodium citrate (5-15 mM) maintained protein stability while showing a mild viscosity reduction (10-15%).
Buffer ionic strength played a significant role: higher ionic strengths (>0.2 M NaCl) increased viscosity across all protein concentrations.
Potential Pitfalls:
High polysorbate concentrations disrupted protein structure, requiring screening for alternative stabilizers.
Visualization:
Heatmap illustrating viscosity values across varying ionic strengths and excipient concentrations.(See Figure 2 below, extracted from Dataset 2)
Source: Dataset Link

Dataset 3: Rheological Study of Protein Formulations (File: Rheology_Study_Results_2022.pdf)
Key Insights:
Rheological analysis confirmed that protein solutions exhibit non-Newtonian behavior at high concentrations.
A combination of sorbitol (4%) and sodium citrate (10 mM) showed synergistic effects, reducing viscosity by 40% while maintaining structural stability.
Visualization:
Rheology plot comparing shear rate and viscosity for different excipient formulations.(See Figure 3 below, extracted from Dataset 3)
Source: Dataset Link

Summary of Insights
Optimal Excipient Conditions:
Sorbitol (4% w/v) and sodium citrate (10 mM) demonstrated synergistic effects, achieving a 40% reduction in viscosity while maintaining protein stability.
Conditions to Avoid:
Avoid polysorbate concentrations >0.1% due to observed protein aggregation.
High ionic strengths (>0.2 M NaCl) increase viscosity significantly and should be avoided.
Guidance for Future DOE:
Screen combinations of sorbitol and sodium citrate in PBS at pH 7.4.
Evaluate non-Newtonian behavior using rheological techniques to fine-tune shear rate-dependent viscosity.`

  try {
    console.log("📝 [DATA_ANALYZER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [DATA_ANALYZER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [DATA_ANALYZER_AGENT] Error:", error)
    throw error
  }
}

async function callDOEAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("🧪 [DOE_AGENT] Starting...")
  const systemPrompt = `You are an expert in Design of Experiments (DOE) and statistical analysis for biopharma research. Your role is to synthesize insights from the literature review (given by Agent 1) and user data analysis (given by Agent 2) to generate a hypothesis, propose a suitable DOE, and optionally include a statistical plan if the user requests it.
Your primary responsibilities include:
Hypothesis Generation
Develop a clear, testable hypothesis based on findings from the literature search and user data analysis. Ensure the hypothesis aligns with the user-provided research problem and constraints.
Design of Experiments (DOE):
Propose a comprehensive experimental design to test the hypothesis, clearly outlining:
Experimental Factors: Independent variables to test (e.g., excipients, concentrations, pH).
Levels: Specific values or conditions for each factor.
Controls: Baseline or reference conditions.
Randomization: Techniques to minimize bias and ensure robust results.
Ensure the design is efficient, statistically valid, and practical for execution.
Optional Statistical Plan (if requested by the user):
Recommend statistical methods for analyzing the results (e.g., ANOVA, regression, response surface methodology).
Define the criteria for statistical significance (e.g., p-value threshold) and detail how the data will be interpreted to validate the hypothesis.
Constraints:
Focus solely on generating the hypothesis, DOE, and statistical plan (if requested). Do not interpret results or perform data analysis.
Ensure all recommendations are scientifically sound, feasible, and tailored to the user's research problem.
Present the output in a well-organized format, making it easy for the user to understand and implement.
Output:
Provide:
Hypothesis: A clear and concise statement of the hypothesis.
Design of Experiments (DOE):
List of factors, levels, and controls.
Randomization strategy.
Any additional notes for execution.
Statistical Plan (if requested):
Recommended methods for data analysis.
Criteria for statistical significance.
Additional considerations for analyzing and interpreting results.
To perform your task, use the following inputs:
Findings from Literature Review: ${state.literatureFindings}
Research Problem and Constraints: ${state.problem}, ${state.variables}, ${state.specialConsiderations}


Output example-


1. Hypothesis
Combining sorbitol (as a primary viscosity-reducing excipient) with low concentrations of sodium citrate (for ionic modulation) and including a novel excipient identified in recent literature, trehalose, will synergistically reduce viscosity in high-concentration protein formulations without compromising stability.

2. Design of Experiments (DOE)
Rationale for Experimental Design:
Novel Inclusion: Trehalose was identified in the literature as a promising excipient for modulating water-protein interactions to reduce viscosity. It has not been tested in historical datasets provided by the user.
Historical Insights: Sorbitol (4% w/v) and sodium citrate (10 mM) had previously shown effectiveness individually. Testing them in combination may reveal additive or synergistic effects.
Control Conditions: Repeat previously successful conditions (sorbitol 4% and sodium citrate 10 mM) to validate historical findings and use as a baseline for comparing the new combinations.
Randomization Strategy:
Randomize the order of sample preparation and viscosity testing to avoid bias.
Perform three replicates for each condition to ensure robust statistical power.
Novel Combinations to Explore:
Sorbitol (4%), Trehalose (2%), and Sodium Citrate (10 mM).
Trehalose (5%) with Sodium Citrate (15 mM) in a pH 7.4 buffer.
Sorbitol (6%) with Trehalose (5%) as a dual-modifier system.
Additional Notes for Execution:
Use phosphate-buffered saline (PBS) as the baseline buffer for all conditions.
Perform viscosity measurements using a capillary viscometer at 25°C.
Evaluate protein stability with Circular Dichroism (CD) and Differential Scanning Calorimetry (DSC) for all combinations.

3. Statistical Plan (Optional – User Requested)
Methods:
Factorial Analysis of Variance (ANOVA) to evaluate the interaction effects of sorbitol, trehalose, and sodium citrate on viscosity.
Apply response surface methodology (RSM) to model the optimal excipient concentrations and their combined effects.
Post-hoc pairwise comparison tests (e.g., Tukey's HSD) to identify significant differences between conditions.
Criteria for Statistical Significance:
p-value < 0.05.
Effect size (partial eta squared) for practical significance.
Additional Considerations:
Conduct residual analysis to validate the assumptions of ANOVA.
Correlate stability findings (from CD and DSC) with viscosity results to ensure excipient combinations meet stability constraints.`

  try {
    console.log("📝 [DOE_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [DOE_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [DOE_AGENT] Error:", error)
    throw error
  }
}

async function callReportWriterAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("📝 [REPORT_WRITER_AGENT] Starting...")
  const systemPrompt = `
  You are a highly skilled scientific report writer specializing in biopharma research. Your role is to compile and present a comprehensive report summarizing the findings and recommendations from all previous agents and providing the user with a clear, actionable experimental design.
Your responsibilities include:
Information Compilation:
Synthesize findings from the web search (Agent 2) and user data analysis (Agent 3), ensuring that key insights and recommendations are clearly presented.
Integrate the hypothesis, Design of Experiments (DOE), and statistical plan proposed by Agent 4 into the report.
Highlight how each step contributes to the overall experimental objective.
Report Structure:
Introduction:
Provide an overview of the research problem, objectives, and importance of the study.
Web Search Findings:
Summarize key insights from the literature search, including novel findings, recommendations, and supporting references.
User Data Insights:
Present key insights and recommendations derived from historical user data, identifying trends, successful conditions, and areas for improvement.
Hypothesis:
Clearly state the testable hypothesis guiding the experimental design.
Design of Experiments (DOE):
Present the DOE, including factors, levels, controls, and randomization techniques. Organize this information in a well-structured table for clarity.
Statistical Plan:
If requested by the user, provide a concise description of the statistical methods and criteria for analyzing results.
Recommendations:
Conclude with actionable recommendations based on the synthesized insights and proposed design.
Formatting and Clarity:
Use tables, bullet points, and concise text to make the report easy to follow.
Ensure all findings are traceable to their respective sources (e.g., web search or user data) with proper referencing.
Maintain a logical flow that would be clear to biopharma scientists.
Constraints:
Focus solely on synthesizing and presenting the findings; do not perform new analysis.
Ensure the report is accurate, concise, and scientifically rigorous.
Highlight novel and actionable aspects of the DOE that arose from integrating insights across agents.
Output:
Provide:
A structured report organized as per the outline above.
A detailed table summarizing the DOE, including factors, levels, controls, and randomization strategy.
Citations and links to all referenced findings for traceability.
To complete your task, use the following inputs:
Findings from Web Search: {literatureFindings}
User Data Insights: {dataInsights}
DOE and Statistical Plan: {doeDesign}, {statisticalPlan}
Research Problem: {researchProblem}Output example -Comprehensive Experimental Design Report
Research Problem: Lower the viscosity of high-concentration protein formulations.Objective: To identify excipients and conditions that reduce viscosity while maintaining protein stability.

1. Introduction
Viscosity in high-concentration protein formulations poses challenges for subcutaneous drug delivery, impacting syringeability and patient comfort. This report consolidates findings from web literature, historical user data, and a proposed experimental design to address these challenges. The focus is on exploring excipients and their combinations to achieve viscosity reduction while ensuring protein stability.

2. Web Search Findings
Key Insights:
Excipients for Viscosity Reduction:
Trehalose and sucrose were identified as effective viscosity-reducing agents by modulating water-protein interactions【1】【2】.
Arginine and sodium citrate were noted for their ability to disrupt protein-protein interactions【3】【4】.
Optimal Conditions:
Trehalose at 2-5% w/v and arginine at 10-50 mM showed the best potential for maintaining protein stability while reducing viscosity【1】【3】.
Potential Pitfalls:
High concentrations of polysorbates may destabilize protein structure【4】.
Recommendations:
Prioritize trehalose and sodium citrate for further testing, as they align with the research problem and offer novel combinations【1】【4】.
References:
Smith, J. et al. (2020). Impact of Sugars on Protein Viscosity. Journal of Biopharma Research. Link
Lee, A. et al. (2019). Amino Acids as Viscosity Reducers in mAb Formulations. BioFormulation Journal. Link
Patel, R. et al. (2021). Challenges in High-Concentration Formulations. ResearchGate. Link
Nguyen, T. et al. (2018). Phase Separation in Protein Solutions. Google Scholar. Link

3. User Data Insights
Key Insights:
Successful Conditions:
Sorbitol (4% w/v) and sodium citrate (10 mM) significantly reduced viscosity in past experiments【5】【6】.
Trends:
Sodium citrate concentrations above 15 mM led to protein instability【5】.
Sorbitol and sodium citrate combinations showed additive effects in viscosity reduction【6】.
Observed Pitfalls:
High ionic strengths increased viscosity across all conditions【5】.
Recommendations:
Retest previously successful conditions (sorbitol 4%, sodium citrate 10 mM) as controls【5】【6】.
Test trehalose as a novel excipient for synergy with sorbitol【1】【5】.
Data Sources: 5. Dataset: Protein_Excipients_Screening_2020.xlsx. Link6. Dataset: High_Protein_Stability_2021.csv. Link

4. Hypothesis
Combining trehalose (2-5% w/v), sorbitol (4-6% w/v), and sodium citrate (5-15 mM) will synergistically reduce viscosity in high-concentration protein formulations while maintaining protein stability【1】【5】【6】.

5. Design of Experiments (DOE)


6. Statistical Analysis Plan (Optional)
Methods:
Factorial Analysis of Variance (ANOVA) to analyze the effects of excipient concentrations and their interactions【3】【4】.
Response Surface Methodology (RSM) for modeling optimal excipient combinations【3】.
Criteria for Significance:
p-value < 0.05.
Effect size (partial eta squared) for practical significance【4】【5】.
Additional Notes:
Ensure protein stability is assessed for significant conditions using Circular Dichroism (CD) and Differential Scanning Calorimetry (DSC)【5】【6】.

7. Recommendations
Prioritize Novel Combinations:
Test trehalose (2-5%) with sorbitol (4-6%) and sodium citrate (5-10 mM) at pH 7.4【1】【6】.
Validate Historical Success:
Retest the historical condition (sorbitol 4%, sodium citrate 10 mM) for comparison【5】【6】.
Assess Stability:
Use CD and DSC to confirm structural integrity for all promising conditions【5】.
  `

  try {
    console.log("📝 [REPORT_WRITER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [REPORT_WRITER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [REPORT_WRITER_AGENT] Error:", error)
    throw error
  }
}
