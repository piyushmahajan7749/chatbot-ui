"use client"

import { ChatUI } from "@/components/chat/chat-ui"
import { createChat, getChatByScope } from "@/db/chats"
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
}

const SCOPE_LABELS: Record<ChatScope, string> = {
  project: "Project Chat",
  design: "Design Chat",
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
  headerSlot
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

  const handleStartThread = async () => {
    if (!scopeId || !selectedWorkspace) return
    setCreating(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: `${SCOPE_LABELS[scope]} — ${scopeName ?? scopeId.slice(0, 6)}`,
        scope,
        scope_id: scopeId,
        project_id: scope === "project" ? scopeId : null,
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
      className={cn("text-ink-900 flex size-full flex-col bg-white", className)}
    >
      <div className="border-ink-200 bg-ink-50 shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-teal-journey-dark flex size-7 items-center justify-center rounded-md text-white">
            <IconBrain size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
              {SCOPE_LABELS[scope]}
            </div>
            {scopeName && (
              <div className="text-ink-900 truncate text-xs font-semibold">
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
          <div className="text-ink-400 flex h-full items-center justify-center text-xs">
            Loading thread…
          </div>
        ) : pinnedChat ? (
          <div className="flex h-full flex-col">
            <div className="border-ink-100 flex shrink-0 items-center justify-end gap-2 border-b px-3 py-1.5">
              <button
                onClick={openPinnedThread}
                title="Open thread full-screen"
                className="text-ink-500 hover:bg-ink-100 hover:text-ink-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
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
            <IconMessage size={28} className="text-ink-400" />
            <p className="text-ink-500 text-xs">No {scope} chat yet.</p>
            <button
              onClick={handleStartThread}
              disabled={creating || !scopeId || !selectedWorkspace}
              className="bg-brick hover:bg-brick-hover flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
            >
              <IconPlus size={12} />
              {creating ? "Starting…" : "Start thread"}
            </button>
          </div>
        )}
      </div>

      <div className="border-ink-200 bg-ink-50 shrink-0 border-t px-4 py-2">
        <div className="text-ink-400 flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
          <IconMessage size={12} />
          <span>Scoped to {scope}</span>
        </div>
      </div>
    </div>
  )
}
