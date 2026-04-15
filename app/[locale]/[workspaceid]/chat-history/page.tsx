"use client"

import { useContext, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntityCard } from "@/components/cards/entity-card"
import type { AccentKey } from "@/components/canvas/accent-tabs"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import { createChat, getChatsByWorkspaceId } from "@/db/chats"
import { supabase } from "@/lib/supabase/browser-client"
import type { Tables } from "@/supabase/types"
import { IconMessagePlus, IconSearch, IconMessages } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

type ScopeFilter = "all" | "workspace" | "project" | "design"

const FILTERS: { key: ScopeFilter; label: string; accent: AccentKey }[] = [
  { key: "all", label: "All", accent: "neutral" },
  { key: "workspace", label: "Workspace", accent: "sage-brand" },
  { key: "project", label: "Project", accent: "teal-journey" },
  { key: "design", label: "Design", accent: "purple-persona" }
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
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ScopeFilter>("all")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getChatsByWorkspaceId(workspaceId)
      .then(rows => {
        if (!cancelled) setChats(rows as Tables<"chats">[])
      })
      .catch(err => {
        console.error("Failed to load chat history:", err)
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load chat history.",
            variant: "destructive"
          })
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

  const handleStartNew = async () => {
    if (!selectedWorkspace) return
    setCreating(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: "New workspace chat",
        scope: null,
        scope_id: null,
        project_id: null,
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
      router.push(`/${locale}/${workspaceId}/chat/${chat.id}`)
    } catch (err) {
      console.error("Failed to start new workspace chat:", err)
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
            Chat History
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
    </div>
  )
}
