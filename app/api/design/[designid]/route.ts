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

export async function PUT(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const designId = params.designid
    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json(
        { error: "Invalid design ID provided" },
        { status: 400 }
      )
    }

    const payload = await request.json()
    const {
      content,
      name,
      description,
      objectives,
      variables,
      specialConsiderations
    } = payload ?? {}

    if (
      typeof content === "undefined" &&
      typeof name === "undefined" &&
      typeof description === "undefined"
    ) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      )
    }

    const supabase = createClient(cookies())
    const updates: Record<string, any> = {}

    if (typeof content !== "undefined") {
      updates.content =
        typeof content === "string" ? content : JSON.stringify(content)
    }
    if (typeof name !== "undefined") {
      updates.name = name
    }
    if (typeof description !== "undefined") {
      updates.description = description
    }
    if (typeof objectives !== "undefined") {
      updates.objectives = objectives
    }
    if (typeof variables !== "undefined") {
      updates.variables = variables
    }
    if (typeof specialConsiderations !== "undefined") {
      updates.special_considerations = specialConsiderations
    }

    const { data: updatedDesign, error } = await supabase
      .from("designs")
      .update(updates)
      .eq("id", designId)
      .select("*")
      .single()

    if (error || !updatedDesign) {
      console.error("❌ [DESIGN_API] Update error:", error)
      return NextResponse.json(
        { error: "Failed to update design" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, design: updatedDesign })
  } catch (error) {
    console.error("❌ [DESIGN_API] Error updating design:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
