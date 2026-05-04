import Loading from "@/app/[locale]/loading"
import { cn } from "@/lib/utils"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools"
import { getChatFilesByChatId } from "@/db/chat-files"
import { getChatById } from "@/db/chats"
import {
  getMessageFileItemsByMessageId,
  getRagCitationsByMessageId
} from "@/db/message-file-items"
import { getMessagesByChatId } from "@/db/messages"
import { getMessageImageFromStorage } from "@/db/storage/message-images"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import useHotkey from "@/lib/hooks/use-hotkey"
import { LLMID, MessageImage } from "@/types"
import { useParams } from "next/navigation"
import { FC, useContext, useEffect, useState } from "react"
import { ChatHelp } from "./chat-help"
import { useScroll } from "./chat-hooks/use-scroll"
import { ChatInput } from "./chat-input"
import { ChatMessages } from "./chat-messages"
import { ChatScrollButtons } from "./chat-scroll-buttons"
import { ChatSecondaryButtons } from "./chat-secondary-buttons"

interface ChatUIProps {
  variant?: "full" | "panel"
  /**
   * Optional override for the active chat id. When set, ChatUI loads this chat
   * directly (used by ScopedChatRail to render a pinned thread inline without
   * routing). Falls back to the :chatid route param otherwise.
   */
  chatId?: string
}

