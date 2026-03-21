import { NextResponse } from "next/server"
import {
  getHypothesisSavedDesign,
  saveHypothesisDesign
} from "../../../utils/persistence-firestore"

/**
 * GET /api/design/draft/hypothesis/[hypothesisId]/saved-design
 * Get saved design for a specific hypothesis
 */
export async function GET(
  req: Request,
  { params }: { params: { hypothesisId: string } }
) {
  try {
    const hypothesisId = params.hypothesisId
    console.log(
      `[SAVED-DESIGN-GET] Checking for saved design: ${hypothesisId.slice(0, 8)}...`
    )

    if (!hypothesisId) {
      console.error("[SAVED-DESIGN-GET] No hypothesis ID provided")
      return NextResponse.json(
        { success: false, error: "Hypothesis ID is required" },
        { status: 400 }
      )
    }

    const savedDesign = await getHypothesisSavedDesign(hypothesisId)

    if (!savedDesign) {
      console.log(
        `[SAVED-DESIGN-GET] No saved design found for ${hypothesisId.slice(0, 8)}...`
      )
      return NextResponse.json(
        { success: false, error: "No saved design found" },
        { status: 404 }
      )
    }

    console.log(
      `[SAVED-DESIGN-GET] ✅ Found saved design for ${hypothesisId.slice(0, 8)}... (saved at: ${savedDesign.savedAt})`
    )
    return NextResponse.json({
      success: true,
      ...savedDesign
    })
  } catch (error: any) {
    console.error("[SAVED-DESIGN-GET] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get saved design"
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/design/draft/hypothesis/[hypothesisId]/saved-design
 * Save design for a specific hypothesis
 */
export async function POST(
  req: Request,
  { params }: { params: { hypothesisId: string } }
) {
  try {
    const hypothesisId = params.hypothesisId
    if (!hypothesisId) {
      return NextResponse.json(
        { success: false, error: "Hypothesis ID is required" },
        { status: 400 }
      )
    }

    const body = await req.json()
    const {
      generatedDesign,
      generatedLiteratureSummary,
      generatedStatReview,
      promptsUsed
    } = body

    if (!generatedDesign) {
      return NextResponse.json(
        { success: false, error: "Design data is required" },
        { status: 400 }
      )
    }

    const success = await saveHypothesisDesign(hypothesisId, {
      generatedDesign,
      generatedLiteratureSummary,
      generatedStatReview,
      promptsUsed
    })

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to save design" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Design saved successfully"
    })
  } catch (error: any) {
    console.error("[SAVED-DESIGN-POST] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save design"
      },
      { status: 500 }
    )
  }
}
