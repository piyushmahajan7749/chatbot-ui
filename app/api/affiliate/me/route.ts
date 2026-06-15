import { NextResponse } from "next/server"
import { requireUser } from "@/lib/server/require-user"
import { getAffiliateDashboard } from "@/lib/affiliate/service"

/**
 * GET /api/affiliate/me
 * The signed-in user's affiliate dashboard, or { isAffiliate: false } if they
 * aren't an influencer. Aggregated stats only — never returns raw referred ids.
 */
export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const dashboard = await getAffiliateDashboard(auth.user.id, base)
    return NextResponse.json(dashboard)
  } catch (e) {
    console.error("[affiliate/me] failed", e)
    return NextResponse.json(
      { error: "Failed to load affiliate dashboard" },
      { status: 500 }
    )
  }
}
