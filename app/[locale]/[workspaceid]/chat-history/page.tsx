"use client"

/**
 * Workspace Chats — the list of GENERAL chats (workspace-wide + project
 * level). Chats scoped to a single design or report are deliberately excluded:
 * those live inside the design/report's own chat rail and are not surfaced
 * here. Each slab shows the chat name, the question that was asked, and the
 * source the answer drew its information from. Search + page-number pagination
 * only — no filters, no "start thread" (general chats begin from the chat UI).
 */

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { EntityCard } from "@/components/cards/entity-card"
import { SlabPager } from "@/components/ui/slab-pager"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getFirstUserMessagePreviewsByChatIds } from "@/db/messages"
import { getChatSourceTitlesByChatIds } from "@/db/message-file-items"
import { formatShortDateEU } from "@/lib/format-date"
import type { Tables } from "@/supabase/types"
import { IconMessages, IconSearch } from "@tabler/icons-react"

const PAGE_SIZE = 12

// Single-document chat rails (a chat pinned to one design/report for editing)
// are stored on the chat row with these scopes; the general Chats page hides
// them — they belong to their parent design/report, not the workspace feed.
const EXCLUDED_SCOPES = new Set(["design", "report"])

export default function ChatHistoryPage() {
  const params = useParams()
  const router = useRouter()

  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [chats, setChats] = useState<Tables<"chats">[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  // chatId → first user message ("the question asked").
  const [questionByChat, setQuestionByChat] = useState<Record<string, string>>(
    {}
  )
  // chatId → a representative RAG source title ("from which source").
  const [sourceByChat, setSourceByChat] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getChatsByWorkspaceId(workspaceId)
      .then(rows => {
        if (cancelled) return
        // General chats only: drop the per-design / per-report edit rails.
        const general = (rows as Tables<"chats">[]).filter(
          c => !c.scope || !EXCLUDED_SCOPES.has(c.scope)
        )
        setChats(general)

        const ids = general.map(c => c.id)
        void getFirstUserMessagePreviewsByChatIds(ids)
          .then(map => {
            if (!cancelled) setQuestionByChat(map)
          })
          .catch(err =>
            console.warn("[chat-history] question previews failed:", err)
          )
        void getChatSourceTitlesByChatIds(ids)
          .then(map => {
            if (!cancelled) setSourceByChat(map)
          })
          .catch(err =>
            console.warn("[chat-history] source titles failed:", err)
          )
      })
      .catch(err => console.error("Failed to load chats:", err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  // Snap to first page when the search narrows the list.
  useEffect(() => {
    setPage(0)
  }, [search])

  const shortDate = (date: string | null): string =>
    date ? formatShortDateEU(date) : "-"

  // Compress a free-form chat name to a 1-3 word title; keep labelled chats.
  const shortChatTitle = (name: string): string => {
    if (!name) return "Untitled"
    if (name.includes("·")) return name
    const words = name.trim().split(/\s+/)
    return words.slice(0, 3).join(" ") + (words.length > 3 ? "…" : "")
  }

  const sortedChats = useMemo(
    () =>
      [...chats].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [chats]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedChats
    return sortedChats.filter(c => {
      const question = questionByChat[c.id] ?? ""
      return (
        c.name.toLowerCase().includes(q) || question.toLowerCase().includes(q)
      )
    })
  }, [sortedChats, search, questionByChat])

  const start = page * PAGE_SIZE
  const paged = filtered.slice(start, start + PAGE_SIZE)

  return (
    <div className="bg-ink-50 h-full space-y-6 p-6">
      <div>
        <div className="text-ink-400 text-[11px] font-bold uppercase tracking-[0.13em]">
          Workspace
        </div>
        <h1 className="text-ink-900 text-2xl font-extrabold tracking-tight">
          Chats
        </h1>
        <p className="text-ink-500 mt-1 text-sm">
          Your general chats. Chats opened inside a design to edit it stay with
          that design.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
        </div>
      ) : chats.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
          <IconMessages size={36} className="text-ink-200" />
          <p className="text-ink-400 text-sm">No chat threads yet.</p>
        </div>
      ) : (
        <SlabPager
          total={filtered.length}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          topRight={
            <div className="border-ink-200 flex w-full max-w-[260px] items-center gap-2 rounded-md border bg-white px-3 sm:w-[260px]">
              <IconSearch size={14} className="text-ink-400 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search chats…"
                className="text-ink-900 placeholder:text-ink-400 h-8 w-full border-none bg-transparent text-[12.5px] outline-none"
              />
            </div>
          }
        >
          {paged.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <IconMessages size={32} className="text-ink-200" />
              <p className="text-ink-400 text-sm">No chats match “{search}”.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paged.map(chat => {
                const question = questionByChat[chat.id] ?? ""
                const source = sourceByChat[chat.id]
                return (
                  <EntityCard
                    key={chat.id}
                    title={shortChatTitle(chat.name)}
                    description={question || undefined}
                    chips={
                      source
                        ? [
                            {
                              label: `from ${source}`,
                              filled: true,
                              accent: "sage-brand" as const
                            }
                          ]
                        : []
                    }
                    badges={source ? [`from ${source}`] : []}
                    timestampLabel=""
                    timestamp={shortDate(chat.updated_at || chat.created_at)}
                    onClick={() =>
                      router.push(`/${locale}/${workspaceId}/chat/${chat.id}`)
                    }
                  />
                )
              })}
            </div>
          )}
        </SlabPager>
      )}
    </div>
  )
}
