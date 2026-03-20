"use client"

import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { CreateReport } from "@/components/reports/create-report"

export default function NewReportPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId")
  const [isOpen, setIsOpen] = useState(true)

  // Handle closing the dialog - redirect back to the project or reports list
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      if (projectId) {
        // Redirect back to project page if came from project context
        window.history.back()
      } else {
        // Redirect to reports list
        window.location.href = window.location.href.replace("/new", "")
      }
    }
  }

  return (
    <div className="container mx-auto p-6">
      <CreateReport 
        isOpen={isOpen} 
        onOpenChange={handleOpenChange}
        projectId={projectId || undefined}
      />
    </div>
  )
}