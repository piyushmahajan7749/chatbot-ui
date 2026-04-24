import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { adminDb } from "@/lib/firebase/admin"
import { normalizeEmail, permissionDocId } from "@/lib/design/sharing"
import type { CollaboratorRole, DesignPermission } from "@/types/sharing"

const ALLOWED_ROLES: CollaboratorRole[] = ["viewer", "editor"]

async function authorizeOwner(designId: string) {
  const supabase = createClient(cookies())
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const ref = adminDb.collection("designs").doc(designId)
  const doc = await ref.get()
  if (!doc.exists) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  }
  const data = doc.data() as any
  if (data.user_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { user, ref, data }
}

export async function GET(
  _request: Request,
  { params }: { params: { designid: string } }
) {
  const auth = await authorizeOwner(params.designid)
  if ("error" in auth) return auth.error

  const snap = await adminDb
    .collection("design_permissions")
    .where("design_id", "==", params.designid)
    .orderBy("created_at", "desc")
    .get()

  const collaborators = snap.docs.map((d: any) => ({
    id: d.id,
    ...d.data()
  })) as DesignPermission[]

  return NextResponse.json({ collaborators })
}

export async function POST(
  request: Request,
  { params }: { params: { designid: string } }
) {
  const auth = await authorizeOwner(params.designid)
  if ("error" in auth) return auth.error

  const body = await request.json().catch(() => ({}))
  const rawEmail: unknown = body?.email
  const rawRole: unknown = body?.role

  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    )
  }
  const role: CollaboratorRole =
    typeof rawRole === "string" &&
    ALLOWED_ROLES.includes(rawRole as CollaboratorRole)
      ? (rawRole as CollaboratorRole)
      : "viewer"

  const email = normalizeEmail(rawEmail)

  if (email === normalizeEmail(auth.user.email ?? "")) {
    return NextResponse.json(
      { error: "You already own this design" },
      { status: 400 }
    )
  }

  // Try to resolve to an existing Supabase user. Use admin listUsers lookup via
  // service-role client if available; otherwise store as pending invite.
  let resolvedUserId: string | null = null
  try {
    const supabase = createClient(cookies())
    // listUsers isn't exposed to non-service keys; we fall back silently.
    const { data } = (await (supabase as any).auth.admin?.listUsers?.({
      page: 1,
      perPage: 1,
      email
    })) ?? { data: null }
    const match = data?.users?.find(
      (u: any) => normalizeEmail(u.email ?? "") === email
    )
    if (match?.id) resolvedUserId = match.id
  } catch {
    // admin lookup not available — invite stays pending until resolver runs
  }

  const now = new Date().toISOString()
  const docId = permissionDocId(params.designid, email)
  const permission: DesignPermission = {
    id: docId,
    design_id: params.designid,
    user_id: resolvedUserId,
    email,
    role,
    invited_by: auth.user.id,
    invited_by_email: auth.user.email ?? null,
    created_at: now,
    resolved_at: resolvedUserId ? now : null
  }

  await adminDb
    .collection("design_permissions")
    .doc(docId)
    .set(permission, { merge: true })

  if (resolvedUserId) {
    const sharedWith: string[] = Array.isArray(auth.data.shared_with)
      ? auth.data.shared_with
      : []
    if (!sharedWith.includes(resolvedUserId)) {
      await auth.ref.update({
        shared_with: [...sharedWith, resolvedUserId],
        updated_at: now
      })
    }
  }

  return NextResponse.json({ collaborator: permission })
}

export async function DELETE(
  request: Request,
  { params }: { params: { designid: string } }
) {
  const auth = await authorizeOwner(params.designid)
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 })
  }

  const docId = permissionDocId(params.designid, email)
  const permRef = adminDb.collection("design_permissions").doc(docId)
  const permSnap = await permRef.get()
  if (!permSnap.exists) {
    return NextResponse.json({ success: true })
  }
  const perm = permSnap.data() as DesignPermission
  await permRef.delete()

  if (perm.user_id) {
    const sharedWith: string[] = Array.isArray(auth.data.shared_with)
      ? auth.data.shared_with
      : []
    const next = sharedWith.filter(id => id !== perm.user_id)
    if (next.length !== sharedWith.length) {
      await auth.ref.update({
        shared_with: next,
        updated_at: new Date().toISOString()
      })
    }
  }

  return NextResponse.json({ success: true })
}
