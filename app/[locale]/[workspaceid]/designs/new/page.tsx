"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { CreateDesign } from "@/components/designs/create-design"

/**
 * /designs/new is a lightweight shell that opens the Create Design modal.
 * On cancel we route back to the owning project (or /projects). On create,
 * the modal itself routes to /designs/[id], so we just close here.
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
          : `/${locale}/${wsId}/projects`
      )
    }
  }

  return (
    <div className="bg-ink-50 h-full">
      <CreateDesign
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        projectId={projectId}
      />
    </div>
  )
}
