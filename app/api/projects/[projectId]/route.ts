import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { requireUser } from "@/lib/server/require-user"
import { requireFirestoreOwner } from "@/lib/server/firestore-authz"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response

    const owner = await requireFirestoreOwner(
      "projects",
      params.projectId,
      auth.user.id
    )
    if (owner.response) return owner.response

    return NextResponse.json(owner.doc)
  } catch (error) {
    console.error("❌ [PROJECTS_API] Error fetching project:", error)
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response

    const owner = await requireFirestoreOwner(
      "projects",
      params.projectId,
      auth.user.id
    )
    if (owner.response) return owner.response

    const updates = await request.json()

    // Owner-only fields must not be rewritten by update payloads.
    delete updates.user_id
    delete updates.id
    delete updates.workspace_id
    delete updates.created_at

    await adminDb
      .collection("projects")
      .doc(params.projectId)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })

    const updatedDoc = await adminDb
      .collection("projects")
      .doc(params.projectId)
      .get()

    return NextResponse.json({ id: updatedDoc.id, ...updatedDoc.data() })
  } catch (error) {
    console.error("❌ [PROJECTS_API] Error updating project:", error)
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response

    const owner = await requireFirestoreOwner(
      "projects",
      params.projectId,
      auth.user.id
    )
    if (owner.response) return owner.response

    await adminDb.collection("projects").doc(params.projectId).delete()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ [PROJECTS_API] Error deleting project:", error)
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    )
  }
}
