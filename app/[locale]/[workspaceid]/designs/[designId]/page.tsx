"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import { IconArrowLeft, IconClock, IconFlask } from "@tabler/icons-react"
import { ExternalLink, Download } from "lucide-react"

interface DesignContent {
  generatedDesign?: any
  generatedLiteratureSummary?: any
  generatedStatReview?: any
  selectedHypothesis?: {
    content: string
    explanation?: string
  }
}

export default function DesignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  const designId = params.designId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [design, setDesign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [parsedContent, setParsedContent] = useState<DesignContent | null>(null)

  useEffect(() => {
    if (designId) fetchDesign()
  }, [designId])

  const fetchDesign = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/design/${designId}`)
      if (!response.ok) {
        toast({
          title: "Not found",
          description: "Design not found.",
          variant: "destructive"
        })
        router.push(`/${locale}/${workspaceId}/designs`)
        return
      }
      const data = await response.json()
      setDesign(data)

      // Parse saved content
      if (data.content) {
        try {
          const parsed =
            typeof data.content === "string"
              ? JSON.parse(data.content)
              : data.content
          setParsedContent(parsed)
        } catch {
          setParsedContent(null)
        }
      }
    } catch (error) {
      console.error("Error fetching design:", error)
      toast({
        title: "Error",
        description: "Failed to load design.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const getTimeAgo = (date: string): string => {
    if (!date) return ""
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }

  const handleOpenEditor = () => {
    router.push(`/${locale}/${workspaceId}/design/${designId}`)
  }

  const handleDownload = () => {
    if (!design) return
    const sections: string[] = []
    sections.push(`# ${design.name || "Untitled Design"}\n`)
    if (design.description) sections.push(`${design.description}\n`)

    if (parsedContent?.selectedHypothesis) {
      sections.push(
        `## Hypothesis\n${parsedContent.selectedHypothesis.content}`
      )
      if (parsedContent.selectedHypothesis.explanation) {
        sections.push(`\n${parsedContent.selectedHypothesis.explanation}`)
      }
    }

    if (parsedContent?.generatedDesign) {
      const d = parsedContent.generatedDesign
      if (d.experimentDesign) {
        sections.push(`\n## Experiment Design`)
        for (const [key, value] of Object.entries(d.experimentDesign)) {
          const title = key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s: string) => s.toUpperCase())
          sections.push(
            `\n### ${title}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`
          )
        }
      }
      if (d.executionPlan) {
        sections.push(`\n## Execution Plan`)
        for (const [key, value] of Object.entries(d.executionPlan)) {
          const title = key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s: string) => s.toUpperCase())
          sections.push(
            `\n### ${title}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`
          )
        }
      }
    }

    if (parsedContent?.generatedStatReview) {
      const sr = parsedContent.generatedStatReview
      sections.push(`\n## Statistical Review`)
      if (sr.whatLooksGood)
        sections.push(`\n### What Looks Good\n${sr.whatLooksGood}`)
      if (sr.overallAssessment)
        sections.push(`\n### Overall Assessment\n${sr.overallAssessment}`)
    }

    const blob = new Blob([sections.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${design.name || "design"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
      </div>
    )
  }

  if (!design) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <p className="text-slate-500">Design not found</p>
      </div>
    )
  }

  const hasGeneratedContent = !!parsedContent?.generatedDesign

  return (
    <div className="h-full overflow-auto bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${locale}/${workspaceId}/designs`)}
              className="gap-1 text-slate-600"
            >
              <IconArrowLeft size={16} />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {design.name || "Untitled Design"}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <IconClock size={14} />
                  Created {getTimeAgo(design.created_at)}
                </span>
                {design.updated_at &&
                  design.updated_at !== design.created_at && (
                    <span>Updated {getTimeAgo(design.updated_at)}</span>
                  )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasGeneratedContent && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleDownload}
              >
                <Download className="size-4" />
                Download
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2 bg-teal-600 hover:bg-teal-700"
              onClick={handleOpenEditor}
            >
              <ExternalLink className="size-4" />
              {hasGeneratedContent ? "Open in Editor" : "Generate Design"}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl p-6">
        {design.description && (
          <p className="mb-6 text-slate-600">{design.description}</p>
        )}

        {/* Hypothesis */}
        {parsedContent?.selectedHypothesis && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Selected Hypothesis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-slate-700">
                {parsedContent.selectedHypothesis.content}
              </p>
              {parsedContent.selectedHypothesis.explanation && (
                <p className="mt-3 text-sm text-slate-500">
                  {parsedContent.selectedHypothesis.explanation}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Experiment Design */}
        {parsedContent?.generatedDesign?.experimentDesign && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Experiment Design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(
                parsedContent.generatedDesign.experimentDesign
              ).map(([key, value]) => {
                const title = key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (s: string) => s.toUpperCase())
                return (
                  <div key={key}>
                    <h4 className="mb-1 text-sm font-medium text-slate-700">
                      {title}
                    </h4>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">
                      {typeof value === "string"
                        ? value
                        : JSON.stringify(value, null, 2)}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Execution Plan */}
        {parsedContent?.generatedDesign?.executionPlan && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Execution Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(parsedContent.generatedDesign.executionPlan).map(
                ([key, value]) => {
                  const title = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s: string) => s.toUpperCase())
                  return (
                    <div key={key}>
                      <h4 className="mb-1 text-sm font-medium text-slate-700">
                        {title}
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-slate-600">
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value, null, 2)}
                      </p>
                    </div>
                  )
                }
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistical Review */}
        {parsedContent?.generatedStatReview && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Statistical Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {parsedContent.generatedStatReview.whatLooksGood && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-emerald-700">
                    What Looks Good
                  </h4>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">
                    {parsedContent.generatedStatReview.whatLooksGood}
                  </p>
                </div>
              )}
              {parsedContent.generatedStatReview.problemsOrRisks?.length >
                0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-amber-700">
                    Problems or Risks
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {parsedContent.generatedStatReview.problemsOrRisks.map(
                      (item: string, i: number) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {parsedContent.generatedStatReview.suggestedImprovements?.length >
                0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-blue-700">
                    Suggested Improvements
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {parsedContent.generatedStatReview.suggestedImprovements.map(
                      (item: string, i: number) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {parsedContent.generatedStatReview.overallAssessment && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-700">
                    Overall Assessment
                  </h4>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">
                    {parsedContent.generatedStatReview.overallAssessment}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Literature Summary */}
        {parsedContent?.generatedLiteratureSummary && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Literature Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(parsedContent.generatedLiteratureSummary).map(
                ([key, value]) => {
                  if (key === "citations") return null
                  const title = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s: string) => s.toUpperCase())
                  return (
                    <div key={key}>
                      <h4 className="mb-1 text-sm font-medium text-slate-700">
                        {title}
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-slate-600">
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value, null, 2)}
                      </p>
                    </div>
                  )
                }
              )}
            </CardContent>
          </Card>
        )}

        {/* No content message */}
        {!hasGeneratedContent && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-amber-50 p-4">
              <IconFlask size={32} className="text-amber-400" />
            </div>
            <p className="font-medium text-slate-600">
              Design not yet generated
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Open the editor to generate hypotheses and create your experiment
              design.
            </p>
            <Button
              className="mt-4 gap-2 bg-teal-600 hover:bg-teal-700"
              onClick={handleOpenEditor}
            >
              <ExternalLink className="size-4" />
              Generate Design
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
