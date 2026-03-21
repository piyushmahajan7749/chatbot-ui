import axios from "axios"
import { TavilySearchResults } from "@langchain/community/tools/tavily_search"
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { AggregatedSearchResults, SearchResult } from "../types"

// Initialize enhanced search tools
let scholarTool: SERPGoogleScholarAPITool | null = null
if (process.env.SERPAPI_API_KEY) {
  scholarTool = new SERPGoogleScholarAPITool({
    apiKey: process.env.SERPAPI_API_KEY
  })
} else {
  console.log(
    "⚠️ [SERPAPI] SERPAPI_API_KEY not configured. Google Scholar searches disabled."
  )
}

// Initialize Tavily for comprehensive web search (if API key available)
let tavilyTool: TavilySearchResults | null = null
if (process.env.TAVILY_API_KEY) {
  tavilyTool = new TavilySearchResults({
    apiKey: process.env.TAVILY_API_KEY,
    maxResults: 10
  })
}

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

// Enhanced rate limiting with backoff strategy
export class EnhancedRateLimiter {
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

export const rateLimiter = new EnhancedRateLimiter()

// Enhanced query optimization
export function optimizeSearchQuery(
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

  const enhancedKeywords = Array.from(
    new Set([...keywords, ...domainTerms[domain]])
  )

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
export async function searchPubMedEnhanced(
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
export async function searchArXivEnhanced(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    await rateLimiter.checkAndWait("arxiv", 3)
    console.log(`🔍 [ARXIV_ENHANCED] Searching for: ${query}`)

    const response = await axios.get("https://export.arxiv.org/api/query", {
      params: {
        search_query: `all:${encodeURIComponent(query)}`,
        start: 0,
        max_results: maxResults,
        sortBy: "relevance",
        sortOrder: "descending"
      },
      timeout: 10000
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
export async function searchTavilyEnhanced(
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
export async function searchSemanticScholar(
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
export async function searchGoogleScholar(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  try {
    if (!scholarTool) {
      console.log(
        "⚠️ [SCHOLAR] SERPAPI key missing; skipping Google Scholar search."
      )
      return []
    }

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
export async function performMultiSourceSearch(
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
export async function synthesizeSearchResults(
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
    const completion = await openai().chat.completions.create({
      model: MODEL_NAME(),
      messages: [
        {
          role: "system",
          content:
            "You are an expert research analyst who extracts actionable insights from academic literature."
        },
        { role: "user", content: synthesisPrompt }
      ],
      // This deployment only supports temperature=1.
      temperature: 1
    })

    const response = completion.choices[0].message.content || ""

    // Parse the response to extract categorized insights
    const methodologies =
      response
        .match(
          /methodologies?:?\s*(.*?)(?=pitfalls?|recommended|novel|$)/gim
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const pitfalls =
      response
        .match(
          /pitfalls?:?\s*(.*?)(?=methodologies?|recommended|novel|$)/gim
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const approaches =
      response
        .match(
          /recommended.*?approaches?:?\s*(.*?)(?=methodologies?|pitfalls?|novel|$)/gim
        )?.[1]
        ?.split(/[\n•-]/)
        .filter(s => s.trim()) || []
    const insights =
      response
        .match(
          /novel.*?insights?:?\s*(.*?)(?=methodologies?|pitfalls?|recommended|$)/gim
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
