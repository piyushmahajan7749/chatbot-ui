"use client"

import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"

import { Tables } from "@/supabase/types"
import { useContext, useEffect, useState } from "react"
import { BookOpen, Lightbulb, Database, FileText } from "lucide-react"
import Loading from "@/app/[locale]/loading"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Add this type at the top of the file, after imports
type DesignWithProblem = Tables<"designs"> & {
  problem?: string
  objectives?: string[]
  variables?: string[]
  specialConsiderations?: string[]
}

interface AggregatedSearchResults {
  totalResults: number
  sources: {
    pubmed: any[]
    arxiv: any[]
    scholar: any[]
    semanticScholar: any[]
    tavily: any[]
  }
  synthesizedFindings: {
    keyMethodologies: string[]
    commonPitfalls: string[]
    recommendedApproaches: string[]
    novelInsights: string[]
  }
}

// New interfaces to match the refactored API
interface NewApiResponse {
  success: boolean
  reportWriterOutput: {
    researchObjective: string
    literatureSummary: {
      whatOthersHaveDone: string
      goodMethodsAndTools: string
      potentialPitfalls: string
      citations: string[]
    }
    hypothesis: {
      hypothesis: string
      explanation: string
    }
    experimentDesign: {
      experimentDesign: {
        whatWillBeTested: string
        whatWillBeMeasured: string
        controlGroups: string
        experimentalGroups: string
        sampleTypes: string
        toolsNeeded: string
        replicatesAndConditions: string
        specificRequirements: string
      }
      executionPlan: {
        materialsList: string
        materialPreparation: string
        stepByStepProcedure: string
        timeline: string
        setupInstructions: string
        dataCollectionPlan: string
        conditionsTable: string
        storageDisposal: string
        safetyNotes: string
      }
      rationale: string
    }
    statisticalReview: {
      whatLooksGood: string
      problemsOrRisks: string[]
      suggestedImprovements: string[]
      overallAssessment: string
    }
    finalNotes: string
  }
  agentOutputs?: any
  searchResults?: AggregatedSearchResults
}

