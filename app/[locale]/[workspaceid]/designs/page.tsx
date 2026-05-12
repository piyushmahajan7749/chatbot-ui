"use client"

/**
 * Workspace-wide Designs list.
 *
 * Pulls every design in the workspace (from ChatbotUIContext, which is
 * already populated by the workspace layout) and renders them in a flat
 * list with project-name attribution. Replaces the earlier stub that
 * redirected to /projects — clicking "All Designs" in the sidebar
 * shouldn't bounce the user back to project nav (#17 in the May ask).
 */
import {
  IconFlask,
  IconFolder,
  IconPlus,
  IconSearch
} from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import { ChatbotUIContext } from "@/context/context"
import { getProjectsByWorkspaceId } from "@/db/projects"
import { cn } from "@/lib/utils"

interface ProjectLite {
  id: string
  name: string
}

function relativeTime(iso: string | null) {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`
  const w = Math.floor(d / 7)
  return `${w} wk ago`
}

export default function DesignsPage() {
  const params = useParams()
  const router = useRouter()
  const { designs, selectedWorkspace } = useContext(ChatbotUIContext)
  const locale = params.locale as string
  const workspaceId = params.workspaceid as string

  // Projects aren't carried in ChatbotUIContext — fetch on mount so
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
    return sortedDesigns.filter(
      d =>
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        projectName(d.project_id)?.toLowerCase().includes(q)
    )
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
          <Button variant="primary" size="lg" onClick={handleNewDesign}>
            <IconPlus size={14} stroke={2.4} /> New design
          </Button>
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
        return (
          <button
            key={d.id}
            type="button"
            onClick={() =>
              router.push(`/${locale}/${workspaceId}/designs/${d.id}`)
            }
            className={cn(
              "border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto_auto] items-center gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
            )}
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <Chip variant="default" className="h-[18px] text-[10px]">
                  Design
                </Chip>
                {pname && (
                  <Chip variant="accent" className="h-[18px] text-[10px]">
                    <IconFolder size={10} className="mr-0.5" />
                    {pname}
                  </Chip>
                )}
                {d.updated_at &&
                  new Date(d.updated_at).getTime() >
                    Date.now() - 1000 * 60 * 60 * 24 && (
                    <Chip variant="accent" className="h-[18px] text-[10px]">
                      Updated recently
                    </Chip>
                  )}
              </div>
              <div className="text-ink truncate text-[15px] font-semibold">
                {d.name}
              </div>
              {d.description && (
                <div className="text-ink-3 mt-1 line-clamp-1 text-[12.5px]">
                  {d.description}
                </div>
              )}
            </div>
            <div className="text-ink-3 min-w-[90px] text-right font-mono text-[12px]">
              {relativeTime(d.updated_at || d.created_at)}
            </div>
            <div className="w-1" />
          </button>
        )
      })}
    </div>
  )
}
