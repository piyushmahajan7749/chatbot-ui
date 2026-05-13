"use client"

/**
 * Workspace-level "/chat" landing.
 *
 * When the chat is empty (no messages yet), shows the user a quick
 * picker for what to chat with: Workspace / Projects / Designs /
 * Reports / Files. Each card opens StartChatModal on the matching tab.
 *
 * Previous version had:
 *   - QuickSettings (model picker) at the top - model identity is
 *     intentionally hidden from users now (Shadow AI is the product)
 *   - 4 "suggestion task" cards (Analyze data, Summarize a paper, …) -
 *     replaced by the scope picker so users select their context
 *     instead of a generic intent
 */
import { ChatHelp } from "@/components/chat/chat-help"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatUI } from "@/components/chat/chat-ui"
import {
  StartChatModal,
  type StartChatSelection,
  type ChatScope
} from "@/components/chat/start-chat-modal"
import { createChat } from "@/db/chats"
import { createChatFiles } from "@/db/chat-files"
import { Brand } from "@/components/ui/brand"
import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { supabase } from "@/lib/supabase/browser-client"
import { useToast } from "@/app/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  IconBriefcase,
  IconFile,
  IconFlask,
  IconFolder,
  IconReport
} from "@tabler/icons-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useContext, useEffect, useRef, useState } from "react"

type UseCase = "design" | "validate" | "explore" | "browse"

const USE_CASE_GREETING: Record<UseCase, string> = {
  design: "Ready to design your next experiment?",
  validate: "Let's pressure-test a hypothesis.",
  explore: "What should we dig into?",
  browse: "What can I help with today?"
}

interface ScopeCard {
  id: ChatScope
  icon: typeof IconBriefcase
  title: string
  description: string
  color: string
}

