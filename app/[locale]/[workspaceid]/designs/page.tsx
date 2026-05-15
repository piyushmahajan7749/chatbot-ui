"use client"

/**
 * Workspace-wide Designs list.
 *
 * Pulls every design in the workspace (from ChatbotUIContext, which is
 * already populated by the workspace layout) and renders them in a flat
 * list with project-name attribution. Replaces the earlier stub that
 * redirected to /projects - clicking "All Designs" in the sidebar
 * shouldn't bounce the user back to project nav (#17 in the May ask).
 */
import {
  IconFlask,
  IconFolder,
  IconMessage,
  IconPlus,
  IconSearch
} from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import { ChatbotUIContext } from "@/context/context"
import { getProjectsByWorkspaceId } from "@/db/projects"
import {
  getDesignProblemStatement,
  getDesignProgress
} from "@/lib/design-status"
import { formatCreatedModifiedStacked } from "@/lib/format-date"
import { cn } from "@/lib/utils"

interface ProjectLite {
  id: string
  name: string
}

export default function DesignsPage() {
  const params = useParams()
  const router = useRouter()
  const { designs, selectedWorkspace } = useContext(ChatbotUIContext)
  const locale = params.locale as string
  const workspaceId = params.workspaceid as string

  // Projects aren't carried in ChatbotUIContext - fetch on mount so
  // each design row can show its project_id resolved to a name.
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!selectedWorkspace?.id) return
    let cancelled = false
    void getProjectsByWorkspaceId(selectedWorkspace.id)
      .then((rows: any[]) => {
        if (!cancelled) {
          setProjects(
            (rows ?? []).map(p => ({ id: p.id, name: p.name as string }))
          )
        }
      })
      .catch((err: any) =>
        console.warn("[DesignsPage] failed to load projects:", err)
      )
    return () => {
      cancelled = true
    }
  }, [selectedWorkspace?.id])

  const projectName = (projectId: string | null | undefined) =>
    (projectId && projects.find(p => p.id === projectId)?.name) || null

  const sortedDesigns = useMemo(
    () =>
      [...designs].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [designs]
  )

  const filteredDesigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedDesigns
    // Resolve project names inline so the useMemo depends only on `projects`
    // (the source of truth), not the `projectName` helper closure - which
    // ESLint can't trace through.
    const nameById = new Map(projects.map(p => [p.id, p.name]))
    return sortedDesigns.filter(d => {
      const pn = d.project_id ? nameById.get(d.project_id) : undefined
      return (
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        pn?.toLowerCase().includes(q)
      )
    })
  }, [sortedDesigns, search, projects])

  const handleNewDesign = () => {
    router.push(`/${locale}/${workspaceId}/designs/new`)
  }

  return (
    <div className="bg-paper h-full overflow-auto px-10 pb-16 pt-7">
      <div className="mx-auto max-w-[1060px]">
        {/* Header */}
        <div className="mb-7 flex items-end justify-between gap-5">
          <div>
            <Eyebrow>{selectedWorkspace?.name ?? "Workspace"}</Eyebrow>
            <DisplayHeading as="h1" className="mb-1 mt-1.5 text-[36px]">
              Designs
            </DisplayHeading>
            <div className="text-ink-3 text-[13px]">
              {designs.length} design{designs.length === 1 ? "" : "s"} across{" "}
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Issue #2 - "Start chat" jumps straight into a chat scoped
                across all designs in the workspace. The chat page lets
                the user narrow to one design from there, but the default
                is the whole collection so they aren't forced to pick. */}
            <Button
              variant="secondary"
              size="lg"
              onClick={() =>
                router.push(
                  `/${locale}/${workspaceId}/chat?defaultScope=designs`
                )
              }
            >
              <IconMessage size={14} stroke={2.4} /> Start chat
            </Button>
            <Button variant="primary" size="lg" onClick={handleNewDesign}>
              <IconPlus size={14} stroke={2.4} /> New design
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="border-line bg-paper mb-5 flex items-center gap-2 rounded-md border px-3">
          <IconSearch size={14} className="text-ink-3 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search designs, descriptions, projects…"
            className="text-ink placeholder:text-ink-3 h-10 w-full border-none bg-transparent text-[13px] outline-none"
          />
        </div>

        {/* List */}
        {filteredDesigns.length === 0 ? (
          <Card className="p-10 text-center">
            <IconFlask size={28} className="text-ink-3 mx-auto mb-3" />
            <div className="text-ink mb-1 text-[14px] font-semibold">
              {search.trim()
                ? "No matching designs"
                : "No designs in this workspace yet"}
            </div>
            <div className="text-ink-3 mb-5 text-[13px]">
              {search.trim()
                ? "Try a different search term."
                : "Click New design above to start."}
            </div>
          </Card>
        ) : (
          <DesignsList
            items={filteredDesigns}
            projectNameOf={projectName}
            workspaceId={workspaceId}
            locale={locale}
          />
        )}
      </div>
    </div>
  )
}

