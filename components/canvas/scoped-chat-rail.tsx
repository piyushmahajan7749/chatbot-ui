"use client"

import { ChatUI } from "@/components/chat/chat-ui"
import { createChat, getChatByScope, updateChat } from "@/db/chats"
import { ChatbotUIContext } from "@/context/context"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/browser-client"
import type { Tables } from "@/supabase/types"
import {
  IconBrain,
  IconExternalLink,
  IconMessage,
  IconPlus
} from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { ReactNode, useContext, useEffect, useState } from "react"

export type ChatScope = "project" | "design" | "report"

interface ScopedChatRailProps {
  scope: ChatScope
  scopeId?: string
  scopeName?: string
  className?: string
  headerSlot?: ReactNode
  /** If true, a pinned thread is auto-created as soon as none is found. */
  autoStart?: boolean
  /**
   * Optional scope-specific context injected into the chat's system prompt.
   * For design scope, this should be a summary of the current problem,
   * selected hypotheses, and active design so the assistant answers in
   * reference to the current experiment without the user re-supplying it.
   */
  contextPrompt?: string
}

const SCOPE_LABELS: Record<ChatScope, string> = {
  project: "Project Chat",
  design: "Shadow AI chat",
  report: "Report Chat"
}

/**
 * Right-rail chat with a single pinned thread per (scope, scope_id).
 *
 * Load strategy:
 *  - If the current route is already on a chat page (has :chatid param), defer
 *    to the existing ChatUI so we don't fight the URL-driven load.
 *  - Otherwise resolve the pinned thread for this scope. If one exists, show a
 *    link to open it full-screen. If not, offer a one-click "Start thread"
 *    action that creates the row with scope/scope_id set.
 *
 *  Full auto-load (rendering the pinned thread inline without a route change)
 *  requires refactoring ChatUI to drive from selectedChat rather than
 *  params.chatid. Tracked as a follow-up.
 */
export function ScopedChatRail({
  scope,
  scopeId,
  scopeName,
  className,
  headerSlot,
  autoStart = false,
  contextPrompt
}: ScopedChatRailProps) {
  const params = useParams()
  const router = useRouter()
  const { selectedWorkspace, chatSettings } = useContext(ChatbotUIContext)

  const [pinnedChat, setPinnedChat] = useState<Tables<"chats"> | null>(null)
  const [resolving, setResolving] = useState(false)
  const [creating, setCreating] = useState(false)

  const onChatRoute = Boolean(params.chatid)

  useEffect(() => {
    if (!scopeId || onChatRoute) return
    let cancelled = false
    setResolving(true)
    getChatByScope(scope, scopeId)
      .then(chat => {
        if (!cancelled) setPinnedChat(chat ?? null)
      })
      .catch(() => {
        if (!cancelled) setPinnedChat(null)
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, scopeId, onChatRoute])

  useEffect(() => {
    if (!autoStart) return
    if (onChatRoute) return
    if (resolving) return
    if (pinnedChat) return
    if (!scopeId || !selectedWorkspace) return
    if (creating) return
    void handleStartThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoStart,
    onChatRoute,
    resolving,
    pinnedChat,
    scopeId,
    selectedWorkspace
  ])

  // Keep the pinned chat's system prompt in sync with the current scope context
  // (e.g. when the user edits the design or picks different hypotheses).
  useEffect(() => {
    if (!pinnedChat || !contextPrompt) return
    const trimmed = contextPrompt.trim()
    if (!trimmed) return
    const current = pinnedChat.prompt ?? ""
    if (current.includes(trimmed)) return
    const base = chatSettings?.prompt ?? selectedWorkspace?.default_prompt ?? ""
    const merged = `${base ? base.trim() + "\n\n" : ""}${trimmed}`
    void updateChat(pinnedChat.id, { prompt: merged })
      .then(updated => setPinnedChat(updated))
      .catch(err => console.warn("Failed to refresh chat context:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedChat?.id, contextPrompt])

  const handleStartThread = async () => {
    if (!scopeId || !selectedWorkspace) return
    setCreating(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const basePrompt =
        chatSettings?.prompt ?? selectedWorkspace.default_prompt ?? ""
      const prompt =
        contextPrompt && contextPrompt.trim()
          ? `${basePrompt ? basePrompt.trim() + "\n\n" : ""}${contextPrompt.trim()}`
          : basePrompt

      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: `${SCOPE_LABELS[scope]} — ${scopeName ?? scopeId.slice(0, 6)}`,
        scope,
        scope_id: scopeId,
        project_id: scope === "project" ? scopeId : null,
        model: chatSettings?.model ?? selectedWorkspace.default_model,
        prompt,
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
      setPinnedChat(chat)
    } catch (err) {
      console.error("Failed to start scoped chat thread:", err)
    } finally {
      setCreating(false)
    }
  }

  const openPinnedThread = () => {
    if (!pinnedChat || !selectedWorkspace) return
    const locale = (params.locale as string) ?? "en"
    router.push(`/${locale}/${selectedWorkspace.id}/chat/${pinnedChat.id}`)
  }

  return (
    <div
      className={cn("text-ink bg-surface flex size-full flex-col", className)}
    >
      <div className="border-line bg-paper-2 shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-ink text-paper flex size-7 items-center justify-center rounded-md">
            <IconBrain size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
              {SCOPE_LABELS[scope]}
            </div>
            {scopeName && (
              <div className="text-ink truncate text-[13px] font-semibold">
                {scopeName}
              </div>
            )}
          </div>
          {headerSlot}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {onChatRoute ? (
          <ChatUI variant="panel" />
        ) : resolving ? (
          <div className="text-ink-3 flex h-full items-center justify-center text-[12px]">
            Loading thread…
          </div>
        ) : pinnedChat ? (
          <div className="flex h-full flex-col">
            <div className="border-line flex shrink-0 items-center justify-end gap-2 border-b px-3 py-1.5">
              <button
                onClick={openPinnedThread}
                title="Open thread full-screen"
                className="text-ink-3 hover:bg-paper-2 hover:text-ink flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                <IconExternalLink size={11} />
                Expand
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <ChatUI variant="panel" chatId={pinnedChat.id} />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <IconMessage size={28} className="text-ink-3" />
            <p className="text-ink-3 text-[12.5px]">No {scope} chat yet.</p>
            <button
              onClick={handleStartThread}
              disabled={creating || !scopeId || !selectedWorkspace}
              className="bg-rust text-paper flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium hover:bg-[color:var(--rust-hover)] disabled:opacity-50"
            >
              <IconPlus size={12} />
              {creating ? "Starting…" : "Start thread"}
            </button>
          </div>
        )}
      </div>

      <div className="border-line bg-paper-2 shrink-0 border-t px-4 py-2">
        <div className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]">
          <IconMessage size={12} />
          <span>Scoped to {scope}</span>
        </div>
      </div>
    </div>
  )
}
