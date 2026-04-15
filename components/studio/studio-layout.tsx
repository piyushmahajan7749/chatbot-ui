"use client"

import { useCallback, useState, useEffect } from "react"
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
  const [isMobile, setIsMobile] = useState(false)
  const [showChat, setShowChat] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) {
        setShowChat(false)
      }
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const startX = e.clientX
      const startWidth = chatWidth

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX
        const newWidth = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, startWidth + delta)
        )
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

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
        {/* Mobile: Stack chat and canvas vertically */}
        {showChat ? (
          <div className="flex-1 overflow-hidden">
            <StudioChatPanel
              width={0} // Full width on mobile
              projectId={projectId}
              workspaceId={workspaceId}
              onBack={() => setShowChat(false)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <StudioCanvas
              projectId={projectId}
              workspaceId={workspaceId}
              onOpenChat={() => setShowChat(true)}
            >
              {children}
            </StudioCanvas>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
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
          "group z-50 flex w-2 shrink-0 cursor-col-resize justify-center",
          isDragging ? "bg-blue-500/20" : "hover:bg-blue-400/10"
        )}
      >
        <div
          className={cn(
            "h-full w-1 transition-colors",
            isDragging
              ? "bg-blue-500"
              : "bg-transparent group-hover:bg-blue-400"
          )}
        />
      </div>

      {/* Canvas/Main Content */}
      <main className="relative flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="relative flex-1 overflow-hidden">
            <StudioCanvas projectId={projectId} workspaceId={workspaceId}>
              {children}
            </StudioCanvas>
          </div>
        </div>
      </main>
    </div>
  )
}
