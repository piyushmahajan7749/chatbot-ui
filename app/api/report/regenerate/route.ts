import { ChatOpenAI } from "@langchain/openai"
import { NextResponse } from "next/server"
import { z } from "zod"

const llm = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  apiKey: `${process.env.OPENAI_KEY}`
})

// Schema for the regeneration request
const RegenerationRequestSchema = z.object({
  sectionName: z.string(),
  currentContent: z.string(),
  userFeedback: z.string()
})

type RegenerationRequest = z.infer<typeof RegenerationRequestSchema>

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sectionName, currentContent, userFeedback } =
      RegenerationRequestSchema.parse(body)

    const systemPrompt = `You are an expert scientific writer tasked with improving a section of a research report based on user feedback. 
You will be given:
1. The name of the section to regenerate
2. The current content of that section
3. Specific feedback from the user
4. Additional context about the experiment

Guidelines:
- Maintain scientific accuracy and professional tone
- Address all points in the user's feedback
- Keep the same general structure and purpose of the section
- Ensure the new content aligns with the experimental context
- Return only the revised content for the specified section`

    const userPrompt = `Section to regenerate: ${sectionName}

Current content:
${currentContent}

User feedback:
${userFeedback}

Please provide an improved version of this section that addresses the feedback while maintaining scientific accuracy and professional tone.`

    const response = await llm.invoke([
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ])

    return NextResponse.json({
      success: true,
      regeneratedContent: response.content,
      sectionName: sectionName
    })
  } catch (error) {
    console.error("[REGENERATION_ERROR]", error)
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Error",
      { status: 500 }
    )
  }
}

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
