import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { requireUser, userOwnsWorkspace } from "@/lib/server/require-user"

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response
    const user = auth.user

    const { name, description, tags, workspace_id } = await request.json()

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    if (!(await userOwnsWorkspace(user.id, workspace_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
    const auth = await requireUser()
    if (auth.response) return auth.response
    const user = auth.user

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

    if (!(await userOwnsWorkspace(user.id, workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("projects")
      .where("user_id", "==", user.id)
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
