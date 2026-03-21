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

    const { dataCollection, workspaceId } = await request.json()

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Default template — protocol-aware columns if a protocol was attached
    const hasProtocol = !!dataCollection.protocol_file_id
    const defaultColumns = hasProtocol
      ? [
          "Sample ID",
          "Date",
          "Condition",
          "Time Point",
          "Measurement 1",
          "Measurement 2",
          "Temperature (°C)",
          "pH",
          "Notes"
        ]
      : ["Sample ID", "Date", "Parameter", "Value", "Unit", "Notes"]
    const emptyRow = defaultColumns.map(() => "")
    const defaultRows = Array.from({ length: 5 }, () => [...emptyRow])

    const docData = {
      id,
      user_id: user.id,
      workspace_id: workspaceId,
      name: dataCollection.name || "Untitled Data Collection",
      description: dataCollection.description || "",
      sharing: dataCollection.sharing || "private",
      folder_id: dataCollection.folder_id || null,
      protocol_file_id: dataCollection.protocol_file_id || null,
      protocol_file_name: dataCollection.protocol_file_name || null,
      template_columns: defaultColumns,
      template_rows: defaultRows,
      messages: [],
      structured_data: null,
      created_at: now,
      updated_at: now
    }

    await adminDb.collection("data_collections").doc(id).set(docData)

    return NextResponse.json(docData)
  } catch (error) {
    console.error("[DATA_COLLECTIONS_API] Error creating:", error)
    return NextResponse.json(
      { error: "Failed to create data collection" },
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

    let query = adminDb.collection("data_collections") as any

    if (workspaceId) {
      query = query.where("workspace_id", "==", workspaceId)
    } else if (userId) {
      query = query.where("user_id", "==", userId)
    } else {
      query = query.where("user_id", "==", user.id)
    }

    const snapshot = await query.orderBy("created_at", "desc").get()
    const dataCollections = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ dataCollections })
  } catch (error) {
    console.error("[DATA_COLLECTIONS_API] Error fetching:", error)
    return NextResponse.json(
      { error: "Failed to fetch data collections" },
      { status: 500 }
    )
  }
}
