"use client"

import { useEffect, useMemo, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChatbotUIContext } from "@/context/context"
import {
  getReportsByWorkspaceId,
  deleteReport,
  updateReport
} from "@/db/reports-firestore"
import { getProjectsByWorkspaceId } from "@/db/projects"
import {
  IconFolder,
  IconMessage,
  IconPencil,
  IconPlus,
  IconReport,
  IconTrash
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/app/hooks/use-toast"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import { formatCreatedModifiedStacked } from "@/lib/format-date"
import { cn } from "@/lib/utils"

interface Report {
  id: string
  name: string
  description: string
  project_id?: string | null
  created_at: string
  updated_at: string
  report_draft?: string
  report_outline?: string
}

interface ProjectLite {
  id: string
  name: string
}

export default function ReportsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { selectedWorkspace } = useContext(ChatbotUIContext)
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [reports, setReports] = useState<Report[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [loading, setLoading] = useState(true)

  // Inline rename / edit-objective dialog state. Surfaced from the pencil
  // icon on each slab so a scientist can correct the name or objective
  // without opening the full report.
  const [editing, setEditing] = useState<Report | null>(null)
  const [editName, setEditName] = useState("")
  const [editObjective, setEditObjective] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    fetchReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Projects power the per-row project chip - same data the Designs list
  // uses. Best-effort fetch; if it fails the chip just doesn't render.
  useEffect(() => {
    if (!selectedWorkspace?.id) return
    let cancelled = false
    void getProjectsByWorkspaceId(selectedWorkspace.id)
      .then((rows: any[]) => {
        if (!cancelled) {
          setProjects(
            (rows ?? []).map(p => ({ id: p.id, name: p.name as string }))
          )
        }
      })
      .catch((err: any) =>
        console.warn("[ReportsPage] failed to load projects:", err)
      )
    return () => {
      cancelled = true
    }
  }, [selectedWorkspace?.id])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const data = await getReportsByWorkspaceId(workspaceId)
      setReports(data)
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const projectName = (projectId: string | null | undefined) =>
    (projectId && projects.find(p => p.id === projectId)?.name) || null

  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [reports]
  )

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId)
      setReports(prev => prev.filter(r => r.id !== reportId))
      toast({
        title: "Report deleted",
        description: "The report has been deleted successfully."
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete report.",
        variant: "destructive"
      })
    }
  }

  const openEdit = (report: Report) => {
    setEditing(report)
    setEditName(report.name || "")
    setEditObjective(report.description || "")
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      const trimmedName = editName.trim() || editing.name
      await updateReport(editing.id, {
        name: trimmedName,
        description: editObjective
      })
      setReports(prev =>
        prev.map(r =>
          r.id === editing.id
            ? { ...r, name: trimmedName, description: editObjective }
            : r
        )
      )
      setEditing(null)
      toast({ title: "Report updated" })
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message ?? "Could not update report.",
        variant: "destructive"
      })
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="bg-paper h-full space-y-6 overflow-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <DisplayHeading as="h1" className="mt-1 text-[34px]">
            Reports
          </DisplayHeading>
          <p className="text-ink-3 mt-1 text-[13px]">
            Generate and manage research reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* "Start chat" is implied to mean "chat with all reports in this
              workspace" - no scope picker. The /chat landing's auto-start
              effect creates the chat for us when defaultScope=reports. */}
          <Button
            variant="secondary"
            size="lg"
            onClick={() =>
              router.push(`/${locale}/${workspaceId}/chat?defaultScope=reports`)
            }
          >
            <IconMessage size={14} stroke={2.4} /> Start chat
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
          >
            <IconPlus size={14} stroke={2.4} />
            New Report
          </Button>
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-line border-t-rust size-8 animate-spin rounded-full border-2" />
        </div>
      ) : sortedReports.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="bg-rust-soft mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
            <IconReport size={28} className="text-rust" />
          </div>
          <p className="text-ink mb-2 text-[14px] font-semibold">
            No reports yet
          </p>
          <p className="text-ink-3 mx-auto mb-6 max-w-sm text-[13px] leading-relaxed">
            Create detailed reports from your conversations and data to track
            your research progress.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
          >
            <IconPlus size={12} />
            Create your first report
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sortedReports.map(report => {
            const pname = projectName(report.project_id)
            const isCompleted = !!report.report_draft
            const isDraft = !report.report_draft && !!report.report_outline
            const statusLabel = isCompleted
              ? "Completed"
              : isDraft
                ? "Draft"
                : "In progress"
            const dateLines = formatCreatedModifiedStacked(
              report.created_at,
              report.updated_at
            )
            return (
              <div
                key={report.id}
                onClick={() =>
                  router.push(`/${locale}/${workspaceId}/reports/${report.id}`)
                }
                className={cn(
                  "border-line bg-surface hover:border-line-strong hover:bg-paper group grid cursor-pointer grid-cols-[1fr_auto] items-start gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-ink truncate text-[15px] font-semibold">
                      {report.name}
                    </h3>
                    {/* Inline actions - revealed on hover, like Designs. */}
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          openEdit(report)
                        }}
                        className="hover:bg-paper-2 rounded p-1.5"
                        title="Edit name and objective"
                      >
                        <IconPencil size={14} className="text-ink-3" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            onClick={e => e.stopPropagation()}
                            className="hover:bg-paper-2 rounded p-1.5"
                            title="Delete report"
                          >
                            <IconTrash size={14} className="text-destructive" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={e => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Report</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this report? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteReport(report.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {/* Objective lives in `description` - shown as the
                      secondary line, mirroring the Designs slab. */}
                  {report.description && (
                    <p className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
                      {report.description}
                    </p>
                  )}
                  {/* Color-coded tag row: project + status. No "stage" -
                      reports don't have a phased pipeline. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {pname && (
                      <span className="border-teal-journey/30 bg-teal-journey-tint text-teal-journey inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium">
                        <IconFolder size={10} />
                        {pname}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                        isCompleted
                          ? "border-transparent bg-[#DDE9DF] text-[#1F4A2C]"
                          : isDraft
                            ? "border-purple-persona/30 bg-purple-persona-tint text-purple-persona"
                            : "border-amber-300/40 bg-amber-100/70 text-amber-800"
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
                {/* Stacked dates in right corner */}
                <div className="text-ink-3 flex min-w-[120px] flex-col items-end gap-0.5 text-right font-mono text-[11px] leading-tight">
                  {dateLines.map(line => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rename / edit objective dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={open => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-report-name">Name</Label>
              <Input
                id="edit-report-name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-report-objective">Objective</Label>
              <Textarea
                id="edit-report-objective"
                rows={3}
                value={editObjective}
                onChange={e => setEditObjective(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editName.trim()}
            >
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
