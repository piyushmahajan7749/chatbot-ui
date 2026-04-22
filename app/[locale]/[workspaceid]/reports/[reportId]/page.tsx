"use client"

import { useEffect, useMemo, useRef, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AccentTabs, type TabStatus } from "@/components/canvas/accent-tabs"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import { ELNExportModal } from "@/components/eln/eln-export-modal"
import { ELNConnectModal } from "@/components/eln/eln-connect-modal"
import { ELNConnection } from "@/types/eln"
import { getELNConnections } from "@/db/eln-connections"
import { getReportById, updateReport } from "@/db/reports-firestore"
import { Tables } from "@/supabase/types"
import { toast as sonnerToast } from "sonner"
import {
  IconArrowLeft,
  IconClock,
  IconFileText,
  IconLayoutGrid,
  IconUpload
} from "@tabler/icons-react"
import { FlaskConical, Download, Copy, Maximize2 } from "lucide-react"
import {
  OverviewTab,
  type ReportTab
} from "@/components/reports/tabs/overview-tab"
import { InputsTab } from "@/components/reports/tabs/inputs-tab"
import { ReportTab as ReportTabView } from "@/components/reports/tabs/report-tab"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"

type Draft = Record<string, any>

type GenerationStatus = "idle" | "generating" | "ready" | "error"

function getGenerationStatus(report: any): GenerationStatus {
  const raw = report?.generation_status
  if (raw === "generating") return "generating"
  if (raw === "error") return "error"
  if (report?.report_draft) return "ready"
  if (raw === "ready") return "ready"
  return "idle"
}

function draftToText(draft: Draft | null): string {
  if (!draft) return ""
  return Object.entries(draft)
    .filter(([key, value]) => value && key !== "_chartData")
    .map(([key, value]) => {
      const title = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, s => s.toUpperCase())
      const text =
        typeof value === "string" ? value : JSON.stringify(value, null, 2)
      return `## ${title}\n\n${text}`
    })
    .join("\n\n")
}

