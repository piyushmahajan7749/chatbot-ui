import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"

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

    const { name, description, tags, workspace_id } = await request.json()

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    const projectId = crypto.randomUUID()
    const projectData = {
      id: projectId,
      user_id: user.id,
      workspace_id,
      name: name || "Untitled Project",
      description: description || "",
      tags: tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    await adminDb.collection("projects").doc(projectId).set(projectData)

    console.log("✅ [PROJECTS_API] Project created:", projectId)
    return NextResponse.json(projectData)
  } catch (error) {
    console.error("❌ [PROJECTS_API] Error creating project:", error)
    return NextResponse.json(
      { error: "Failed to create project" },
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

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")
    const searchTerm = searchParams.get("searchTerm")
    const tags = searchParams.get("tags")
    const sortBy = searchParams.get("sortBy") || "updated_at"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("projects")
      .where("workspace_id", "==", workspaceId)

    const snapshot = await query
      .orderBy(sortBy, sortOrder as "asc" | "desc")
      .get()

    let projects = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    // Client-side filtering for search and tags (Firestore doesn't support ilike)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      projects = projects.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term)
      )
    }

    if (tags) {
      const tagList = tags.split(",")
      projects = projects.filter((p: any) =>
        tagList.some((tag: string) => p.tags?.includes(tag))
      )
    }

    return NextResponse.json({ projects })
  } catch (error) {
    console.error("❌ [PROJECTS_API] Error fetching projects:", error)
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    )
  }
}
