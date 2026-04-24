import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"

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

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      )
    }

    const snapshot = await adminDb
      .collection("project_files")
      .where("user_id", "==", user.id)
      .where("project_id", "==", projectId)
      .orderBy("created_at", "desc")
      .get()

    const files = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ files })
  } catch (error) {
    console.error("❌ [PROJECT_FILES] Error fetching files:", error)
    return NextResponse.json(
      { error: "Failed to fetch project files" },
      { status: 500 }
    )
  }
}

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

    const body = await request.json()
    const {
      id,
      project_id,
      workspace_id,
      name,
      mime_type,
      size,
      storage_path
    } = body

    if (!id || !project_id || !workspace_id || !name || !storage_path) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const declaredSize = typeof size === "number" ? size : 0
    const MAX_PROJECT_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
    if (declaredSize > MAX_PROJECT_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 25 MB limit" },
        { status: 413 }
      )
    }

    const record = {
      id,
      user_id: user.id,
      project_id,
      workspace_id,
      name,
      mime_type: mime_type || "application/octet-stream",
      size: declaredSize,
      storage_path,
      created_at: new Date().toISOString()
    }

    await adminDb.collection("project_files").doc(id).set(record)

    return NextResponse.json(record)
  } catch (error) {
    console.error("❌ [PROJECT_FILES] Error creating file record:", error)
    return NextResponse.json(
      { error: "Failed to save file metadata" },
      { status: 500 }
    )
  }
}
