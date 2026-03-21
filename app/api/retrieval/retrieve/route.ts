import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import {
  getAzureOpenAIEmbeddingsClient,
  getAzureOpenAIEmbeddingsDeployment
} from "@/lib/azure-openai"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput, fileIds, embeddingsProvider, sourceCount } = json as {
    userInput: string
    fileIds: string[]
    embeddingsProvider: "openai" | "local"
    sourceCount: number
  }

  const uniqueFileIds = [...new Set(fileIds)]

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    let chunks: any[] = []

    if (embeddingsProvider === "openai") {
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

      const openaiEmbedding = response.data.map(item => item.embedding)[0]

      const { data: openaiFileItems, error: openaiError } =
        await supabaseAdmin.rpc("match_file_items_openai", {
          query_embedding: openaiEmbedding as any,
          match_count: sourceCount,
          file_ids: uniqueFileIds
        })

      if (openaiError) {
        throw openaiError
      }

      chunks = openaiFileItems
    } else if (embeddingsProvider === "local") {
      const localEmbedding = await generateLocalEmbedding(userInput)

      const { data: localFileItems, error: localFileItemsError } =
        await supabaseAdmin.rpc("match_file_items_local", {
          query_embedding: localEmbedding as any,
          match_count: sourceCount,
          file_ids: uniqueFileIds
        })

      if (localFileItemsError) {
        throw localFileItemsError
      }

      chunks = localFileItems
    }

    const mostSimilarChunks = chunks?.sort(
      (a, b) => b.similarity - a.similarity
    )

    return new Response(JSON.stringify({ results: mostSimilarChunks }), {
      status: 200
    })
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
