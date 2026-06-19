"use client"

import { useContext, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { SlabRow } from "@/components/ui/slab-row"
import { getProjectById, updateProject, deleteProject } from "@/db/projects"
import { getDesignsByProject } from "@/db/designs"
import { deleteDesign as deleteDesignFirestore } from "@/db/designs-firestore"
import type { Tables } from "@/supabase/types"
import { Project } from "@/types/project"
import { ProjectSettingsModal } from "./project-settings-modal"
import { getDesignProgress } from "@/lib/design-status"
import { formatCreatedModifiedStacked } from "@/lib/format-date"
import {
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconDotsVertical,
  IconEdit,
  IconFlask,
  IconPlus,
  IconSearch,
  IconTrash
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/app/hooks/use-toast"
import { ChatbotUIContext } from "@/context/context"

interface StudioCanvasProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
  onOpenChat?: () => void
  showRail?: boolean
  onToggleRail?: () => void
}

type DesignRow = Tables<"designs"> & {
  description?: string
  content?: unknown
  approved_phases?: string[] | null
  current_stage?: string | null
}

type SortKey = "updated" | "created" | "name"
type FilterKey = "all" | "completed" | "in_progress"

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Last updated",
  created: "Date created",
  name: "Name (A–Z)"
}
const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All designs",
  completed: "Completed",
  in_progress: "In progress"
}

const STATUS_COMPLETED =
  "rounded-full border border-transparent bg-[#DDE9DF] px-2 py-0.5 text-[10.5px] font-medium text-[#1F4A2C]"
const STATUS_IN_PROGRESS =
  "rounded-full border border-amber-300/40 bg-amber-100/70 px-2 py-0.5 text-[10.5px] font-medium text-amber-800"
const CHIP_STAGE =
  "rounded-full border border-purple-persona/30 bg-purple-persona-tint px-2 py-0.5 text-[10.5px] font-medium text-purple-persona"

