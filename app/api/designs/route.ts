import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { resolvePendingInvites } from "@/lib/design/sharing"

export async function POST(request: Request) {
  try {
    // Verify user is authenticated with Supabase
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { design, workspaceId } = await request.json()

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    const designId = crypto.randomUUID()
    const designData = {
      id: designId,
      user_id: user.id,
      workspace_id: workspaceId,
      project_id: design.project_id ?? null,
      name: design.problem || design.name || "",
      description: design.description || "",
      sharing: design.sharing || "private",
      share_token: null,
      shared_with: [],
      forked_from: null,
      folder_id: design.folder_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    await adminDb.collection("designs").doc(designId).set(designData)

    console.log(
      "✅ [DESIGNS_API] Design created:",
      designId,
      "project:",
      designData.project_id
    )
    return NextResponse.json({ ...designData, id: designId })
  } catch (error) {
    console.error("❌ [DESIGNS_API] Error creating design:", error)
    return NextResponse.json(
      { error: "Failed to create design" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await resolvePendingInvites(user.id, user.email)

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")
    const userId = searchParams.get("userId")
    const projectId = searchParams.get("projectId")
    const scope = searchParams.get("scope")

    if (scope === "shared-with-me") {
      const snapshot = await adminDb
        .collection("designs")
        .where("shared_with", "array-contains", user.id)
        .orderBy("updated_at", "desc")
        .get()
      const designs = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
        id: doc.id,
        ...doc.data()
      }))
      return NextResponse.json({ designs })
    }

    let query: FirebaseFirestore.Query = adminDb.collection("designs")

    if (projectId) {
      query = query
        .where("user_id", "==", user.id)
        .where("project_id", "==", projectId)
    } else if (workspaceId) {
      query = query.where("workspace_id", "==", workspaceId)
    } else if (userId) {
      query = query.where("user_id", "==", userId)
    } else {
      query = query.where("user_id", "==", user.id)
    }

    const snapshot = await query.orderBy("created_at", "desc").get()
    const designs = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ designs })
  } catch (error) {
    console.error("❌ [DESIGNS_API] Error fetching designs:", error)
    return NextResponse.json(
      { error: "Failed to fetch designs" },
      { status: 500 }
    )
  }
}
