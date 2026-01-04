import { NextResponse } from "next/server"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

export async function POST(req: Request) {
  try {
    const { sectionName, currentContent, userFeedback } = await req.json()

    if (!sectionName || !currentContent || !userFeedback) {
      return new NextResponse("Missing required fields", { status: 400 })
    }

    const systemPrompt = `You are a meticulous scientific report editor. Improve the given section by applying the user's feedback. Keep the structure and factual tone. Do not invent data. Keep the content concise and formatted in Markdown.`

    const userPrompt = `Section: ${sectionName}\n\nCurrent Content:\n\n${currentContent}\n\nUser Feedback:\n${userFeedback}\n\nRewrite the section to incorporate the feedback while preserving accuracy.`

    const completion = await openai().chat.completions.create({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    })

    const regeneratedContent =
      completion.choices[0]?.message?.content?.trim() || currentContent

    return NextResponse.json({ success: true, regeneratedContent })
  } catch (error) {
    console.error("[REPORT_REGENERATE_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}

// Removed duplicate implementation
