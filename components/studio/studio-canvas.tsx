"use client"

import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EntityCard } from "@/components/cards/entity-card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { AccentTabs } from "@/components/canvas/accent-tabs"
import { getProjectById, updateProject, deleteProject } from "@/db/projects"
import { getDesignsByProject } from "@/db/designs"
import { getReportsByProject } from "@/db/reports"
import { createChat, getChatsByWorkspaceId } from "@/db/chats"
import type { Tables } from "@/supabase/types"
import { Project } from "@/types/project"
import { ProjectSettingsModal } from "./project-settings-modal"
import {
  IconClipboardText,
  IconDownload,
  IconEdit,
  IconFile,
  IconFileText,
  IconFlask,
  IconMessage,
  IconMessagePlus,
  IconPhoto,
  IconPlus,
  IconReport,
  IconSearch,
  IconSparkles,
  IconTable,
  IconTrash,
  IconUpload
} from "@tabler/icons-react"
import { useToast } from "@/app/hooks/use-toast"
import { ChatbotUIContext } from "@/context/context"
import { supabase } from "@/lib/supabase/browser-client"
import {
  deleteProjectFile,
  getProjectFiles,
  getProjectFileSignedUrl,
  uploadProjectFile,
  type ProjectFileMeta
} from "@/db/project-files"

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
}

type ReportRow = Tables<"reports">
type ChatRow = Tables<"chats">

type TabKey = "designs" | "reports" | "chats" | "files"

