import { Tables } from "@/supabase/types"
import { ChatMessage, LLMID } from "."
import type { RetrievedItem } from "@/lib/rag/types"

export interface ChatSettings {
  model: LLMID
  prompt: string
  temperature: number
  contextLength: number
  includeProfileContext: boolean
  includeWorkspaceInstructions: boolean
  embeddingsProvider: "openai" | "local"
}

export interface ChatPayload {
  chatSettings: ChatSettings
  workspaceInstructions: string
  chatMessages: ChatMessage[]
  assistant: Tables<"assistants"> | null
  /**
   * Items just retrieved for THIS message turn. Post-RAG-cutover (PR-6)
   * these are RagItems carrying source_title / source_url for inline
   * citations; pre-cutover they were Tables<"file_items"> rows.
   * `RetrievedItem` is the structural superset both satisfy.
   */
  messageFileItems: RetrievedItem[]
  /**
   * Items linked to this chat from prior turns (read from `chat_files` /
   * `message_file_items` join). Still typed as `Tables<"file_items">`
   * because the persisted FK lives there. PR-9 will collapse this once
   * `file_items` is dropped.
   */
  chatFileItems: Tables<"file_items">[]
}

export interface ChatAPIPayload {
  chatSettings: ChatSettings
  messages: Tables<"messages">[]
}