export const ChatUI: FC<ChatUIProps> = ({ variant = "full", chatId }) => {
  useHotkey("o", () => handleNewChat())

  const params = useParams()
  const effectiveChatId = chatId ?? (params.chatid as string | undefined)

  const {
    setChatMessages,
    selectedChat,
    setSelectedChat,
    setChatSettings,
    setChatImages,
    assistants,
    setSelectedAssistant,
    setChatFileItems,
    setChatFiles,
    setShowFilesDisplay,
    setUseRetrieval,
    setSelectedTools
  } = useContext(ChatbotUIContext)

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const {
    messagesStartRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    setIsAtBottom,
    isAtTop,
    isAtBottom,
    isOverflowing,
    scrollToTop
  } = useScroll()

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      await fetchMessages()
      await fetchChat()

      scrollToBottom()
      setIsAtBottom(true)
    }

    if (effectiveChatId) {
      setLoading(true)
      fetchData().then(() => {
        handleFocusChatInput()
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChatId])

  const fetchMessages = async () => {
    if (!effectiveChatId) return
    const fetchedMessages = await getMessagesByChatId(effectiveChatId)

    const imagePromises: Promise<MessageImage>[] = fetchedMessages.flatMap(
      message =>
        message.image_paths
          ? message.image_paths.map(async imagePath => {
              const url = await getMessageImageFromStorage(imagePath)

              if (url) {
                const response = await fetch(url)
                const blob = await response.blob()
                const base64 = await convertBlobToBase64(blob)

                return {
                  messageId: message.id,
                  path: imagePath,
                  base64,
                  url,
                  file: null
                }
              }

              return {
                messageId: message.id,
                path: imagePath,
                base64: "",
                url,
                file: null
              }
            })
          : []
    )

    const images: MessageImage[] = await Promise.all(imagePromises.flat())
    setChatImages(images)

    // Load BOTH legacy file-items AND rag-citation snapshots per message.
    // Legacy: join on file_items table (chunks of attached files).
    // RAG: snapshot rows on message_file_items (post-PR-9a) — survive
    //      doc re-indexing because they carry the title/url/content
    //      copy that was true at message-write time.
    const messageFileItemPromises = fetchedMessages.map(
      async message => await getMessageFileItemsByMessageId(message.id)
    )
    const ragCitationPromises = fetchedMessages.map(
      async message => await getRagCitationsByMessageId(message.id)
    )

    const messageFileItems = await Promise.all(messageFileItemPromises)
    const ragCitationsPerMsg = await Promise.all(ragCitationPromises)

    const legacyFileItems = messageFileItems.flatMap(item => item.file_items)
    // Adapt RAG snapshots into the file-item-shape expected downstream
    // (chat-messages.tsx filters chatFileItems by id). Carry the
    // citation metadata so MessageMarkdown can render clickable chips.
    // Cast: `content_snapshot`/`source_*` were added by migration
    // 20260504 + 20260507 but the generated Database types lag until
    // `npm run db-types` runs against the migrated DB.
    const ragVirtualItems = (ragCitationsPerMsg.flat() as any[]).map(row => ({
      id: row.rag_item_id ?? row.id,
      content: row.content_snapshot ?? "",
      source_title: row.source_title,
      source_url: row.source_url,
      // Legacy fields the downstream renderer reads — set safe defaults.
      file_id: null as any,
      tokens: 0,
      sharing: "private",
      created_at: "",
      updated_at: null,
      user_id: "",
      local_embedding: null,
      openai_embedding: null
    }))

    const uniqueFileItems = [
      ...legacyFileItems,
      ...ragVirtualItems
    ] as typeof legacyFileItems
    setChatFileItems(uniqueFileItems)

    const chatFiles = await getChatFilesByChatId(effectiveChatId)

    setChatFiles(
      chatFiles.files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        file: null
      }))
    )

    setUseRetrieval(true)
    setShowFilesDisplay(true)

    // Index rag citations by message id so per-message lookup is O(1).
    // ragCitationsPerMsg is parallel to fetchedMessages by index.
    const ragIdsByMessage = new Map<string, string[]>()
    fetchedMessages.forEach((msg, i) => {
      const ids = (ragCitationsPerMsg[i] as any[])
        .map(row => row.rag_item_id ?? row.id)
        .filter(Boolean) as string[]
      if (ids.length) ragIdsByMessage.set(msg.id, ids)
    })

    const fetchedChatMessages = fetchedMessages.map(message => {
      const legacyIds = messageFileItems
        .filter(messageFileItem => messageFileItem.id === message.id)
        .flatMap(messageFileItem =>
          messageFileItem.file_items.map(fileItem => fileItem.id)
        )
      const ragIds = ragIdsByMessage.get(message.id) ?? []
      return {
        message,
        fileItems: [...legacyIds, ...ragIds]
      }
    })

    setChatMessages(fetchedChatMessages)
  }

  const fetchChat = async () => {
    if (!effectiveChatId) return
    const chat = await getChatById(effectiveChatId)
    if (!chat) return

    if (chat.assistant_id) {
      const assistant = assistants.find(
        assistant => assistant.id === chat.assistant_id
      )

      if (assistant) {
        setSelectedAssistant(assistant)

        const assistantTools = (
          await getAssistantToolsByAssistantId(assistant.id)
        ).tools
        setSelectedTools(assistantTools)
      }
    }

    setSelectedChat(chat)
    setChatSettings({
      model: chat.model as LLMID,
      prompt: chat.prompt,
      temperature: chat.temperature,
      contextLength: chat.context_length,
      includeProfileContext: chat.include_profile_context,
      includeWorkspaceInstructions: chat.include_workspace_instructions,
      embeddingsProvider: chat.embeddings_provider as "openai" | "local"
    })
  }

  if (loading) {
    return <Loading />
  }

  const isPanel = variant === "panel"

  return (
    <div className="relative flex h-full flex-col items-center">
      <div
        className={cn(
          "absolute flex justify-center",
          isPanel ? "left-2 top-2" : "left-4 top-2.5"
        )}
      >
        <ChatScrollButtons
          isAtTop={isAtTop}
          isAtBottom={isAtBottom}
          isOverflowing={isOverflowing}
          scrollToTop={scrollToTop}
          scrollToBottom={scrollToBottom}
        />
      </div>

      <div
        className={cn(
          "absolute flex h-[40px] items-center space-x-2",
          isPanel ? "right-2 top-1" : "right-4 top-1"
        )}
      >
        <ChatSecondaryButtons />
      </div>

      {/* Chat header - hidden in panel mode (studio has its own header).
          Surfaces the chat's scope (workspace / project / design / report
          or the count of attached files) so the user always knows which
          context their answers are pulling from. */}
      {!isPanel && (
        <div className="bg-secondary flex min-h-[50px] w-full items-center justify-center gap-3 border-b-2 px-4 py-2 font-bold">
          <div className="max-w-[600px] truncate">
            {selectedChat?.name || "Chat"}
          </div>
          <ChatScopeBadge />
        </div>
      )}

      <div
        className="flex size-full flex-col overflow-auto border-b"
        onScroll={handleScroll}
      >
        <div ref={messagesStartRef} />

        <ChatMessages />

        <div ref={messagesEndRef} />
      </div>

      <div
        className={cn(
          "relative items-end",
          isPanel
            ? "w-full px-3 pb-3 pt-2"
            : "w-full min-w-[300px] px-2 pb-3 pt-0 sm:w-[600px] sm:pb-8 sm:pt-5 md:w-[700px] lg:w-[700px] xl:w-[800px]"
        )}
      >
        <ChatInput />
      </div>

      {/* Chat help - hidden in panel mode */}
      {!isPanel && (
        <div className="absolute bottom-2 right-2 hidden md:block lg:bottom-4 lg:right-4">
          <ChatHelp />
        </div>
      )}
    </div>
  )
}

