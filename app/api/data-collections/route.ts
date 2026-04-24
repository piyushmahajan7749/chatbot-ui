import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { requireUser, userOwnsWorkspace } from "@/lib/server/require-user"

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth.response) return auth.response
    const user = auth.user

    const { dataCollection, workspaceId } = await request.json()

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      )
    }

    if (!(await userOwnsWorkspace(user.id, workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
    const auth = await requireUser()
    if (auth.response) return auth.response
    const user = auth.user

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")

    let query = adminDb
      .collection("data_collections")
      .where("user_id", "==", user.id) as any

    if (workspaceId) {
      if (!(await userOwnsWorkspace(user.id, workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      query = query.where("workspace_id", "==", workspaceId)
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
