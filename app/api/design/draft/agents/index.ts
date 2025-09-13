import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import {
  ExperimentDesignState,
  LiteratureScoutOutput,
  HypothesisBuilderOutput,
  ExperimentDesignerOutput,
  StatCheckOutput,
  ReportWriterOutput,
  LiteratureScoutSchema,
  HypothesisBuilderSchema,
  ExperimentDesignerSchema,
  StatCheckSchema,
  ReportWriterSchema,
  CitationItem
} from "../types"
import {
  createLiteratureScoutPrompt,
  createHypothesisBuilderPrompt,
  createExperimentDesignerPrompt,
  createStatCheckPrompt,
  createReportWriterPrompt
} from "../prompts/agent-prompts"
import {
  optimizeSearchQuery,
  performMultiSourceSearch
} from "../utils/search-utils"
import { deepScholarRetrieveAndCurate } from "../utils/deepscholar-ops"

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

const MODEL_NAME = "gpt-4o-2024-08-06"
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
})

export async function callLiteratureScoutAgent(
  state: ExperimentDesignState
): Promise<LiteratureScoutOutput> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📚 [LITERATURE_SCOUT_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  // Log input state
  console.log("📥 [LITERATURE_SCOUT_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log("  🔬 Variables:", JSON.stringify(state.variables, null, 2))
  console.log(
    "  ⚠️  Special Considerations:",
    JSON.stringify(state.specialConsiderations, null, 2)
  )

  // Enhanced query optimization using the existing function
  const queryData = optimizeSearchQuery(
    state.problem,
    state.objectives,
    state.variables,
    "biomedical"
  )

  console.log("\n🔍 [LITERATURE_SCOUT_SEARCH] Search Query Optimization:")
  console.log("  🎯 Primary Query:", queryData.primaryQuery)
  console.log(
    "  🔄 Alternative Queries:",
    JSON.stringify(queryData.alternativeQueries, null, 2)
  )
  console.log(
    "  🏷️  Keywords:",
    JSON.stringify(queryData.keywords.slice(0, 10), null, 2)
  )

  try {
    // DeepScholar retrieval pipeline: multi-round + sem-filter/top-k
    console.log(
      "\n🌐 [LITERATURE_SCOUT_SEARCH] Starting DeepScholar retrieval..."
    )
    const dsStart = Date.now()
    const curated = await deepScholarRetrieveAndCurate(
      state.problem,
      state.objectives,
      state.variables,
      2, // rounds
      2, // queries per round
      10, // per-source
      30 // topK
    )
    console.log(
      `⏱️  [LITERATURE_SCOUT_SEARCH] DeepScholar retrieval finished in ${
        Date.now() - dsStart
      }ms`
    )

    console.log("📊 [LITERATURE_SCOUT_SEARCH] Search Results Summary:")
    console.log("  📚 Total Curated:", curated.totalResults)
    console.log("  🏥 PubMed:", curated.sources.pubmed.length)
    console.log("  📄 ArXiv:", curated.sources.arxiv.length)
    console.log("  🎓 Scholar:", curated.sources.scholar.length)
    console.log(
      "  🔬 Semantic Scholar:",
      curated.sources.semanticScholar.length
    )
    console.log("  🌍 Tavily:", curated.sources.tavily.length)

    // Store search results in state for next agents
    state.searchResults = curated
    console.log(
      `🧾 [LITERATURE_SCOUT_SEARCH] Curated total: ${curated.totalResults} (PubMed:${curated.sources.pubmed.length}, ArXiv:${curated.sources.arxiv.length}, SemSch:${curated.sources.semanticScholar.length}, Scholar:${curated.sources.scholar.length}, Tavily:${curated.sources.tavily.length})`
    )

    console.log("\n🤖 [LITERATURE_SCOUT_AI] Calling OpenAI for analysis...")
    const systemPrompt = createLiteratureScoutPrompt(state, curated)
    const userPrompt = `Please analyze these research papers and provide insights organized into the three sections: what others have done, good methods/tools, and potential pitfalls. Include proper citations.`

    console.log("📝 [LITERATURE_SCOUT_AI] Prompt lengths:")
    console.log("  📏 System prompt:", systemPrompt.length, "characters")
    console.log("  📏 User prompt:", userPrompt.length, "characters")

    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        LiteratureScoutSchema,
        "literatureScout"
      )
    })

    const executionTime = Date.now() - startTime
    console.log(
      `⏱️  [LITERATURE_SCOUT_AI] OpenAI call completed in ${executionTime}ms`
    )

    const parsed = completion.choices[0].message.parsed!
    const result: LiteratureScoutOutput = {
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
      "  📚 What Others Have Done:",
      result.whatOthersHaveDone.length,
      "characters"
    )
    console.log(
      "  🛠️  Good Methods/Tools:",
      result.goodMethodsAndTools.length,
      "characters"
    )
    console.log(
      "  ⚠️  Potential Pitfalls:",
      result.potentialPitfalls.length,
      "characters"
    )
    console.log("  📖 Citations:", result.citations.length, "items")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return result
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

  // Log input state
  console.log("📥 [HYPOTHESIS_BUILDER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log("  🔬 Variables:", JSON.stringify(state.variables, null, 2))
  console.log(
    "  ⚠️  Special Considerations:",
    JSON.stringify(state.specialConsiderations, null, 2)
  )

  // Log literature scout output if available
  if (state.literatureScoutOutput) {
    console.log("  📚 Literature Scout Available: ✅")
    console.log(
      "    📖 Citations:",
      state.literatureScoutOutput.citations.length,
      "items"
    )
  } else {
    console.log("  📚 Literature Scout Available: ❌")
  }

  console.log(
    "\n🤖 [HYPOTHESIS_BUILDER_AI] Calling OpenAI for hypothesis generation..."
  )
  const systemPrompt = createHypothesisBuilderPrompt(state)
  const userPrompt = `Based on the research problem and literature insights provided, generate one clear, testable hypothesis with explanation.`

  console.log("📝 [HYPOTHESIS_BUILDER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        HypothesisBuilderSchema,
        "hypothesisBuilder"
      )
    })

    const executionTime = Date.now() - startTime
    console.log(
      `⏱️  [HYPOTHESIS_BUILDER_AI] OpenAI call completed in ${executionTime}ms`
    )

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
  state: ExperimentDesignState
): Promise<ExperimentDesignerOutput> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("🧪 [EXPERIMENT_DESIGNER_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  // Log input state
  console.log("📥 [EXPERIMENT_DESIGNER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log("  🔬 Variables:", JSON.stringify(state.variables, null, 2))
  console.log(
    "  ⚠️  Special Considerations:",
    JSON.stringify(state.specialConsiderations, null, 2)
  )

  // Log previous agent outputs if available
  if (state.literatureScoutOutput) {
    console.log("  📚 Literature Scout Available: ✅")
  } else {
    console.log("  📚 Literature Scout Available: ❌")
  }

  if (state.hypothesisBuilderOutput) {
    console.log("  💡 Hypothesis Builder Available: ✅")
    console.log(
      "    🧪 Hypothesis Length:",
      state.hypothesisBuilderOutput.hypothesis.length,
      "characters"
    )
  } else {
    console.log("  💡 Hypothesis Builder Available: ❌")
  }

  console.log(
    "\n🤖 [EXPERIMENT_DESIGNER_AI] Calling OpenAI for experiment design..."
  )
  const systemPrompt = createExperimentDesignerPrompt(state)
  const userPrompt = `Design a complete, lab-ready experiment with detailed execution plan based on the hypothesis and research context provided.`

  console.log("📝 [EXPERIMENT_DESIGNER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignerSchema,
        "experimentDesigner"
      )
    })

    const executionTime = Date.now() - startTime
    console.log(
      `⏱️  [EXPERIMENT_DESIGNER_AI] OpenAI call completed in ${executionTime}ms`
    )

    const parsed = completion.choices[0].message.parsed!
    const result = {
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
      executionPlan: {
        materialsList: parsed.executionPlan?.materialsList || "Not specified",
        materialPreparation:
          parsed.executionPlan?.materialPreparation || "Not specified",
        stepByStepProcedure:
          parsed.executionPlan?.stepByStepProcedure || "Not specified",
        timeline: parsed.executionPlan?.timeline || "Not specified",
        setupInstructions:
          parsed.executionPlan?.setupInstructions || "Not specified",
        dataCollectionPlan:
          parsed.executionPlan?.dataCollectionPlan || "Not specified",
        conditionsTable:
          parsed.executionPlan?.conditionsTable || "Not specified",
        storageDisposal:
          parsed.executionPlan?.storageDisposal || "Not specified",
        safetyNotes: parsed.executionPlan?.safetyNotes || "Not specified"
      },
      rationale: parsed.rationale || "No rationale provided"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [EXPERIMENT_DESIGNER_OUTPUT] Agent Output:")
    console.log("  🧪 Experiment Design Components:")
    console.log(
      "    🔬 What Will Be Tested:",
      result.experimentDesign.whatWillBeTested.length,
      "characters"
    )
    console.log(
      "    📊 What Will Be Measured:",
      result.experimentDesign.whatWillBeMeasured.length,
      "characters"
    )
    console.log(
      "    🎯 Control Groups:",
      result.experimentDesign.controlGroups.length,
      "characters"
    )
    console.log(
      "    🧬 Experimental Groups:",
      result.experimentDesign.experimentalGroups.length,
      "characters"
    )
    console.log(
      "    🧪 Sample Types:",
      result.experimentDesign.sampleTypes.length,
      "characters"
    )
    console.log(
      "    🛠️  Tools Needed:",
      result.experimentDesign.toolsNeeded.length,
      "characters"
    )
    console.log("  📋 Execution Plan Components:")
    console.log(
      "    📦 Materials List:",
      result.executionPlan.materialsList.length,
      "characters"
    )
    console.log(
      "    🔧 Material Preparation:",
      result.executionPlan.materialPreparation.length,
      "characters"
    )
    console.log(
      "    📝 Step-by-Step Procedure:",
      result.executionPlan.stepByStepProcedure.length,
      "characters"
    )
    console.log(
      "    ⏰ Timeline:",
      result.executionPlan.timeline.length,
      "characters"
    )
    console.log(
      "    ⚙️  Setup Instructions:",
      result.executionPlan.setupInstructions.length,
      "characters"
    )
    console.log(
      "    📊 Data Collection Plan:",
      result.executionPlan.dataCollectionPlan.length,
      "characters"
    )
    console.log(
      "    🛡️  Safety Notes:",
      result.executionPlan.safetyNotes.length,
      "characters"
    )
    console.log("  📖 Rationale:", result.rationale.length, "characters")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return result
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
  state: ExperimentDesignState
): Promise<StatCheckOutput> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📊 [STAT_CHECK_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  // Log input state and previous agent outputs
  console.log("📥 [STAT_CHECK_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log("  🔬 Variables:", JSON.stringify(state.variables, null, 2))
  console.log(
    "  ⚠️  Special Considerations:",
    JSON.stringify(state.specialConsiderations, null, 2)
  )

  // Log previous agent outputs availability
  console.log(
    "  📚 Literature Scout Available:",
    state.literatureScoutOutput ? "✅" : "❌"
  )
  console.log(
    "  💡 Hypothesis Builder Available:",
    state.hypothesisBuilderOutput ? "✅" : "❌"
  )
  console.log(
    "  🧪 Experiment Designer Available:",
    state.experimentDesignerOutput ? "✅" : "❌"
  )

  console.log("\n🤖 [STAT_CHECK_AI] Calling OpenAI for statistical review...")
  const systemPrompt = createStatCheckPrompt(state)
  const userPrompt = `Review this experiment design and execution plan for statistical and logical soundness. Provide feedback on what looks good, what problems or risks exist, and suggest improvements.`

  console.log("📝 [STAT_CHECK_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(StatCheckSchema, "statCheck")
    })

    const executionTime = Date.now() - startTime
    console.log(
      `⏱️  [STAT_CHECK_AI] OpenAI call completed in ${executionTime}ms`
    )

    const parsed = completion.choices[0].message.parsed!
    const result = {
      whatLooksGood: parsed.whatLooksGood || "No assessment available",
      problemsOrRisks: parsed.problemsOrRisks || [],
      suggestedImprovements: parsed.suggestedImprovements || [],
      overallAssessment:
        parsed.overallAssessment || "No overall assessment available"
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
      "  📊 Overall Assessment:",
      result.overallAssessment.length,
      "characters"
    )
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return result
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

export async function callReportWriterAgent(
  state: ExperimentDesignState
): Promise<ReportWriterOutput> {
  const startTime = Date.now()
  console.log("\n" + "=".repeat(80))
  console.log("📝 [REPORT_WRITER_AGENT] Starting Agent Execution")
  console.log("=".repeat(80))

  // Log input state and all previous agent outputs
  console.log("📥 [REPORT_WRITER_INPUT] Agent Input:")
  console.log("  📋 Problem:", state.problem)
  console.log("  🎯 Objectives:", JSON.stringify(state.objectives, null, 2))
  console.log("  🔬 Variables:", JSON.stringify(state.variables, null, 2))
  console.log(
    "  ⚠️  Special Considerations:",
    JSON.stringify(state.specialConsiderations, null, 2)
  )

  // Log all previous agent outputs availability
  console.log(
    "  📚 Literature Scout Available:",
    state.literatureScoutOutput ? "✅" : "❌"
  )
  console.log(
    "  💡 Hypothesis Builder Available:",
    state.hypothesisBuilderOutput ? "✅" : "❌"
  )
  console.log(
    "  🧪 Experiment Designer Available:",
    state.experimentDesignerOutput ? "✅" : "❌"
  )
  console.log("  📊 Stat Check Available:", state.statCheckOutput ? "✅" : "❌")
  console.log(
    "  🌐 Search Results Available:",
    state.searchResults ? "✅" : "❌"
  )

  console.log(
    "\n🤖 [REPORT_WRITER_AI] Calling OpenAI for final report synthesis..."
  )
  const systemPrompt = createReportWriterPrompt(state)
  const userPrompt = `Create a comprehensive, structured report that synthesizes all the agent outputs into a clear, actionable experimental design document.`

  console.log("📝 [REPORT_WRITER_AI] Prompt lengths:")
  console.log("  📏 System prompt:", systemPrompt.length, "characters")
  console.log("  📏 User prompt:", userPrompt.length, "characters")

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(ReportWriterSchema, "reportWriter")
    })

    const executionTime = Date.now() - startTime
    console.log(
      `⏱️  [REPORT_WRITER_AI] OpenAI call completed in ${executionTime}ms`
    )

    const parsed = completion.choices[0].message.parsed!
    return {
      researchObjective:
        parsed.researchObjective || "No research objective available",
      literatureSummary: {
        whatOthersHaveDone:
          parsed.literatureSummary?.whatOthersHaveDone ||
          "No information available",
        goodMethodsAndTools:
          parsed.literatureSummary?.goodMethodsAndTools ||
          "No information available",
        potentialPitfalls:
          parsed.literatureSummary?.potentialPitfalls ||
          "No information available",
        citations: parsed.literatureSummary?.citations || []
      },
      hypothesis: {
        hypothesis: parsed.hypothesis?.hypothesis || "No hypothesis available",
        explanation:
          parsed.hypothesis?.explanation || "No explanation available"
      },
      experimentDesign: {
        experimentDesign: {
          whatWillBeTested:
            parsed.experimentDesign?.experimentDesign?.whatWillBeTested ||
            "Not specified",
          whatWillBeMeasured:
            parsed.experimentDesign?.experimentDesign?.whatWillBeMeasured ||
            "Not specified",
          controlGroups:
            parsed.experimentDesign?.experimentDesign?.controlGroups ||
            "Not specified",
          experimentalGroups:
            parsed.experimentDesign?.experimentDesign?.experimentalGroups ||
            "Not specified",
          sampleTypes:
            parsed.experimentDesign?.experimentDesign?.sampleTypes ||
            "Not specified",
          toolsNeeded:
            parsed.experimentDesign?.experimentDesign?.toolsNeeded ||
            "Not specified",
          replicatesAndConditions:
            parsed.experimentDesign?.experimentDesign
              ?.replicatesAndConditions || "Not specified",
          specificRequirements:
            parsed.experimentDesign?.experimentDesign?.specificRequirements ||
            "Not specified"
        },
        executionPlan: {
          materialsList:
            parsed.experimentDesign?.executionPlan?.materialsList ||
            "Not specified",
          materialPreparation:
            parsed.experimentDesign?.executionPlan?.materialPreparation ||
            "Not specified",
          stepByStepProcedure:
            parsed.experimentDesign?.executionPlan?.stepByStepProcedure ||
            "Not specified",
          timeline:
            parsed.experimentDesign?.executionPlan?.timeline || "Not specified",
          setupInstructions:
            parsed.experimentDesign?.executionPlan?.setupInstructions ||
            "Not specified",
          dataCollectionPlan:
            parsed.experimentDesign?.executionPlan?.dataCollectionPlan ||
            "Not specified",
          conditionsTable:
            parsed.experimentDesign?.executionPlan?.conditionsTable ||
            "Not specified",
          storageDisposal:
            parsed.experimentDesign?.executionPlan?.storageDisposal ||
            "Not specified",
          safetyNotes:
            parsed.experimentDesign?.executionPlan?.safetyNotes ||
            "Not specified"
        },
        rationale: parsed.experimentDesign?.rationale || "No rationale provided"
      },
      statisticalReview: {
        whatLooksGood:
          parsed.statisticalReview?.whatLooksGood || "No assessment available",
        problemsOrRisks: parsed.statisticalReview?.problemsOrRisks || [],
        suggestedImprovements:
          parsed.statisticalReview?.suggestedImprovements || [],
        overallAssessment:
          parsed.statisticalReview?.overallAssessment ||
          "No overall assessment available"
      },
      finalNotes: parsed.finalNotes || "No final notes available"
    }

    const result = {
      researchObjective:
        parsed.researchObjective || "No research objective available",
      literatureSummary: {
        whatOthersHaveDone:
          parsed.literatureSummary?.whatOthersHaveDone ||
          "No information available",
        goodMethodsAndTools:
          parsed.literatureSummary?.goodMethodsAndTools ||
          "No information available",
        potentialPitfalls:
          parsed.literatureSummary?.potentialPitfalls ||
          "No information available",
        citations: parsed.literatureSummary?.citations || []
      },
      hypothesis: {
        hypothesis: parsed.hypothesis?.hypothesis || "No hypothesis generated",
        explanation:
          parsed.hypothesis?.explanation || "No explanation available"
      },
      experimentDesign: {
        experimentDesign: {
          whatWillBeTested:
            parsed.experimentDesign?.experimentDesign?.whatWillBeTested ||
            "Not specified",
          whatWillBeMeasured:
            parsed.experimentDesign?.experimentDesign?.whatWillBeMeasured ||
            "Not specified",
          controlGroups:
            parsed.experimentDesign?.experimentDesign?.controlGroups ||
            "Not specified",
          experimentalGroups:
            parsed.experimentDesign?.experimentDesign?.experimentalGroups ||
            "Not specified",
          sampleTypes:
            parsed.experimentDesign?.experimentDesign?.sampleTypes ||
            "Not specified",
          toolsNeeded:
            parsed.experimentDesign?.experimentDesign?.toolsNeeded ||
            "Not specified",
          replicatesAndConditions:
            parsed.experimentDesign?.experimentDesign
              ?.replicatesAndConditions || "Not specified",
          specificRequirements:
            parsed.experimentDesign?.experimentDesign?.specificRequirements ||
            "Not specified"
        },
        executionPlan: {
          materialsList:
            parsed.experimentDesign?.executionPlan?.materialsList ||
            "Not specified",
          materialPreparation:
            parsed.experimentDesign?.executionPlan?.materialPreparation ||
            "Not specified",
          stepByStepProcedure:
            parsed.experimentDesign?.executionPlan?.stepByStepProcedure ||
            "Not specified",
          timeline:
            parsed.experimentDesign?.executionPlan?.timeline || "Not specified",
          setupInstructions:
            parsed.experimentDesign?.executionPlan?.setupInstructions ||
            "Not specified",
          dataCollectionPlan:
            parsed.experimentDesign?.executionPlan?.dataCollectionPlan ||
            "Not specified",
          conditionsTable:
            parsed.experimentDesign?.executionPlan?.conditionsTable ||
            "Not specified",
          storageDisposal:
            parsed.experimentDesign?.executionPlan?.storageDisposal ||
            "Not specified",
          safetyNotes:
            parsed.experimentDesign?.executionPlan?.safetyNotes ||
            "Not specified"
        },
        rationale: parsed.experimentDesign?.rationale || "No rationale provided"
      },
      statisticalReview: {
        whatLooksGood:
          parsed.statisticalReview?.whatLooksGood || "No assessment available",
        problemsOrRisks: parsed.statisticalReview?.problemsOrRisks || [],
        suggestedImprovements:
          parsed.statisticalReview?.suggestedImprovements || [],
        overallAssessment:
          parsed.statisticalReview?.overallAssessment ||
          "No overall assessment available"
      },
      finalNotes: parsed.finalNotes || "No final notes available"
    }

    const totalTime = Date.now() - startTime
    console.log("\n📤 [REPORT_WRITER_OUTPUT] Agent Output:")
    console.log(
      "  📋 Research Objective:",
      result.researchObjective.length,
      "characters"
    )
    console.log("  📚 Literature Summary:")
    console.log(
      "    📖 What Others Have Done:",
      result.literatureSummary.whatOthersHaveDone.length,
      "characters"
    )
    console.log(
      "    🛠️  Good Methods/Tools:",
      result.literatureSummary.goodMethodsAndTools.length,
      "characters"
    )
    console.log(
      "    ⚠️  Potential Pitfalls:",
      result.literatureSummary.potentialPitfalls.length,
      "characters"
    )
    console.log(
      "    📖 Citations:",
      result.literatureSummary.citations.length,
      "items"
    )
    console.log("  💡 Hypothesis:")
    console.log(
      "    🧪 Hypothesis:",
      result.hypothesis.hypothesis.length,
      "characters"
    )
    console.log(
      "    📝 Explanation:",
      result.hypothesis.explanation.length,
      "characters"
    )
    console.log("  🧪 Experiment Design:")
    console.log("    🔬 Design Components: 8 fields")
    console.log("    📋 Execution Plan: 9 fields")
    console.log(
      "    📖 Rationale:",
      result.experimentDesign.rationale.length,
      "characters"
    )
    console.log("  📊 Statistical Review:")
    console.log(
      "    ✅ What Looks Good:",
      result.statisticalReview.whatLooksGood.length,
      "characters"
    )
    console.log(
      "    ⚠️  Problems/Risks:",
      result.statisticalReview.problemsOrRisks.length,
      "items"
    )
    console.log(
      "    💡 Improvements:",
      result.statisticalReview.suggestedImprovements.length,
      "items"
    )
    console.log(
      "    📊 Assessment:",
      result.statisticalReview.overallAssessment.length,
      "characters"
    )
    console.log("  📝 Final Notes:", result.finalNotes.length, "characters")
    console.log("  ⏱️  Total Execution Time:", totalTime, "ms")
    console.log("=".repeat(80))

    return result
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(
      `❌ [REPORT_WRITER_ERROR] Agent failed after ${totalTime}ms:`,
      error
    )
    console.log("=".repeat(80))
    throw error
  }
}
