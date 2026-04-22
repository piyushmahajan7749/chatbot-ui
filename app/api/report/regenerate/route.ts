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

    const systemPrompt = `You are a meticulous scientific report editor. Improve the given section by applying the user's feedback. IMPORTANT: Format ALL content as bullet points, numbered lists, and short declarative statements. Do NOT write in paragraph form. Use markdown bullet points (- or *) and numbered lists (1., 2., etc.). Group related points under subheadings (### or ####). Use markdown tables for numerical data. Keep the factual, scientific tone. Do not invent data.`

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
