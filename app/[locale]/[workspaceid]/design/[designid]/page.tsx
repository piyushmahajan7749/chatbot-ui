"use client"

import { useEffect, useState, useCallback } from "react"
import { DesignReview } from "../components/design-review"
import { DesignProgress } from "@/components/ui/design-progress"
import { toast } from "sonner"

// Flag to switch between mock and real API for testing
const USE_MOCK_API = false // Set to false to use real API

interface DesignData {
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
    searchResults?: any
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

export default function DesignIDPage({
  params
}: {
  params: { designid: string }
}) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [designData, setDesignData] = useState<DesignData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dataSource, setDataSource] = useState<"generated" | "database" | null>(
    null
  )
  const [hasCheckedStatus, setHasCheckedStatus] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Function to fetch existing design from the database
  const fetchExistingDesign = useCallback(async () => {
    try {
      console.log("📋 [DESIGN_PAGE] Fetching existing design from database...")
      setIsLoading(true)
      setDataSource("database")

      // In a real implementation, you would fetch the design from your database
      // For now, we'll create a mock design that represents what would be loaded
      // Replace this with actual database call to get design by ID

      const mockExistingDesign = {
        problem: `Existing research problem for design ${params.designid}`,
        objectives: ["Database objective 1", "Database objective 2"],
        variables: ["Database variable 1", "Database variable 2"],
        specialConsiderations: ["Database consideration 1"],
        literatureFindings: {
          papers: [
            {
              title: "Existing Paper from Database",
              summary: "This paper was previously loaded from database",
              relevance: "Previously analyzed relevance",
              methodology: "Database stored methodology",
              pitfalls: ["Known pitfall 1", "Known pitfall 2"]
            }
          ],
          searchResults: {
            totalResults: 0,
            sources: {
              pubmed: [],
              arxiv: [],
              scholar: [],
              semanticScholar: [],
              tavily: []
            },
            synthesizedFindings: {
              keyMethodologies: [],
              commonPitfalls: [],
              recommendedApproaches: [],
              novelInsights: []
            }
          },
          synthesizedInsights: {
            keyMethodologies: ["Methodology from database"],
            commonPitfalls: ["Pitfall from database"],
            recommendedApproaches: ["Approach from database"],
            novelInsights: ["Insight from database"]
          }
        },
        dataAnalysis: {
          correlations: ["Existing correlation analysis"],
          outliers: ["Existing outlier detection"],
          keyFindings: ["Previous key finding"],
          metrics: ["Stored metric analysis"]
        },
        experimentDesign: {
          hypothesis: "Previously formulated hypothesis from database",
          factors: [
            {
              name: "Existing factor 1",
              levels: ["Level A", "Level B", "Level C"]
            }
          ],
          randomization: "Previously defined randomization strategy",
          statisticalPlan: {
            methods: ["Existing statistical method"],
            significance: "0.05"
          }
        },
        finalReport: {
          introduction: "Previously generated introduction",
          literatureSummary: "Existing literature summary",
          dataInsights: "Previous data insights",
          hypothesis: "Stored hypothesis",
          designOfExperiments: "Existing DOE description",
          statisticalAnalysis: "Previous statistical analysis",
          recommendations: "Stored recommendations"
        }
      }

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      setDesignData(mockExistingDesign)
      setIsLoading(false)
      console.log(
        "✅ [DESIGN_PAGE] Successfully loaded existing design from database"
      )
    } catch (error) {
      console.error("❌ [DESIGN_PAGE] Error fetching design:", error)
      setIsLoading(false)
    }
  }, [params.designid])

  // Check design status and handle the generation flow - only run once
  useEffect(() => {
    if (hasCheckedStatus) {
      return // Prevent multiple checks
    }

    const checkDesignStatus = () => {
      try {
        console.log("🔍 [DESIGN_PAGE] Checking design status...")

        // Check if there's a design being generated
        const isGeneratingFlag = localStorage.getItem(
          `design_generating_${params.designid}`
        )
        const isCompleted = localStorage.getItem(
          `design_completed_${params.designid}`
        )
        const designDataString = localStorage.getItem(
          `design_data_${params.designid}`
        )

        if (isCompleted && designDataString) {
          // Design generation just completed, load the fresh data
          console.log(
            "✅ [DESIGN_PAGE] Design generation completed, loading fresh data..."
          )
          try {
            const parsedData = JSON.parse(designDataString)
            setDesignData(parsedData)
            setDataSource("generated")
            setIsGenerating(false)
            setIsLoading(false)

            // Clean up localStorage
            localStorage.removeItem(`design_completed_${params.designid}`)
            localStorage.removeItem(`design_data_${params.designid}`)
            localStorage.removeItem(`design_generating_${params.designid}`)

            console.log(
              "🧹 [DESIGN_PAGE] Cleaned up localStorage after loading generated design"
            )
          } catch (parseError) {
            console.error(
              "❌ [DESIGN_PAGE] Error parsing design data:",
              parseError
            )
            setIsGenerating(false)
            // Fall back to fetching existing design
            fetchExistingDesign()
          }
        } else if (isGeneratingFlag) {
          // Design is still being generated
          console.log(
            "🔄 [DESIGN_PAGE] Design still generating, showing progress..."
          )
          setIsGenerating(true)
          setIsLoading(false)
        } else {
          // This is an existing design, fetch it from database
          console.log(
            "📋 [DESIGN_PAGE] Loading existing design from database..."
          )
          setIsGenerating(false)
          fetchExistingDesign()
        }

        setHasCheckedStatus(true) // Mark that we've checked the status
      } catch (error) {
        console.error("❌ [DESIGN_PAGE] Error checking design status:", error)
        setIsGenerating(false)
        setHasCheckedStatus(true)
        fetchExistingDesign()
      }
    }

    // Initial check
    checkDesignStatus()
  }, [params.designid, hasCheckedStatus, fetchExistingDesign])

  // Separate effect for polling during generation - only when actively generating
  useEffect(() => {
    if (!isGenerating || hasCheckedStatus === false) {
      return // Don't poll if not generating or haven't checked status yet
    }

    const pollForCompletion = () => {
      const isCompleted = localStorage.getItem(
        `design_completed_${params.designid}`
      )
      const designDataString = localStorage.getItem(
        `design_data_${params.designid}`
      )

      if (isCompleted && designDataString) {
        console.log("✅ [DESIGN_PAGE] Generation completed during polling!")
        try {
          const parsedData = JSON.parse(designDataString)
          setDesignData(parsedData)
          setDataSource("generated")
          setIsGenerating(false)
          setIsLoading(false)

          // Clean up localStorage
          localStorage.removeItem(`design_completed_${params.designid}`)
          localStorage.removeItem(`design_data_${params.designid}`)
          localStorage.removeItem(`design_generating_${params.designid}`)
        } catch (parseError) {
          console.error(
            "❌ [DESIGN_PAGE] Error parsing design data during polling:",
            parseError
          )
          setIsGenerating(false)
          fetchExistingDesign()
        }
      }
    }

    const pollInterval = setInterval(pollForCompletion, 2000)

    // Cleanup after 5 minutes maximum
    const maxTimeout = setTimeout(() => {
      clearInterval(pollInterval)
      localStorage.removeItem(`design_generating_${params.designid}`)
      setIsGenerating(false)
      fetchExistingDesign()
      console.log(
        "⏰ [DESIGN_PAGE] Generation timeout, loading existing design"
      )
    }, 300000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(maxTimeout)
    }
  }, [isGenerating, params.designid, hasCheckedStatus, fetchExistingDesign])

  const handleGenerationComplete = () => {
    console.log("✅ [DESIGN_PAGE] Design generation completed!")
    setIsGenerating(false)
    localStorage.removeItem(`design_generating_${params.designid}`)
    // The polling effect will pick up the completed design data
  }

  // Debug effect to track state changes
  useEffect(() => {
    console.log("🔄 [DESIGN_PAGE] State update:", {
      isGenerating,
      isLoading,
      hasData: !!designData,
      dataSource,
      hasCheckedStatus
    })
  }, [isGenerating, isLoading, designData, dataSource, hasCheckedStatus])

  // Function to handle design regeneration
  const handleRegenerate = async (feedback: string) => {
    if (!designData || !feedback.trim()) {
      console.error("❌ [DESIGN_PAGE] Missing data for regeneration")
      toast.error("Please provide feedback for regeneration")
      return
    }

    try {
      setIsRegenerating(true)
      console.log(
        "🔄 [DESIGN_PAGE] Starting design regeneration with feedback:",
        feedback
      )
      toast.info(
        USE_MOCK_API
          ? "Regenerating design with your feedback (Mock Mode)..."
          : "Regenerating design with your feedback..."
      )

      const response = await fetch(
        USE_MOCK_API ? "/api/design/mock-regenerate" : "/api/design/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            designId: params.designid,
            feedback: feedback,
            currentDesign: designData
          })
        }
      )

      if (!response.ok) {
        throw new Error(`Regeneration failed: ${response.status}`)
      }

      const result = await response.json()
      console.log("✅ [DESIGN_PAGE] Regeneration completed:", result)

      if (result.success && result.design) {
        // Update the design data with the regenerated version
        setDesignData(result.design)
        setDataSource("generated")
        toast.success("Design successfully regenerated with your feedback!")
        console.log(
          "🔄 [DESIGN_PAGE] Design data updated with regenerated version"
        )
      } else {
        throw new Error(result.error || "Regeneration failed")
      }
    } catch (error) {
      console.error("❌ [DESIGN_PAGE] Regeneration error:", error)
      toast.error(
        `Failed to regenerate design: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    } finally {
      setIsRegenerating(false)
    }
  }

  // Show progress component while generating
  if (isGenerating) {
    console.log("🎨 [DESIGN_PAGE] Rendering progress component")
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Design Generation in Progress</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <DesignProgress
            isGenerating={isGenerating}
            onComplete={handleGenerationComplete}
          />
        </div>
      </div>
    )
  }

  // Show loading state while fetching existing design (but not if we're generating)
  if (isLoading && !isGenerating) {
    console.log("⏳ [DESIGN_PAGE] Rendering loading component")
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Loading Design</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="space-y-4 text-center">
            <div className="mx-auto size-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
            <p className="text-gray-600">Loading your design...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state if no design data is available
  if (!designData && !isLoading && !isGenerating) {
    console.log("❌ [DESIGN_PAGE] Rendering error component - no data")
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Design Not Found</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="space-y-4 text-center">
            <p className="text-gray-600">Could not load the design data.</p>
            <button
              onClick={() => {
                setHasCheckedStatus(false)
                setIsLoading(true)
              }}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show design review component when data is loaded
  if (designData && !isLoading && !isGenerating) {
    console.log("✅ [DESIGN_PAGE] Rendering design review component")
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Design Review</h1>
        </div>
        <div className="relative flex-1 overflow-hidden p-1 sm:p-2">
          <DesignReview
            designData={designData}
            onApprove={() => console.log("Design approved")}
            onRegenerate={handleRegenerate}
            isRegenerating={isRegenerating}
            skipApiCalls={true}
            dataSource={dataSource}
          />
        </div>
      </div>
    )
  }

  // Fallback loading state (should rarely be reached)
  console.log("🤔 [DESIGN_PAGE] Rendering fallback loading state")
  return (
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
      <div className="flex items-center justify-center border-b px-4 py-3">
        <h1 className="text-2xl font-bold">Loading...</h1>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="space-y-4 text-center">
          <div className="mx-auto size-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Please wait...</p>
        </div>
      </div>
    </div>
  )
}
