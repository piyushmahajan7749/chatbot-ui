import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { requireUser, userOwnsWorkspace } from "@/lib/server/require-user"

/**
 * Firestore-backed Reports API (mirrors designs migration).
 * NOTE: This still uses Supabase Auth for user verification.
 */

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response
    const user = auth.user

    const { report, workspaceId, selectedFiles, collections } =
      (await request.json()) as {
        report: any
        workspaceId: string
        selectedFiles?: {
          protocol?: any[]
          papers?: any[]
          dataFiles?: any[]
        }
        collections?: any[]
      }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    if (!(await userOwnsWorkspace(user.id, workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const reportId = crypto.randomUUID()
    const now = new Date().toISOString()

    const reportData = {
      id: reportId,
      user_id: user.id,
      workspace_id: workspaceId,
      name: report?.name || report?.description || "Untitled report",
      description: report?.description || "",
      sharing: report?.sharing || "private",
      folder_id: report?.folder_id || null,
      created_at: now,
      updated_at: now,

      // Generated content (optional, filled later)
      report_outline: report?.report_outline || null,
      report_draft: report?.report_draft || null,
      chart_image: report?.chart_image || null,

      // Attachments (snapshots so reports don't depend on Supabase joins)
      files: {
        protocol: selectedFiles?.protocol || [],
        papers: selectedFiles?.papers || [],
        dataFiles: selectedFiles?.dataFiles || []
      },

      // Optional collection links (snapshot minimal fields)
      collections: Array.isArray(collections) ? collections : []
    }

    await adminDb.collection("reports").doc(reportId).set(reportData)

    console.log("✅ [REPORTS_API] Report created:", reportId)
    return NextResponse.json({ ...reportData, id: reportId })
  } catch (error) {
    console.error("❌ [REPORTS_API] Error creating report:", error)
    return NextResponse.json(
      { error: "Failed to create report" },
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

    let query = adminDb.collection("reports").where("user_id", "==", user.id)

    if (workspaceId) {
      if (!(await userOwnsWorkspace(user.id, workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      query = query.where("workspace_id", "==", workspaceId)
    }

    // NOTE:
    // Using `where(...)` + `orderBy(...)` requires a composite Firestore index.
    // To keep local/dev + fresh projects working out-of-the-box, fetch unsorted and
    // sort in memory.
    const snapshot = await query.get()
    const reports = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    reports.sort((a: any, b: any) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime()
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json({ reports })
  } catch (error) {
    console.error("❌ [REPORTS_API] Error fetching reports:", error)
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    )
  }
}
