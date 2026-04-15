"use client"

import { useCallback, useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import { getProjectById } from "@/db/projects"
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
  onBack: _onBack
}: StudioLayoutProps) {
  // `onBack` is accepted for backwards compatibility with the project detail
  // page but no longer used directly — the Projects grid entry is reached
  // via the sidebar/browser back button now that the chat rail is always on.
  void _onBack
  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [projectName, setProjectName] = useState<string | undefined>()

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getProjectById(projectId)
      .then(p => {
        if (!cancelled) setProjectName(p?.name ?? undefined)
      })
      .catch(() => {
        if (!cancelled) setProjectName(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

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
      <div className="bg-ink-50 text-ink-900 flex h-screen flex-col overflow-hidden font-sans">
        {/* Mobile: Stack chat and canvas vertically */}
        {showChat ? (
          <div className="flex-1 overflow-hidden">
            <ScopedChatRail
              scope="project"
              scopeId={projectId}
              scopeName={projectName}
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
    <div className="bg-ink-50 text-ink-900 flex h-screen overflow-hidden font-sans">
      {/* Canvas/Main Content */}
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="relative flex-1 overflow-hidden">
            <StudioCanvas projectId={projectId} workspaceId={workspaceId}>
              {children}
            </StudioCanvas>
          </div>
        </div>
      </main>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "group z-50 flex w-1.5 shrink-0 cursor-col-resize justify-center",
          isDragging ? "bg-teal-journey/30" : "hover:bg-teal-journey/20"
        )}
      >
        <div
          className={cn(
            "h-full w-px transition-colors",
            isDragging
              ? "bg-teal-journey"
              : "bg-ink-200 group-hover:bg-teal-journey"
          )}
        />
      </div>

      {/* Chat Rail (right side — JourneyMaker pattern) */}
      <aside
        className="border-ink-200 shrink-0 border-l bg-white"
        style={{ width: chatWidth }}
      >
        <ScopedChatRail
          scope="project"
          scopeId={projectId}
          scopeName={projectName}
        />
      </aside>
    </div>
  )
}
