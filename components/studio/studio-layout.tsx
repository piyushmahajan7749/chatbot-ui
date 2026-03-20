"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { StudioChatPanel } from "./studio-chat-panel"
import { StudioCanvas } from "./studio-canvas"

interface StudioLayoutProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
  onBack?: () => void
}

const MIN_WIDTH = 320
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 400

export function StudioLayout({ 
  children, 
  projectId, 
  workspaceId, 
  onBack 
}: StudioLayoutProps) {
  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const startX = e.clientX
      const startWidth = chatWidth

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta))
        setChatWidth(newWidth)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [chatWidth]
  )

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Chat Panel */}
      <StudioChatPanel 
        width={chatWidth}
        projectId={projectId}
        workspaceId={workspaceId}
        onBack={onBack}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-2 cursor-col-resize z-50 flex justify-center group shrink-0",
          isDragging ? "bg-blue-500/20" : "hover:bg-blue-400/10"
        )}
      >
        <div
          className={cn(
            "w-1 h-full transition-colors",
            isDragging ? "bg-blue-500" : "bg-transparent group-hover:bg-blue-400"
          )}
        />
      </div>

      {/* Canvas/Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <div className="flex flex-col h-full">
          <div className="flex-1 relative overflow-hidden">
            <StudioCanvas 
              projectId={projectId}
              workspaceId={workspaceId}
            >
              {children}
            </StudioCanvas>
          </div>
        </div>
      </main>
    </div>
  )
}