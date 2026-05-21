"use client"

/**
 * Workspace-wide Designs list.
 *
 * Surfaces every design the user owns across the workspace, sorted
 * by recency. Controls:
 *  - Sort/filter tabs on the left (All / In progress / Completed)
 *  - Search bar on the right (half-width per the scientist's spec)
 *  - 12 slabs per page with prev/next arrows top + bottom
 *  - Per-row edit + delete in the upper right; stacked dates in the
 *    lower right (matches the cross-app SlabRow convention).
 */
import {
  IconCopy,
  IconFileText,
  IconFlask,
  IconFolder,
  IconMessage,
  IconPencil,
  IconPlus,
  IconReportAnalytics,
  IconSearch,
  IconTrash
} from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useMemo, useState } from "react"
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
import { GenerateReportModal } from "@/components/designs/generate-report-modal"
import { ChatbotUIContext } from "@/context/context"
import { deleteDesign, updateDesign } from "@/db/designs-firestore"
import { getProjectsByWorkspaceId } from "@/db/projects"
import {
  getDesignProblemStatement,
  getDesignProgress
} from "@/lib/design-status"
import {
  formatCreatedModifiedStacked,
  formatShortDate
} from "@/lib/format-date"
import { cn } from "@/lib/utils"

interface ProjectLite {
  id: string
  name: string
}

type DesignsFilter = "all" | "in-progress" | "completed"
const PAGE_SIZE = 12

