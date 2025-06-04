"use client"

import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"

import { Tables } from "@/supabase/types"
import { useContext, useEffect, useState } from "react"
import {
  ChevronUp,
  ExternalLink,
  Search,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Database,
  FileText,
  BarChart3,
  Globe,
  ChevronDown
} from "lucide-react"
import Loading from "@/app/[locale]/loading"
import ReactMarkdown from "react-markdown"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader } from "@/components/ui/loader"
import PptxGenJS from "pptxgenjs"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"

// Add this type at the top of the file, after imports
type DesignWithProblem = Tables<"designs"> & { problem?: string }

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
}

interface DesignReviewProps {
  designData: {
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
  onApprove?: () => void
  onRegenerate?: (feedback: string) => void
  isRegenerating?: boolean
  skipApiCalls?: boolean
  dataSource?: "generated" | "database" | null
}

// Helper functions for PPT generation
function getIntroSlide(pptx: PptxGenJS, title: string) {
  let slide = pptx.addSlide()
  slide.background = { color: "0070C0" }
  // Add a title
  slide.addText(title, {
    x: 0, // Center horizontally
    y: 2.16667, // Center vertically
    w: "100%", // Width of the text box to span the entire slide width
    h: 1,
    fontSize: 72,
    color: "ffffff",
    fontFace: "Calibri",
    align: "center",
    valign: "middle"
  })
}

function getContentSlide(pptx: PptxGenJS, title: string, content: string) {
  let slide = pptx.addSlide()
  slide.background = { color: "f0d3dc" }
  slide.addText(title, {
    x: 0.2,
    y: 0.2,
    h: 1,
    w: "100%",
    fontSize: 24,
    color: "000000",
    fontFace: "Calibri",
    align: pptx.AlignH.left,
    valign: pptx.AlignV.top
  })

  slide.addText(content, {
    x: 0.2,
    y: 0.8,
    h: 1,
    w: "90%",
    fontSize: 16,
    color: "000000",
    fontFace: "Calibri",
    align: pptx.AlignH.left,
    valign: pptx.AlignV.top
  })
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
  const [isEditing, setIsEditing] = useState(false)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [editedContent, setEditedContent] = useState("")
  const [question, setQuestion] = useState("")
  const [isQuestionSectionVisible, setIsQuestionSectionVisible] = useState(true)
  const [isRegenerateLoading, setRegenerateLoading] = useState(false)
  const [localDesign, setLocalDesign] = useState<DesignWithProblem | null>(null)
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({})
  const [feedback, setFeedback] = useState("")
  const [selectedSource, setSelectedSource] = useState<string>("overview")
  const [searchProgress, setSearchProgress] = useState(0)

  // Mapping for nicer display of section names
  const outlineMapping: Record<string, string> = {
    introduction: "Introduction",
    literatureSummary: "Literature Summary",
    dataInsights: "Data Insights",
    hypothesis: "Hypothesis",
    designOfExperiments: "Design of Experiments",
    statisticalAnalysis: "Statistical Analysis",
    recommendations: "Recommendations",
    content: "Content"
  }

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

      // Set the outline and section contents
      const outlineKeys = Object.keys(designContent)
      setGeneratedOutline(outlineKeys)
      setSectionContents(designContent)
      setContentLoading(false)
      setActiveSection(0)

      console.log(
        "✅ [DESIGN_REVIEW] Successfully set up design from provided data"
      )
      return
    }