interface DesignsListProps {
  items: Array<{
    id: string
    name: string
    description?: string | null
    project_id?: string | null
    updated_at?: string | null
    created_at: string
    /** Raw Firestore content blob - used to derive status. */
    content?: string | Record<string, unknown> | null
  }>
  projectNameOf: (id: string | null | undefined) => string | null
  workspaceId: string
  locale: string
}

const DesignsList: FC<DesignsListProps> = ({
  items,
  projectNameOf,
  workspaceId,
  locale
}) => {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(d => {
        const pname = projectNameOf(d.project_id)
        const progress = getDesignProgress(d)
        const problemStatement = getDesignProblemStatement(d)
        const dateLines = formatCreatedModifiedStacked(
          d.created_at,
          d.updated_at
        )
        return (
          <button
            key={d.id}
            type="button"
            onClick={() =>
              router.push(`/${locale}/${workspaceId}/designs/${d.id}`)
            }
            className={cn(
              "border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto] items-start gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
            )}
          >
            <div className="min-w-0">
              <div className="text-ink truncate text-[15px] font-semibold">
                {d.name}
              </div>
              {/* Secondary line: user-typed problem statement from
                  `content.problem.problemStatement`. Falls back to
                  legacy `description` ONLY when it isn't the same
                  string as `name` (legacy rows duplicated name into
                  description, which made the slab show the title
                  twice - the bug the scientist flagged). */}
              {problemStatement ? (
                <div className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
                  {problemStatement}
                </div>
              ) : d.description && d.description !== d.name ? (
                <div className="text-ink-3 mt-1 line-clamp-2 text-[12.5px]">
                  {d.description}
                </div>
              ) : null}
              {/* Color-coded tag row. Each chip uses its own tint so the
                  three pieces of info (project / status / stage) are
                  distinguishable at a glance instead of being one big
                  rust-soft blob. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {pname && (
                  <span className="border-teal-journey/30 bg-teal-journey-tint text-teal-journey inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium">
                    <IconFolder size={10} />
                    {pname}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                    progress.isCompleted
                      ? "border-transparent bg-[#DDE9DF] text-[#1F4A2C]"
                      : "border-amber-300/40 bg-amber-100/70 text-amber-800"
                  )}
                >
                  {progress.isCompleted ? "Completed" : "In progress"}
                </span>
                {!progress.isCompleted && progress.currentStageLabel && (
                  <span className="border-purple-persona/30 bg-purple-persona-tint text-purple-persona rounded-full border px-2 py-0.5 text-[10.5px] font-medium">
                    Stage: {progress.currentStageLabel}
                  </span>
                )}
              </div>
            </div>
            {/* Stacked vertical dates on the right corner. */}
            <div className="text-ink-3 flex min-w-[120px] flex-col items-end gap-0.5 text-right font-mono text-[11px] leading-tight">
              {dateLines.map(line => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
