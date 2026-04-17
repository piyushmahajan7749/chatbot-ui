import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"

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

    const designDoc = await adminDb
      .collection("designs")
      .doc(params.designid)
      .get()

    if (!designDoc.exists) {
      console.error("❌ [DESIGN_API] Design not found:", params.designid)
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    const design = { id: designDoc.id, ...designDoc.data() }

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
      domain,
      phase,
      objectives,
      objective,
      variables,
      knownVariables,
      unknownVariables,
      material,
      time,
      equipment,
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

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

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
    if (typeof domain !== "undefined") {
      updates.domain = domain
    }
    if (typeof phase !== "undefined") {
      updates.phase = phase
    }
    if (typeof objectives !== "undefined") {
      updates.objectives = objectives
    }
    if (typeof objective !== "undefined") {
      updates.objective = objective
    }
    if (typeof variables !== "undefined") {
      updates.variables = variables
    }
    if (typeof knownVariables !== "undefined") {
      updates.known_variables = knownVariables
    }
    if (typeof unknownVariables !== "undefined") {
      updates.unknown_variables = unknownVariables
    }
    if (typeof material !== "undefined") {
      updates.material = material
    }
    if (typeof time !== "undefined") {
      updates.time = time
    }
    if (typeof equipment !== "undefined") {
      updates.equipment = equipment
    }
    if (typeof specialConsiderations !== "undefined") {
      updates.special_considerations = specialConsiderations
    }

    const designRef = adminDb.collection("designs").doc(designId)
    await designRef.update(updates)

    const updatedDoc = await designRef.get()
    const updatedDesign = { id: updatedDoc.id, ...updatedDoc.data() }

    return NextResponse.json({ success: true, design: updatedDesign })
  } catch (error) {
    console.error("❌ [DESIGN_API] Error updating design:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const designId = params.designid
    const updates = await request.json()

    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json({ error: "Invalid design ID" }, { status: 400 })
    }

    // Verify ownership
    const designDoc = await adminDb.collection("designs").doc(designId).get()

    if (!designDoc.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    const designData = designDoc.data()
    if (designData?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await adminDb
      .collection("designs")
      .doc(designId)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })

    const updated = await adminDb.collection("designs").doc(designId).get()

    console.log("✅ [DESIGN_API] Design updated:", designId)
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    console.error("❌ [DESIGN_API] Error updating design:", error)
    return NextResponse.json(
      { error: "Failed to update design" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const designId = params.designid

    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json({ error: "Invalid design ID" }, { status: 400 })
    }

    // Verify ownership
    const designDoc = await adminDb.collection("designs").doc(designId).get()

    if (!designDoc.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    const designData = designDoc.data()
    if (designData?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await adminDb.collection("designs").doc(designId).delete()

    console.log("✅ [DESIGN_API] Design deleted:", designId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ [DESIGN_API] Error deleting design:", error)
    return NextResponse.json(
      { error: "Failed to delete design" },
      { status: 500 }
    )
  }
}
