import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ThinkingIndicator } from "@/components/chat/thinking-indicator"
import { ChatbotUIContext } from "@/context/context"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { cn } from "@/lib/utils"
import { getAzureDeploymentNameClient } from "@/lib/azure-deployment-client"
import { Tables } from "@/supabase/types"
import { LLM, LLMID, MessageImage, ModelProvider } from "@/types"
import {
  IconBolt,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconFileText,
  IconMoodSmile,
  IconPencil
} from "@tabler/icons-react"
import Image from "next/image"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { ModelIcon } from "../models/model-icon"
import { Button } from "../ui/button"
import { FileIcon } from "../ui/file-icon"
import { FilePreview } from "../ui/file-preview"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { WithTooltip } from "../ui/with-tooltip"
import { MessageActions } from "./message-actions"
import { MessageMarkdown } from "./message-markdown"

const ICON_SIZE = 32

interface MessageProps {
  message: Tables<"messages">
  fileItems: Tables<"file_items">[]
  isEditing: boolean
  isLast: boolean
  onStartEdit: (message: Tables<"messages">) => void
  onCancelEdit: () => void
  onSubmitEdit: (value: string, sequenceNumber: number) => void
}

export const Message: FC<MessageProps> = ({
  message,
  fileItems,
  isEditing,
  isLast,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit
}) => {
  const {
    assistants,
    profile,
    isGenerating,
    setIsGenerating,
    firstTokenReceived,
    availableLocalModels,
    availableOpenRouterModels,
    chatMessages,
    selectedAssistant,
    chatImages,
    assistantImages,
    toolInUse,
    files,
    models,
    selectedChat
  } = useContext(ChatbotUIContext)

  const { handleSendMessage } = useChatHandler()

  const editInputRef = useRef<HTMLTextAreaElement>(null)

  const [isHovering, setIsHovering] = useState(false)
  const [editedMessage, setEditedMessage] = useState(message.content)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [azureDeploymentName, setAzureDeploymentName] = useState<
    string | null | undefined
  >(undefined)

  const [showImagePreview, setShowImagePreview] = useState(false)
  const [selectedImage, setSelectedImage] = useState<MessageImage | null>(null)

  const [showFileItemPreview, setShowFileItemPreview] = useState(false)
  const [selectedFileItem, setSelectedFileItem] =
    useState<Tables<"file_items"> | null>(null)

  const [viewSources, setViewSources] = useState(false)

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message.content)
    } else {
      const textArea = document.createElement("textarea")
      textArea.value = message.content
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
    }
  }

  const handleSendEdit = () => {
    onSubmitEdit(editedMessage, message.sequence_number)
    onCancelEdit()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isEditing && event.key === "Enter" && event.metaKey) {
      handleSendEdit()
    }
  }

  const handleRegenerate = async () => {
    setIsGenerating(true)
    await handleSendMessage(
      editedMessage || chatMessages[chatMessages.length - 2].message.content,
      chatMessages,
      true
    )
  }

  const handleStartEdit = () => {
    onStartEdit(message)
  }

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked)
    // TODO: Implement actual bookmark persistence to database
    console.log(
      `${isBookmarked ? "Removed" : "Added"} bookmark for message ${message.id}`
    )
  }

  useEffect(() => {
    setEditedMessage(message.content)

    if (isEditing && editInputRef.current) {
      const input = editInputRef.current
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }, [isEditing])

  const MODEL_DATA = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name,
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false
    })),
    ...LLM_LIST,
    ...availableLocalModels,
    ...availableOpenRouterModels
  ].find(llm => llm.modelId === message.model) as LLM

  const messageAssistantImage = assistantImages.find(
    image => image.assistantId === message.assistant_id
  )?.base64

  const selectedAssistantImage = assistantImages.find(
    image => image.path === selectedAssistant?.image_path
  )?.base64

  const modelDetails = LLM_LIST.find(model => model.modelId === message.model)

  const fileAccumulator: Record<
    string,
    {
      id: string
      name: string
      count: number
      type: string
      description: string
    }
  > = {}

  const fileSummary = fileItems.reduce((acc, fileItem) => {
    const parentFile = files.find(file => file.id === fileItem.file_id)
    if (parentFile) {
      if (!acc[parentFile.id]) {
        acc[parentFile.id] = {
          id: parentFile.id,
          name: parentFile.name,
          count: 1,
          type: parentFile.type,
          description: parentFile.description
        }
      } else {
        acc[parentFile.id].count += 1
      }
    }
    return acc
  }, fileAccumulator)

  const isLoadingThisMessage =
    !firstTokenReceived &&
    isGenerating &&
    isLast &&
    message.role === "assistant"

  useEffect(() => {
    if (!isLoadingThisMessage) return
    if (azureDeploymentName !== undefined) return
    ;(async () => {
      const deployment = await getAzureDeploymentNameClient()
      setAzureDeploymentName(deployment)
    })()
  }, [isLoadingThisMessage, azureDeploymentName])

  const displayedModelName =
    isLoadingThisMessage && azureDeploymentName
      ? azureDeploymentName
      : MODEL_DATA?.modelName

  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const isSystem = message.role === "system"

  const scopedAssistantLabel =
    selectedChat?.scope === "design" ? "Shadow AI" : null

  const senderName = isAssistant
    ? message.assistant_id
      ? assistants.find(a => a.id === message.assistant_id)?.name
      : selectedAssistant
        ? selectedAssistant?.name
        : (scopedAssistantLabel ?? displayedModelName)
    : (profile?.display_name ?? profile?.username)

  return (
    <div
      className={cn(
        "group flex w-full px-4 py-2",
        isUser ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "relative flex max-w-[85%] flex-col",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* Sender name + avatar row */}
        {!isSystem && (
          <div
            className={cn(
              "mb-1.5 flex items-center gap-2 px-1",
              isUser ? "flex-row-reverse" : "flex-row"
            )}
          >
            {isAssistant ? (
              messageAssistantImage ? (
                <Image
                  className="size-5 rounded"
                  src={messageAssistantImage}
                  alt="assistant"
                  height={20}
                  width={20}
                />
              ) : (
                <ModelIcon
                  provider={modelDetails?.provider || "custom"}
                  height={20}
                  width={20}
                />
              )
            ) : profile?.image_url ? (
              <Image
                className="size-5 rounded-full"
                src={profile?.image_url}
                height={20}
                width={20}
                alt="user"
              />
            ) : (
              <div className="bg-rust flex size-5 items-center justify-center rounded-full">
                <IconMoodSmile size={12} className="text-paper" />
              </div>
            )}
            <span className="text-ink-3 text-xs font-medium">{senderName}</span>
          </div>
        )}

        {/* System message */}
        {isSystem && (
          <div className="bg-paper-2 flex w-full items-center gap-3 rounded-xl px-4 py-3">
            <IconPencil
              className="bg-ink text-paper shrink-0 rounded p-1"
              size={24}
            />
            <div className="text-ink text-sm font-semibold">Prompt</div>
          </div>
        )}

        {/* Message bubble */}
        {!isSystem && (
          <div
            className={cn(
              "relative rounded-2xl px-4 py-2.5 text-sm shadow-sm",
              isUser
                ? "bg-ink text-paper rounded-tr-sm"
                : "border-line bg-surface text-ink rounded-tl-sm border"
            )}
          >
            {/* Hover actions */}
            <div
              className={cn(
                "absolute top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100",
                isUser ? "-left-8" : "-right-8"
              )}
            >
              <MessageActions
                onCopy={handleCopy}
                onEdit={handleStartEdit}
                isAssistant={isAssistant}
                isLast={isLast}
                isEditing={isEditing}
                isHovering={isHovering}
                onRegenerate={handleRegenerate}
                onBookmark={handleBookmark}
                isBookmarked={isBookmarked}
              />
            </div>

            {/* Content */}
            {isLoadingThisMessage ? (
              <>
                {(() => {
                  switch (toolInUse) {
                    case "none":
                      return <ThinkingIndicator />
                    case "retrieval":
                      return (
                        <div className="flex animate-pulse items-center space-x-2 text-slate-500">
                          <IconFileText size={18} />
                          <div>Searching files...</div>
                        </div>
                      )
                    default:
                      return (
                        <div className="flex animate-pulse items-center space-x-2 text-slate-500">
                          <IconBolt size={18} />
                          <div>Using {toolInUse}...</div>
                        </div>
                      )
                  }
                })()}
              </>
            ) : isEditing ? (
              <TextareaAutosize
                textareaRef={editInputRef}
                className="text-md w-full bg-transparent"
                value={editedMessage}
                onValueChange={setEditedMessage}
                maxRows={20}
              />
            ) : (
              <MessageMarkdown
                content={message.content}
                isUser={isUser}
                // Post-PR-6 each fileItem may carry RagItem citation
                // metadata (source_title / source_url / source_section)
                // so the chip renderer can resolve [N] markers to
                // clickable links. Legacy file_items rows just produce
                // styled pills via the renderer's fallback path.
                sources={fileItems.map(fi => ({
                  source_title: (fi as any).source_title ?? null,
                  source_url: (fi as any).source_url ?? null,
                  source_section: (fi as any).source_section ?? null
                }))}
              />
            )}
          </div>
        )}

        {/* Sources */}
        {fileItems.length > 0 && (
          <div className="mt-2 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
            {!viewSources ? (
              <div
                className="flex cursor-pointer items-center font-medium text-slate-600 hover:text-slate-800"
                onClick={() => setViewSources(true)}
              >
                {fileItems.length}
                {fileItems.length > 1 ? " Sources " : " Source "}
                from {Object.keys(fileSummary).length}{" "}
                {Object.keys(fileSummary).length > 1 ? "Files" : "File"}{" "}
                <IconCaretRightFilled className="ml-1" size={14} />
              </div>
            ) : (
              <>
                <div
                  className="flex cursor-pointer items-center font-medium text-slate-600 hover:text-slate-800"
                  onClick={() => setViewSources(false)}
                >
                  {fileItems.length}
                  {fileItems.length > 1 ? " Sources " : " Source "}
                  from {Object.keys(fileSummary).length}{" "}
                  {Object.keys(fileSummary).length > 1 ? "Files" : "File"}{" "}
                  <IconCaretDownFilled className="ml-1" size={14} />
                </div>

                <div className="mt-2 space-y-3">
                  {Object.values(fileSummary).map((file, index) => (
                    <div key={index}>
                      <div className="flex items-center space-x-2">
                        <FileIcon type={file.type} />
                        <div className="truncate font-medium text-slate-700">
                          {file.name}
                        </div>
                      </div>

                      {fileItems
                        .filter(fileItem => {
                          const parentFile = files.find(
                            pf => pf.id === fileItem.file_id
                          )
                          return parentFile?.id === file.id
                        })
                        .map((fileItem, idx) => (
                          <div
                            key={idx}
                            className="ml-6 mt-1 cursor-pointer text-xs font-normal text-slate-500 hover:text-slate-700"
                            onClick={() => {
                              setSelectedFileItem(fileItem)
                              setShowFileItemPreview(true)
                            }}
                          >
                            {fileItem.content.substring(0, 200)}...
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Images */}
        {message.image_paths.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.image_paths.map((path, index) => {
              const item = chatImages.find(image => image.path === path)
              return (
                <Image
                  key={index}
                  className="cursor-pointer rounded-lg hover:opacity-80"
                  src={path.startsWith("data") ? path : item?.base64}
                  alt="message image"
                  width={200}
                  height={200}
                  onClick={() => {
                    setSelectedImage({
                      messageId: message.id,
                      path,
                      base64: path.startsWith("data")
                        ? path
                        : item?.base64 || "",
                      url: path.startsWith("data") ? "" : item?.url || "",
                      file: null
                    })
                    setShowImagePreview(true)
                  }}
                  loading="lazy"
                />
              )
            })}
          </div>
        )}

        {/* Edit buttons */}
        {isEditing && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleSendEdit}>
              Save & Send
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {showImagePreview && selectedImage && (
        <FilePreview
          type="image"
          item={selectedImage}
          isOpen={showImagePreview}
          onOpenChange={(isOpen: boolean) => {
            setShowImagePreview(isOpen)
            setSelectedImage(null)
          }}
        />
      )}

      {showFileItemPreview && selectedFileItem && (
        <FilePreview
          type="file_item"
          item={selectedFileItem}
          isOpen={showFileItemPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowFileItemPreview(isOpen)
            setSelectedFileItem(null)
          }}
        />
      )}
    </div>
  )
}