export function StudioCanvas({
  children,
  projectId,
  workspaceId
}: StudioCanvasProps) {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  void profile

  const [project, setProject] = useState<Project | null>(null)
  const [designs, setDesigns] = useState<DesignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("updated")
  const [filterKey, setFilterKey] = useState<FilterKey>("all")

  const actualProjectId = projectId || (params.projectId as string)
  const actualWorkspaceId = workspaceId || (params.workspaceid as string)
  const locale = params.locale as string

  useEffect(() => {
    if (actualProjectId && actualWorkspaceId) void fetchProjectData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualProjectId, actualWorkspaceId])

  // Re-fetch designs when the tab regains focus so returning from a design
  // page shows newly created / saved designs immediately.
  useEffect(() => {
    if (!actualProjectId) return
    const onFocus = () => {
      if (document.visibilityState === "visible") void fetchProjectData()
    }
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualProjectId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      const projectData = await getProjectById(actualProjectId)
      if (!projectData) {
        toast({
          title: "Error",
          description: "Project not found.",
          variant: "destructive"
        })
        return
      }
      setProject(projectData)
      const projectDesigns = await getDesignsByProject(actualProjectId).catch(
        () => []
      )
      setDesigns(projectDesigns as DesignRow[])
    } catch (error) {
      console.error("Error fetching project data:", error)
      toast({
        title: "Error",
        description: "Failed to load project data.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNewDesign = () => {
    router.push(
      `/${locale}/${actualWorkspaceId}/designs/new?projectId=${actualProjectId}`
    )
  }

  const handleOpenDesign = (id: string) => {
    router.push(`/${locale}/${actualWorkspaceId}/designs/${id}`)
  }

  const handleDeleteDesign = async (id: string) => {
    if (!window.confirm("Delete this design? This cannot be undone.")) return
    try {
      await deleteDesignFirestore(id)
      setDesigns(prev => prev.filter(d => d.id !== id))
      toast({ title: "Design deleted" })
    } catch (err: any) {
      toast({
        title: "Couldn't delete design",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    }
  }

  const handleProjectUpdate = async (updates: Partial<Project>) => {
    if (!project) return
    try {
      const updated = await updateProject(project.id, updates)
      setProject(updated)
      toast({ title: "Project updated" })
      setSettingsOpen(false)
    } catch {
      toast({
        title: "Error",
        description: "Failed to update project.",
        variant: "destructive"
      })
    }
  }

  const handleProjectDelete = async () => {
    if (!project) return
    try {
      await deleteProject(project.id)
      toast({ title: "Project deleted" })
      router.push(`/${locale}/${actualWorkspaceId}/projects`)
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive"
      })
    }
  }

  const statusOf = (d: DesignRow) => {
    const progress = getDesignProgress(d as any)
    const isCompleted =
      progress.isCompleted || (d.approved_phases ?? []).includes("design")
    return { isCompleted, stageLabel: progress.currentStageLabel }
  }

  const visibleDesigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = designs.filter(d => {
      if (q) {
        const hit =
          d.name?.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q))
        if (!hit) return false
      }
      if (filterKey !== "all") {
        const { isCompleted } = statusOf(d)
        if (filterKey === "completed" && !isCompleted) return false
        if (filterKey === "in_progress" && isCompleted) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      if (sortKey === "name") return (a.name || "").localeCompare(b.name || "")
      const ax = new Date(
        (sortKey === "created" ? a.created_at : a.updated_at || a.created_at) ||
          0
      ).getTime()
      const bx = new Date(
        (sortKey === "created" ? b.created_at : b.updated_at || b.created_at) ||
          0
      ).getTime()
      return bx - ax
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs, search, sortKey, filterKey])

  // Children override: the design editor route renders its own content inside
  // the StudioLayout shell.
  if (children) {
    return <div className="bg-ink-50 h-full">{children}</div>
  }

  if (loading) {
    return (
      <div className="bg-ink-50 flex h-full flex-col">
        <div className="border-ink-200 border-b bg-white p-6">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="bg-ink-50 flex h-full items-center justify-center">
        <p className="text-ink-400">Project not found</p>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="bg-ink-50 flex h-full flex-col">
        {/* Header */}
        <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-ink-400 text-[11px] font-bold uppercase tracking-[0.13em]">
                Project
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <h1 className="text-ink-900 truncate text-2xl font-extrabold tracking-tight">
                  {project.name}
                </h1>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="text-ink-400 hover:text-ink-700"
                  title="Project settings"
                >
                  <IconEdit size={16} />
                </Button>
              </div>
              {project.description && (
                <p className="text-ink-500 mt-1 line-clamp-2 text-sm">
                  {project.description}
                </p>
              )}
              {project.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={handleNewDesign}
              className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
            >
              <IconPlus size={16} />
              New Design
            </Button>
          </div>
        </div>

        {/* Toolbar: search · sort · filter */}
        <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="border-ink-200 flex min-w-[240px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5">
              <IconSearch size={14} className="text-ink-400 shrink-0" />
              <Input
                placeholder="Search designs…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border-none p-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <IconArrowsSort size={15} />
                  {SORT_LABEL[sortKey]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sortKey}
                  onValueChange={v => setSortKey(v as SortKey)}
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      {SORT_LABEL[k]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <IconAdjustmentsHorizontal size={15} />
                  {FILTER_LABEL[filterKey]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Filter</DropdownMenuLabel>
                {(Object.keys(FILTER_LABEL) as FilterKey[]).map(k => (
                  <DropdownMenuCheckboxItem
                    key={k}
                    checked={filterKey === k}
                    onCheckedChange={() => setFilterKey(k)}
                  >
                    {FILTER_LABEL[k]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Vertical designs list */}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {visibleDesigns.length === 0 ? (
            <EmptyDesigns hasAny={designs.length > 0} onNew={handleNewDesign} />
          ) : (
            <div className="mx-auto flex max-w-[960px] flex-col gap-2.5">
              <div className="text-ink-400 mb-1 text-xs">
                {visibleDesigns.length} of {designs.length} design
                {designs.length === 1 ? "" : "s"}
              </div>
              {visibleDesigns.map(d => {
                const { isCompleted, stageLabel } = statusOf(d)
                const dateLines = formatCreatedModifiedStacked(
                  d.created_at,
                  d.updated_at
                )
                return (
                  <SlabRow
                    key={d.id}
                    onClick={() => handleOpenDesign(d.id)}
                    dateLines={dateLines}
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-ink-400 hover:text-ink-700 size-7"
                            aria-label="Design actions"
                            onClick={e => e.stopPropagation()}
                          >
                            <IconDotsVertical size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-36"
                          onClick={e => e.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onSelect={() => handleOpenDesign(d.id)}
                            className="cursor-pointer"
                          >
                            <IconEdit size={14} className="mr-2" />
                            Open / edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleDeleteDesign(d.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <IconTrash size={14} className="mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  >
                    <div className="text-ink-900 truncate text-[15px] font-semibold">
                      {d.name || "Untitled Design"}
                    </div>
                    {d.description && (
                      <div className="text-ink-500 mt-1 line-clamp-1 text-[12.5px]">
                        {d.description}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={
                          isCompleted ? STATUS_COMPLETED : STATUS_IN_PROGRESS
                        }
                      >
                        {isCompleted ? "Completed" : "In progress"}
                      </span>
                      {!isCompleted && stageLabel && (
                        <span className={CHIP_STAGE}>Stage: {stageLabel}</span>
                      )}
                    </div>
                  </SlabRow>
                )
              })}
            </div>
          )}
        </div>

        <ProjectSettingsModal
          project={project}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onUpdate={handleProjectUpdate}
          onDelete={handleProjectDelete}
        />
      </div>
    </ErrorBoundary>
  )
}

function EmptyDesigns(props: { hasAny: boolean; onNew: () => void }) {
  if (props.hasAny) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-ink-500 text-sm">No designs match your search.</p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="bg-teal-journey-tint rounded-full p-4">
        <IconFlask size={28} className="text-teal-journey" />
      </div>
      <p className="text-ink-700 text-sm font-semibold">No designs yet</p>
      <p className="text-ink-400 max-w-sm text-xs">
        Kick off your research by starting a Design. Move through Problem,
        Literature, Hypothesis, and Final Design in a guided flow — reports,
        chats, and files live inside each design.
      </p>
      <Button
        onClick={props.onNew}
        className="bg-brick hover:bg-brick-hover mt-2 gap-2"
      >
        <IconPlus size={16} />
        Start your first Design
      </Button>
    </div>
  )
}
