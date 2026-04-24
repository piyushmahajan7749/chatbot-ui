import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import { requireUser } from "@/lib/server/require-user"
import { requireFirestoreOwner } from "@/lib/server/firestore-authz"

export async function GET(
  request: Request,
  { params }: { params: { reportid: string } }
) {
  try {
    const reportId = params.reportid
    if (!reportId || reportId === "undefined" || reportId === "null") {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 })
    }

    const auth = await requireUser()
    if (auth.response) return auth.response

    const owner = await requireFirestoreOwner("reports", reportId, auth.user.id)
    if (owner.response) return owner.response

    return NextResponse.json(owner.doc)
  } catch (error) {
    console.error("❌ [REPORTS_API] Error fetching report:", error)
    return NextResponse.json(
      { error: "Failed to fetch report" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { reportid: string } }
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

    const reportId = params.reportid
    if (!reportId || reportId === "undefined" || reportId === "null") {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 })
    }

    const ref = adminDb.collection("reports").doc(reportId)
    const existing = await ref.get()
    if (!existing.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const reportData = existing.data()
    if (reportData?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updates = (await request.json()) as Record<string, any>

    await ref.update({
      ...updates,
      updated_at: new Date().toISOString()
    })

    const updated = await ref.get()
    return NextResponse.json({ id: updated.id, ...updated.data() })
  } catch (error) {
    console.error("❌ [REPORTS_API] Error updating report:", error)
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { reportid: string } }
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

    const reportId = params.reportid
    if (!reportId || reportId === "undefined" || reportId === "null") {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 })
    }

    const ref = adminDb.collection("reports").doc(reportId)
    const existing = await ref.get()
    if (!existing.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const reportData = existing.data()
    if (reportData?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ref.delete()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ [REPORTS_API] Error deleting report:", error)
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 500 }
    )
  }
}
