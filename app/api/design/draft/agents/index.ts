import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
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
import { optimizeSearchQuery } from "../utils/search-utils"
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
      apa: undefined
    })) as CitationItem[]

  const items: CitationItem[] = []
  items.push(...collect(searchResults.sources.pubmed || [], "pubmed"))
  items.push(...collect(searchResults.sources.arxiv || [], "arxiv"))
  items.push(
    ...collect(searchResults.sources.semanticScholar || [], "semantic_scholar")
  )
  items.push(...collect(searchResults.sources.scholar || [], "scholar"))
  items.push(...collect(searchResults.sources.tavily || [], "tavily"))

  // Re-number sequentially for consistent [X] references
  return items.map((it, idx) => ({ ...it, index: idx + 1 }))
}

const openai = () => getAzureOpenAIForDesign()
const MODEL_NAME = () => getDesignDeployment()

type AgentCallResult<T> = {
  output: T
  prompt: AgentPromptUsage
}

export type LiteratureScoutProgressEvent =
  | { step: "analyzing"; message: string }
  | { step: "optimizing_query"; message: string; primaryQuery?: string }
  | { step: "searching_sources"; message: string }
  | {
      step: "papers_found"
      message: string
      totalPapers: number
      sourceCounts: Record<string, number>
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

  const queryData = optimizeSearchQuery(
    state.problem,
    state.objectives,
    combinedVariables,
    "biomedical"
  )

  console.log("\n🔍 [LITERATURE_SCOUT_SEARCH] Search Query Optimization:")
  console.log("  🎯 Primary Query:", queryData.primaryQuery)

  onProgress?.({
    step: "optimizing_query",
    message: "Optimized search query",
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

    // PaperFinder is best-effort: if it fails, we still run the pipeline with no citations.
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
      message:
        "Searching PubMed, arXiv, Semantic Scholar, Google Scholar, and the web..."
    })

    for (let i = 0; i < roundQueries.length; i++) {
      const q = roundQueries[i]
      try {
        console.log(
          `\n🌐 [LITERATURE_SCOUT_SEARCH] Round ${i + 1}/${roundQueries.length}: "${q.slice(0, 80)}"`
        )
        const pfStart = Date.now()
        const response = await runPaperFinder(buildRoundQuery(q), {
          operationMode: "infer",
          readResultsFromCache: !searchOptions.bypassCache
        })
        console.log(
          `⏱️  [LITERATURE_SCOUT_SEARCH] Round ${i + 1} responded in ${
            Date.now() - pfStart
          }ms`
        )

        const normalized = normalizePaperFinderResults(response)
        allResults.push(...normalized)
        if (response?.response_text) responseTexts.push(response.response_text)

        // Early-exit once we've gathered enough unique, non-excluded papers.
        const uniqueSoFar = dedupeNormalize(allResults).filter(p => {
          const url = (p.url || "").toLowerCase()
          const title = (p.title || "").toLowerCase()
          return !excludeUrls.has(url) && !excludeTitles.has(title)
        })
        if (uniqueSoFar.length >= minPapers) {
          console.log(
            `✅ [LITERATURE_SCOUT_SEARCH] Reached ${uniqueSoFar.length} unique papers after ${i + 1} round(s); stopping fan-out.`
          )
          break
        }
      } catch (paperFinderError: any) {
        console.warn(
          `⚠️  [LITERATURE_SCOUT_SEARCH] Round ${i + 1} failed; continuing:`,
          paperFinderError?.message || paperFinderError
        )
      }
    }

    const mergedResults = dedupeNormalize(allResults)
      .filter(p => {
        const url = (p.url || "").toLowerCase()
        const title = (p.title || "").toLowerCase()
        return !excludeUrls.has(url) && !excludeTitles.has(title)
      })
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, 40)

    if (mergedResults.length === 0) {
      console.warn(
        "⚠️  [LITERATURE_SCOUT_SEARCH] All rounds returned zero unique papers."
      )
      onProgress?.({
        step: "papers_found",
        message: "No papers found — continuing with AI synthesis only.",
        totalPapers: 0,
        sourceCounts: {}
      })
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
        tavily: curated.sources.tavily.length
      }
      onProgress?.({
        step: "papers_found",
        message: `Found ${mergedResults.length} papers`,
        totalPapers: mergedResults.length,
        sourceCounts
      })
    }

    curated.searchMetrics.queryOptimization = roundQueries

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
    const output: LiteratureScoutOutput = {
      whatOthersHaveDone:
        parsed.whatOthersHaveDone || "No information available",
      goodMethodsAndTools:
        parsed.goodMethodsAndTools || "No information available",
      potentialPitfalls: parsed.potentialPitfalls || "No information available",
      citations: parsed.citations || [],
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
      message: `Literature search complete — ${output.citationsDetailed?.length ?? 0} papers`,
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
      conditionsTable: parsed.conditionsTable || "Not specified",
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
      result.conditionsTable.length,
      "characters"
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
      finalAssessment: parsed.finalAssessment || ""
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
      reagentAndBufferPreparation:
        parsed.reagentAndBufferPreparation || "Not specified",
      stockSolutionPreparation:
        parsed.stockSolutionPreparation || "Not specified",
      masterMixStrategy: parsed.masterMixStrategy || "Not specified",
      workingSolutionTables: parsed.workingSolutionTables || "Not specified",
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
    console.log(
      "  🧪 Reagent/Buffer Prep:",
      result.reagentAndBufferPreparation.length,
      "chars"
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
      samplePreparation: parsed.samplePreparation || "Not specified",
      measurementSteps: parsed.measurementSteps || "Not specified",
      experimentalConditionExecution:
        parsed.experimentalConditionExecution || "Not specified",
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
      "chars"
    )
    console.log(
      "  📊 Measurement Steps:",
      result.measurementSteps.length,
      "chars"
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
  reagentAndBufferPreparation: "Not specified",
  stockSolutionPreparation: "Not specified",
  masterMixStrategy: "Not specified",
  workingSolutionTables: "Not specified",
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
  samplePreparation: "Not specified",
  measurementSteps: "Not specified",
  experimentalConditionExecution: "Not specified",
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
  conditionsTable: "Not specified",
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
 * `finalNotes` (closing reflection). Everything else — literature summary,
 * hypothesis, experiment design, statistical review, execution plan,
 * procedure — is passed through verbatim from `state`.
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
