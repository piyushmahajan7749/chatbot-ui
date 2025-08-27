import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export async function GET(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    console.log("📋 [DESIGN_API] Fetching design by ID:", params.designid)

    // Validate the design ID
    if (
      !params.designid ||
      params.designid === "undefined" ||
      params.designid === "null"
    ) {
      console.error("❌ [DESIGN_API] Invalid design ID:", params.designid)
      return NextResponse.json(
        { error: "Invalid design ID provided" },
        { status: 400 }
      )
    }

    const supabase = createClient(cookies())
    const { data: design, error } = await supabase
      .from("designs")
      .select("*")
      .eq("id", params.designid)
      .single()

    if (error) {
      console.error("❌ [DESIGN_API] Database error:", error)
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    if (!design) {
      console.error("❌ [DESIGN_API] Design not found:", params.designid)
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    console.log("✅ [DESIGN_API] Design found:", design.name)
    console.log("📝 [DESIGN_API] Has content:", !!design.content)

    return NextResponse.json(design)
  } catch (error) {
    console.error("❌ [DESIGN_API] Error fetching design:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
