import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { getAzureOpenAIForDeployment } from "@/lib/azure-openai"

export async function POST(request: Request) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      )
    }

    const whisperDeployment = process.env.AZURE_WHISPER_DEPLOYMENT || "whisper"
    const openai = getAzureOpenAIForDeployment(whisperDeployment)

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: whisperDeployment
    })

    return NextResponse.json({
      text: transcription.text
    })
  } catch (error: any) {
    console.error("[TRANSCRIBE_API] Error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to transcribe audio" },
      { status: 500 }
    )
  }
}