    // Original API-based logic
    if (designData.problem) {
      fetchDesign()
    } else {
      // If no designId, generate a new draft
      // generateDraft("New Design", "Initial design description")
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
      // If fetch fails, fall back to generating a new draft
      generateDraft("New Design", "Initial design description")
    } finally {
      setLoading(false)
    }
  }

  // New function to fetch design content
  const fetchDesignContent = async (design: DesignWithProblem) => {
    try {
      setContentLoading(true)
      console.log("Fetching design content...")

      // Call the API to get design content
      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: design.problem || design.name,
          description: design.description,
          objectives: [],
          variables: [],
          specialConsiderations: []
        })
      })

      if (!response.ok) {
        throw new Error(`Error fetching design content: ${response.status}`)
      }

      const data = await response.json()
      console.log("Design content received:", data)

      if (data.experimentDesign && data.finalReport) {
        // Create a combined object for sections
        const designDraft: Record<string, string> = {}

        // Add all properties from finalReport
        if (data.finalReport.introduction)
          designDraft.introduction = data.finalReport.introduction
        if (data.finalReport.literatureSummary)
          designDraft.literatureSummary = data.finalReport.literatureSummary
        if (data.finalReport.dataInsights)
          designDraft.dataInsights = data.finalReport.dataInsights
        if (data.finalReport.hypothesis)
          designDraft.hypothesis = data.finalReport.hypothesis
        if (data.finalReport.designOfExperiments)
          designDraft.designOfExperiments = data.finalReport.designOfExperiments
        if (data.finalReport.statisticalAnalysis)
          designDraft.statisticalAnalysis = data.finalReport.statisticalAnalysis
        if (data.finalReport.recommendations)
          designDraft.recommendations = data.finalReport.recommendations

        // If no sections were added, add a default one
        if (Object.keys(designDraft).length === 0) {
          designDraft.content = "No content available"
        }

        console.log("Processed design sections:", designDraft)
        console.log("Section keys:", Object.keys(designDraft))

        // Set the outline and section contents
        const outlineKeys = Object.keys(designDraft)
        setGeneratedOutline(outlineKeys)
        setSectionContents(designDraft)

        // Ensure we keep the selected design
        if (!selectedDesign) {
          console.log("No selectedDesign found, creating a new one")
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
            objectives: null,
            special_considerations: null,
            variables: null
          } as DesignWithProblem
          setSelectedDesign(fallbackDesign)
          setLocalDesign(fallbackDesign)
        } else {
          console.log("Selected design exists:", selectedDesign)
          setLocalDesign(selectedDesign)
        }

        // Force a re-render by updating a state
        setActiveSection(0)
      } else {
        console.error("Invalid data structure received:", data)
        throw new Error("No design content received")
      }
    } catch (error) {
      console.error("Error fetching design content:", error)
      // Set some default sections if content fetch fails
      const defaultSections = {
        introduction: "Content is being generated...",
        methodology: "Content is being generated...",
        results: "Content is being generated...",
        conclusion: "Content is being generated..."
      }
      setGeneratedOutline(Object.keys(defaultSections))
      setSectionContents(defaultSections)
    } finally {
      setContentLoading(false)
    }
  }

  const generateDraft = async (problem: string, description: string) => {
    setLoading(true)
    setContentLoading(true)
    console.log("Generating draft with problem:", problem)

    try {
      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          description,
          // Add missing required fields that the API expects
          objectives: [],
          variables: [],
          specialConsiderations: []
        })
      })

      if (!response.ok) {
        throw new Error(`Error generating design draft: ${response.status}`)
      }

      const data = await response.json()
      console.log("Draft generation response:", data)

      if (data.experimentDesign && data.finalReport) {
        // Create a combined object for sections
        const designDraft: Record<string, string> = {}

        // Add all properties from finalReport
        if (data.finalReport.introduction)
          designDraft.introduction = data.finalReport.introduction
        if (data.finalReport.literatureSummary)
          designDraft.literatureSummary = data.finalReport.literatureSummary
        if (data.finalReport.dataInsights)
          designDraft.dataInsights = data.finalReport.dataInsights
        if (data.finalReport.hypothesis)
          designDraft.hypothesis = data.finalReport.hypothesis
        if (data.finalReport.designOfExperiments)
          designDraft.designOfExperiments = data.finalReport.designOfExperiments
        if (data.finalReport.statisticalAnalysis)
          designDraft.statisticalAnalysis = data.finalReport.statisticalAnalysis
        if (data.finalReport.recommendations)
          designDraft.recommendations = data.finalReport.recommendations

        // If no sections were added, add a default one
        if (Object.keys(designDraft).length === 0) {
          designDraft.content = "No content available"
        }

        console.log("Processed draft sections:", designDraft)
        console.log("Draft section keys:", Object.keys(designDraft))

        // Set the outline and section contents
        const outlineKeys = Object.keys(designDraft)
        setGeneratedOutline(outlineKeys)
        setSectionContents(designDraft)

        // Force a re-render by updating a state
        setActiveSection(0)

        // Create a design object with the generated data
        const designWithProblem: DesignWithProblem = {
          id: designData.problem || Date.now().toString(),
          user_id: "",
          name: problem,
          description: description,
          sharing: "private",
          created_at: new Date().toISOString(),
          updated_at: null,
          folder_id: null,
          problem: problem,
          objectives: null,
          special_considerations: null,
          variables: null
        } as DesignWithProblem

        setSelectedDesign(designWithProblem)
        setLocalDesign(designWithProblem)
      } else {
        console.error("Invalid data structure received:", data)
        throw new Error("No design data received")
      }
    } catch (error) {
      console.error("Error generating draft:", error)

      // Set some default sections if generation fails
      const defaultSections = {
        introduction: "Content is being generated...",
        methodology: "Content is being generated...",
        results: "Content is being generated...",
        conclusion: "Content is being generated..."
      }
      setGeneratedOutline(Object.keys(defaultSections))
      setSectionContents(defaultSections)
    } finally {
      setLoading(false)
      setContentLoading(false)
    }
  }

  const handleEdit = () => {
    console.log("Edit button clicked, setting isEditing to true")
    console.log("Current active section:", generatedOutline[activeSection])
    console.log(
      "Current section content:",
      sectionContents[generatedOutline[activeSection]]
    )

    setIsEditing(true)
    setEditedContent(sectionContents[generatedOutline[activeSection]] || "")
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent("")
  }

  const handleSave = () => {
    console.log("Save button clicked, saving edited content")
    console.log("Section being updated:", generatedOutline[activeSection])
    console.log("New content:", editedContent)

    // console.log("Saving section:", generatedOutline[activeSection], "with content:", editedContent)
    setSectionContents(prev => ({
      ...prev,
      [generatedOutline[activeSection]]: editedContent
    }))

    console.log("Updated section contents:", sectionContents)
    setIsEditing(false)
    setEditedContent("")
  }

  const handleRegenerateSection = async () => {
    if (!selectedDesign) return

    try {
      setRegenerateLoading(true)
      const currentSectionName = generatedOutline[activeSection]
      const currentContent = sectionContents[currentSectionName]

      if (!currentSectionName || !currentContent || !question) {
        console.error("Missing required fields for regeneration")
        return
      }

      const response = await fetch("/api/design/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: designData.problem,
          sectionName: currentSectionName,
          currentContent: currentContent,
          userFeedback: question
        })
      })

      const result = await response.json()
      if (result.success) {
        setSectionContents(prev => ({
          ...prev,
          [currentSectionName]: result.regeneratedContent
        }))
      }
    } catch (error) {
      console.error("Error regenerating content:", error)
    } finally {
      setQuestion("")
      setRegenerateLoading(false)
    }
  }

  const toggleQuestionSection = () => {
    setIsQuestionSectionVisible(!isQuestionSectionVisible)
  }

  const handleDownload = () => {
    setLoading(true)
    let pptx = new PptxGenJS()

    // Create intro slide
    getIntroSlide(pptx, "Design Document")

    // Iterate through all sections and create content slides
    generatedOutline.forEach(section => {
      const content = sectionContents[section] || ""
      const title =
        outlineMapping[section] || section.replace(/([A-Z])/g, " $1").trim()

      getContentSlide(pptx, title, content)
    })

    pptx.writeFile({ fileName: "Design Document.pptx" }).then(() => {
      setLoading(false)
    })
  }

  // Add a useEffect to log and handle state changes
  useEffect(() => {
    console.log("Generated outline changed:", generatedOutline)
    console.log("Section contents changed:", sectionContents)
    console.log("Selected design state:", selectedDesign)
    console.log("Local design state:", localDesign)

    if (
      generatedOutline.length > 0 &&
      Object.keys(sectionContents).length > 0
    ) {
      console.log("Content is available, setting active section to 0")
      setActiveSection(0)

      // If we have content but no design, create a fallback design
      if (!selectedDesign && !localDesign) {
        console.log(
          "Creating fallback design because content exists but no design is selected"
        )
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
          objectives: null,
          special_considerations: null,
          variables: null
        } as DesignWithProblem
        setSelectedDesign(fallbackDesign)
        setLocalDesign(fallbackDesign)
      }
    }
  }, [
    generatedOutline,
    sectionContents,
    selectedDesign,
    localDesign,
    designData.problem,
    profile
  ])

  // Calculate search progress based on available results
  useEffect(() => {
    if (designData.literatureFindings?.searchResults) {
      const { sources } = designData.literatureFindings.searchResults
      const totalSources = 4
      const sourcesWithResults = [
        sources?.pubmed?.length > 0,
        sources?.arxiv?.length > 0,
        sources?.scholar?.length > 0,
        sources?.semanticScholar?.length > 0
      ].filter(Boolean).length

      setSearchProgress((sourcesWithResults / totalSources) * 100)
    }
  }, [designData.literatureFindings?.searchResults])

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "pubmed":
        return <Database className="size-4" />
      case "arxiv":
        return <FileText className="size-4" />
      case "scholar":
        return <Globe className="size-4" />
      case "semantic_scholar":
        return <BarChart3 className="size-4" />
      case "tavily":
        return <Search className="size-4" />
      default:
        return <BookOpen className="size-4" />
    }
  }

  const getSourceColor = (source: string) => {
    switch (source) {
      case "pubmed":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "arxiv":
        return "bg-green-100 text-green-800 border-green-200"
      case "scholar":
        return "bg-purple-100 text-purple-800 border-purple-200"
      case "semantic_scholar":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "tavily":
        return "bg-teal-100 text-teal-800 border-teal-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const formatSourceName = (source: string) => {
    switch (source) {
      case "pubmed":
        return "PubMed"
      case "arxiv":
        return "ArXiv"
      case "scholar":
        return "Google Scholar"
      case "semantic_scholar":
        return "Semantic Scholar"
      case "tavily":
        return "Tavily"
      default:
        return source
    }
  }

  const handleApprove = () => {
    toast.success("Design approved successfully!")
    onApprove?.()
  }

  const handleRegenerate = () => {
    if (!feedback.trim()) {
      toast.error("Please provide feedback for regeneration")
      return
    }

    toast.info("Regenerating design with your feedback...")
    onRegenerate?.(feedback)
    setFeedback("")
  }

  const renderSearchResults = () => {
    const searchResults = designData.literatureFindings?.searchResults

    if (!searchResults) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="size-5" />
              Literature Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              No comprehensive search results available.
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="size-5" />
              Multi-Source Literature Search
            </div>
            <Badge variant="secondary" className="text-sm">
              {searchResults.totalResults} papers found
            </Badge>
          </CardTitle>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Search Progress</span>
              <span>{Math.round(searchProgress)}% complete</span>
            </div>
            <Progress value={searchProgress} className="h-2" />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={selectedSource}
            onValueChange={setSelectedSource}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="pubmed" className="text-xs">
                PubMed ({searchResults.sources.pubmed.length})
              </TabsTrigger>
              <TabsTrigger value="arxiv" className="text-xs">
                ArXiv ({searchResults.sources.arxiv.length})
              </TabsTrigger>
              <TabsTrigger value="scholar" className="text-xs">
                Scholar ({searchResults.sources.scholar.length})
              </TabsTrigger>
              <TabsTrigger value="semanticScholar" className="text-xs">
                S. Scholar ({searchResults.sources.semanticScholar.length})
              </TabsTrigger>
              <TabsTrigger value="tavily" className="text-xs">
                Tavily ({searchResults.sources.tavily.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TrendingUp className="size-4" />
                      Key Methodologies
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {searchResults.synthesizedFindings.keyMethodologies
                        .slice(0, 5)
                        .map((method, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700"
                          >
                            <span className="mt-1 text-blue-500">•</span>
                            {method}
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="size-4" />
                      Common Pitfalls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {searchResults.synthesizedFindings.commonPitfalls
                        .slice(0, 5)
                        .map((pitfall, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700"
                          >
                            <span className="mt-1 text-red-500">•</span>
                            {pitfall}
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="size-4" />
                      Recommended Approaches
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {searchResults.synthesizedFindings.recommendedApproaches
                        .slice(0, 5)
                        .map((approach, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700"
                          >
                            <span className="mt-1 text-green-500">•</span>
                            {approach}
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <BookOpen className="size-4" />
                      Novel Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {searchResults.synthesizedFindings.novelInsights
                        .slice(0, 5)
                        .map((insight, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700"
                          >
                            <span className="mt-1 text-purple-500">•</span>
                            {insight}
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {(
              [
                "pubmed",
                "arxiv",
                "scholar",
                "semanticScholar",
                "tavily"
              ] as const
            ).map(source => (
              <TabsContent key={source} value={source} className="space-y-3">
                <div className="mb-4 flex items-center gap-2">
                  {getSourceIcon(source)}
                  <h3 className="font-semibold">
                    {formatSourceName(source)} Results
                  </h3>
                  <Badge className={getSourceColor(source)}>
                    {searchResults.sources[source].length} papers
                  </Badge>
                </div>

                {searchResults.sources[source].length === 0 ? (
                  <p className="py-8 text-center text-gray-500">
                    No results found from this source
                  </p>
                ) : (
                  <div className="space-y-3">
                    {searchResults.sources[source]
                      .slice(0, 10)
                      .map((paper, idx) => (
                        <Card
                          key={idx}
                          className="border-l-4 border-l-blue-500"
                        >
                          <CardContent className="pt-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-4">
                                <h4 className="text-sm font-medium leading-tight">
                                  {paper.title}
                                </h4>
                                <div className="flex gap-2">
                                  <Badge
                                    className={getSourceColor(paper.source)}
                                    variant="outline"
                                  >
                                    {formatSourceName(paper.source)}
                                  </Badge>
                                  {paper.relevanceScore && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {(paper.relevanceScore * 100).toFixed(0)}%
                                      relevant
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1 text-xs text-gray-600">
                                {paper.authors.length > 0 && (
                                  <p>
                                    <strong>Authors:</strong>{" "}
                                    {paper.authors.slice(0, 3).join(", ")}
                                    {paper.authors.length > 3 ? " et al." : ""}
                                  </p>
                                )}
                                <p>
                                  <strong>Year:</strong> {paper.publishedDate}{" "}
                                  {paper.journal && (
                                    <span>
                                      • <strong>Journal:</strong>{" "}
                                      {paper.journal}
                                    </span>
                                  )}
                                </p>
                                {paper.citationCount && (
                                  <p>
                                    <strong>Citations:</strong>{" "}
                                    {paper.citationCount}
                                  </p>
                                )}
                              </div>

                              <p className="text-xs leading-relaxed text-gray-700">
                                {paper.abstract.length > 300
                                  ? `${paper.abstract.substring(0, 300)}...`
                                  : paper.abstract}
                              </p>

                              <div className="flex items-center gap-2 pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    window.open(paper.url, "_blank")
                                  }
                                >
                                  <ExternalLink className="mr-1 size-3" />
                                  View{" "}
                                  {source === "tavily" ? "Article" : "Paper"}
                                </Button>
                                {paper.doi && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() =>
                                      window.open(
                                        `https://doi.org/${paper.doi}`,
                                        "_blank"
                                      )
                                    }
                                  >
                                    DOI
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    )
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
          <p className="leading-relaxed text-gray-600">
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
          <p className="leading-relaxed text-gray-600">
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
    <div className="scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400 mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Experiment Design Review</h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Problem Statement */}
      <Card>
        <CardHeader>
          <CardTitle>Research Problem</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700">
            {designData.problem || "No problem statement available"}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <h4 className="mb-2 font-medium">Objectives</h4>
              <ul className="space-y-1">
                {(designData.objectives || []).map((obj, idx) => (
                  <li key={idx} className="text-sm text-gray-600">
                    • {obj}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-medium">Variables</h4>
              <ul className="space-y-1">
                {(designData.variables || []).map((variable, idx) => (
                  <li key={idx} className="text-sm text-gray-600">
                    • {variable}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-medium">Special Considerations</h4>
              <ul className="space-y-1">
                {(designData.specialConsiderations || []).map(
                  (consideration, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      • {consideration}
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Source Literature Search Results */}
      {renderSearchResults()}

      {/* Traditional Literature Findings */}
      {(designData.literatureFindings?.papers || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Additional Literature Analysis
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setExpandedSections(prev => ({
                    ...prev,
                    literature: !prev.literature
                  }))
                }
              >
                {expandedSections.literature ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </CardTitle>
          </CardHeader>
          {expandedSections.literature && (
            <CardContent>
              <div className="space-y-4">
                {(designData.literatureFindings?.papers || []).map(
                  (paper, idx) => (
                    <div key={idx} className="rounded-lg border p-4">
                      <h4 className="mb-2 font-medium">{paper.title}</h4>
                      <p className="mb-2 text-sm text-gray-600">
                        {paper.summary}
                      </p>
                      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                        <div>
                          <strong>Relevance:</strong> {paper.relevance}
                        </div>
                        <div>
                          <strong>Methodology:</strong> {paper.methodology}
                        </div>
                      </div>
                      {(paper.pitfalls || []).length > 0 && (
                        <div className="mt-2">
                          <strong className="text-sm">
                            Potential Pitfalls:
                          </strong>
                          <ul className="mt-1 space-y-1">
                            {(paper.pitfalls || []).map(
                              (pitfall, pitfallIdx) => (
                                <li
                                  key={pitfallIdx}
                                  className="text-sm text-red-600"
                                >
                                  • {pitfall}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Data Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Data Analysis Insights
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedSections(prev => ({
                  ...prev,
                  dataAnalysis: !prev.dataAnalysis
                }))
              }
            >
              {expandedSections.dataAnalysis ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </CardTitle>
        </CardHeader>
        {expandedSections.dataAnalysis && (
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-3 font-medium">Key Findings</h4>
                <ul className="space-y-2">
                  {(designData.dataAnalysis?.keyFindings || []).map(
                    (finding, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {finding}
                      </li>
                    )
                  )}
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-medium">Correlations</h4>
                <ul className="space-y-2">
                  {(designData.dataAnalysis?.correlations || []).map(
                    (correlation, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {correlation}
                      </li>
                    )
                  )}
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-medium">Outliers</h4>
                <ul className="space-y-2">
                  {(designData.dataAnalysis?.outliers || []).map(
                    (outlier, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {outlier}
                      </li>
                    )
                  )}
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-medium">Key Metrics</h4>
                <ul className="space-y-2">
                  {(designData.dataAnalysis?.metrics || []).map(
                    (metric, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {metric}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Experiment Design */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Proposed Experiment Design
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedSections(prev => ({
                  ...prev,
                  experimentDesign: !prev.experimentDesign
                }))
              }
            >
              {expandedSections.experimentDesign ? (
                <ChevronUp />
              ) : (
                <ChevronDown />
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        {expandedSections.experimentDesign && (
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="mb-3 font-medium">Hypothesis</h4>
                <p className="rounded-lg bg-blue-50 p-4 text-gray-700">
                  {designData.experimentDesign?.hypothesis ||
                    "No hypothesis specified"}
                </p>
              </div>

              <div>
                <h4 className="mb-3 font-medium">Experimental Factors</h4>
                <div className="grid gap-4">
                  {(designData.experimentDesign?.factors || []).map(
                    (factor, idx) => (
                      <div key={idx} className="rounded-lg border p-4">
                        <h5 className="font-medium">{factor.name}</h5>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(factor.levels || []).map((level, levelIdx) => (
                            <Badge key={levelIdx} variant="outline">
                              {level}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-medium">Randomization Strategy</h4>
                <p className="text-gray-700">
                  {designData.experimentDesign?.randomization ||
                    "No randomization strategy specified"}
                </p>
              </div>

              <div>
                <h4 className="mb-3 font-medium">Statistical Analysis Plan</h4>
                <div className="space-y-2">
                  <div>
                    <strong>Methods:</strong>
                    <ul className="mt-1 space-y-1">
                      {(
                        designData.experimentDesign?.statisticalPlan?.methods ||
                        []
                      ).map((method, idx) => (
                        <li key={idx} className="text-sm text-gray-700">
                          • {method}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Significance Level:</strong>
                    <span className="ml-2 text-gray-700">
                      {designData.experimentDesign?.statisticalPlan
                        ?.significance || "Not specified"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Final Report Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Executive Summary
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedSections(prev => ({
                  ...prev,
                  finalReport: !prev.finalReport
                }))
              }
            >
              {expandedSections.finalReport ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </CardTitle>
        </CardHeader>
        {expandedSections.finalReport && (
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-medium">Introduction</h4>
                <p className="text-sm text-gray-700">
                  {designData.finalReport?.introduction ||
                    "No introduction available"}
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Literature Summary</h4>
                <p className="text-sm text-gray-700">
                  {designData.finalReport?.literatureSummary ||
                    "No literature summary available"}
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Data Insights</h4>
                <p className="text-sm text-gray-700">
                  {designData.finalReport?.dataInsights ||
                    "No data insights available"}
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Recommendations</h4>
                <p className="text-sm text-gray-700">
                  {designData.finalReport?.recommendations ||
                    "No recommendations available"}
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="feedback"
                className="mb-2 block text-sm font-medium"
              >
                Feedback for Regeneration (optional)
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Provide specific feedback about what should be changed or improved..."
                className="min-h-[100px] w-full resize-y rounded-lg border border-gray-300 p-3"
              />
            </div>

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
                onClick={handleRegenerate}
                className="flex-1"
                disabled={isRegenerating}
              >
                {isRegenerating
                  ? "Regenerating..."
                  : "Regenerate with Feedback"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
