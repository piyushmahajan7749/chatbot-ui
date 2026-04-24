import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import { requireUser } from "@/lib/server/require-user"
import { requireFirestoreOwner } from "@/lib/server/firestore-authz"

export async function GET(
  request: Request,
  { params }: { params: { datacollectionid: string } }
) {
  try {
    const id = params.datacollectionid
    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
    }

    const auth = await requireUser()
    if (auth.response) return auth.response

    const owner = await requireFirestoreOwner(
      "data_collections",
      id,
      auth.user.id
    )
    if (owner.response) return owner.response

    return NextResponse.json(owner.doc)
  } catch (error) {
    console.error("[DATA_COLLECTIONS_API] Error fetching:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { datacollectionid: string } }
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

    const id = params.datacollectionid
    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
    }

    const updates = await request.json()

    const docRef = adminDb.collection("data_collections").doc(id)
    const doc = await docRef.get()

    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const data = doc.data()
    if (data?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await docRef.update({
      ...updates,
      updated_at: new Date().toISOString()
    })

    const updated = await docRef.get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    console.error("[DATA_COLLECTIONS_API] Error updating:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { datacollectionid: string } }
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

    const id = params.datacollectionid
    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
    }

    const docRef = adminDb.collection("data_collections").doc(id)
    const doc = await docRef.get()

    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const data = doc.data()
    if (data?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await docRef.delete()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DATA_COLLECTIONS_API] Error deleting:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
