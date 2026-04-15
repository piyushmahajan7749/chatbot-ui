"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AccentTabs } from "@/components/canvas/accent-tabs"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import {
  IconArrowLeft,
  IconBook,
  IconBulb,
  IconClipboardText,
  IconClock,
  IconTargetArrow
} from "@tabler/icons-react"
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
  const [activeTab, setActiveTab] = useState("problem")

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
        router.push(`/${locale}/${workspaceId}/projects`)
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
              onClick={() => {
                const projectId = design?.project_id
                router.push(
                  projectId
                    ? `/${locale}/${workspaceId}/projects/${projectId}`
                    : `/${locale}/${workspaceId}/projects`
                )
              }}
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

      {/* Sub-tabs — JourneyMaker pattern applied to a Design */}
      <AccentTabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            key: "problem",
            label: "Problem",
            accent: "teal-journey",
            icon: <IconTargetArrow size={14} />
          },
          {
            key: "literature",
            label: "Literature",
            accent: "orange-product",
            icon: <IconBook size={14} />
          },
          {
            key: "hypotheses",
            label: "Hypotheses",
            accent: "purple-persona",
            icon: <IconBulb size={14} />
          },
          {
            key: "final",
            label: "Final Design",
            accent: "sage-brand",
            icon: <IconClipboardText size={14} />
          }
        ]}
      />

      {/* Content */}
      <div className="mx-auto max-w-4xl p-6">
        {/* Problem tab */}
        {activeTab === "problem" && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-teal-journey text-lg">
                Research Problem
              </CardTitle>
            </CardHeader>
            <CardContent>
              {design.description ? (
                <p className="text-ink-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {design.description}
                </p>
              ) : (
                <p className="text-ink-400 text-sm">
                  No problem statement yet. Open the editor to define the
                  research question this design addresses.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Hypotheses tab */}
        {activeTab === "hypotheses" &&
          (parsedContent?.selectedHypothesis ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-purple-persona text-lg">
                  Selected Hypothesis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-ink-700 text-sm leading-relaxed">
                  {parsedContent.selectedHypothesis.content}
                </p>
                {parsedContent.selectedHypothesis.explanation && (
                  <p className="text-ink-500 mt-3 text-sm">
                    {parsedContent.selectedHypothesis.explanation}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="border-purple-persona/30 bg-purple-persona-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
              No hypothesis selected yet. Generate hypotheses from the editor.
            </div>
          ))}

        {/* Literature tab */}
        {activeTab === "literature" &&
          (parsedContent?.generatedLiteratureSummary ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-orange-product text-lg">
                  Literature Summary
                </CardTitle>
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
                        <h4 className="text-ink-700 mb-1 text-sm font-medium">
                          {title}
                        </h4>
                        <p className="text-ink-500 whitespace-pre-wrap text-sm">
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
          ) : (
            <div className="border-orange-product/30 bg-orange-product-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
              No literature summary yet. Generate one from the editor.
            </div>
          ))}

        {/* Final Design tab — experiment design + execution plan + stat review */}
        {activeTab === "final" && (
          <div className="space-y-6">
            {!parsedContent?.generatedDesign?.experimentDesign &&
              !parsedContent?.generatedDesign?.executionPlan &&
              !parsedContent?.generatedStatReview && (
                <div className="border-sage-brand/30 bg-sage-brand-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
                  No final design yet. Run the design generator from the editor
                  to populate this tab.
                </div>
              )}

            {/* Experiment Design */}
            {parsedContent?.generatedDesign?.experimentDesign && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-sage-brand text-lg">
                    Experiment Design
                  </CardTitle>
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
                        <h4 className="text-ink-700 mb-1 text-sm font-medium">
                          {title}
                        </h4>
                        <p className="text-ink-500 whitespace-pre-wrap text-sm">
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
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-sage-brand text-lg">
                    Execution Plan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(
                    parsedContent.generatedDesign.executionPlan
                  ).map(([key, value]) => {
                    const title = key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (s: string) => s.toUpperCase())
                    return (
                      <div key={key}>
                        <h4 className="text-ink-700 mb-1 text-sm font-medium">
                          {title}
                        </h4>
                        <p className="text-ink-500 whitespace-pre-wrap text-sm">
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

            {/* Statistical Review */}
            {parsedContent?.generatedStatReview && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-sage-brand text-lg">
                    Statistical Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {parsedContent.generatedStatReview.whatLooksGood && (
                    <div>
                      <h4 className="mb-1 text-sm font-medium text-emerald-700">
                        What Looks Good
                      </h4>
                      <p className="text-ink-500 whitespace-pre-wrap text-sm">
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
                      <ul className="text-ink-500 list-disc space-y-1 pl-5 text-sm">
                        {parsedContent.generatedStatReview.problemsOrRisks.map(
                          (item: string, i: number) => (
                            <li key={i}>{item}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                  {parsedContent.generatedStatReview.suggestedImprovements
                    ?.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-sm font-medium text-blue-700">
                        Suggested Improvements
                      </h4>
                      <ul className="text-ink-500 list-disc space-y-1 pl-5 text-sm">
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
                      <h4 className="text-ink-700 mb-1 text-sm font-medium">
                        Overall Assessment
                      </h4>
                      <p className="text-ink-500 whitespace-pre-wrap text-sm">
                        {parsedContent.generatedStatReview.overallAssessment}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
