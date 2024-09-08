"use client"

import { ChatbotUIContext } from "@/context/context"
import { useContext } from "react"

export default function ReportsPage() {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center">
      <div className="text-4xl">Reports for {selectedWorkspace?.name}</div>
      {/* Add more content for the reports page */}
    </div>
  )
}