export function StudioCanvas({
  children,
  projectId,
  workspaceId,
  showRail,
  onToggleRail
}: StudioCanvasProps) {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile, selectedWorkspace, chatSettings } =
    useContext(ChatbotUIContext)

  const [project, setProject] = useState<Project | null>(null)
  const [designs, setDesigns] = useState<DesignRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [chats, setChats] = useState<ChatRow[]>([])
  const [files, setFiles] = useState<ProjectFileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<TabKey>("designs")
  const [creatingChat, setCreatingChat] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const actualProjectId = projectId || (params.projectId as string)
  const actualWorkspaceId = workspaceId || (params.workspaceid as string)
  const locale = params.locale as string

  useEffect(() => {
    if (actualProjectId && actualWorkspaceId) {
      void fetchProjectData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualProjectId, actualWorkspaceId])

  // Re-fetch designs/reports/chats when the tab regains focus so returning
  // from a design page shows any newly created/saved designs immediately.
  useEffect(() => {
    if (!actualProjectId || !actualWorkspaceId) return
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchProjectData()
      }
    }
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualProjectId, actualWorkspaceId])

  // Reset search when switching tabs so the placeholder matches the context.
  useEffect(() => {
    setSearch("")
  }, [activeTab])

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

      const [projectDesigns, projectReports, workspaceChats, projectFiles] =
        await Promise.all([
          getDesignsByProject(actualProjectId).catch(() => []),
          profile
            ? getReportsByProject(profile.user_id, actualProjectId).catch(
                () => []
              )
            : Promise.resolve([] as ReportRow[]),
          getChatsByWorkspaceId(actualWorkspaceId).catch(() => []),
          getProjectFiles(actualProjectId).catch(() => [])
        ])

      setDesigns(projectDesigns as DesignRow[])
      setReports(projectReports as ReportRow[])
      setChats(
        (workspaceChats as ChatRow[]).filter(
          c => c.project_id === actualProjectId
        )
      )
      setFiles(projectFiles)
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

  const handleNewReport = () => {
    router.push(
      `/${locale}/${actualWorkspaceId}/reports/new?projectId=${actualProjectId}`
    )
  }

  const handleNewChat = async () => {
    if (!selectedWorkspace || !project) return
    setCreatingChat(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: `${project.name} chat`,
        scope: "project",
        scope_id: project.id,
        project_id: project.id,
        model: chatSettings?.model ?? selectedWorkspace.default_model,
        prompt: chatSettings?.prompt ?? selectedWorkspace.default_prompt ?? "",
        temperature:
          chatSettings?.temperature ?? selectedWorkspace.default_temperature,
        context_length:
          chatSettings?.contextLength ??
          selectedWorkspace.default_context_length,
        embeddings_provider:
          chatSettings?.embeddingsProvider ??
          selectedWorkspace.embeddings_provider,
        include_profile_context:
          chatSettings?.includeProfileContext ??
          selectedWorkspace.include_profile_context,
        include_workspace_instructions:
          chatSettings?.includeWorkspaceInstructions ??
          selectedWorkspace.include_workspace_instructions,
        sharing: "private"
      })
      router.push(`/${locale}/${actualWorkspaceId}/chat/${chat.id}`)
    } catch (error) {
      console.error("Failed to create project chat:", error)
      toast({
        title: "Error",
        description: "Failed to start a new chat.",
        variant: "destructive"
      })
    } finally {
      setCreatingChat(false)
    }
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
        filled: !!parsed?.papers || !!parsed?.generatedLiteratureSummary,
        accent: "orange-product" as const
      },
      {
        label: "Hypothesis",
        filled: !!parsed?.hypotheses || !!parsed?.selectedHypothesis,
        accent: "purple-persona" as const
      },
      {
        label: "Final",
        filled: !!parsed?.designs || !!parsed?.generatedDesign,
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

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    )
  }, [reports, search])

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(c => c.name.toLowerCase().includes(q))
  }, [chats, search])

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return files
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, search])

  const handleUploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    if (!profile || !actualWorkspaceId || !actualProjectId) return
    setUploadingFiles(true)
    let uploaded = 0
    try {
      for (const file of Array.from(list)) {
        try {
          const record = await uploadProjectFile({
            file,
            projectId: actualProjectId,
            workspaceId: actualWorkspaceId,
            userId: profile.user_id
          })
          setFiles(prev => [record, ...prev])
          uploaded++
        } catch (err: any) {
          toast({
            title: `Couldn't upload ${file.name}`,
            description: err?.message ?? "Unsupported file or upload failed.",
            variant: "destructive"
          })
        }
      }
      if (uploaded > 0) {
        toast({
          title: `Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`,
          description: "Files are now available in the Files tab."
        })
        setActiveTab("files")
      }
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleDeleteFile = async (f: ProjectFileMeta) => {
    try {
      await deleteProjectFile(f.id, f.storage_path)
      setFiles(prev => prev.filter(x => x.id !== f.id))
    } catch (err: any) {
      toast({
        title: "Failed to delete file",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    }
  }

  const handleOpenFile = async (f: ProjectFileMeta) => {
    try {
      const url = await getProjectFileSignedUrl(f.storage_path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err: any) {
      toast({
        title: "Unable to open file",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    }
  }

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

  const toolbarCopy: Record<TabKey, { placeholder: string; cta: JSX.Element }> =
    {
      designs: {
        placeholder: "Search designs…",
        cta: (
          <Button
            onClick={handleNewDesign}
            className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
          >
            <IconPlus size={16} />
            New Design
          </Button>
        )
      },
      reports: {
        placeholder: "Search reports…",
        cta: (
          <Button
            onClick={handleNewReport}
            className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
          >
            <IconPlus size={16} />
            New Report
          </Button>
        )
      },
      chats: {
        placeholder: "Search chats…",
        cta: (
          <Button
            onClick={handleNewChat}
            disabled={creatingChat || !selectedWorkspace}
            className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
          >
            <IconMessagePlus size={16} />
            {creatingChat ? "Starting…" : "New Chat"}
          </Button>
        )
      },
      files: {
        placeholder: "Search files…",
        cta: (
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFiles}
            className="bg-brick hover:bg-brick-hover shrink-0 gap-2"
          >
            <IconUpload size={16} />
            {uploadingFiles ? "Uploading…" : "Upload Files"}
          </Button>
        )
      }
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

            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.csv,application/pdf,image/jpeg,image/png,text/csv"
                multiple
                className="hidden"
                onChange={e => {
                  void handleUploadFiles(e.target.files)
                  e.currentTarget.value = ""
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles}
                aria-label="Upload files"
                className="border-ink-200 text-ink-700 hover:bg-ink-100 flex h-9 items-center gap-2 rounded-full border bg-white px-4 text-xs font-semibold uppercase tracking-wide shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
              >
                <IconUpload size={14} className="shrink-0" />
                {uploadingFiles ? "Uploading…" : "Upload Files"}
              </button>

              {/* Chat: toggles chat rail */}
              {onToggleRail && (
                <button
                  onClick={onToggleRail}
                  aria-label="Toggle chat"
                  className={
                    "flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-sm ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 " +
                    (showRail
                      ? "bg-ink-700 hover:bg-ink-800 ring-white/10"
                      : "from-brick to-brick-hover bg-gradient-to-r ring-white/20")
                  }
                >
                  <IconSparkles size={14} className="shrink-0" />
                  Chat
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <AccentTabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as TabKey)}
          tabs={[
            {
              key: "designs",
              label: `Designs${designs.length ? ` (${designs.length})` : ""}`,
              accent: "teal-journey",
              icon: <IconClipboardText size={14} />
            },
            {
              key: "reports",
              label: `Reports${reports.length ? ` (${reports.length})` : ""}`,
              accent: "orange-product",
              icon: <IconReport size={14} />
            },
            {
              key: "chats",
              label: `Chats${chats.length ? ` (${chats.length})` : ""}`,
              accent: "purple-persona",
              icon: <IconMessage size={14} />
            },
            {
              key: "files",
              label: `Files${files.length ? ` (${files.length})` : ""}`,
              accent: "sage-brand",
              icon: <IconFile size={14} />
            }
          ]}
        />

        {/* Toolbar */}
        <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="border-ink-200 flex min-w-[240px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5">
              <IconSearch size={14} className="text-ink-400 shrink-0" />
              <Input
                placeholder={toolbarCopy[activeTab].placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border-none p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {toolbarCopy[activeTab].cta}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {activeTab === "designs" && (
            <DesignsGrid
              designs={filteredDesigns}
              rawCount={designs.length}
              searching={search.trim() !== ""}
              chipsFor={chipsFor}
              getTimeAgo={getTimeAgo}
              onOpenDesign={id =>
                router.push(`/${locale}/${actualWorkspaceId}/designs/${id}`)
              }
              onNewDesign={handleNewDesign}
            />
          )}

          {activeTab === "reports" && (
            <ReportsGrid
              reports={filteredReports}
              rawCount={reports.length}
              searching={search.trim() !== ""}
              getTimeAgo={getTimeAgo}
              onOpenReport={id =>
                router.push(`/${locale}/${actualWorkspaceId}/reports/${id}`)
              }
              onNewReport={handleNewReport}
            />
          )}

          {activeTab === "chats" && (
            <ChatsGrid
              chats={filteredChats}
              rawCount={chats.length}
              searching={search.trim() !== ""}
              getTimeAgo={getTimeAgo}
              onOpenChat={id =>
                router.push(`/${locale}/${actualWorkspaceId}/chat/${id}`)
              }
              onNewChat={handleNewChat}
              creatingChat={creatingChat}
            />
          )}

          {activeTab === "files" && (
            <FilesGrid
              files={filteredFiles}
              rawCount={files.length}
              searching={search.trim() !== ""}
              getTimeAgo={getTimeAgo}
              onOpenFile={handleOpenFile}
              onDeleteFile={handleDeleteFile}
              onUpload={() => fileInputRef.current?.click()}
              uploading={uploadingFiles}
            />
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

// ── Tab grids ──────────────────────────────────────────────────────────

function DesignsGrid(props: {
  designs: DesignRow[]
  rawCount: number
  searching: boolean
  chipsFor: (d: DesignRow) => any
  getTimeAgo: (d: string | null) => string
  onOpenDesign: (id: string) => void
  onNewDesign: () => void
}) {
  const { designs, rawCount, searching, chipsFor, getTimeAgo } = props
  if (designs.length === 0) {
    return (
      <EmptyState
        searching={searching}
        searchEmpty="No designs match your search."
        listEmpty="No designs yet"
        icon={<IconFlask size={28} className="text-teal-journey" />}
        tint="bg-teal-journey-tint"
        description="Kick off your research by starting a Design. You can move through Problem, Literature, Hypothesis, and Final Design in a guided flow."
        ctaLabel="Start your first Design"
        onCta={props.onNewDesign}
        hasRaw={rawCount > 0}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {designs.map(design => (
        <EntityCard
          key={design.id}
          title={design.name || "Untitled Design"}
          description={design.description || undefined}
          chips={chipsFor(design)}
          timestampLabel="Updated"
          timestamp={getTimeAgo(design.updated_at || design.created_at)}
          onClick={() => props.onOpenDesign(design.id)}
        />
      ))}
    </div>
  )
}

function ReportsGrid(props: {
  reports: ReportRow[]
  rawCount: number
  searching: boolean
  getTimeAgo: (d: string | null) => string
  onOpenReport: (id: string) => void
  onNewReport: () => void
}) {
  const { reports, rawCount, searching, getTimeAgo } = props
  if (reports.length === 0) {
    return (
      <EmptyState
        searching={searching}
        searchEmpty="No reports match your search."
        listEmpty="No reports yet"
        icon={<IconReport size={28} className="text-orange-product" />}
        tint="bg-orange-product-tint"
        description="Summarize findings from this project into a shareable report."
        ctaLabel="Create a Report"
        onCta={props.onNewReport}
        hasRaw={rawCount > 0}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {reports.map(report => (
        <EntityCard
          key={report.id}
          title={report.name || "Untitled Report"}
          description={report.description || undefined}
          timestampLabel="Updated"
          timestamp={getTimeAgo(report.updated_at || report.created_at)}
          onClick={() => props.onOpenReport(report.id)}
        />
      ))}
    </div>
  )
}

function ChatsGrid(props: {
  chats: ChatRow[]
  rawCount: number
  searching: boolean
  getTimeAgo: (d: string | null) => string
  onOpenChat: (id: string) => void
  onNewChat: () => void
  creatingChat: boolean
}) {
  const { chats, rawCount, searching, getTimeAgo } = props
  if (chats.length === 0) {
    return (
      <EmptyState
        searching={searching}
        searchEmpty="No chats match your search."
        listEmpty="No project chats yet"
        icon={<IconMessage size={28} className="text-purple-persona" />}
        tint="bg-purple-persona-tint"
        description="Start a project-scoped chat to ask questions across this project's files and designs."
        ctaLabel={props.creatingChat ? "Starting…" : "Start a Chat"}
        onCta={props.onNewChat}
        hasRaw={rawCount > 0}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {chats.map(chat => (
        <EntityCard
          key={chat.id}
          title={chat.name || "Untitled Chat"}
          timestampLabel="Updated"
          timestamp={getTimeAgo(chat.updated_at || chat.created_at)}
          onClick={() => props.onOpenChat(chat.id)}
        />
      ))}
    </div>
  )
}

function FilesGrid(props: {
  files: ProjectFileMeta[]
  rawCount: number
  searching: boolean
  getTimeAgo: (d: string | null) => string
  onOpenFile: (f: ProjectFileMeta) => void
  onDeleteFile: (f: ProjectFileMeta) => void
  onUpload: () => void
  uploading: boolean
}) {
  const { files, rawCount, searching, getTimeAgo } = props

  if (files.length === 0) {
    if (searching && rawCount > 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-ink-500 text-sm">No files match your search.</p>
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="bg-sage-brand-tint rounded-full p-4">
          <IconFile size={28} className="text-sage-brand" />
        </div>
        <p className="text-ink-700 text-sm font-semibold">No files yet</p>
        <p className="text-ink-400 max-w-sm text-xs">
          Upload supporting materials (PDF, JPEG, PNG, CSV) to share context
          across designs and chats in this project.
        </p>
        <Button
          onClick={props.onUpload}
          disabled={props.uploading}
          className="bg-brick hover:bg-brick-hover mt-2 gap-2"
        >
          <IconUpload size={16} />
          {props.uploading ? "Uploading…" : "Upload Files"}
        </Button>
      </div>
    )
  }

  const iconFor = (mime: string, name: string) => {
    if (mime.startsWith("image/")) return <IconPhoto size={18} />
    if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf"))
      return <IconFileText size={18} />
    if (mime.includes("csv") || name.toLowerCase().endsWith(".csv"))
      return <IconTable size={18} />
    return <IconFile size={18} />
  }

  const formatSize = (bytes: number): string => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {files.map(file => (
        <div
          key={file.id}
          className="border-ink-200 hover:border-sage-brand/50 group relative flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-start gap-2">
            <div className="bg-sage-brand-tint text-sage-brand rounded-md p-2">
              {iconFor(file.mime_type, file.name)}
            </div>
            <button
              onClick={() => props.onOpenFile(file)}
              title={file.name}
              className="text-ink-900 line-clamp-3 min-w-0 flex-1 break-words text-left text-sm font-semibold leading-snug hover:underline"
            >
              {file.name}
            </button>
          </div>
          <div className="text-ink-400 flex items-center justify-between text-[10px]">
            <span>{formatSize(file.size)}</span>
            <span>{getTimeAgo(file.created_at)}</span>
          </div>
          <div className="mt-auto flex items-center justify-end gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => props.onOpenFile(file)}
              title="Open file"
              className="text-ink-400 hover:text-ink-700 rounded p-1"
            >
              <IconDownload size={14} />
            </button>
            <button
              onClick={() => props.onDeleteFile(file)}
              title="Delete file"
              className="text-ink-400 rounded p-1 hover:text-red-500"
            >
              <IconTrash size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState(props: {
  searching: boolean
  searchEmpty: string
  listEmpty: string
  icon: React.ReactNode
  tint: string
  description: string
  ctaLabel: string
  onCta: () => void
  hasRaw: boolean
}) {
  const {
    searching,
    searchEmpty,
    listEmpty,
    icon,
    tint,
    description,
    ctaLabel,
    onCta,
    hasRaw
  } = props

  if (searching && hasRaw) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-ink-500 text-sm">{searchEmpty}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className={`${tint} rounded-full p-4`}>{icon}</div>
      <p className="text-ink-700 text-sm font-semibold">{listEmpty}</p>
      <p className="text-ink-400 max-w-sm text-xs">{description}</p>
      <Button
        onClick={onCta}
        className="bg-brick hover:bg-brick-hover mt-2 gap-2"
      >
        <IconPlus size={16} />
        {ctaLabel}
      </Button>
    </div>
  )
}
