"use client"

/**
 * StartChatModal — picker for the new-thread flow.
 *
 * The user chooses what they want to chat with: the whole workspace,
 * one project, one design, one report, or a hand-picked set of files.
 * The selection drives `chats.scope` + `chats.scope_id` (and, for files,
 * the chat_files join), which the retrieve route uses to filter the
 * unified `rag_items` corpus (see lib/rag/retrieve.ts).
 */
import {
  IconBriefcase,
  IconCheck,
  IconClipboardText,
  IconFile,
  IconFlask,
  IconFolder,
  IconReport,
  IconSearch
} from "@tabler/icons-react"
import { FC, useContext, useEffect, useMemo, useState } from "react"

import { getProjectsByWorkspaceId } from "@/db/projects"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChatbotUIContext } from "@/context/context"
import { cn } from "@/lib/utils"

export type ChatScope = "workspace" | "project" | "design" | "report" | "files"

export interface StartChatSelection {
  scope: "project" | "design" | "report" | null
  scopeId: string | null
  fileIds: string[]
  /** Human-readable label for the picked context (for the new chat name + header). */
  label: string
}

interface StartChatModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (sel: StartChatSelection) => void
  busy?: boolean
}

export const StartChatModal: FC<StartChatModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  busy
}) => {
  const {
    selectedWorkspace,
    designs,
    reports,
    files: workspaceFiles
  } = useContext(ChatbotUIContext)

  const [activeTab, setActiveTab] = useState<ChatScope>("workspace")
  const [search, setSearch] = useState("")
  const [pickedFileIds, setPickedFileIds] = useState<string[]>([])
  // Projects aren't carried in ChatbotUIContext today — fetch on modal
  // open so the Projects tab populates without a context refactor.
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    if (!isOpen || !selectedWorkspace?.id) return
    let cancelled = false
    void getProjectsByWorkspaceId(selectedWorkspace.id)
      .then((rows: any[]) => {
        if (!cancelled) setProjects(rows ?? [])
      })
      .catch((err: any) =>
        console.warn("[StartChatModal] failed to load projects:", err)
      )
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedWorkspace?.id])

  const reset = () => {
    setActiveTab("workspace")
    setSearch("")
    setPickedFileIds([])
  }

  const handleClose = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const handlePickWorkspace = () => {
    onConfirm({
      scope: null,
      scopeId: null,
      fileIds: [],
      label: `Workspace · ${selectedWorkspace?.name ?? "Workspace"}`
    })
  }

  const handlePickProject = (id: string, name: string) => {
    onConfirm({
      scope: "project",
      scopeId: id,
      fileIds: [],
      label: `Project · ${name}`
    })
  }

  const handlePickDesign = (id: string, name: string) => {
    onConfirm({
      scope: "design",
      scopeId: id,
      fileIds: [],
      label: `Design · ${name}`
    })
  }

  const handlePickReport = (id: string, name: string) => {
    onConfirm({
      scope: "report",
      scopeId: id,
      fileIds: [],
      label: `Report · ${name}`
    })
  }

  const handleConfirmFiles = () => {
    if (pickedFileIds.length === 0) return
    onConfirm({
      scope: null,
      scopeId: null,
      fileIds: pickedFileIds,
      label: `Files · ${pickedFileIds.length} selected`
    })
  }

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p: any) =>
      `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q)
    )
  }, [projects, search])

  const filteredDesigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return designs
    return designs.filter(d =>
      `${d.name} ${d.description ?? ""}`.toLowerCase().includes(q)
    )
  }, [designs, search])

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter(r =>
      `${r.name ?? ""} ${(r as any).description ?? ""}`
        .toLowerCase()
        .includes(q)
    )
  }, [reports, search])

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workspaceFiles
    return workspaceFiles.filter(f =>
      `${f.name ?? ""} ${(f as any).description ?? ""}`
        .toLowerCase()
        .includes(q)
    )
  }, [workspaceFiles, search])

  const toggleFile = (id: string) => {
    setPickedFileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a new chat</DialogTitle>
          <DialogDescription>
            Pick what you want to chat with. The chat will pull answers from
            this context only and cite back to the source.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={v => {
            setActiveTab(v as ChatScope)
            setSearch("")
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="workspace" className="gap-1.5">
              <IconBriefcase size={14} /> Workspace
            </TabsTrigger>
            <TabsTrigger value="project" className="gap-1.5">
              <IconFolder size={14} /> Projects
            </TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5">
              <IconFlask size={14} /> Designs
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5">
              <IconReport size={14} /> Reports
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-1.5">
              <IconFile size={14} /> Files
            </TabsTrigger>
          </TabsList>

          {/* Search bar — hidden for the workspace tab (single choice). */}
          {activeTab !== "workspace" && (
            <div className="border-line bg-paper mt-3 flex items-center gap-2 rounded-md border px-3">
              <IconSearch size={14} className="text-ink-400 shrink-0" />
              <Input
                placeholder={`Search ${activeTab}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border-none px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          )}

          {/* WORKSPACE */}
          <TabsContent value="workspace" className="mt-4">
            <div className="border-line bg-paper-2 flex items-start gap-3 rounded-lg border p-4">
              <IconBriefcase size={18} className="text-ink-700 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-ink text-sm font-semibold">
                  {selectedWorkspace?.name ?? "Workspace"}
                </div>
                <div className="text-ink-3 mt-0.5 text-[12.5px] leading-relaxed">
                  Chat across every design, report, paper, file, and
                  conversation in this workspace. Answers cite the source on
                  click.
                </div>
              </div>
            </div>
          </TabsContent>

          {/* PROJECT */}
          <TabsContent value="project" className="mt-3">
            <PickList
              items={filteredProjects.map((p: any) => ({
                id: p.id,
                title: p.name,
                subtitle: p.description ?? undefined
              }))}
              emptyHint="No projects in this workspace yet."
              onSelect={(id, title) => handlePickProject(id, title)}
            />
          </TabsContent>

          {/* DESIGN */}
          <TabsContent value="design" className="mt-3">
            <PickList
              items={filteredDesigns.map(d => ({
                id: d.id,
                title: d.name,
                subtitle: d.description ?? undefined
              }))}
              emptyHint="No designs in this workspace yet."
              onSelect={(id, title) => handlePickDesign(id, title)}
            />
          </TabsContent>

          {/* REPORT */}
          <TabsContent value="report" className="mt-3">
            <PickList
              items={filteredReports.map(r => ({
                id: r.id,
                title: r.name ?? "Untitled report",
                subtitle: (r as any).description ?? undefined
              }))}
              emptyHint="No reports in this workspace yet."
              onSelect={(id, title) => handlePickReport(id, title)}
            />
          </TabsContent>

          {/* FILES (multi-select) */}
          <TabsContent value="files" className="mt-3">
            <MultiPickList
              items={filteredFiles.map(f => ({
                id: f.id,
                title: f.name,
                subtitle: f.type ?? undefined
              }))}
              picked={pickedFileIds}
              onToggle={toggleFile}
              emptyHint="No files in this workspace yet. Upload from a project's Files tab."
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {activeTab === "workspace" && (
            <Button onClick={handlePickWorkspace} disabled={busy}>
              {busy ? "Starting…" : "Chat with workspace"}
            </Button>
          )}
          {activeTab === "files" && (
            <Button
              onClick={handleConfirmFiles}
              disabled={busy || pickedFileIds.length === 0}
            >
              {busy
                ? "Starting…"
                : `Chat with ${pickedFileIds.length} file${
                    pickedFileIds.length === 1 ? "" : "s"
                  }`}
            </Button>
          )}
          {activeTab !== "workspace" && activeTab !== "files" && (
            <span className="text-ink-3 self-center text-[12px]">
              Select an item above to start the chat
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Generic single-pick list ─────────────────────────────────────────────

interface PickListItem {
  id: string
  title: string
  subtitle?: string
}

const PickList: FC<{
  items: PickListItem[]
  emptyHint: string
  onSelect: (id: string, title: string) => void
}> = ({ items, emptyHint, onSelect }) => {
  if (items.length === 0) {
    return (
      <div className="border-line bg-paper-2 text-ink-3 rounded-md border border-dashed p-6 text-center text-[12.5px]">
        {emptyHint}
      </div>
    )
  }
  return (
    <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          onClick={() => onSelect(it.id, it.title)}
          className="border-line bg-surface hover:border-line-strong hover:bg-paper-2 flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-ink truncate text-[13px] font-semibold">
              {it.title}
            </div>
            {it.subtitle && (
              <div className="text-ink-3 mt-0.5 line-clamp-1 text-[11.5px]">
                {it.subtitle}
              </div>
            )}
          </div>
          <IconClipboardText
            size={14}
            className="text-ink-400 shrink-0"
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}

// ── Multi-select list (files) ────────────────────────────────────────────

const MultiPickList: FC<{
  items: PickListItem[]
  picked: string[]
  onToggle: (id: string) => void
  emptyHint: string
}> = ({ items, picked, onToggle, emptyHint }) => {
  if (items.length === 0) {
    return (
      <div className="border-line bg-paper-2 text-ink-3 rounded-md border border-dashed p-6 text-center text-[12.5px]">
        {emptyHint}
      </div>
    )
  }
  const isAllPicked = items.every(it => picked.includes(it.id))
  return (
    <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-ink-3 text-[11.5px]">
          {picked.length} selected
        </span>
        <button
          type="button"
          onClick={() =>
            isAllPicked
              ? items.forEach(it => picked.includes(it.id) && onToggle(it.id))
              : items.forEach(it => !picked.includes(it.id) && onToggle(it.id))
          }
          className="text-ink-3 hover:text-ink text-[11.5px] underline-offset-2 hover:underline"
        >
          {isAllPicked ? "Clear all" : "Select all"}
        </button>
      </div>
      {items.map(it => {
        const isPicked = picked.includes(it.id)
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={cn(
              "border-line bg-surface hover:border-line-strong hover:bg-paper-2 flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
              isPicked && "border-rust bg-rust-soft"
            )}
          >
            <Checkbox checked={isPicked} className="pointer-events-none" />
            <div className="min-w-0 flex-1">
              <div className="text-ink truncate text-[13px] font-semibold">
                {it.title}
              </div>
              {it.subtitle && (
                <div className="text-ink-3 mt-0.5 line-clamp-1 text-[11.5px]">
                  {it.subtitle}
                </div>
              )}
            </div>
            {isPicked && <IconCheck size={14} className="text-rust" />}
          </button>
        )
      })}
    </div>
  )
}
