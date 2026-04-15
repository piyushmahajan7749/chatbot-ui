"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EntityCard } from "@/components/cards/entity-card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { getProjectById, updateProject, deleteProject } from "@/db/projects"
import { getDesignsByProject } from "@/db/designs"
import type { Tables } from "@/supabase/types"
import { Project } from "@/types/project"
import { ProjectSettingsModal } from "./project-settings-modal"
import { IconEdit, IconFlask, IconPlus, IconSearch } from "@tabler/icons-react"
import { useToast } from "@/app/hooks/use-toast"

interface StudioCanvasProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
  onOpenChat?: () => void
}

type DesignRow = Tables<"designs"> & {
  description?: string
  content?: unknown
}

export function StudioCanvas({
  children,
  projectId,
  workspaceId
}: StudioCanvasProps) {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [designs, setDesigns] = useState<DesignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState("")

  const actualProjectId = projectId || (params.projectId as string)
  const actualWorkspaceId = workspaceId || (params.workspaceid as string)
  const locale = params.locale as string

  useEffect(() => {
    if (actualProjectId && actualWorkspaceId) {
      void fetchProjectData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualProjectId, actualWorkspaceId])

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

  const handleProjectUpdate = async (updates: Partial<Project>) => {
    if (!project) return
    try {
      const updatedProject = await updateProject(project.id, updates)
      setProject(updatedProject)
      toast({
        title: "Project updated",
        description: "Your project has been updated successfully."
      })
      setSettingsOpen(false)
    } catch (error) {
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
      toast({
        title: "Project deleted",
        description: "Your project has been deleted successfully."
      })
      router.push(`/${locale}/${actualWorkspaceId}/projects`)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive"
      })
    }
  }

  const getTimeAgo = (date: string | null): string => {
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

  // Compute design sub-tab completion chips (matches Design detail: Problem /
  // Literature / Hypothesis / Final). Best-effort parse from the stored
  // content blob; falls back to "problem only" when nothing's generated yet.
  const chipsFor = (d: DesignRow) => {
    let parsed: any = null
    if (d.content) {
      try {
        parsed =
          typeof d.content === "string" ? JSON.parse(d.content) : d.content
      } catch {
        parsed = null
      }
    }
    return [
      {
        label: "Problem",
        filled: !!d.description,
        accent: "teal-journey" as const
      },
      {
        label: "Literature",
        filled: !!parsed?.generatedLiteratureSummary,
        accent: "orange-product" as const
      },
      {
        label: "Hypothesis",
        filled: !!parsed?.selectedHypothesis,
        accent: "purple-persona" as const
      },
      {
        label: "Final",
        filled: !!parsed?.generatedDesign,
        accent: "sage-brand" as const
      }
    ]
  }

  const filteredDesigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return designs
    return designs.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
    )
  }, [designs, search])

  // Children override: used when the page-level route wants to render its own
  // content inside the StudioLayout shell (e.g. Design editor).
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
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
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
          </div>
        </div>

        {/* Designs toolbar */}
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
            <Button
              onClick={handleNewDesign}
              className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
            >
              <IconPlus size={16} />
              New Design
            </Button>
          </div>
        </div>

        {/* Designs grid */}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {filteredDesigns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="bg-teal-journey-tint rounded-full p-4">
                <IconFlask size={28} className="text-teal-journey" />
              </div>
              <p className="text-ink-700 text-sm font-semibold">
                {search ? "No designs match your search." : "No designs yet"}
              </p>
              {!search && (
                <>
                  <p className="text-ink-400 max-w-sm text-xs">
                    Kick off your research by starting a Design. You can move
                    through Problem, Literature, Hypothesis, and Final Design in
                    a guided flow.
                  </p>
                  <Button
                    onClick={handleNewDesign}
                    className="bg-brick hover:bg-brick-hover mt-2 gap-2"
                  >
                    <IconPlus size={16} />
                    Start your first Design
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDesigns.map(design => (
                <EntityCard
                  key={design.id}
                  title={design.name || "Untitled Design"}
                  description={design.description || undefined}
                  chips={chipsFor(design)}
                  timestampLabel="Updated"
                  timestamp={getTimeAgo(design.updated_at || design.created_at)}
                  onClick={() =>
                    router.push(
                      `/${locale}/${actualWorkspaceId}/designs/${design.id}`
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Project settings modal */}
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
