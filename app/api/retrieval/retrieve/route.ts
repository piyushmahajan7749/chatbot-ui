import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import {
  getAzureOpenAIEmbeddingsClient,
  getAzureOpenAIEmbeddingsDeployment
} from "@/lib/azure-openai"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"

/**
 * RAG retrieve endpoint.
 *
 * `file_items` rows can carry `openai_embedding`, `local_embedding`, or
 * both. The schema doesn't track which provider a file was ingested with,
 * so a previous version of this route would silently return zero chunks
 * when the caller's chat-time `embeddingsProvider` didn't match the column
 * that was actually populated at ingest.
 *
 * We now try the caller's preferred provider first and, if it returns
 * nothing, fall back to the OTHER provider before giving up. This catches
 * the common cross-provider mismatch without doubling cost in the happy
 * path.
 */
export async function POST(request: Request) {
  const json = await request.json()
  const { userInput, fileIds, embeddingsProvider, sourceCount } = json as {
    userInput: string
    fileIds: string[]
    embeddingsProvider: "openai" | "local"
    sourceCount: number
  }

  const uniqueFileIds = [...new Set(fileIds ?? [])]
  const matchSourceCount = sourceCount ?? 8

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    // Ownership check: refuse to retrieve embeddings for files the caller
    // doesn't own — would otherwise be a uuid-guessing attack.
    if (uniqueFileIds.length > 0) {
      const { data: ownedFiles, error: ownedError } = await supabaseAdmin
        .from("files")
        .select("id")
        .in("id", uniqueFileIds)
        .eq("user_id", profile.user_id)

      if (ownedError) throw ownedError

      if (!ownedFiles || ownedFiles.length !== uniqueFileIds.length) {
        return new Response(
          JSON.stringify({ message: "Forbidden: unknown file id" }),
          { status: 403 }
        )
      }
    }

    const tryOpenAI = async (): Promise<any[]> => {
      const embeddingsDeployment =
        profile.azure_openai_embeddings_id ||
        getAzureOpenAIEmbeddingsDeployment()
      if (!embeddingsDeployment) {
        throw new Error(
          "Azure embeddings deployment not configured. Set AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT or configure azure_openai_embeddings_id."
        )
      }
      const openai = getAzureOpenAIEmbeddingsClient()
      const response = await openai.embeddings.create({
        model: embeddingsDeployment,
        input: userInput,
        dimensions: 1536
      })
      const embedding = response.data.map(item => item.embedding)[0]
      const { data, error } = await supabaseAdmin.rpc(
        "match_file_items_openai",
        {
          query_embedding: embedding as any,
          match_count: matchSourceCount,
          file_ids: uniqueFileIds
        }
      )
      if (error) throw error
      return data ?? []
    }

    const tryLocal = async (): Promise<any[]> => {
      const localEmbedding = await generateLocalEmbedding(userInput)
      const { data, error } = await supabaseAdmin.rpc(
        "match_file_items_local",
        {
          query_embedding: localEmbedding as any,
          match_count: matchSourceCount,
          file_ids: uniqueFileIds
        }
      )
      if (error) throw error
      return data ?? []
    }

    const primary = embeddingsProvider === "openai" ? tryOpenAI : tryLocal
    const fallback = embeddingsProvider === "openai" ? tryLocal : tryOpenAI

    let chunks = await primary()
    let usedFallback = false
    if (chunks.length === 0 && uniqueFileIds.length > 0) {
      try {
        const fallbackChunks = await fallback()
        if (fallbackChunks.length > 0) {
          chunks = fallbackChunks
          usedFallback = true
          console.warn(
            `[retrieve] Primary provider (${embeddingsProvider}) returned 0 ` +
              `chunks; ${fallbackChunks.length} from fallback. Files were ` +
              "likely ingested with the other provider."
          )
        }
      } catch (fallbackError) {
        // Fallback misconfig (e.g. Azure missing): keep the empty primary
        // result and surface a warning. The chat will still answer from
        // model weights.
        console.warn("[retrieve] Fallback provider failed:", fallbackError)
      }
    }

    if (uniqueFileIds.length > 0 && chunks.length === 0) {
      console.warn(
        `[retrieve] 0 chunks for ${uniqueFileIds.length} file(s) on both ` +
          "providers. Likely cause: files haven't been processed yet (no " +
          "file_items rows). Run the file-processing pipeline."
      )
    }

    const mostSimilarChunks = chunks
      .sort((a: any, b: any) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, matchSourceCount)

    return new Response(
      JSON.stringify({ results: mostSimilarChunks, usedFallback }),
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[retrieve] Error:", error)
    const errorMessage =
      error.message || error.error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
