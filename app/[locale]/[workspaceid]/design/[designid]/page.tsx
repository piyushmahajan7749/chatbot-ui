"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DesignReview } from "../components/design-review"
import { DesignProgress } from "@/components/ui/design-progress"
import {
  DesignPlanMetadata,
  DesignPlanStatus,
  DesignPlanHypothesis
} from "@/types/design-plan"
import { toast } from "sonner"

interface DesignData {
  name?: string
  description?: string
  objectives?: string[]
  variables?: string[]
  specialConsiderations?: string[]
  reportWriterOutput?: any
  searchResults?: any
}

const planMetadataKey = (designId: string) => `design_plan_${designId}`
const planStatusKey = (designId: string) => `design_plan_status_${designId}`

export default function DesignIDPage({
  params
}: {
  params: { designid: string }
}) {
  const [designData, setDesignData] = useState<DesignData | null>(null)
  const [planMetadata, setPlanMetadata] = useState<DesignPlanMetadata | null>(
    null
  )
  const [planStatus, setPlanStatus] = useState<DesignPlanStatus | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)
  const [generatingHypothesisId, setGeneratingHypothesisId] = useState<
    string | null
  >(null)
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<
    string | null
  >(null)
  const [generatedDesign, setGeneratedDesign] = useState<any | null>(null)
  const [generatedLiteratureSummary, setGeneratedLiteratureSummary] = useState<
    any | null
  >(null)
  const [generatedStatReview, setGeneratedStatReview] = useState<any | null>(
    null
  )
  const [designError, setDesignError] = useState<string | null>(null)
  const [manualReportText, setManualReportText] = useState<string | null>(null)

  const loadDesignFromDatabase = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/design/${params.designid}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch design: ${response.status}`)
      }

      const designFromDb = await response.json()
      const base: DesignData = {
        name: designFromDb.name || `Design ${params.designid}`,
        description: designFromDb.description || "",
        objectives: designFromDb.objectives || [],
        variables: designFromDb.variables || [],
        specialConsiderations: designFromDb.special_considerations || []
      }

      if (designFromDb.content) {
        try {
          const parsed = JSON.parse(designFromDb.content)
          setDesignData({ ...base, ...parsed })
        } catch {
          setDesignData(base)
        }
      } else {
        setDesignData(base)
      }
    } catch (error: any) {
      console.error("❌ [DESIGN_PAGE] Error loading design:", error)
      setDesignData(null)
      toast.error(
        `Unable to load design: ${error?.message || "Unexpected error"}`
      )
    } finally {
      setIsLoading(false)
    }
  }, [params.designid])

  useEffect(() => {
    const storedMetadata = (() => {
      try {
        const value = localStorage.getItem(planMetadataKey(params.designid))
        return value ? (JSON.parse(value) as DesignPlanMetadata) : null
      } catch {
        localStorage.removeItem(planMetadataKey(params.designid))
        return null
      }
    })()

    const storedStatus = (() => {
      try {
        const value = localStorage.getItem(planStatusKey(params.designid))
        return value ? (JSON.parse(value) as DesignPlanStatus) : null
      } catch {
        localStorage.removeItem(planStatusKey(params.designid))
        return null
      }
    })()

    if (storedMetadata) {
      setPlanMetadata(storedMetadata)
      setIsGenerating(true)
      if (storedMetadata.request && !designData) {
        setDesignData({
          name: storedMetadata.request.title,
          description: storedMetadata.request.description,
          objectives: storedMetadata.request.constraints?.objectives || [],
          variables: storedMetadata.request.constraints?.variables || [],
          specialConsiderations:
            storedMetadata.request.constraints?.specialConsiderations || []
        })
      }
    }

    if (storedStatus) {
      setPlanStatus(storedStatus)
      if (storedStatus.status === "completed") {
        setIsGenerating(false)
      }
    }

    loadDesignFromDatabase()
  }, [params.designid, loadDesignFromDatabase])

  useEffect(() => {
    if (!planMetadata) {
      return
    }

    let isActive = true
    let timer: NodeJS.Timeout | null = null

    const pollStatus = async () => {
      try {
        const response = await fetch(planMetadata.statusUrl)
        if (!response.ok) {
          throw new Error(`Status poll failed: ${response.status}`)
        }

        const status = (await response.json()) as DesignPlanStatus
        if (!isActive) {
          return
        }

        setPlanStatus(status)
        localStorage.setItem(
          planStatusKey(params.designid),
          JSON.stringify(status)
        )
        setPlanError(null)

        if (status.status === "completed" || status.status === "failed") {
          setIsGenerating(false)
          localStorage.removeItem(planMetadataKey(params.designid))
          localStorage.removeItem(`design_generating_${params.designid}`)
          if (timer) {
            clearInterval(timer)
            timer = null
          }
          if (status.status === "completed") {
            toast.success("Design draft completed.")
          } else {
            toast.error("Design draft failed.")
          }
        }
      } catch (error: any) {
        console.error("❌ [DESIGN_PAGE] Poll error:", error)
        if (isActive) {
          setPlanError(error?.message || "Unable to fetch plan status")
        }
      }
    }

    pollStatus()
    timer = setInterval(pollStatus, 5000)

    return () => {
      isActive = false
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [planMetadata, params.designid])

  const latestHypotheses = useMemo(
    () => planStatus?.top_hypotheses || [],
    [planStatus?.top_hypotheses]
  )

  const selectedHypothesis = useMemo(() => {
    if (!selectedHypothesisId) return null
    return latestHypotheses.find(
      hypothesis => hypothesis.hypothesisId === selectedHypothesisId
    )
  }, [latestHypotheses, selectedHypothesisId])

  const logs = useMemo(() => planStatus?.logs || [], [planStatus?.logs])

  const reviewProblem = designData?.name || "Untitled Research Plan"

  const isDesignLoaded = !!designData

  useEffect(() => {
    setSelectedHypothesisId(null)
    setGeneratingHypothesisId(null)
    setGeneratedDesign(null)
    setGeneratedLiteratureSummary(null)
    setGeneratedStatReview(null)
    setDesignError(null)
    setManualReportText(null)
  }, [planStatus?.planId])

  const handleGenerateDesign = async (
    hypothesis: DesignPlanHypothesis,
    options?: { instructions?: string }
  ) => {
    if (!hypothesis?.hypothesisId) {
      return
    }

    if (!planStatus || planStatus.status !== "completed") {
      toast.error(
        "The research plan is still running. Please wait until it completes."
      )
      return
    }

    setSelectedHypothesisId(hypothesis.hypothesisId)
    setGeneratingHypothesisId(hypothesis.hypothesisId)
    setGeneratedDesign(null)
    setGeneratedLiteratureSummary(null)
    setGeneratedStatReview(null)
    setDesignError(null)

    try {
      const fetchOptions: RequestInit = { method: "POST" }
      if (options?.instructions) {
        fetchOptions.headers = { "Content-Type": "application/json" }
        fetchOptions.body = JSON.stringify({
          instructions: options.instructions
        })
      }

      const response = await fetch(
        `/api/design/draft/hypothesis/${hypothesis.hypothesisId}/design`,
        fetchOptions
      )

      const data = await response.json()

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            `Design generation failed with status ${response.status}`
        )
      }

      setGeneratedDesign(data.report)
      setGeneratedLiteratureSummary(
        data.literatureSummary || data.report?.literatureSummary || null
      )
      setGeneratedStatReview(
        data.statReview || data.report?.statisticalReview || null
      )
      setManualReportText(null)
      toast.success("Experiment design generated.")
    } catch (error: any) {
      console.error("❌ [DESIGN_PAGE] Design generation error:", error)
      const message = error?.message || "Failed to generate experiment design"
      setDesignError(message)
      toast.error(message)
    } finally {
      setGeneratingHypothesisId(null)
    }
  }

  const handleRegenerateSelected = useCallback(async () => {
    if (!selectedHypothesis) {
      toast.error("Select a hypothesis before regenerating.")
      return
    }
    await handleGenerateDesign(selectedHypothesis)
  }, [selectedHypothesis, handleGenerateDesign])

  const handleRegenerateWithPrompt = useCallback(
    async (prompt: string) => {
      if (!selectedHypothesis) {
        toast.error("Select a hypothesis before regenerating.")
        return
      }
      await handleGenerateDesign(selectedHypothesis, {
        instructions: prompt
      })
    },
    [selectedHypothesis, handleGenerateDesign]
  )

  const handleManualEditSave = useCallback(async (updatedText: string) => {
    setManualReportText(updatedText)
    toast.success("Custom edits saved locally.")
  }, [])

  if (isGenerating) {
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Design Generation in Progress</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <DesignProgress
            isGenerating
            status={planStatus?.status}
            progress={planStatus?.progress}
            logs={logs}
            error={planError}
          />
        </div>
      </div>
    )
  }

  if (isLoading && !isDesignLoaded) {
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-2xl font-bold">Loading Design</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="space-y-4 text-center">
            <div className="mx-auto size-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
            <p className="text-gray-600">Loading your design…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
      <div className="flex items-center justify-center border-b px-4 py-3">
        <h1 className="text-2xl font-bold">{reviewProblem}</h1>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <DesignReview
          designData={designData}
          planStatus={planStatus}
          topHypotheses={latestHypotheses}
          logs={logs}
          onGenerateDesign={handleGenerateDesign}
          generatingHypothesisId={generatingHypothesisId}
          selectedHypothesisId={selectedHypothesisId}
          generatedDesign={generatedDesign}
          generatedLiteratureSummary={generatedLiteratureSummary}
          generatedStatReview={generatedStatReview}
          designError={designError}
          manualReportText={manualReportText}
          onRegenerateDesign={handleRegenerateSelected}
          onRegenerateWithPrompt={handleRegenerateWithPrompt}
          onManualEdit={handleManualEditSave}
        />
      </div>
    </div>
  )
}
