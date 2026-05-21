"use client"

/**
 * Workspace-wide Reports list.
 *
 * Reports are generated from designs, so each slab is attributed to its parent
 * design. Two filter tabs (Completed / In progress) on the left, right-aligned
 * search at half-width, page-level pagination at 12 slabs/page. Each slab
 * matches the canonical SlabRow alignment: inline edit + delete in the upper
 * right, stacked Created / Modified dates in the lower right.
 *
 * There is no "new report" or "start chat" action here — reports are spawned
 * from a completed design via the design's "Generate report" button.
 */

import { FC, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SlabPager } from "@/components/ui/slab-pager"
import { SlabRow } from "@/components/ui/slab-row"
import { Textarea } from "@/components/ui/textarea"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import {
  IconFlask,
  IconPencil,
  IconReport,
  IconSearch,
  IconTrash
} from "@tabler/icons-react"
import {
  deleteReport,
  getReportsByWorkspaceId,
  updateReport
} from "@/db/reports-firestore"
import { formatCreatedModifiedStacked } from "@/lib/format-date"
import { cn } from "@/lib/utils"

interface Report {
  id: string
  name: string
  description: string
  source_design_id?: string | null
  source_design_name?: string | null
  created_at: string
  updated_at: string
  report_draft?: string
  report_outline?: string
}

type ReportsFilter = "completed" | "in-progress"
const PAGE_SIZE = 12

export default function ReportsPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ReportsFilter>("completed")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  const [editing, setEditing] = useState<Report | null>(null)
  const [editName, setEditName] = useState("")
  const [editObjective, setEditObjective] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    void fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Snap to first page whenever the slice the user is looking at changes.
  useEffect(() => {
    setPage(0)
  }, [filter, search])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const reportRows = await getReportsByWorkspaceId(workspaceId)
      setReports(reportRows as Report[])
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [reports]
  )

  const isCompleted = (r: Report) => !!r.report_draft

  const completedReports = useMemo(
    () => sortedReports.filter(isCompleted),
    [sortedReports]
  )
  const inProgressReports = useMemo(
    () => sortedReports.filter(r => !isCompleted(r)),
    [sortedReports]
  )

  const activeList: Report[] =
    filter === "completed" ? completedReports : inProgressReports

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeList
    return activeList.filter(
      r =>
        r.name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.source_design_name?.toLowerCase().includes(q)
    )
  }, [activeList, search])

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId)
      setReports(prev => prev.filter(r => r.id !== reportId))
      toast.success("Report deleted")
    } catch (error: any) {
      toast.error(`Delete failed: ${error?.message ?? "unknown"}`)
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
      toast.success("Report updated")
    } catch (error: any) {
      toast.error(`Save failed: ${error?.message ?? "unknown"}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const start = page * PAGE_SIZE
  const paged = filtered.slice(start, start + PAGE_SIZE)

  return (
    <div className="bg-paper h-full space-y-6 overflow-auto p-8">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <DisplayHeading as="h1" className="mt-1 text-[34px]">
            Reports
          </DisplayHeading>
          <p className="text-ink-3 mt-1 text-[13px]">
            Reports generated from your completed designs.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-line border-t-rust size-8 animate-spin rounded-full border-2" />
        </div>
      ) : reports.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="bg-rust-soft mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
            <IconReport size={28} className="text-rust" />
          </div>
          <p className="text-ink mb-2 text-[14px] font-semibold">
            No reports yet
          </p>
          <p className="text-ink-3 mx-auto mb-6 max-w-sm text-[13px] leading-relaxed">
            Reports are generated from a completed design. Open a finished
            design and use its “Generate report” action.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/${locale}/${workspaceId}/designs`)}
          >
            <IconFlask size={12} />
            Go to designs
          </Button>
        </Card>
      ) : (
        <SlabPager
          total={filtered.length}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          topLeft={
            <ReportsFilterTabs
              value={filter}
              onChange={setFilter}
              counts={{
                completed: completedReports.length,
                "in-progress": inProgressReports.length
              }}
            />
          }
          topRight={
            <div className="border-line bg-paper flex w-full max-w-[260px] items-center gap-2 rounded-md border px-3 sm:w-[260px]">
              <IconSearch size={14} className="text-ink-3 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search reports…"
                className="text-ink placeholder:text-ink-3 h-8 w-full border-none bg-transparent text-[12.5px] outline-none"
              />
            </div>
          }
        >
          {paged.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="text-ink-3 text-[13px]">
                No reports match these filters.
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {paged.map(r => (
                <ReportSlab
                  key={r.id}
                  report={r}
                  onOpen={() =>
                    router.push(`/${locale}/${workspaceId}/reports/${r.id}`)
                  }
                  onEdit={() => openEdit(r)}
                  onDelete={() => handleDeleteReport(r.id)}
                />
              ))}
            </div>
          )}
        </SlabPager>
      )}

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

// ── Filter tabs ─────────────────────────────────────────────────────

interface ReportsFilterTabsProps {
  value: ReportsFilter
  onChange: (v: ReportsFilter) => void
  counts: Record<ReportsFilter, number>
}

const ReportsFilterTabs: FC<ReportsFilterTabsProps> = ({
  value,
  onChange,
  counts
}) => {
  const tabs: { key: ReportsFilter; label: string }[] = [
    { key: "completed", label: "Completed" },
    { key: "in-progress", label: "In progress" }
  ]
  return (
    <div className="border-line bg-paper-2 inline-flex overflow-hidden rounded-md border">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "border-line border-r px-3 py-1.5 text-[12px] font-medium transition-colors last:border-r-0",
            value === t.key
              ? "bg-ink text-paper"
              : "text-ink-2 hover:bg-paper hover:text-ink"
          )}
        >
          {t.label}
          <span className="text-ink-3 ml-1.5 font-mono text-[10.5px]">
            {counts[t.key]}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Report slab ─────────────────────────────────────────────────────

interface ReportSlabProps {
  report: Report
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

const ReportSlab: FC<ReportSlabProps> = ({
  report,
  onOpen,
  onEdit,
  onDelete
}) => {
  const completed = !!report.report_draft
  const dateLines = formatCreatedModifiedStacked(
    report.created_at,
    report.updated_at
  )
  return (
    <SlabRow
      onClick={onOpen}
      dateLines={dateLines}
      actions={
        <>
          <button
            type="button"
            data-slab-action
            onClick={onEdit}
            title="Edit name + objective"
            className="hover:bg-paper-2 rounded p-1.5"
          >
            <IconPencil size={14} className="text-ink-3" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                data-slab-action
                title="Delete report"
                className="hover:bg-paper-2 rounded p-1.5"
              >
                <IconTrash size={14} className="text-destructive" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Report</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this report? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    >
      <h3 className="text-ink truncate text-[15px] font-semibold">
        {report.name}
      </h3>
      {report.description && (
        <p className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
          {report.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {report.source_design_name && (
          <span className="border-teal-journey/30 bg-teal-journey-tint text-teal-journey inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium">
            <IconFlask size={10} />
            {report.source_design_name}
          </span>
        )}
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            completed
              ? "border-transparent bg-[#DDE9DF] text-[#1F4A2C]"
              : "border-amber-300/40 bg-amber-100/70 text-amber-800"
          )}
        >
          {completed ? "Completed" : "In progress"}
        </span>
      </div>
    </SlabRow>
  )
}