interface DesignReviewProps {
  designData: {
    problem: string
    objectives: string[]
    variables: string[]
    specialConsiderations: string[]
    // Legacy support for old format
    literatureFindings?: {
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
    dataAnalysis?: {
      correlations: string[]
      outliers: string[]
      keyFindings: string[]
      metrics: string[]
    }
    experimentDesign?: {
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
    finalReport?: {
      introduction: string
      literatureSummary: string
      dataInsights: string
      hypothesis: string
      designOfExperiments: string
      statisticalAnalysis: string
      recommendations: string
    }
    // New format from refactored API
    reportWriterOutput?: NewApiResponse["reportWriterOutput"]
    searchResults?: AggregatedSearchResults
  }
  onApprove?: () => void
  onRegenerate?: (feedback: string) => void
  isRegenerating?: boolean
  skipApiCalls?: boolean
  dataSource?: "generated" | "database" | null
}

function linkifyCitations(text: string) {
  if (!text) return text
  return text.replace(/\[(\d+)\]/g, (_m, p1) => `[${p1}](#cite-${p1})`)
}

export function DesignReview({
  designData,
  onApprove,
  onRegenerate,
  isRegenerating,
  skipApiCalls,
  dataSource
}: DesignReviewProps) {
  const { profile } = useContext(ChatbotUIContext)
  const { selectedDesign, setSelectedDesign } = useDesignContext()

  const [loading, setLoading] = useState(false)
  const [contentLoading, setContentLoading] = useState(true)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [localDesign, setLocalDesign] = useState<DesignWithProblem | null>(null)
  const [agentOutputs, setAgentOutputs] = useState<any | null>(null)

  useEffect(() => {
    // Skip API calls if data is already provided
    if (skipApiCalls && designData.problem) {
      console.log("🚫 [DESIGN_REVIEW] Skipping API calls, using provided data")
      console.log("📊 [DESIGN_REVIEW] Data source:", dataSource)

      // Set up the design data directly without API calls
      const designWithProblem: DesignWithProblem = {
        id: designData.problem,
        user_id: profile?.id || "",
        name: designData.problem,
        description: "Design loaded from " + (dataSource || "unknown source"),
        problem: designData.problem,
        sharing: "private",
        created_at: new Date().toISOString(),
        updated_at: null,
        folder_id: null,
        objectives: designData.objectives || null,
        special_considerations: designData.specialConsiderations || null,
        variables: designData.variables || null
      } as DesignWithProblem

      setSelectedDesign(designWithProblem)
      setLocalDesign(designWithProblem)

      // Set up content from the provided design data
      const designContent: Record<string, string> = {}
      const reportOutput = designData.reportWriterOutput

      console.log(
        "\n🔍 [DESIGN_REVIEW_SKIP_API] Processing provided design data:"
      )
      console.log("  📋 Design Data Keys:", Object.keys(designData))
      console.log("  📝 Report Writer Output Available:", !!reportOutput)
      if (reportOutput) {
        console.log(
          "    📋 Research Objective:",
          !!reportOutput.researchObjective
        )
        console.log(
          "    📚 Literature Summary:",
          !!reportOutput.literatureSummary
        )
        console.log("    💡 Hypothesis:", !!reportOutput.hypothesis)
        console.log(
          "    🧪 Experiment Design:",
          !!reportOutput.experimentDesign
        )
        console.log(
          "    📊 Statistical Review:",
          !!reportOutput.statisticalReview
        )
        console.log("    📝 Final Notes:", !!reportOutput.finalNotes)
      }

      // Handle new API format first
      if (reportOutput) {
        if (reportOutput.researchObjective) {
          designContent.researchObjective = reportOutput.researchObjective
          console.log("    ✅ Added Research Objective section")
        }

        if (reportOutput.literatureSummary) {
          const ls = reportOutput.literatureSummary as any
          const detailed = (ls.citationsDetailed || []) as Array<{
            index: number
            title: string
            url: string
            authors: string[]
            year?: string
            journal?: string
          }>

          const citationsBlock =
            detailed.length > 0
              ? detailed
                  .map(
                    c =>
                      `[${c.index}] ${c.title}${c.year ? ` (${c.year})` : ""}$${
                        c.journal ? ` ${c.journal}` : ""
                      } — ${c.authors?.join(", ") || ""} \n${c.url}`
                  )
                  .join("\n")
              : ls.citations?.join("\n") || ""

          designContent.literatureSummary = `
**What Others Have Done:**
${linkifyCitations(reportOutput.literatureSummary.whatOthersHaveDone)}

**Good Methods and Tools:**
${linkifyCitations(reportOutput.literatureSummary.goodMethodsAndTools)}

**Potential Pitfalls:**
${linkifyCitations(reportOutput.literatureSummary.potentialPitfalls)}

**Citations:**
${citationsBlock
  .split("\n")
  .map((line: string) => {
    const m = line.match(/^\[(\d+)\]/)
    if (!m) return line
    const idx = m[1]
    return `<a id=\"cite-${idx}\"></a>` + line
  })
  .join("\n")}
          `.trim()
          console.log("    ✅ Added Literature Summary section")
        }

        if (reportOutput.hypothesis) {
          designContent.hypothesis = `
**Hypothesis:**
${reportOutput.hypothesis.hypothesis}

**Explanation:**
${reportOutput.hypothesis.explanation}
          `.trim()
          console.log("    ✅ Added Hypothesis section")
        }

        if (reportOutput.experimentDesign) {
          designContent.experimentDesign = `
**Experiment Design:**
- What Will Be Tested: ${reportOutput.experimentDesign.experimentDesign.whatWillBeTested}
- What Will Be Measured: ${reportOutput.experimentDesign.experimentDesign.whatWillBeMeasured}
- Control Groups: ${reportOutput.experimentDesign.experimentDesign.controlGroups}
- Experimental Groups: ${reportOutput.experimentDesign.experimentDesign.experimentalGroups}
- Sample Types: ${reportOutput.experimentDesign.experimentDesign.sampleTypes}
- Tools Needed: ${reportOutput.experimentDesign.experimentDesign.toolsNeeded}
- Replicates and Conditions: ${reportOutput.experimentDesign.experimentDesign.replicatesAndConditions}

**Execution Plan:**
- Materials List: ${reportOutput.experimentDesign.executionPlan.materialsList}
- Material Preparation: ${reportOutput.experimentDesign.executionPlan.materialPreparation}
- Step-by-Step Procedure: ${reportOutput.experimentDesign.executionPlan.stepByStepProcedure}
- Timeline: ${reportOutput.experimentDesign.executionPlan.timeline}
- Setup Instructions: ${reportOutput.experimentDesign.executionPlan.setupInstructions}
- Data Collection Plan: ${reportOutput.experimentDesign.executionPlan.dataCollectionPlan}
- Conditions Table: ${reportOutput.experimentDesign.executionPlan.conditionsTable}
- Storage/Disposal: ${reportOutput.experimentDesign.executionPlan.storageDisposal}
- Safety Notes: ${reportOutput.experimentDesign.executionPlan.safetyNotes}

**Rationale:**
${reportOutput.experimentDesign.rationale}
          `.trim()
          console.log("    ✅ Added Experiment Design section")
        }

        if (reportOutput.statisticalReview) {
          designContent.statisticalReview = `
**What Looks Good:**
${reportOutput.statisticalReview.whatLooksGood}

**Problems or Risks:**
${reportOutput.statisticalReview.problemsOrRisks.join("\n- ")}

**Suggested Improvements:**
${reportOutput.statisticalReview.suggestedImprovements.join("\n- ")}

**Overall Assessment:**
${reportOutput.statisticalReview.overallAssessment}
          `.trim()
          console.log("    ✅ Added Statistical Review section")
        }

        if (reportOutput.finalNotes) {
          designContent.finalNotes = reportOutput.finalNotes
          console.log("    ✅ Added Final Notes section")
        }
      }

      // Handle legacy format (fallback)
      if (designData.finalReport && Object.keys(designContent).length === 0) {
        if (designData.finalReport.introduction)
          designContent.introduction = designData.finalReport.introduction
        if (designData.finalReport.literatureSummary)
          designContent.literatureSummary =
            designData.finalReport.literatureSummary
        if (designData.finalReport.dataInsights)
          designContent.dataInsights = designData.finalReport.dataInsights
        if (designData.finalReport.hypothesis)
          designContent.hypothesis = designData.finalReport.hypothesis
        if (designData.finalReport.designOfExperiments)
          designContent.designOfExperiments =
            designData.finalReport.designOfExperiments
        if (designData.finalReport.statisticalAnalysis)
          designContent.statisticalAnalysis =
            designData.finalReport.statisticalAnalysis
        if (designData.finalReport.recommendations)
          designContent.recommendations = designData.finalReport.recommendations
      }

      // Set the outline and section contents
      const outlineKeys = Object.keys(designContent)

      console.log("\n📋 [DESIGN_REVIEW_SKIP_API] Section Processing Complete:")
      console.log("  📝 Total Sections Created:", outlineKeys.length)
      console.log("  🔑 Section Keys:", outlineKeys.join(", "))
      console.log(
        "  📊 Total Content Length:",
        Object.values(designContent).reduce(
          (sum, content) => sum + content.length,
          0
        ),
        "characters"
      )

      setGeneratedOutline(outlineKeys)
      setSectionContents(designContent)
      setContentLoading(false)

      console.log(
        "✅ [DESIGN_REVIEW_SKIP_API] Successfully set up design from provided data"
      )
      return
    }

    // Original API-based logic
    if (designData.problem) {
      fetchDesign()
    }
  }, [designData.problem, skipApiCalls, dataSource])

  const fetchDesign = async () => {
    try {
      setLoading(true)
      setContentLoading(true)
      const response = await fetch(`/api/design/${designData.problem}`)

      if (!response.ok) {
        throw new Error(`Error fetching design: ${response.status}`)
      }

      const data = await response.json()
      const designWithProblem: DesignWithProblem = {
        ...data,
        problem: data.name
      }
      setSelectedDesign(designWithProblem)

      // Check if we need to generate content
      if (
        !generatedOutline.length ||
        Object.keys(sectionContents).length === 0
      ) {
        // Fetch or generate content
        await fetchDesignContent(designWithProblem)
      } else {
        setContentLoading(false)
      }
    } catch (error) {
      console.error("Error fetching design:", error)
      // If fetch fails, show error state
      setContentLoading(false)
    } finally {
      setLoading(false)
    }
  }

  // New function to fetch design content
  const fetchDesignContent = async (design: DesignWithProblem) => {
    const startTime = Date.now()
    try {
      setContentLoading(true)
      console.log("\n" + "=".repeat(80))
      console.log("🚀 [DESIGN_REVIEW_FE] Starting Design Content Fetch")
      console.log("=".repeat(80))
      console.log("📥 [DESIGN_REVIEW_INPUT] Input Design:")
      console.log("  📋 Problem:", design.problem || design.name)
      console.log("  📝 Description:", design.description)
      console.log("  🆔 Design ID:", design.id)

      // Call the API to get design content
      const requestPayload = {
        problem: design.problem || design.name,
        description: design.description,
        objectives: Array.isArray(design.objectives) ? design.objectives : [],
        variables: Array.isArray(design.variables) ? design.variables : [],
        specialConsiderations: Array.isArray(design.specialConsiderations)
          ? design.specialConsiderations
          : []
      }

      console.log("📤 [DESIGN_REVIEW_REQUEST] API Request:")
      console.log("  🎯 Endpoint: /api/design/draft")
      console.log("  📋 Payload:", JSON.stringify(requestPayload, null, 2))

      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      })

      if (!response.ok) {
        throw new Error(`Error fetching design content: ${response.status}`)
      }

      const data = await response.json()
      const fetchTime = Date.now() - startTime
      console.log(
        `📥 [DESIGN_REVIEW_RESPONSE] API Response received in ${fetchTime}ms:`
      )
      console.log("  ✅ Success:", data.success)
      console.log(
        "  📊 Response size:",
        JSON.stringify(data).length,
        "characters"
      )
      console.log("  🔑 Response keys:", Object.keys(data).join(", "))

      if (data.reportWriterOutput) {
        console.log("  📝 Report Writer Output Available: ✅")
        console.log(
          "    📋 Research Objective:",
          !!data.reportWriterOutput.researchObjective
        )
        console.log(
          "    📚 Literature Summary:",
          !!data.reportWriterOutput.literatureSummary
        )
        console.log("    💡 Hypothesis:", !!data.reportWriterOutput.hypothesis)
        console.log(
          "    🧪 Experiment Design:",
          !!data.reportWriterOutput.experimentDesign
        )
        console.log(
          "    📊 Statistical Review:",
          !!data.reportWriterOutput.statisticalReview
        )
        console.log("    📝 Final Notes:", !!data.reportWriterOutput.finalNotes)
      }
      if (data.agentOutputs) {
        setAgentOutputs(data.agentOutputs)
      }

      if (data.searchResults) {
        console.log("  🌐 Search Results Available: ✅")
        console.log("    📚 Total Results:", data.searchResults.totalResults)
        console.log(
          "    🏥 PubMed:",
          data.searchResults.sources?.pubmed?.length || 0
        )
        console.log(
          "    📄 ArXiv:",
          data.searchResults.sources?.arxiv?.length || 0
        )
        console.log(
          "    🎓 Scholar:",
          data.searchResults.sources?.scholar?.length || 0
        )
        console.log(
          "    🔬 Semantic Scholar:",
          data.searchResults.sources?.semanticScholar?.length || 0
        )
        console.log(
          "    🌍 Tavily:",
          data.searchResults.sources?.tavily?.length || 0
        )
      }

      // Handle both old and new API response formats
      const reportOutput = data.reportWriterOutput || data
      const searchResults = data.searchResults

      console.log("\n🔄 [DESIGN_REVIEW_PROCESSING] Processing API Response:")
      console.log(
        "  📝 Report Output Type:",
        reportOutput
          ? data.reportWriterOutput
            ? "New Format"
            : "Legacy Format"
          : "None"
      )
      console.log(
        "  🌐 Search Results Type:",
        searchResults ? "Available" : "None"
      )

      if (
        reportOutput &&
        (reportOutput.researchObjective ||
          data.experimentDesign ||
          data.finalReport)
      ) {
        console.log("  ✅ Valid response data detected, processing sections...")

        // Create a combined object for sections
        const designDraft: Record<string, string> = {}

        // Handle new API format
        if (reportOutput.researchObjective) {
          designDraft.researchObjective = reportOutput.researchObjective
          console.log("📋 Added Research Objective section")
        }

        if (reportOutput.literatureSummary) {
          designDraft.literatureSummary = `
**What Others Have Done:**
${reportOutput.literatureSummary.whatOthersHaveDone}

**Good Methods and Tools:**
${reportOutput.literatureSummary.goodMethodsAndTools}

**Potential Pitfalls:**
${reportOutput.literatureSummary.potentialPitfalls}

**Citations:**
${reportOutput.literatureSummary.citations.join("\n")}
          `.trim()
        }

        if (reportOutput.hypothesis) {
          designDraft.hypothesis = `
**Hypothesis:**
${reportOutput.hypothesis.hypothesis}

**Explanation:**
${reportOutput.hypothesis.explanation}
          `.trim()
        }

        if (reportOutput.experimentDesign) {
          designDraft.experimentDesign = `
**Experiment Design:**
- What Will Be Tested: ${reportOutput.experimentDesign.experimentDesign.whatWillBeTested}
- What Will Be Measured: ${reportOutput.experimentDesign.experimentDesign.whatWillBeMeasured}
- Control Groups: ${reportOutput.experimentDesign.experimentDesign.controlGroups}
- Experimental Groups: ${reportOutput.experimentDesign.experimentDesign.experimentalGroups}
- Sample Types: ${reportOutput.experimentDesign.experimentDesign.sampleTypes}
- Tools Needed: ${reportOutput.experimentDesign.experimentDesign.toolsNeeded}
- Replicates and Conditions: ${reportOutput.experimentDesign.experimentDesign.replicatesAndConditions}

**Execution Plan:**
- Materials List: ${reportOutput.experimentDesign.executionPlan.materialsList}
- Material Preparation: ${reportOutput.experimentDesign.executionPlan.materialPreparation}
- Step-by-Step Procedure: ${reportOutput.experimentDesign.executionPlan.stepByStepProcedure}
- Timeline: ${reportOutput.experimentDesign.executionPlan.timeline}
- Setup Instructions: ${reportOutput.experimentDesign.executionPlan.setupInstructions}
- Data Collection Plan: ${reportOutput.experimentDesign.executionPlan.dataCollectionPlan}
- Conditions Table: ${reportOutput.experimentDesign.executionPlan.conditionsTable}
- Storage/Disposal: ${reportOutput.experimentDesign.executionPlan.storageDisposal}
- Safety Notes: ${reportOutput.experimentDesign.executionPlan.safetyNotes}

**Rationale:**
${reportOutput.experimentDesign.rationale}
          `.trim()
        }

        if (reportOutput.statisticalReview) {
          designDraft.statisticalReview = `
**What Looks Good:**
${reportOutput.statisticalReview.whatLooksGood}

**Problems or Risks:**
${reportOutput.statisticalReview.problemsOrRisks.join("\n- ")}

**Suggested Improvements:**
${reportOutput.statisticalReview.suggestedImprovements.join("\n- ")}

**Overall Assessment:**
${reportOutput.statisticalReview.overallAssessment}
          `.trim()
        }

        if (reportOutput.finalNotes) {
          designDraft.finalNotes = reportOutput.finalNotes
        }

        // Handle legacy API format (fallback)
        if (data.finalReport && Object.keys(designDraft).length === 0) {
          if (data.finalReport.introduction)
            designDraft.introduction = data.finalReport.introduction
          if (data.finalReport.literatureSummary)
            designDraft.literatureSummary = data.finalReport.literatureSummary
          if (data.finalReport.dataInsights)
            designDraft.dataInsights = data.finalReport.dataInsights
          if (data.finalReport.hypothesis)
            designDraft.hypothesis = data.finalReport.hypothesis
          if (data.finalReport.designOfExperiments)
            designDraft.designOfExperiments =
              data.finalReport.designOfExperiments
          if (data.finalReport.statisticalAnalysis)
            designDraft.statisticalAnalysis =
              data.finalReport.statisticalAnalysis
          if (data.finalReport.recommendations)
            designDraft.recommendations = data.finalReport.recommendations
        }

        // If no sections were added, add a default one
        if (Object.keys(designDraft).length === 0) {
          designDraft.content = "No content available"
        }

        console.log("Processed design sections:", designDraft)
        console.log("Section keys:", Object.keys(designDraft))

        // Set the outline and section contents
        const outlineKeys = Object.keys(designDraft)
        console.log(
          "\n📋 [DESIGN_REVIEW_SECTIONS] Section Processing Complete:"
        )
        console.log("  📝 Total Sections Created:", outlineKeys.length)
        console.log("  🔑 Section Keys:", outlineKeys.join(", "))
        console.log(
          "  📊 Total Content Length:",
          Object.values(designDraft).reduce(
            (sum, content) => sum + content.length,
            0
          ),
          "characters"
        )

        setGeneratedOutline(outlineKeys)
        setSectionContents(designDraft)

        // Ensure we keep the selected design
        if (!selectedDesign) {
          console.log("  ⚠️  No selectedDesign found, creating fallback design")
          // Create a basic design if none exists
          const fallbackDesign: DesignWithProblem = {
            id: designData.problem || Date.now().toString(),
            user_id: profile?.id || "",
            name: "Design Draft",
            description: "Generated design",
            problem: "Design Draft",
            sharing: "private",
            created_at: new Date().toISOString(),
            updated_at: null,
            folder_id: null,
            objectives: [],
            specialConsiderations: [],
            variables: []
          } as unknown as DesignWithProblem
          setSelectedDesign(fallbackDesign)
          setLocalDesign(fallbackDesign)
        } else {
          console.log("Selected design exists:", selectedDesign)
          setLocalDesign(selectedDesign)
        }

        // Force a re-render

        const totalTime = Date.now() - startTime
        console.log(
          `\n✅ [DESIGN_REVIEW_SUCCESS] Design content fetch completed in ${totalTime}ms`
        )
        console.log("=".repeat(80))
      } else {
        console.error(
          "❌ [DESIGN_REVIEW_ERROR] Invalid data structure received:",
          data
        )
        throw new Error("No design content received")
      }
    } catch (error) {
      const totalTime = Date.now() - startTime
      console.error(
        `❌ [DESIGN_REVIEW_ERROR] Design content fetch failed after ${totalTime}ms:`,
        error
      )

      // Set some default sections if content fetch fails
      const defaultSections = {
        introduction: "Content is being generated...",
        methodology: "Content is being generated...",
        results: "Content is being generated...",
        conclusion: "Content is being generated..."
      }
      setGeneratedOutline(Object.keys(defaultSections))
      setSectionContents(defaultSections)
      console.log("  🔄 Set default sections as fallback")
      console.log("=".repeat(80))
    } finally {
      setContentLoading(false)
    }
  }

  // Simplified useEffect to handle fallback design creation
  useEffect(() => {
    if (
      generatedOutline.length > 0 &&
      Object.keys(sectionContents).length > 0 &&
      !selectedDesign &&
      !localDesign
    ) {
      const fallbackDesign: DesignWithProblem = {
        id: designData.problem || Date.now().toString(),
        user_id: profile?.id || "",
        name: "Design Draft",
        description: "Generated design",
        problem: designData.problem || "Design Draft",
        sharing: "private",
        created_at: new Date().toISOString(),
        updated_at: null,
        folder_id: null,
        objectives: [],
        specialConsiderations: [],
        variables: []
      } as unknown as DesignWithProblem
      setSelectedDesign(fallbackDesign)
      setLocalDesign(fallbackDesign)
    }
  }, [
    generatedOutline,
    sectionContents,
    selectedDesign,
    localDesign,
    designData.problem,
    profile
  ])

  const handleApprove = () => {
    toast.success("Design approved successfully!")
    onApprove?.()
  }

  const handleRegenerate = () => {
    toast.info("Regenerating design...")
    window.location.reload()
  }

  if (loading) {
    return <Loading />
  }

  // Only render content when both design and content are loaded
  const designToUse = selectedDesign || localDesign
  if (!designToUse) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <div className="mb-4 text-6xl">🔬</div>
          <h2 className="text-2xl font-bold text-gray-800">
            Design Ready to Load
          </h2>
          <p className="leading-relaxed text-white">
            Your experimental design is being prepared. The multi-agent research
            system has completed the analysis and is ready to display your
            comprehensive design review.
          </p>
          <div className="pt-4">
            <Button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Load Design Review
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Check if we have content to display
  if (
    generatedOutline.length === 0 ||
    Object.keys(sectionContents).length === 0
  ) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <div className="mb-4 text-6xl">📄</div>
          <h2 className="text-2xl font-bold text-gray-800">
            Generating Design Content
          </h2>
          <p className="leading-relaxed text-white">
            The experimental design content is being generated by our AI system.
            This process typically takes 1-2 minutes as we analyze literature,
            process data, and create your comprehensive design.
          </p>
          <div className="pt-4">
            <Button onClick={() => window.location.reload()} variant="outline">
              Refresh Status
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto h-full max-w-4xl space-y-6 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Experiment Design Review</h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Research Problem */}
      <Card>
        <CardHeader>
          <CardTitle>Research Problem</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-white">
            {designData.problem || "No problem statement available"}
          </p>
        </CardContent>
      </Card>

      {/* Research Objective */}
      {sectionContents.researchObjective && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5 text-blue-600" />
              Research Objective
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <ReactMarkdown>{sectionContents.researchObjective}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Literature Summary */}
      {sectionContents.literatureSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-green-600" />
              Literature Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none text-white">
              <ReactMarkdown>{sectionContents.literatureSummary}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hypothesis */}
      {sectionContents.hypothesis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-5 text-yellow-600" />
              Hypothesis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none text-white">
              <ReactMarkdown>{sectionContents.hypothesis}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experiment Design */}
      {sectionContents.experimentDesign && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5 text-purple-600" />
              Experiment Design
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none text-white">
              <ReactMarkdown>{sectionContents.experimentDesign}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Button
              onClick={handleApprove}
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={isRegenerating}
            >
              Approve Design
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="flex-1"
              disabled={isRegenerating}
            >
              Regenerate Design
            </Button>
          </div>
        </CardContent>
      </Card>

      {agentOutputs && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Outputs (Raw)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none text-white">
              {agentOutputs.literatureScoutOutput && (
                <>
                  <h3>Literature Scout</h3>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(
                      agentOutputs.literatureScoutOutput,
                      null,
                      2
                    )}
                  </pre>
                </>
              )}
              {agentOutputs.hypothesisBuilderOutput && (
                <>
                  <h3>Hypothesis Builder</h3>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(
                      agentOutputs.hypothesisBuilderOutput,
                      null,
                      2
                    )}
                  </pre>
                </>
              )}
              {agentOutputs.experimentDesignerOutput && (
                <>
                  <h3>Experiment Designer</h3>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(
                      agentOutputs.experimentDesignerOutput,
                      null,
                      2
                    )}
                  </pre>
                </>
              )}
              {agentOutputs.statCheckOutput && (
                <>
                  <h3>Stat Check</h3>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(agentOutputs.statCheckOutput, null, 2)}
                  </pre>
                </>
              )}
              {agentOutputs.reportWriterOutput && (
                <>
                  <h3>Report Writer</h3>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(agentOutputs.reportWriterOutput, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
