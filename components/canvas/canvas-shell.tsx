"use client"

import { cn } from "@/lib/utils"
import { ReactNode, useCallback, useEffect, useState } from "react"
import { AccentTabDef, AccentTabs } from "./accent-tabs"

interface CanvasShellProps {
  header?: ReactNode
  tabs: AccentTabDef[]
  activeKey: string
  onTabChange: (key: string) => void
  children: ReactNode
  rail?: ReactNode
  showRail?: boolean
  onToggleRail?: () => void
  railDefaultWidth?: number
  railMinWidth?: number
  railMaxWidth?: number
  className?: string
}

/**
 * Two-region shell: center canvas + right chat rail (resizable).
 * Rail visibility is controlled by the parent via showRail / onToggleRail
 * so the toggle button can live in the page's own toolbar.
 *
 * On mobile the rail opens as a full-screen overlay with a back button.
 */
export function CanvasShell({
  header,
  tabs,
  activeKey,
  onTabChange,
  children,
  rail,
  showRail = false,
  onToggleRail,
  railDefaultWidth = 340,
  railMinWidth = 280,
  railMaxWidth = 560,
  className
}: CanvasShellProps) {
  const [railWidth, setRailWidth] = useState(railDefaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const startX = e.clientX
      const startWidth = railWidth

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX
        setRailWidth(
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
    [railWidth, railMinWidth, railMaxWidth]
  )

  return (
    <div
      className={cn(
        "bg-ink-50 text-ink-900 flex size-full overflow-hidden",
        className
      )}
    >
      {/* Canvas column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {header && (
          <div className="border-ink-200 shrink-0 border-b bg-white">
            {header}
          </div>
        )}

        <AccentTabs
          tabs={tabs}
          activeKey={activeKey}
          onChange={onTabChange}
          className="shrink-0"
        />

        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>

      {/* Drag handle + right rail (desktop, when open) */}
      {rail && !isMobile && showRail && (
        <>
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "group z-10 flex w-1.5 shrink-0 cursor-col-resize justify-center",
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
            style={{ width: railWidth }}
          >
            <div className="h-full">{rail}</div>
          </aside>
        </>
      )}

      {/* Mobile rail overlay */}
      {rail && isMobile && showRail && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
          <button
            onClick={onToggleRail}
            className="border-ink-200 text-ink-500 shrink-0 border-b px-4 py-3 text-left text-xs font-bold uppercase tracking-widest"
          >
            ← Back to canvas
          </button>
          <div className="min-h-0 flex-1">{rail}</div>
        </div>
      )}
    </div>
  )
}
