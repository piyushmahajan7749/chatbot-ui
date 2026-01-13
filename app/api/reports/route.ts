import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"

/**
 * Firestore-backed Reports API (mirrors designs migration).
 * NOTE: This still uses Supabase Auth for user verification.
 */

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
    const userId = searchParams.get("userId")

    let query = adminDb.collection("reports")

    if (workspaceId) {
      query = query.where("workspace_id", "==", workspaceId)
    } else if (userId) {
      query = query.where("user_id", "==", userId)
    } else {
      query = query.where("user_id", "==", user.id)
    }

    const snapshot = await query.orderBy("created_at", "desc").get()
    const reports = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ reports })
  } catch (error) {
    console.error("❌ [REPORTS_API] Error fetching reports:", error)
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    )
  }
}
