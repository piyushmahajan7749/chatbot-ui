import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert } from "@/supabase/types"

export const getMessageFileItemsByMessageId = async (messageId: string) => {
  const { data: messageFileItems, error } = await supabase
    .from("messages")
    .select(
      `
      id,
      file_items (*)
    `
    )
    .eq("id", messageId)
    .single()

  if (!messageFileItems) {
    throw new Error(error.message)
  }

  return messageFileItems
}

export const createMessageFileItems = async (
  messageFileItems: TablesInsert<"message_file_items">[]
) => {
  const { data: createdMessageFileItems, error } = await supabase
    .from("message_file_items")
    .insert(messageFileItems)
    .select("*")

  if (!createdMessageFileItems) {
    throw new Error(error.message)
  }

  return createdMessageFileItems
}

/**
 * Look up citation rows for a message that came from the RAG corpus
 * (rag_item_id set). Returns the denormalized snapshot fields written
 * at message-send time so chips survive page reload even if the source
 * doc was re-indexed since.
 */
export const getRagCitationsByMessageId = async (messageId: string) => {
  const { data, error } = await supabase
    .from("message_file_items")
    .select("id, rag_item_id, source_title, source_url, content_snapshot")
    .eq("message_id", messageId)
    .not("rag_item_id", "is", null)

  if (error) throw new Error(error.message)
  return data ?? []
}