export default function ReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  const reportId = params.reportId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ReportTab>("overview")

  const [objective, setObjective] = useState("")
  const [protocolFiles, setProtocolFiles] = useState<Tables<"files">[]>([])
  const [paperFiles, setPaperFiles] = useState<Tables<"files">[]>([])
  const [dataFiles, setDataFilesState] = useState<Tables<"files">[]>([])

  const [isGenerating, setIsGenerating] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [regeneratingChart, setRegeneratingChart] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const sectionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [elnConnections, setElnConnections] = useState<ELNConnection[]>([])
  const [showELNExportModal, setShowELNExportModal] = useState(false)
  const [showELNConnectModal, setShowELNConnectModal] = useState(false)
  const [loadingConnections, setLoadingConnections] = useState(false)

  const objectiveSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (reportId) void fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  useEffect(() => {
    const load = async () => {
      if (!profile?.user_id) return
      setLoadingConnections(true)
      try {
        const connections = await getELNConnections(profile.user_id)
        setElnConnections(connections)
      } catch (error) {
        console.error("Failed to load ELN connections:", error)
      } finally {
        setLoadingConnections(false)
      }
    }
    void load()
  }, [profile?.user_id])

  // Poll while generation is running so sublabels / tab content update.
  useEffect(() => {
    if (report?.generation_status !== "generating") return
    const interval = setInterval(() => {
      void fetchReport({ silent: true })
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.generation_status])

  const fetchReport = async ({ silent }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true)
      const data = await getReportById(reportId)
      if (!data) {
        toast({
          title: "Not found",
          description: "Report not found.",
          variant: "destructive"
        })
        router.push(`/${locale}/${workspaceId}/reports`)
        return
      }
      setReport(data)
      setObjective(data.description ?? "")
      setProtocolFiles(data.files?.protocol ?? [])
      setPaperFiles(data.files?.papers ?? [])
      setDataFilesState(data.files?.dataFiles ?? [])
    } catch (error) {
      console.error("Error fetching report:", error)
      toast({
        title: "Error",
        description: "Failed to load report.",
        variant: "destructive"
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const generationStatus = getGenerationStatus(report)
  const draft: Draft | null =
    report?.report_draft && typeof report.report_draft === "object"
      ? (report.report_draft as Draft)
      : null
  const hasDraft = !!draft
  const fileCount = protocolFiles.length + paperFiles.length + dataFiles.length

  const handleObjectiveChange = (value: string) => {
    setObjective(value)
    if (objectiveSaveTimer.current) clearTimeout(objectiveSaveTimer.current)
    objectiveSaveTimer.current = setTimeout(() => {
      updateReport(reportId, { description: value }).catch(err => {
        console.warn("Failed to save objective:", err)
      })
    }, 600)
  }

  const persistFiles = (next: {
    protocol: Tables<"files">[]
    papers: Tables<"files">[]
    dataFiles: Tables<"files">[]
  }) => {
    updateReport(reportId, { files: next }).catch(err => {
      console.warn("Failed to save files:", err)
    })
  }

  const handleToggleFile = (
    type: "protocol" | "papers" | "dataFiles",
    item: Tables<"files">
  ) => {
    if (type === "protocol") {
      const next = [item]
      setProtocolFiles(next)
      persistFiles({ protocol: next, papers: paperFiles, dataFiles })
      return
    }
    const current = type === "papers" ? paperFiles : dataFiles
    const setter = type === "papers" ? setPaperFiles : setDataFilesState
    const exists = current.some(f => f.id === item.id)
    const next = exists
      ? current.filter(f => f.id !== item.id)
      : [...current, item]
    setter(next)
    persistFiles({
      protocol: protocolFiles,
      papers: type === "papers" ? next : paperFiles,
      dataFiles: type === "dataFiles" ? next : dataFiles
    })
  }

  const handleGenerate = async () => {
    if (!objective.trim() || protocolFiles.length === 0) return
    setIsGenerating(true)
    const toastId = `report-generate-${reportId}`
    sonnerToast.loading("Generating report draft…", {
      id: toastId,
      duration: Infinity
    })
    try {
      await updateReport(reportId, {
        description: objective,
        files: {
          protocol: protocolFiles,
          papers: paperFiles,
          dataFiles
        },
        generation_status: "generating",
        generation_started_at: new Date().toISOString(),
        generation_error: null
      })
      setReport((prev: any) => ({
        ...prev,
        description: objective,
        generation_status: "generating"
      }))

      const response = await fetch("/api/report/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentObjective: objective,
          protocol: protocolFiles.map(f => f.id),
          papers: paperFiles.map(f => f.id),
          dataFiles: dataFiles.map(f => f.id)
        })
      })
      if (!response.ok) {
        throw new Error(`Generation failed (${response.status})`)
      }
      const data = await response.json()
      if (!data?.reportOutline || !data?.reportDraft) {
        throw new Error("Generation returned no output")
      }

      await updateReport(reportId, {
        report_outline: data.reportOutline,
        report_draft: data.reportDraft,
        chart_image: data.chartImage || null,
        chart_data: data.chartData || null,
        generation_status: "ready",
        generation_completed_at: new Date().toISOString(),
        generation_error: null
      })
      await fetchReport({ silent: true })

      sonnerToast.success("Report draft generated.", {
        id: toastId,
        duration: 5000
      })
      setActiveTab("report")
    } catch (error: any) {
      console.error("Report generation failed:", error)
      const message = error?.message || "Unknown error"
      await updateReport(reportId, {
        generation_status: "error",
        generation_error: message,
        generation_completed_at: new Date().toISOString()
      }).catch(() => {})
      await fetchReport({ silent: true })
      sonnerToast.error(`Report generation failed: ${message}`, {
        id: toastId,
        duration: 7000
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateSection = async (
    sectionKey: string,
    feedback: string
  ) => {
    if (!draft) return
    setRegeneratingKey(sectionKey)
    try {
      const response = await fetch("/api/report/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionName: sectionKey,
          currentContent: draft[sectionKey] ?? "",
          userFeedback: feedback
        })
      })
      if (!response.ok) {
        throw new Error(`Regeneration failed (${response.status})`)
      }
      const data = await response.json()
      const nextDraft = {
        ...draft,
        [sectionKey]: data.regeneratedContent ?? draft[sectionKey]
      }
      await updateReport(reportId, { report_draft: nextDraft })
      setReport((prev: any) => ({ ...prev, report_draft: nextDraft }))
      sonnerToast.success("Section regenerated.")
    } catch (error: any) {
      console.error("Section regenerate failed:", error)
      sonnerToast.error(
        `Regeneration failed: ${error?.message || "Unknown error"}`
      )
    } finally {
      setRegeneratingKey(null)
    }
  }

  const handleSectionContentChange = (sectionKey: string, value: string) => {
    const baseDraft = draft ?? {}
    const nextDraft = { ...baseDraft, [sectionKey]: value }
    setReport((prev: any) => ({ ...prev, report_draft: nextDraft }))
    if (sectionSaveTimer.current) clearTimeout(sectionSaveTimer.current)
    sectionSaveTimer.current = setTimeout(() => {
      updateReport(reportId, { report_draft: nextDraft }).catch(err => {
        console.warn("Failed to save section edit:", err)
      })
    }, 600)
  }

  const handleChartRegenerate = async (feedback: string) => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    setRegeneratingChart(true)
    try {
      const response = await fetch("/api/report/regenerate-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentChartData: report?.chart_data ?? null,
          userFeedback: trimmed
        })
      })
      if (!response.ok) {
        throw new Error(`Chart regeneration failed (${response.status})`)
      }
      const data = await response.json()
      await updateReport(reportId, {
        chart_image: data.chartImage || null,
        chart_data: data.chartData || null
      })
      setReport((prev: any) => ({
        ...prev,
        chart_image: data.chartImage || null,
        chart_data: data.chartData || null
      }))
      sonnerToast.success("Chart regenerated.")
    } catch (error: any) {
      console.error("Chart regenerate failed:", error)
      sonnerToast.error(
        `Chart regeneration failed: ${error?.message || "Unknown error"}`
      )
    } finally {
      setRegeneratingChart(false)
    }
  }

  const handleELNExport = () => {
    if (elnConnections.length === 0) setShowELNConnectModal(true)
    else setShowELNExportModal(true)
  }

  const handleConnectionCreated = (connection: ELNConnection) => {
    setElnConnections(prev => [...prev, connection])
    setShowELNExportModal(true)
  }

  const draftText = draftToText(draft)

  const handleDownload = () => {
    if (!report || !draftText) return
    const blob = new Blob([draftText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${report.name || "report"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    if (!draftText) return
    await navigator.clipboard.writeText(draftText)
    toast({
      title: "Copied",
      description: "Report copied to clipboard."
    })
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

  const tabDefs = useMemo(() => {
    const sublabelForContent = (keys: string[]) => {
      if (generationStatus === "generating") return "Generating…"
      if (!draft) return "Pending"
      return keys.some(k => draft[k]) ? "Ready" : "Empty"
    }

    return [
      {
        key: "overview",
        label: "Overview",
        sublabel: report?.name || "Untitled report",
        accent: "teal-journey" as const,
        icon: <IconLayoutGrid size={20} />,
        disabled: false,
        status: undefined as TabStatus | undefined,
        primary: true
      },
      {
        key: "inputs",
        label: "Inputs",
        sublabel: fileCount
          ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
          : "Add inputs",
        accent: "neutral" as const,
        icon: <IconUpload size={18} />,
        disabled: false,
        status: (protocolFiles.length > 0 && objective.trim()
          ? "review"
          : "active") as TabStatus
      },
      {
        key: "report",
        label: "Report",
        sublabel: sublabelForContent([
          "aim",
          "introduction",
          "principle",
          "material",
          "preparation",
          "procedure",
          "setup",
          "dataAnalysis",
          "results",
          "discussion",
          "conclusion",
          "nextSteps"
        ]),
        accent: "teal-journey" as const,
        icon: <IconFileText size={18} />,
        disabled: false,
        status: (draft &&
        (draft.aim ||
          draft.introduction ||
          draft.principle ||
          draft.material ||
          draft.preparation ||
          draft.procedure ||
          draft.setup ||
          draft.dataAnalysis ||
          draft.results ||
          draft.discussion ||
          draft.conclusion ||
          draft.nextSteps ||
          report?.chart_image)
          ? "review"
          : "active") as TabStatus
      }
    ]
  }, [
    report,
    draft,
    fileCount,
    generationStatus,
    protocolFiles.length,
    objective
  ])

  if (loading) {
    return (
      <div className="bg-ink-50 flex h-full items-center justify-center">
        <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="bg-ink-50 flex h-full items-center justify-center">
        <p className="text-ink-400">Report not found</p>
      </div>
    )
  }

  return (
    <div className="bg-ink-50 flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${locale}/${workspaceId}/reports`)}
              className="text-ink-500 gap-1"
            >
              <IconArrowLeft size={16} />
              Back
            </Button>
            <div>
              <div className="text-ink-400 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em]">
                <span>Report</span>
                {generationStatus === "generating" && (
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 normal-case tracking-normal text-amber-700">
                    Generating…
                  </span>
                )}
              </div>
              <h1 className="text-ink-900 text-xl font-bold">
                {report.name || "Untitled Report"}
              </h1>
              <div className="text-ink-500 mt-1 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1">
                  <IconClock size={14} />
                  Created {getTimeAgo(report.created_at)}
                </span>
                {report.updated_at &&
                  report.updated_at !== report.created_at && (
                    <span>Updated {getTimeAgo(report.updated_at)}</span>
                  )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasDraft && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownload}
                >
                  <Download className="size-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleCopy}
                >
                  <Copy className="size-4" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleELNExport}
                  disabled={loadingConnections}
                >
                  <FlaskConical className="size-4" />
                  Export to ELN
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <AccentTabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as ReportTab)}
        tabs={tabDefs}
      />

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-6">
          {activeTab === "overview" && (
            <OverviewTab
              report={report}
              fileCount={fileCount}
              generationStatus={generationStatus}
              generationError={report?.generation_error ?? null}
              onGoToTab={setActiveTab}
            />
          )}
          {activeTab === "inputs" && (
            <InputsTab
              objective={objective}
              onObjectiveChange={handleObjectiveChange}
              protocol={protocolFiles}
              papers={paperFiles}
              dataFiles={dataFiles}
              onToggleFile={handleToggleFile}
              isGenerating={isGenerating || generationStatus === "generating"}
              hasDraft={hasDraft}
              onGenerate={handleGenerate}
              generationError={
                generationStatus === "error"
                  ? (report?.generation_error ?? null)
                  : null
              }
            />
          )}
          {activeTab === "report" && (
            <ReportTabView
              draft={draft}
              chartImage={report?.chart_image ?? null}
              regenerating={regeneratingKey}
              onRegenerate={handleRegenerateSection}
              onEditContent={handleSectionContentChange}
              onRegenerateChart={handleChartRegenerate}
              regeneratingChart={regeneratingChart}
              onOpenPreview={() => setShowPreview(true)}
            />
          )}
        </div>
      </div>

      <ReportPreviewModal
        isOpen={showPreview}
        onOpenChange={setShowPreview}
        title={report?.name || "Untitled Report"}
        draft={draft}
        chartImage={report?.chart_image ?? null}
        onEditContent={handleSectionContentChange}
      />

      <ELNExportModal
        isOpen={showELNExportModal}
        onOpenChange={setShowELNExportModal}
        connections={elnConnections}
        reportContent={draftText}
        reportTitle={report?.name || "Shadow AI Report"}
        onExportSuccess={(result: any) => {
          if (result.success) {
            toast({
              title: "Success",
              description: "Report exported to ELN successfully!"
            })
          }
        }}
      />

      <ELNConnectModal
        isOpen={showELNConnectModal}
        onOpenChange={setShowELNConnectModal}
        userId={profile?.user_id || ""}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  )
}
