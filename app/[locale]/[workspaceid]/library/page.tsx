"use client"

/**
 * Workspace Library — every paper a user saves (the bookmark icon on a
 * design's literature tab) lands here. Papers are GROUPED BY THE DESIGN they
 * were saved from, with the design name as the section header, and each paper
 * rendered as a labelled slab (Authors / Year / Summary / Source / Link) that
 * mirrors how it looks inside the design.
 *
 * A paper can be saved from more than one design (source_design_ids is an
 * array), so it appears under each of those designs. Papers saved without a
 * design fall into a "Saved papers" catch-all group.
 */

import { useContext, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import {
  IconBookmark,
  IconFlask,
  IconSearch,
  IconTrash
} from "@tabler/icons-react"
import { ChatbotUIContext } from "@/context/context"
import { getPaperLibrary, removePaperFromLibrary } from "@/db/paper-library"
import type { PaperLibraryEntry } from "@/lib/paper-library/types"

const UNSORTED_KEY = "__unsorted__"

const SOURCE_LABEL: Record<string, string> = {
  pubmed: "PubMed",
  arxiv: "arXiv",
  semantic_scholar: "Semantic Scholar",
  scholar: "Google Scholar",
  tavily: "Web",
  openalex: "OpenAlex",
  user: "Uploaded"
}

interface DesignGroup {
  key: string
  designName: string | null
  papers: PaperLibraryEntry[]
  latest: number
}

export default function LibraryPage() {
  const params = useParams()
  const workspaceId = params.workspaceid as string
  const { designs } = useContext(ChatbotUIContext)

  const [papers, setPapers] = useState<PaperLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getPaperLibrary(workspaceId)
      .then((rows: PaperLibraryEntry[]) => {
        if (!cancelled) setPapers(rows ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const designNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of designs as any[]) m.set(d.id, d.name)
    return m
  }, [designs])

  // Search filter on title / authors / journal.
  const filteredPapers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return papers
    return papers.filter(p => {
      return (
        p.title?.toLowerCase().includes(q) ||
        (p.authors ?? []).some(a => a.toLowerCase().includes(q)) ||
        p.journal?.toLowerCase().includes(q)
      )
    })
  }, [papers, search])

  // Group papers by the design(s) they were saved from. A paper with multiple
  // source_design_ids shows up under each; papers with none go to "unsorted".
  const groups = useMemo<DesignGroup[]>(() => {
    const byKey = new Map<string, PaperLibraryEntry[]>()
    for (const p of filteredPapers) {
      const ids = p.source_design_ids ?? []
      const keys = ids.length > 0 ? ids : [UNSORTED_KEY]
      for (const k of keys) {
        const list = byKey.get(k) ?? []
        list.push(p)
        byKey.set(k, list)
      }
    }
    const out: DesignGroup[] = []
    for (const [key, list] of byKey.entries()) {
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      )
      out.push({
        key,
        designName:
          key === UNSORTED_KEY ? null : (designNameById.get(key) ?? null),
        papers: sorted,
        latest: new Date(
          sorted[0]?.updated_at || sorted[0]?.created_at || 0
        ).getTime()
      })
    }
    // Most-recently-touched group first; the catch-all sinks to the bottom.
    out.sort((a, b) => {
      if (a.key === UNSORTED_KEY) return 1
      if (b.key === UNSORTED_KEY) return -1
      return b.latest - a.latest
    })
    return out
  }, [filteredPapers, designNameById])

  const handleRemove = async (paperId: string) => {
    // Optimistic remove across every group it appears in.
    const prev = papers
    setPapers(p => p.filter(x => x.id !== paperId))
    try {
      await removePaperFromLibrary(paperId)
      toast.success("Removed from library")
    } catch (e: any) {
      setPapers(prev)
      toast.error(`Couldn't remove: ${e?.message ?? "unknown"}`)
    }
  }

  return (
    <div className="bg-paper h-full space-y-6 overflow-auto p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <DisplayHeading as="h1" className="mt-1 text-[34px]">
            Library
          </DisplayHeading>
          <p className="text-ink-3 mt-1 text-[13px]">
            Papers you&apos;ve saved, grouped by the design they came from.
          </p>
        </div>
        {papers.length > 0 && (
          <div className="border-line bg-paper flex w-full max-w-[260px] items-center gap-2 rounded-md border px-3 sm:w-[260px]">
            <IconSearch size={14} className="text-ink-3 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search papers…"
              className="text-ink placeholder:text-ink-3 h-8 w-full border-none bg-transparent text-[12.5px] outline-none"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-line border-t-rust size-8 animate-spin rounded-full border-2" />
        </div>
      ) : papers.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="bg-rust-soft mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
            <IconBookmark size={26} className="text-rust" />
          </div>
          <p className="text-ink mb-2 text-[14px] font-semibold">
            No saved papers yet
          </p>
          <p className="text-ink-3 mx-auto max-w-sm text-[13px] leading-relaxed">
            Open a design&apos;s literature search and use the save icon on any
            paper. Saved papers appear here, grouped by their design.
          </p>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-ink-3 text-[13px]">
            No papers match “{search}”.
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <section key={group.key}>
              <div className="border-line mb-3 flex items-center gap-2 border-b pb-2">
                <IconFlask size={15} className="text-rust shrink-0" />
                <h2 className="text-ink truncate text-[15px] font-semibold">
                  {group.designName ?? "Saved papers"}
                </h2>
                <span className="text-ink-3 font-mono text-[11px]">
                  {group.papers.length} paper
                  {group.papers.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {group.papers.map((paper, idx) => (
                  <LibraryPaperCard
                    key={`${group.key}-${paper.id}`}
                    paper={paper}
                    index={idx}
                    onRemove={() => handleRemove(paper.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function LibraryPaperCard({
  paper,
  index,
  onRemove
}: {
  paper: PaperLibraryEntry
  index: number
  onRemove: () => void
}) {
  const authorList = paper.authors ?? []
  const authorStr =
    authorList.length === 0
      ? ""
      : authorList.length <= 5
        ? authorList.join(", ")
        : `${authorList.slice(0, 5).join(", ")} et al.`

  return (
    <div className="border-line bg-surface rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-rust font-mono text-[11px] font-semibold">
              #{index + 1}
            </span>
            <h4 className="text-ink flex-1 text-[14px] font-semibold leading-snug">
              {paper.title}
            </h4>
          </div>

          {authorStr && (
            <p className="text-ink-2 mt-1.5 text-[12px]">
              <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
                Authors
              </span>
              {authorStr}
            </p>
          )}
          {paper.year && (
            <p className="text-ink-2 mt-1 text-[12px]">
              <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
                Year
              </span>
              {paper.year}
              {paper.journal ? ` · ${paper.journal}` : ""}
            </p>
          )}
          <p className="text-ink-2 mt-2 text-[12.5px] leading-relaxed">
            <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
              Summary
            </span>
            {paper.summary ||
              "Abstract not available - open the paper for details."}
          </p>
          <p className="text-ink-2 mt-2 text-[12px]">
            <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
              Source
            </span>
            {paper.source
              ? (SOURCE_LABEL[paper.source] ?? paper.source)
              : "Unknown"}
          </p>
          {paper.url && (
            <p className="mt-1 text-[12px]">
              <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
                Link
              </span>
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="text-rust inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline"
              >
                {paper.url.replace(/^https?:\/\//, "").slice(0, 80)}
                {" ↗"}
              </a>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-ink-3 hover:text-destructive shrink-0"
          title="Remove from library"
        >
          <IconTrash size={14} />
        </Button>
      </div>
    </div>
  )
}
