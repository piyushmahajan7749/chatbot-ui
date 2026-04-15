"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { CreateDesign } from "@/components/designs/create-design"

export default function NewDesignPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId")
  const [isOpen, setIsOpen] = useState(true)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      if (projectId) {
        window.history.back()
      } else {
        window.location.href = window.location.href.replace("/new", "")
      }
    }
  }

  return (
    <div className="container mx-auto p-6">
      <CreateDesign isOpen={isOpen} onOpenChange={handleOpenChange} />
    </div>
  )
}
