import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { ChatAPIPayload } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as ChatAPIPayload

  try {
    const shouldRetryWithoutTemperature = (error: any) => {
      const msg = (error?.error?.message || error?.message || "") as string
      return (
        /temperature/i.test(msg) &&
        /Only the default \(1\) value is supported/i.test(msg)
      )
    }

    // Azure OpenAI (env-backed). We intentionally ignore chatSettings.model and
    // always use the deployment configured in AZURE_OPENAI_DEPLOYMENT.
    const azureOpenai = getAzureOpenAI()
    const deployment = getAzureOpenAIModel()

    const params: any = {
      model: deployment as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      // Do not send `null` (provider validation error). Omit the field when unset.
      max_tokens:
        chatSettings.model === "gpt-4-vision-preview" ? 4096 : undefined,
      stream: true
    }

    // Defensive: never send nullish max_tokens (some providers error hard)
    if (params.max_tokens == null) delete params.max_tokens

    let response: any
    try {
      response = await azureOpenai.chat.completions.create(params)
    } catch (error: any) {
      if (shouldRetryWithoutTemperature(error)) {
        const { temperature: _temperature, ...withoutTemperature } =
          params as any
        response = await azureOpenai.chat.completions.create(withoutTemperature)
      } else {
        throw error
      }
    }

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
