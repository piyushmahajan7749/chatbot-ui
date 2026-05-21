"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AccentTabs, type TabStatus } from "@/components/canvas/accent-tabs"
// ChatbotUIContext was used for the ELN profile lookup - removed in
// favour of pure prop drilling now that ELN export is gone.
import { useToast } from "@/app/hooks/use-toast"
// ELN export removed for the B2C launch (#21). The lib/eln/* clients +
// modals are kept in the repo so we can flip the surface back on for an
// enterprise SKU without rewriting the integration.
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
import { FileText, Presentation, Save as SaveIcon } from "lucide-react"
import {
  OverviewTab,
  type ReportTab
} from "@/components/reports/tabs/overview-tab"
import { InputsTab } from "@/components/reports/tabs/inputs-tab"
import { ReportTab as ReportTabView } from "@/components/reports/tabs/report-tab"
import { ReportDesignRail } from "@/components/reports/report-design-rail"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"
import { exportReportToPDF, exportReportToPPTX } from "@/lib/report/export"
import { getTemplate, DEFAULT_TEMPLATE_ID } from "@/lib/report/templates"
import { createReportTemplate } from "@/db/report-templates-firestore"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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
  // profile context dropped along with ELN export.
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
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID)
  // Optional scientist-added sections. Persisted on the Firestore
  // report row as `custom_sections`. Each entry feeds into the report
  // generation prompt + the saved-template export.
  const [customSections, setCustomSections] = useState<
    Array<{ id: string; name: string; description: string }>
  >([])

  const [isGenerating, setIsGenerating] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [regeneratingChart, setRegeneratingChart] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isSavingNow, setIsSavingNow] = useState(false)
  const sectionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const objectiveSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reports opened in a "generating" state (created by the Generate-report
  // modal) resume generation here. Tracked per-report so it fires only once.
  const autoGenRef = useRef<Set<string>>(new Set())

  // Save-as-template + add-section dialogs. Both share the simple
  // {name, description} payload shape - we render them as separate
  // <Dialog>s for clarity.
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [savingTemplate, setSavingTemplate] = useState(false)

  const [addSectionDialogOpen, setAddSectionDialogOpen] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")
  const [newSectionDescription, setNewSectionDescription] = useState("")

  useEffect(() => {
    if (reportId) void fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  // ELN connection loader removed (#21) - "Export to ELN" is hidden
  // for the B2C launch. The connections code stays under db/eln-* so we
  // can flip the surface back on without re-implementing it.

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
      setTemplateId(data.template_id ?? DEFAULT_TEMPLATE_ID)
      // Custom sections are persisted as an array of {id, name,
      // description} on the report doc. Empty array when missing so
      // the inputs tab renders a clean "+ Add section" affordance.
      const cs = Array.isArray(data.custom_sections) ? data.custom_sections : []
      setCustomSections(
        cs
          .filter((s: any) => s && typeof s === "object")
          .map((s: any, i: number) => ({
            id: typeof s.id === "string" ? s.id : `cs-${i}`,
            name: typeof s.name === "string" ? s.name : "",
            description: typeof s.description === "string" ? s.description : ""
          }))
      )
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
  // A report becomes "saved" once the user explicitly saves it as a
  // template (the Save-as-Template dialog flips this). Drives the
  // ReportTab + ReportSection lockdown so locked reports can't be
  // re-edited.
  const isReportSaved = !!report?.is_saved
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

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    setReport((prev: any) => ({ ...prev, template_id: id }))
    updateReport(reportId, { template_id: id }).catch(err => {
      console.warn("Failed to save template:", err)
    })
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

  /**
   * Persist custom sections on every change with a tiny debounce. Same
   * 800ms pattern as section-content saves so a typing burst maps to
   * one Firestore write.
   */
  const customSectionsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const handleCustomSectionsChange = (
    next: Array<{ id: string; name: string; description: string }>
  ) => {
    setCustomSections(next)
    if (customSectionsSaveTimer.current)
      clearTimeout(customSectionsSaveTimer.current)
    customSectionsSaveTimer.current = setTimeout(() => {
      updateReport(reportId, { custom_sections: next }).catch(err => {
        console.warn("[reports] persist custom_sections failed:", err)
      })
    }, 800)
  }

  const handleGenerate = async () => {
    // Design-sourced reports use the design itself as the protocol, so a
    // protocol *file* isn't required when we have a design_context snapshot.
    const hasProtocolContext =
      protocolFiles.length > 0 || !!report?.design_context
    if (!objective.trim() || !hasProtocolContext) return
    setIsGenerating(true)
    const toastId = `report-generate-${reportId}`
    sonnerToast.loading("Generating report draft…", {
      id: toastId,
      duration: Infinity
    })
    try {
      await updateReport(reportId, {
        description: objective,
        template_id: templateId,
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
          dataFiles: dataFiles.map(f => f.id),
          designContext: report?.design_context ?? undefined
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

  // Resume generation for a report the modal created in a "generating"
  // state. Fires once per report, once the inputs have loaded.
  useEffect(() => {
    if (!report || autoGenRef.current.has(report.id)) return
    if (report.generation_status !== "generating" || hasDraft || isGenerating)
      return
    const hasInputs =
      dataFiles.length > 0 &&
      (protocolFiles.length > 0 || !!report.design_context)
    if (!objective.trim() || !hasInputs) return
    autoGenRef.current.add(report.id)
    void handleGenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    report?.id,
    report?.generation_status,
    hasDraft,
    isGenerating,
    objective,
    dataFiles.length,
    protocolFiles.length
  ])

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
        const detail = await response
          .json()
          .catch(() => ({ error: response.statusText }))
        throw new Error(
          detail.error || `Regeneration failed (${response.status})`
        )
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

  /**
   * Explicit "Save now" - flushes any pending autosave timer and writes the
   * latest draft + objective immediately. Useful before navigating away or
   * exporting, when the 800ms debounce hasn't fired yet.
   */
  const handleSaveNow = async () => {
    if (isSavingNow) return
    setIsSavingNow(true)
    if (sectionSaveTimer.current) {
      clearTimeout(sectionSaveTimer.current)
      sectionSaveTimer.current = null
    }
    if (objectiveSaveTimer.current) {
      clearTimeout(objectiveSaveTimer.current)
      objectiveSaveTimer.current = null
    }
    try {
      await updateReport(reportId, {
        report_draft: report?.report_draft ?? null,
        description: objective
      })
      sonnerToast.success("Saved")
    } catch (error: any) {
      console.error("Save failed:", error)
      sonnerToast.error(`Save failed: ${error?.message ?? "Unknown error"}`)
    } finally {
      setIsSavingNow(false)
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

  /**
   * Optimistic chart-type toggle - flips `chart_data.chartType` locally
   * so the recharts surface re-renders immediately, then persists. The
   * static `chart_image` (used for PDF/PPT export) is left as-is until
   * the user explicitly hits "Edit chart with AI", which regenerates
   * the PNG to match.
   */
  const handleChartTypeChange = (chartType: "bar" | "line" | "pie") => {
    const current = report?.chart_data
    if (!current) return
    const nextChartData = { ...current, chartType }
    setReport((prev: any) => ({ ...prev, chart_data: nextChartData }))
    updateReport(reportId, { chart_data: nextChartData }).catch(err => {
      console.warn("Failed to persist chart type:", err)
    })
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

  // ELN export handlers removed (#21).
  const handleOpenAddSection = () => {
    setNewSectionName("")
    setNewSectionDescription("")
    setAddSectionDialogOpen(true)
  }

  const handleConfirmAddSection = () => {
    const name = newSectionName.trim()
    if (!name) {
      sonnerToast.error("Section name is required.")
      return
    }
    handleCustomSectionsChange([
      ...customSections,
      {
        id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        description: newSectionDescription.trim()
      }
    ])
    setAddSectionDialogOpen(false)
  }

  const handleOpenSaveAsTemplate = () => {
    setTemplateName(report?.name ?? "")
    setTemplateDescription(report?.description ?? "")
    setTemplateDialogOpen(true)
  }

  const handleConfirmSaveAsTemplate = async () => {
    const trimmed = templateName.trim()
    if (!trimmed) {
      sonnerToast.error("Template name is required.")
      return
    }
    setSavingTemplate(true)
    try {
      // Combine the active template's built-in sections with the
      // user's custom additions so the persisted template captures
      // both the structure and the scientist's bespoke pieces.
      const tpl = getTemplate(templateId)
      const sections = [
        ...tpl.sections.map(s => ({
          key: s.key,
          title: s.title,
          group: s.group
        })),
        ...customSections.map(cs => ({
          key: cs.id,
          title: cs.name || "Untitled section",
          description: cs.description,
          group: "Custom",
          custom: true
        }))
      ]
      await createReportTemplate(workspaceId, {
        name: trimmed,
        description: templateDescription.trim(),
        sections,
        chart_type:
          ((report?.chart_data as Record<string, unknown> | undefined)
            ?.chartType as "bar" | "line" | "pie" | undefined) ?? null
      })
      // Flip the report into the "saved" state so the chrome locks.
      await updateReport(reportId, { is_saved: true })
      setReport((prev: any) => ({ ...prev, is_saved: true }))
      sonnerToast.success("Saved as template")
      setTemplateDialogOpen(false)
    } catch (e: any) {
      sonnerToast.error(
        `Couldn't save template: ${e?.message ?? "unknown error"}`
      )
    } finally {
      setSavingTemplate(false)
    }
  }

  const draftText = draftToText(draft)
  // `draftText` is still computed for parity with the old surface;
  // unused now that ELN export is gone, but cheap to keep so we don't
  // ship a partial rip while the lib/eln integration is still around.
  void draftText

  const template = getTemplate(templateId ?? DEFAULT_TEMPLATE_ID)

  const handleDownloadPDF = async () => {
    if (!report || !draft) return
    try {
      await exportReportToPDF({
        title: report.name || "Report",
        draft,
        sections: template.sections,
        chartImage: report?.chart_image ?? null
      })
    } catch (err: any) {
      console.error("PDF export failed:", err)
      toast({
        title: "Export failed",
        description: err?.message || "Could not generate PDF.",
        variant: "destructive"
      })
    }
  }

  const handleDownloadPPT = async () => {
    if (!report || !draft) return
    try {
      await exportReportToPPTX({
        title: report.name || "Report",
        draft,
        sections: template.sections,
        chartImage: report?.chart_image ?? null
      })
    } catch (err: any) {
      console.error("PPT export failed:", err)
      toast({
        title: "Export failed",
        description: err?.message || "Could not generate PPT.",
        variant: "destructive"
      })
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
                {/* Save button hides once the report is locked - at
                    that point Save-as-Template (inside the Report
                    tab) is the only mutation that makes sense. */}
                {!isReportSaved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleSaveNow}
                    disabled={isSavingNow}
                    title="Flush any pending edits to the server"
                  >
                    <SaveIcon className="size-4" />
                    {isSavingNow ? "Saving…" : "Save"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownloadPDF}
                >
                  <FileText className="size-4" />
                  Download as PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownloadPPT}
                >
                  <Presentation className="size-4" />
                  Download as PPT
                </Button>
                {/* "Export to ELN" hidden for the B2C launch (#21). */}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body: tabs + content on the left, parent-design rail on the right
          (the rail appears only for reports spawned from a design). */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Tabs */}
          <AccentTabs
            activeKey={activeTab}
            onChange={key => setActiveTab(key as ReportTab)}
            tabs={tabDefs}
          />

          {/* Tab content. Inputs + Overview keep a comfortable
          max-width; the Report tab gets the full 6xl so the index +
          body grid has more room to breathe (scientist asked for the
          main content to widen so the chart and tables don't need so
          much horizontal scrolling). */}
          <div className="min-h-0 flex-1 overflow-auto">
            <div
              className={cn(
                "mx-auto p-6",
                activeTab === "report" ? "max-w-6xl" : "max-w-4xl"
              )}
            >
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
                  isGenerating={
                    isGenerating || generationStatus === "generating"
                  }
                  hasDraft={hasDraft}
                  onGenerate={handleGenerate}
                  customSections={customSections}
                  onCustomSectionsChange={handleCustomSectionsChange}
                  generationError={
                    generationStatus === "error"
                      ? (report?.generation_error ?? null)
                      : null
                  }
                  templateId={templateId}
                  onTemplateChange={handleTemplateChange}
                  protocolOptional={!!report?.source_design_id}
                />
              )}
              {activeTab === "report" && (
                <ReportTabView
                  draft={draft}
                  chartImage={report?.chart_image ?? null}
                  chartData={report?.chart_data ?? null}
                  regenerating={regeneratingKey}
                  onRegenerate={handleRegenerateSection}
                  onEditContent={handleSectionContentChange}
                  onRegenerateChart={handleChartRegenerate}
                  onChartTypeChange={handleChartTypeChange}
                  regeneratingChart={regeneratingChart}
                  onOpenPreview={() => setShowPreview(true)}
                  templateId={templateId}
                  reportTitle={report?.name || "Untitled Report"}
                  isSaved={isReportSaved}
                  onSaveAsTemplate={handleOpenSaveAsTemplate}
                  customSections={customSections}
                  onAddCustomSection={handleOpenAddSection}
                />
              )}
            </div>
          </div>
        </div>
        {report?.source_design_id && (
          <ReportDesignRail
            designId={report.source_design_id}
            designName={report.source_design_name ?? null}
            designContext={report.design_context ?? null}
            files={report.files ?? {}}
            locale={locale}
            workspaceId={workspaceId}
          />
        )}
      </div>

      <ReportPreviewModal
        isOpen={showPreview}
        onOpenChange={setShowPreview}
        title={report?.name || "Untitled Report"}
        draft={draft}
        chartImage={report?.chart_image ?? null}
        chartData={report?.chart_data ?? null}
        onEditContent={handleSectionContentChange}
        templateId={templateId}
        isLocked={isReportSaved}
      />

      {/* Add-section dialog. Asks for a name + brief description; the
          generation agent fills the body once the user re-runs the
          report (or types into the section themselves). */}
      <Dialog
        open={addSectionDialogOpen}
        onOpenChange={setAddSectionDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
              Name the section and write 1-2 sentences telling the generation
              agent what to put in it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-section-name">Section name</Label>
              <Input
                id="add-section-name"
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="e.g. Open questions for PI"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-section-desc">What goes here</Label>
              <Textarea
                id="add-section-desc"
                value={newSectionDescription}
                onChange={e => setNewSectionDescription(e.target.value)}
                placeholder="Briefly describe what this section should contain."
                rows={3}
                maxLength={600}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddSectionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmAddSection}>Add section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save-as-template dialog. Persists the active section list +
          chart type to report_templates so the user can spawn future
          reports from the same skeleton. Flips the current report to
          is_saved=true on success, which locks the editor. */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save report as template</DialogTitle>
            <DialogDescription>
              Captures the structure of this report (sections + chart type) so a
              future report can reuse it. Also locks this report from further
              edits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. PI weekly update"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">
                Description{" "}
                <span className="text-ink-3 text-[11px] font-normal">
                  optional
                </span>
              </Label>
              <Textarea
                id="tpl-desc"
                value={templateDescription}
                onChange={e => setTemplateDescription(e.target.value)}
                placeholder="When should someone reach for this template?"
                rows={3}
                maxLength={600}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={savingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSaveAsTemplate}
              disabled={savingTemplate || !templateName.trim()}
            >
              {savingTemplate ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
