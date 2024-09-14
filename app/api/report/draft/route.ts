import { OpenAI } from "openai"
import { ServerRuntime } from "next"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  try {
    const profile = await getServerProfile()

    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || ""
    })

    const { selectedData, generatedOutline } = await request.json()

    const prompt = `Generate a detailed report based on the following outline and data:
    Outline: ${generatedOutline}
    Data: ${JSON.stringify(selectedData)}
    Please provide a comprehensive report following the structure of the outline.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      stream: false
    })

    const reportDraft = completion.choices[0].message.content

    return new Response(JSON.stringify({ reportDraft }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
      headers: { "Content-Type": "application/json" }
    })
  }
}