const SCOPE_CARDS: ScopeCard[] = [
  {
    id: "workspace",
    icon: IconBriefcase,
    title: "Workspace",
    description: "Chat across everything in this workspace",
    color: "text-blue-600 bg-blue-50 border-blue-100"
  },
  {
    id: "project",
    icon: IconFolder,
    title: "Projects",
    description: "Pick one or more projects to chat with",
    color: "text-emerald-600 bg-emerald-50 border-emerald-100"
  },
  {
    id: "design",
    icon: IconFlask,
    title: "Designs",
    description: "Chat about specific designs",
    color: "text-purple-600 bg-purple-50 border-purple-100"
  },
  {
    id: "report",
    icon: IconReport,
    title: "Reports",
    description: "Pick reports to discuss",
    color: "text-orange-600 bg-orange-50 border-orange-100"
  },
  {
    id: "files",
    icon: IconFile,
    title: "Files",
    description: "Chat with selected files only",
    color: "text-slate-600 bg-slate-50 border-slate-100"
  }
]

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const router = useRouter()
  const params = useParams() as { locale: string; workspaceid: string }
  const searchParams = useSearchParams()
  const { chatMessages, profile, selectedWorkspace, chatSettings } =
    useContext(ChatbotUIContext)
  const { toast } = useToast()

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const useCase = (profile?.use_case as UseCase | null) ?? null
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? ""
  const greeting = useCase
    ? USE_CASE_GREETING[useCase]
    : "What can I help with today?"

  const [modalOpen, setModalOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<ChatScope>("workspace")
  const [creating, setCreating] = useState(false)

  // Routes to a fresh chat created from the picker selection. Mirrors
  // chat-history/page.tsx:handleStartFromModal (CSV scope_id, project
  // mirror, chat_files for the Files tab).
  const handleStartFromPicker = async (sel: StartChatSelection) => {
    if (!selectedWorkspace) return
    setCreating(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const scopeIdEncoded =
        sel.scopeIds.length > 0 ? sel.scopeIds.join(",") : null
      const projectId =
        sel.scope === "project" && sel.scopeIds.length > 0
          ? sel.scopeIds[0]
          : null

      const chat = await createChat({
        user_id: user.id,
        workspace_id: selectedWorkspace.id,
        name: sel.label,
        scope: sel.scope,
        scope_id: scopeIdEncoded,
        project_id: projectId,
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
          console.warn("[chat/page] chat_files insert failed:", err)
        }
      }

      router.push(`/${params.locale}/${params.workspaceid}/chat/${chat.id}`)
    } catch (err: any) {
      toast({
        title: "Couldn't start chat",
        description: err?.message ?? "Try again.",
        variant: "destructive"
      })
    } finally {
      setCreating(false)
      setModalOpen(false)
    }
  }

  const openModalOnTab = (tab: ChatScope) => {
    setInitialTab(tab)
    setModalOpen(true)
  }

  // Issues #2 + #3 - "Start chat" buttons on /designs and /reports route
  // here with `?defaultScope=designs|reports`. We auto-create a chat
  // scoped to ALL designs / ALL reports in the workspace (empty scope_id
  // -> retrieve.ts treats as "everything of this type"), and route the
  // user straight in. They can still narrow to a specific design from
  // the chat header. The autoStartedRef guards against double-firing in
  // dev React strict mode.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current) return
    const defaultScope = searchParams.get("defaultScope")
    if (!defaultScope) return
    if (!selectedWorkspace || !profile) return
    if (defaultScope !== "designs" && defaultScope !== "reports") return
    autoStartedRef.current = true

    const scope: ChatScope = defaultScope === "designs" ? "design" : "report"
    const label =
      defaultScope === "designs" ? "All designs chat" : "All reports chat"

    void (async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser()
        if (!user) throw new Error("Not signed in")
        const chat = await createChat({
          user_id: user.id,
          workspace_id: selectedWorkspace.id,
          name: label,
          scope,
          // Empty scope_id - retrieve.ts interprets this as "every
          // design/report in the workspace" for these two scopes.
          scope_id: null,
          project_id: null,
          model: chatSettings?.model ?? selectedWorkspace.default_model,
          prompt:
            chatSettings?.prompt ?? selectedWorkspace.default_prompt ?? "",
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
        router.replace(
          `/${params.locale}/${params.workspaceid}/chat/${chat.id}`
        )
      } catch (err: any) {
        toast({
          title: "Couldn't start chat",
          description: err?.message ?? "Try again.",
          variant: "destructive"
        })
        autoStartedRef.current = false
      }
    })()
    // selectedWorkspace and profile may load asynchronously - re-run
    // until they're both available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, selectedWorkspace?.id, profile?.user_id])

  return (
    <>
      {chatMessages.length === 0 ? (
        <div className="flex h-full flex-col bg-slate-50">
          {/* Top bar - chat help only. Model picker (QuickSettings)
              removed since model identity is hidden from users. */}
          <div className="flex items-center justify-end border-b border-slate-200 bg-white px-4 py-2">
            <ChatHelp />
          </div>

          {/* Centered welcome + scope picker */}
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <Brand />

            <div className="mt-6 text-center">
              {firstName && (
                <p className="text-ink-3 text-[13px]">Hi {firstName},</p>
              )}
              <p className="text-ink mt-0.5 text-[15px] font-medium sm:text-[16px]">
                {greeting}
              </p>
              <p className="text-ink-3 mt-2 text-[13px]">
                Pick what you&apos;d like to chat with - answers cite the
                source.
              </p>
            </div>

            {/* Scope picker - each card opens the modal pre-set to that tab */}
            <div className="mt-6 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-5">
              {SCOPE_CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.id}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                      card.color
                    )}
                    onClick={() => openModalOnTab(card.id)}
                    disabled={creating}
                  >
                    <Icon className="size-5" />
                    <div>
                      <p className="text-sm font-semibold">{card.title}</p>
                      <p className="mt-0.5 text-xs opacity-70">
                        {card.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Free-form input still available below - workspace-scoped on
              first send (matches the Workspace card). */}
          <div className="w-full max-w-3xl self-center px-4 pb-6 pt-2">
            <ChatInput />
          </div>

          {/* Picker modal - shared with chat-history page */}
          <StartChatModal
            isOpen={modalOpen}
            onOpenChange={setModalOpen}
            onConfirm={handleStartFromPicker}
            busy={creating}
            initialTab={initialTab}
          />
        </div>
      ) : (
        <ChatUI />
      )}
    </>
  )
}
