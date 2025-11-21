import { NextResponse } from "next/server"
import { supervisorEnqueue } from "./supervisor"
import { ResearchPlan } from "./types/interfaces"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: Request) {
  const requestStartTime = Date.now()
  console.log("\n" + "=".repeat(100))
  console.log("🚀 [DESIGN_DRAFT_API] New Request Received")
  console.log("=".repeat(100))

  try {
    const requestData = await req.json()
    console.log("📥 [DESIGN_DRAFT_REQUEST] Request Data:")
    console.log("  📋 Raw Request:", JSON.stringify(requestData, null, 2))

    // Support both old format (for backward compatibility) and new format
    let planId: string
    let title: string
    let description: string
    let constraints: Record<string, any> = {}
    let preferences: Record<string, any> = {}

    if (requestData.planId || requestData.title) {
      // New format
      planId = requestData.planId || uuidv4()
      title = requestData.title
      description = requestData.description || requestData.problem || ""
      constraints = requestData.constraints || {}
      preferences = requestData.preferences || {}
    } else {
      // Old format (backward compatibility)
      planId = uuidv4()
      title = requestData.problem || "Untitled Research Plan"
      description = requestData.problem || ""
      constraints = {
        objectives: requestData.objectives || [],
        variables: requestData.variables || [],
        specialConsiderations: requestData.specialConsiderations || []
      }
      preferences = {
        max_hypotheses: 10
      }
    }

    // Validation
    if (!title || !description) {
      console.error("❌ [DESIGN_DRAFT] Missing required fields")
      return NextResponse.json(
        { success: false, error: "Title and description are required" },
        { status: 400 }
      )
    }

    console.log("\n🔧 [DESIGN_DRAFT_STATE] Creating Research Plan")
    const plan: ResearchPlan = {
      planId,
      title,
      description,
      constraints,
      preferences,
      createdAt: new Date().toISOString(),
      status: "pending"
    }

    console.log("📋 [DESIGN_DRAFT_STATE] Research Plan Summary:")
    console.log("  📋 Plan ID:", plan.planId)
    console.log("  📋 Title:", plan.title)
    console.log(
      "  📋 Description Length:",
      plan.description.length,
      "characters"
    )

    // Run supervisor synchronously (with timeout protection)
    try {
      const statusUrl = `/api/design/draft/status/${plan.planId}`

      console.log("\n⏳ [DESIGN_DRAFT] Starting supervisor execution...")
      console.log("  📊 Plan ID:", plan.planId)
      console.log("  🔗 Status URL:", statusUrl)

      // Run supervisor and await completion
      // This will use the full 300 second timeout configured in vercel.json
      try {
        await supervisorEnqueue(plan)
        console.log(
          `✅ [DESIGN_DRAFT] Supervisor completed for plan ${plan.planId}`
        )
      } catch (supervisorError: any) {
        console.error(
          `❌ [DESIGN_DRAFT] Supervisor error for plan ${plan.planId}:`,
          supervisorError
        )
        // Don't throw - we've already saved the error state in the plan
      }

      console.log("\n📤 [DESIGN_DRAFT_RESPONSE] Response Summary:")
      console.log("  📊 Plan ID:", plan.planId)
      console.log("  🔗 Status URL:", statusUrl)
      console.log("  ✅ Supervisor execution completed")
      console.log("=".repeat(100))

      return NextResponse.json(
        {
          success: true,
          planId: plan.planId,
          statusUrl,
          message: "Research plan completed"
        },
        { status: 200 }
      )
    } catch (error: any) {
      console.error("❌ [DESIGN_DRAFT] Supervisor enqueue error:", error)
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Failed to enqueue research plan"
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    const totalRequestTime = Date.now() - requestStartTime
    console.error(
      `❌ [DESIGN_DRAFT_ERROR] Request failed after ${totalRequestTime}ms:`,
      error
    )
    console.log("=".repeat(100))
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error"
      },
      { status: 500 }
    )
  }
}

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
