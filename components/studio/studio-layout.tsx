"use client"

import { useEffect, useState } from "react"
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import { SplitRailLayout } from "@/components/canvas/split-rail-layout"
import { getProjectById } from "@/db/projects"
import { StudioCanvas } from "./studio-canvas"

interface StudioLayoutProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
  onBack?: () => void
}

/**
 * Thin wrapper around SplitRailLayout for the Project page: canvas =
 * StudioCanvas, rail = project-scoped chat.
 */
export function StudioLayout({
  children,
  projectId,
  workspaceId,
  onBack: _onBack
}: StudioLayoutProps) {
  // `onBack` is accepted for call-site compatibility with the project detail
  // page but no longer used — the browser Back + sidebar handle the up-nav now
  // that the rail is always visible.
  void _onBack

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

  return (
    <SplitRailLayout
      rail={
        <ScopedChatRail
          scope="project"
          scopeId={projectId}
          scopeName={projectName}
        />
      }
    >
      <StudioCanvas projectId={projectId} workspaceId={workspaceId}>
        {children}
      </StudioCanvas>
    </SplitRailLayout>
  )
}