/**
 * Pill in the chat header that names the context this chat is bound to.
 * Reads from `selectedChat.scope` / `scope_id` (set by StartChatModal)
 * plus `chatFiles` (for file-attached chats). Lets the user always see
 * which slice of the corpus their answers will come from.
 */
const SCOPE_PILL_CLASSES =
  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"

const ChatScopeBadge: FC = () => {
  const { selectedChat, chatFiles, selectedWorkspace, designs, reports } =
    useContext(ChatbotUIContext)

  if (!selectedChat) return null

  // File-attached chats win over scope (they were created via the
  // StartChatModal "Files" tab and `chat_files` rows are the source of
  // truth for retrieval restriction).
  if (chatFiles && chatFiles.length > 0) {
    return (
      <span
        className={cn(
          SCOPE_PILL_CLASSES,
          "border-ink-200 bg-paper-2 text-ink-700"
        )}
        title={chatFiles.map(f => f.name).join(", ")}
      >
        Files · {chatFiles.length}
      </span>
    )
  }

  const scope = selectedChat.scope
  // scope_id is CSV-encoded for multi-pick (StartChatModal can select
  // 1+ ids per non-Workspace tab). Show the picked count when N>1, the
  // resolved name when N==1.
  const scopeIds = (selectedChat.scope_id ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)

  if (scope === "project" && scopeIds.length > 0) {
    return (
      <span
        className={cn(
          SCOPE_PILL_CLASSES,
          "border-teal-journey/30 bg-teal-journey-tint text-teal-journey"
        )}
      >
        {scopeIds.length === 1 ? "Project" : `Projects · ${scopeIds.length}`}
      </span>
    )
  }
  if (scope === "design" && scopeIds.length > 0) {
    if (scopeIds.length === 1) {
      const d = designs.find(x => x.id === scopeIds[0])
      return (
        <span
          className={cn(
            SCOPE_PILL_CLASSES,
            "border-purple-persona/30 bg-purple-persona-tint text-purple-persona"
          )}
          title={d?.name}
        >
          Design · {d?.name ?? "—"}
        </span>
      )
    }
    return (
      <span
        className={cn(
          SCOPE_PILL_CLASSES,
          "border-purple-persona/30 bg-purple-persona-tint text-purple-persona"
        )}
        title={scopeIds
          .map(id => designs.find(x => x.id === id)?.name ?? id)
          .join(", ")}
      >
        Designs · {scopeIds.length}
      </span>
    )
  }
  if (scope === "report" && scopeIds.length > 0) {
    if (scopeIds.length === 1) {
      const r = reports.find(x => x.id === scopeIds[0])
      return (
        <span
          className={cn(
            SCOPE_PILL_CLASSES,
            "border-orange-product/30 bg-orange-product-tint text-orange-product"
          )}
          title={r?.name ?? undefined}
        >
          Report · {r?.name ?? "—"}
        </span>
      )
    }
    return (
      <span
        className={cn(
          SCOPE_PILL_CLASSES,
          "border-orange-product/30 bg-orange-product-tint text-orange-product"
        )}
        title={scopeIds
          .map(id => reports.find(x => x.id === id)?.name ?? id)
          .join(", ")}
      >
        Reports · {scopeIds.length}
      </span>
    )
  }

  return (
    <span
      className={cn(
        SCOPE_PILL_CLASSES,
        "border-sage-brand/30 bg-sage-brand-tint text-sage-brand"
      )}
    >
      Workspace · {selectedWorkspace?.name ?? ""}
    </span>
  )
}