export default function DesignsPage() {
  const params = useParams()
  const router = useRouter()
  const { designs, setDesigns, reports, selectedWorkspace } =
    useContext(ChatbotUIContext)
  const locale = params.locale as string
  const workspaceId = params.workspaceid as string

  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<DesignsFilter>("all")
  const [page, setPage] = useState(0)

  const [editing, setEditing] = useState<{
    id: string
    name: string
    description: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  // The design currently being turned into a report (drives the modal).
  const [reportDesign, setReportDesign] = useState<any | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  // Most-recent report per source design, so each completed design's slab can
  // surface its report (and disable the generate button once one exists).
  const reportByDesignId = useMemo(() => {
    const map = new Map<string, any>()
    for (const r of reports as any[]) {
      const did = r?.source_design_id
      if (!did) continue
      const existing = map.get(did)
      if (
        !existing ||
        new Date(r.updated_at || r.created_at).getTime() >
          new Date(existing.updated_at || existing.created_at).getTime()
      ) {
        map.set(did, r)
      }
    }
    return map
  }, [reports])

  const handleDuplicate = async (design: any) => {
    if (!selectedWorkspace?.id) return
    setDuplicatingId(design.id)
    try {
      const res = await fetch(`/api/design/${design.id}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace.id,
          projectId: design.project_id ?? null,
          resetApproval: true
        })
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail?.error || `Duplicate failed (${res.status})`)
      }
      const { design: forked } = await res.json()
      setDesigns(prev => [forked, ...prev])
      toast.success("Design duplicated — open the copy to branch a variant")
    } catch (e: any) {
      toast.error(`Duplicate failed: ${e?.message ?? "unknown"}`)
    } finally {
      setDuplicatingId(null)
    }
  }

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
        console.warn("[DesignsPage] failed to load projects:", err)
      )
    return () => {
      cancelled = true
    }
  }, [selectedWorkspace?.id])

  const projectName = (projectId: string | null | undefined) =>
    (projectId && projects.find(p => p.id === projectId)?.name) || null

  const sortedDesigns = useMemo(
    () =>
      [...designs].sort(
        (a: any, b: any) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [designs]
  )

  const filteredDesigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    const nameById = new Map(projects.map(p => [p.id, p.name]))
    return sortedDesigns.filter((d: any) => {
      const pn = d.project_id ? nameById.get(d.project_id) : undefined
      const progress = getDesignProgress(d)
      const isCompleted =
        progress.isCompleted || (d.approved_phases ?? []).includes("design")
      if (filter === "completed" && !isCompleted) return false
      if (filter === "in-progress" && isCompleted) return false
      if (q) {
        return (
          d.name?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q) ||
          pn?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [sortedDesigns, search, projects, filter])

  // Snap page back when filters change so a "Completed (page 3 of 4)"
  // state doesn't strand the user on an empty page after the filter
  // narrows to "All (page 1 of 1)".
  useEffect(() => {
    setPage(0)
  }, [filter, search])

  const handleNewDesign = () => {
    router.push(`/${locale}/${workspaceId}/designs/new`)
  }

  const handleDelete = async (designId: string) => {
    try {
      await deleteDesign(designId)
      setDesigns(prev => prev.filter((d: any) => d.id !== designId))
      toast.success("Design deleted")
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? "unknown"}`)
    }
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    const trimmed = editing.name.trim()
    if (!trimmed) {
      toast.error("Name can't be empty.")
      return
    }
    setSaving(true)
    try {
      await updateDesign(editing.id, {
        name: trimmed,
        description: editing.description
      })
      setDesigns(prev =>
        prev.map((d: any) =>
          d.id === editing.id
            ? { ...d, name: trimmed, description: editing.description }
            : d
        )
      )
      setEditing(null)
      toast.success("Design updated")
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`)
    } finally {
      setSaving(false)
    }
  }

  const totalAll = sortedDesigns.length
  const inProgressCount = sortedDesigns.filter((d: any) => {
    const p = getDesignProgress(d)
    return !(p.isCompleted || (d.approved_phases ?? []).includes("design"))
  }).length
  const completedCount = totalAll - inProgressCount

  const start = page * PAGE_SIZE
  const paged = filteredDesigns.slice(start, start + PAGE_SIZE)

  return (
    <div className="bg-paper h-full overflow-auto px-10 pb-16 pt-7">
      <div className="mx-auto max-w-[1060px]">
        {/* Header */}
        <div className="mb-7 flex items-end justify-between gap-5">
          <div>
            <Eyebrow>{selectedWorkspace?.name ?? "Workspace"}</Eyebrow>
            <DisplayHeading as="h1" className="mb-1 mt-1.5 text-[36px]">
              Designs
            </DisplayHeading>
            <div className="text-ink-3 text-[13px]">
              {totalAll} design{totalAll === 1 ? "" : "s"} across{" "}
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => router.push(`/${locale}/${workspaceId}/reports`)}
            >
              <IconReportAnalytics size={14} stroke={2.4} /> Reports
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() =>
                router.push(
                  `/${locale}/${workspaceId}/chat?defaultScope=designs`
                )
              }
            >
              <IconMessage size={14} stroke={2.4} /> Start chat
            </Button>
            <Button variant="primary" size="lg" onClick={handleNewDesign}>
              <IconPlus size={14} stroke={2.4} /> New design
            </Button>
          </div>
        </div>

        {totalAll === 0 ? (
          <Card className="p-10 text-center">
            <IconFlask size={28} className="text-ink-3 mx-auto mb-3" />
            <div className="text-ink mb-1 text-[14px] font-semibold">
              No designs in this workspace yet
            </div>
            <div className="text-ink-3 mb-5 text-[13px]">
              Click New design above to start.
            </div>
          </Card>
        ) : (
          <SlabPager
            total={filteredDesigns.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            topLeft={
              <FilterTabs
                value={filter}
                onChange={setFilter}
                counts={{
                  all: totalAll,
                  "in-progress": inProgressCount,
                  completed: completedCount
                }}
              />
            }
            topRight={
              <div className="border-line bg-paper flex w-full max-w-[260px] items-center gap-2 rounded-md border px-3 sm:w-[260px]">
                <IconSearch size={14} className="text-ink-3 shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search designs…"
                  className="text-ink placeholder:text-ink-3 h-8 w-full border-none bg-transparent text-[12.5px] outline-none"
                />
              </div>
            }
          >
            {paged.length === 0 ? (
              <Card className="p-10 text-center">
                <div className="text-ink-3 text-[13px]">
                  No designs match these filters.
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {paged.map((d: any) => (
                  <DesignSlab
                    key={d.id}
                    design={d}
                    pname={projectName(d.project_id)}
                    reportForDesign={reportByDesignId.get(d.id) ?? null}
                    duplicating={duplicatingId === d.id}
                    onOpen={() =>
                      router.push(`/${locale}/${workspaceId}/designs/${d.id}`)
                    }
                    onEdit={() =>
                      setEditing({
                        id: d.id,
                        name: d.name ?? "",
                        description: d.description ?? ""
                      })
                    }
                    onDelete={() => handleDelete(d.id)}
                    onDuplicate={() => handleDuplicate(d)}
                    onGenerateReport={() => setReportDesign(d)}
                    onOpenReport={reportId =>
                      router.push(
                        `/${locale}/${workspaceId}/reports/${reportId}`
                      )
                    }
                  />
                ))}
              </div>
            )}
          </SlabPager>
        )}
      </div>

      {/* Inline edit dialog. Same shape as the reports list edit
          (#22 follow-up): rename + edit description without a full
          navigation to the design page. */}
      <Dialog
        open={!!editing}
        onOpenChange={open => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit design</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="design-edit-name">Name</Label>
                <Input
                  id="design-edit-name"
                  value={editing.name}
                  onChange={e =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="design-edit-desc">Description</Label>
                <Textarea
                  id="design-edit-desc"
                  value={editing.description}
                  onChange={e =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editing?.name.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate-report modal — opened from a completed design's slab. */}
      <GenerateReportModal
        open={!!reportDesign}
        onOpenChange={open => {
          if (!open) setReportDesign(null)
        }}
        design={reportDesign}
        workspaceId={workspaceId}
        locale={locale}
      />
    </div>
  )
}

// ── Filter tabs + slab row ───────────────────────────────────────────

interface FilterTabsProps {
  value: DesignsFilter
  onChange: (v: DesignsFilter) => void
  counts: Record<DesignsFilter, number>
}

const FilterTabs: FC<FilterTabsProps> = ({ value, onChange, counts }) => {
  const tabs: { key: DesignsFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in-progress", label: "In progress" },
    { key: "completed", label: "Completed" }
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

interface DesignSlabProps {
  design: any
  pname: string | null
  reportForDesign: any | null
  duplicating: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onGenerateReport: () => void
  onOpenReport: (reportId: string) => void
}

const DesignSlab: FC<DesignSlabProps> = ({
  design,
  pname,
  reportForDesign,
  duplicating,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onGenerateReport,
  onOpenReport
}) => {
  const progress = getDesignProgress(design)
  const isCompleted =
    progress.isCompleted || (design.approved_phases ?? []).includes("design")
  const problemStatement = getDesignProblemStatement(design)
  const dateLines = formatCreatedModifiedStacked(
    design.created_at,
    design.updated_at
  )
  const hasReport = !!reportForDesign
  return (
    <SlabRow
      onClick={onOpen}
      dateLines={dateLines}
      actions={
        <>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onDuplicate()
            }}
            data-slab-action
            disabled={duplicating}
            title="Duplicate to branch a variant"
            className="hover:bg-paper-2 rounded p-1.5 disabled:opacity-50"
          >
            <IconCopy size={14} className="text-ink-3" />
          </button>
          {/* Generate report — completed designs only, and only until a
              report exists (after that the slab shows the report button). */}
          {isCompleted && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (!hasReport) onGenerateReport()
              }}
              data-slab-action
              disabled={hasReport}
              title={
                hasReport
                  ? "Report already generated"
                  : "Generate a report from this design"
              }
              className="hover:bg-paper-2 rounded p-1.5 disabled:opacity-40"
            >
              <IconReportAnalytics size={14} className="text-ink-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            data-slab-action
            title="Edit name + description"
            className="hover:bg-paper-2 rounded p-1.5"
          >
            <IconPencil size={14} className="text-ink-3" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                data-slab-action
                title="Delete design"
                className="hover:bg-paper-2 rounded p-1.5"
              >
                <IconTrash size={14} className="text-destructive" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete design?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes &ldquo;{design.name}&rdquo; and
                  everything inside it (problem, literature, hypotheses,
                  generated designs). Can&apos;t be undone.
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
      <div className="text-ink truncate text-[15px] font-semibold">
        {design.name}
      </div>
      {problemStatement ? (
        <div className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
          {problemStatement}
        </div>
      ) : design.description && design.description !== design.name ? (
        <div className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
          {design.description}
        </div>
      ) : null}
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
              : "border-amber-300/40 bg-amber-100/70 text-amber-800"
          )}
        >
          {isCompleted ? "Completed" : "In progress"}
        </span>
        {!isCompleted && progress.currentStageLabel && (
          <span className="border-purple-persona/30 bg-purple-persona-tint text-purple-persona rounded-full border px-2 py-0.5 text-[10.5px] font-medium">
            Stage: {progress.currentStageLabel}
          </span>
        )}
        {hasReport && (
          <button
            type="button"
            data-slab-action
            onClick={e => {
              e.stopPropagation()
              onOpenReport(reportForDesign.id)
            }}
            title="Open the report generated from this design"
            className="bg-brick hover:bg-brick-hover ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-white"
          >
            <IconFileText size={11} />
            View report
            <span className="font-normal opacity-80">
              · {formatShortDate(reportForDesign.created_at)}
            </span>
          </button>
        )}
      </div>
    </SlabRow>
  )
}
