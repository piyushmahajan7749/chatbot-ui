"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { CreateDesign } from "@/components/designs/create-design"

/**
 * /designs/new is a lightweight shell that opens the Create Design modal.
 * Cancel routes back to:
 *   • the owning project if `?projectId=…` is present (user came from a
 *     project detail page),
 *   • otherwise the workspace dashboard.
 * Create routes to /designs/[id] from inside the modal itself.
 */
export default function NewDesignPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()
  const projectId = searchParams.get("projectId")
  const [isOpen, setIsOpen] = useState(true)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      const locale = (params.locale as string) ?? "en"
      const wsId = params.workspaceid as string
      router.replace(
        projectId
          ? `/${locale}/${wsId}/projects/${projectId}`
          : `/${locale}/${wsId}`
      )
    }
  }

  return (
    <div className="bg-paper h-full">
      <CreateDesign
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        projectId={projectId}
      />
    </div>
  )
}
