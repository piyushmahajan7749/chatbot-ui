import { NextResponse } from "next/server"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const sectionName = body?.sectionName
    const userFeedback = body?.userFeedback
    const currentContent =
      typeof body?.currentContent === "string" ? body.currentContent : ""

    // Empty sections are valid — user might use "Edit with AI" to seed a
    // section that's not generated yet. Only sectionName + userFeedback are
    // truly required.
    if (!sectionName || !userFeedback) {
      return NextResponse.json(
        { error: "Missing required fields: sectionName and userFeedback" },
        { status: 400 }
      )
    }

    const systemPrompt = `You are a meticulous scientific report editor. Improve the given section by applying the user's feedback. IMPORTANT: Format ALL content as bullet points, numbered lists, and short declarative statements. Do NOT write in paragraph form. Use markdown bullet points (- or *) and numbered lists (1., 2., etc.). Group related points under subheadings (### or ####). Use markdown tables for numerical data. Keep the factual, scientific tone. Do not invent data.`

    const currentBlock = currentContent.trim()
      ? `Current Content:\n\n${currentContent}`
      : "Current Content:\n\n(empty — please draft this section based on the feedback)"

    const userPrompt = `Section: ${sectionName}\n\n${currentBlock}\n\nUser Feedback:\n${userFeedback}\n\nRewrite the section to incorporate the feedback while preserving accuracy.`

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
  } catch (error: any) {
    console.error("[REPORT_REGENERATE_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    )
  }
}
