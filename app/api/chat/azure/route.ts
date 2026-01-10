import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { ChatAPIPayload } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as ChatAPIPayload

  try {
    // Azure OpenAI (env-backed). We intentionally ignore chatSettings.model and
    // always use the deployment configured in AZURE_OPENAI_DEPLOYMENT.
    const azureOpenai = getAzureOpenAI()
    const deployment = getAzureOpenAIModel()

    const response = await azureOpenai.chat.completions.create({
      model: deployment as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens: chatSettings.model === "gpt-4-vision-preview" ? 4096 : null, // TODO: Fix
      stream: true
    })

    const stream = OpenAIStream(response as any)

    return new StreamingTextResponse(stream)
  } catch (error: any) {
    const errorMessage = error.error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
