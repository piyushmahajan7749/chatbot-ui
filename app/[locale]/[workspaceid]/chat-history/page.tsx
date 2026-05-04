"use client"

import { useContext, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntityCard } from "@/components/cards/entity-card"
import type { AccentKey } from "@/components/canvas/accent-tabs"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import {
  StartChatModal,
  type StartChatSelection
} from "@/components/chat/start-chat-modal"
import { createChatFiles } from "@/db/chat-files"
import { createChat, getChatsByWorkspaceId } from "@/db/chats"
import { getReportsByWorkspaceId } from "@/db/reports-firestore"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { supabase } from "@/lib/supabase/browser-client"
import type { Tables } from "@/supabase/types"
import {
  IconFile,
  IconFileText,
  IconMessagePlus,
  IconMessages,
  IconSearch
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

type ScopeFilter =
  | "all"
  | "workspace"
  | "project"
  | "design"
  | "reports"
  | "files"

const FILTERS: { key: ScopeFilter; label: string; accent: AccentKey }[] = [
  { key: "all", label: "All", accent: "neutral" },
  { key: "workspace", label: "Workspace", accent: "sage-brand" },
  { key: "project", label: "Project", accent: "teal-journey" },
  { key: "design", label: "Design", accent: "purple-persona" },
  { key: "reports", label: "Reports", accent: "orange-product" },
  { key: "files", label: "Files", accent: "neutral" }
]

const SCOPE_ACCENT: Record<string, AccentKey> = {
  workspace: "sage-brand",
  project: "teal-journey",
  design: "purple-persona"
}

export default function ChatHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { selectedWorkspace, chatSettings } = useContext(ChatbotUIContext)

  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [chats, setChats] = useState<Tables<"chats">[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [files, setFiles] = useState<Tables<"files">[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ScopeFilter>("all")
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Fan out — chats are the primary feed but reports + files share the
    // same surface as adjacent chat targets. Each promise is best-effort:
    // a failed report/file fetch shouldn't blank the whole page.
    Promise.allSettled([
      getChatsByWorkspaceId(workspaceId),
      getReportsByWorkspaceId(workspaceId),
      getFileWorkspacesByWorkspaceId(workspaceId).then(
        ws => (ws as any).files ?? []
      )
    ])
      .then(([chatRes, reportRes, fileRes]) => {
        if (cancelled) return
        if (chatRes.status === "fulfilled") {
          setChats(chatRes.value as Tables<"chats">[])
        } else {
          console.error("Failed to load chats:", chatRes.reason)
        }
        if (reportRes.status === "fulfilled") {
          setReports(reportRes.value as any[])
        }
        if (fileRes.status === "fulfilled") {
          setFiles(fileRes.value as Tables<"files">[])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, toast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (filter === "reports" || filter === "files") return chats // unused — feeds below
    return chats.filter(c => {
      const scopeMatch =
        filter === "all"
          ? true
          : filter === "workspace"
            ? !c.scope
            : c.scope === filter
      const searchMatch = q ? c.name.toLowerCase().includes(q) : true
      return scopeMatch && searchMatch
    })
  }, [chats, filter, search])

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter(r =>
      (r.name || r.description || "").toLowerCase().includes(q)
    )
  }, [reports, search])

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return files
    return files.filter(f =>
      (f.name || f.description || "").toLowerCase().includes(q)
    )
  }, [files, search])

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

  const handleStartNew = () => {
    // Open the picker modal — actual chat creation happens in
    // `handleStartFromModal` once the user picks workspace / project /
    // design / report / files.
    setStartModalOpen(true)
  }

  const handleStartFromModal = async (sel: StartChatSelection) => {
    if (!selectedWorkspace) return
    setCreating(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      // Map the picker's selection onto chats.scope + chats.scope_id +
      // chats.project_id. The retrieve route reads these to scope the
      // unified `rag_items` query (lib/rag/retrieve.ts:resolveScope).
      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: sel.label,
        scope: sel.scope,
        scope_id: sel.scopeId,
        // For project-scoped chats we mirror scopeId into project_id so
        // the existing project-chat surface (studio-canvas) finds it.
        project_id: sel.scope === "project" ? sel.scopeId : null,
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

      // For "files" scope: insert chat_files rows so handleRetrieval
      // (chat-helpers/index.ts) sees them as attached files and
      // restricts retrieval to those file rows in `rag_items`.
      if (sel.fileIds.length > 0) {
        try {
          await createChatFiles(
            sel.fileIds.map(fileId => ({
              user_id: user.id,
              chat_id: chat.id,
              file_id: fileId
            }))
          )
        } catch (err) {
          console.warn(
            "[chat-history] failed to attach files; chat created without file scope:",
            err
          )
        }
      }

      setStartModalOpen(false)
      router.push(`/${locale}/${workspaceId}/chat/${chat.id}`)
    } catch (err) {
      console.error("Failed to start new chat:", err)
      toast({
        title: "Error",
        description: "Failed to start chat.",
        variant: "destructive"
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-ink-50 h-full space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-ink-400 text-[11px] font-bold uppercase tracking-[0.13em]">
            Workspace
          </div>
          <h1 className="text-ink-900 text-2xl font-extrabold tracking-tight">
            Chats
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            Every thread across every project and design, in one place.
          </p>
        </div>
        <Button
          onClick={handleStartNew}
          disabled={creating || !selectedWorkspace}
          className="bg-brick hover:bg-brick-hover gap-2"
        >
          <IconMessagePlus size={16} />
          {creating ? "Starting…" : "Start new thread"}
        </Button>
      </div>

      {/* Filters + search */}
      <div className="border-ink-200 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
        <div className="flex items-center gap-1">
          {FILTERS.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors",
                  active
                    ? "bg-ink-900 text-white"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2">
          <IconSearch size={14} className="text-ink-400 shrink-0" />
          <Input
            placeholder="Search threads…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-none shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
        </div>
      ) : filter === "reports" ? (
        filteredReports.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <IconFileText size={36} className="text-ink-200" />
            <p className="text-ink-400 text-sm">
              {search
                ? "No reports match this search."
                : "No reports yet in this workspace."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredReports.map(r => (
              <EntityCard
                key={r.id}
                title={r.name || "Untitled report"}
                badges={["report"]}
                chips={[
                  { label: "report", filled: true, accent: "orange-product" }
                ]}
                timestampLabel="Updated"
                timestamp={getTimeAgo(r.updated_at || r.created_at)}
                onClick={() =>
                  router.push(`/${locale}/${workspaceId}/reports/${r.id}`)
                }
              />
            ))}
          </div>
        )
      ) : filter === "files" ? (
        filteredFiles.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <IconFile size={36} className="text-ink-200" />
            <p className="text-ink-400 text-sm">
              {search
                ? "No files match this search."
                : "No files in this workspace yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredFiles.map(f => (
              <EntityCard
                key={f.id}
                title={f.name || "Untitled file"}
                badges={[f.type ?? "file"]}
                chips={[
                  { label: f.type ?? "file", filled: true, accent: "neutral" }
                ]}
                timestampLabel="Updated"
                timestamp={getTimeAgo(f.updated_at || f.created_at)}
                onClick={() => undefined}
              />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
          <IconMessages size={36} className="text-ink-200" />
          <p className="text-ink-400 text-sm">
            {search || filter !== "all"
              ? "No threads match these filters."
              : "No chat threads yet."}
          </p>
          {!search && filter === "all" && (
            <Button
              onClick={handleStartNew}
              variant="outline"
              className="mt-3 gap-2"
            >
              <IconMessagePlus size={14} />
              Start your first thread
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(chat => {
            const scopeLabel = chat.scope ?? "workspace"
            const accent = SCOPE_ACCENT[scopeLabel] ?? "neutral"
            return (
              <EntityCard
                key={chat.id}
                title={chat.name || "Untitled thread"}
                badges={[scopeLabel]}
                chips={[{ label: scopeLabel, filled: true, accent }]}
                timestampLabel="Updated"
                timestamp={getTimeAgo(chat.updated_at || chat.created_at)}
                onClick={() =>
                  router.push(`/${locale}/${workspaceId}/chat/${chat.id}`)
                }
              />
            )
          })}
        </div>
      )}

      <StartChatModal
        isOpen={startModalOpen}
        onOpenChange={setStartModalOpen}
        onConfirm={handleStartFromModal}
        busy={creating}
      />
    </div>
  )
}
