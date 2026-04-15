"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

/**
 * The workspace-level Designs list has been retired in favor of
 * Projects → Designs. Any deep link to this route redirects to /projects so
 * existing bookmarks don't 404.
 */
export default function DesignsPage() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    const locale = params.locale as string
    const workspaceId = params.workspaceid as string
    router.replace(`/${locale}/${workspaceId}/projects`)
  }, [params, router])

  return (
    <div className="bg-ink-50 flex h-full items-center justify-center">
      <p className="text-ink-400 text-sm">Redirecting to Projects…</p>
    </div>
  )
}
