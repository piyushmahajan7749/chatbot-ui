"use client"

import { cn } from "@/lib/utils"
import { ReactNode, useCallback, useEffect, useState } from "react"

interface SplitRailLayoutProps {
  children: ReactNode
  rail: ReactNode
  railDefaultWidth?: number
  railMinWidth?: number
  railMaxWidth?: number
  className?: string
}

/**
 * Two-region shell used by Project and Design detail pages: full-height canvas
 * column on the left, resizable right rail. Under 1024px the rail hides and a
 * bottom-right "Chat" FAB opens it as a full-screen overlay.
 *
 * Purely presentational — callers pass in whatever they want for the rail
 * (typically a ScopedChatRail).
 */
export function SplitRailLayout({
  children,
  rail,
  railDefaultWidth = 400,
  railMinWidth = 320,
  railMaxWidth = 640,
  className
}: SplitRailLayoutProps) {
  const [chatWidth, setChatWidth] = useState(railDefaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showRailMobile, setShowRailMobile] = useState(false)

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) setShowRailMobile(false)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const startX = e.clientX
      const startWidth = chatWidth

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX
        setChatWidth(
          Math.max(railMinWidth, Math.min(railMaxWidth, startWidth + delta))
        )
      }
      const onUp = () => {
        setIsDragging(false)
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
      }
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [chatWidth, railMinWidth, railMaxWidth]
  )

  if (isMobile) {
    return (
      <div
        className={cn(
          "bg-ink-50 text-ink-900 flex h-full flex-col overflow-hidden font-sans",
          className
        )}
      >
        <div className="flex-1 overflow-hidden">{children}</div>

        {showRailMobile && (
          <div className="fixed inset-0 z-40 flex flex-col bg-white">
            <button
              onClick={() => setShowRailMobile(false)}
              className="border-ink-200 text-ink-500 shrink-0 border-b px-4 py-3 text-left text-xs font-bold uppercase tracking-widest"
            >
              ← Back to canvas
            </button>
            <div className="min-h-0 flex-1">{rail}</div>
          </div>
        )}

        {!showRailMobile && (
          <button
            onClick={() => setShowRailMobile(true)}
            className="bg-brick hover:bg-brick-hover fixed bottom-6 right-6 z-30 rounded-full px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg"
          >
            Chat
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "bg-ink-50 text-ink-900 flex h-full overflow-hidden font-sans",
        className
      )}
    >
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="relative flex-1 overflow-hidden">{children}</div>
        </div>
      </main>

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

      <aside
        className="border-ink-200 shrink-0 border-l bg-white"
        style={{ width: chatWidth }}
      >
        {rail}
      </aside>
    </div>
  )
}
