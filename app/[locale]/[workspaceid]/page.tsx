"use client"

import {
  IconArrowRight,
  IconFlask,
  IconPlus,
  IconSearch
} from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { FC, useContext, useMemo, useState } from "react"

import { ShadowAISVG } from "@/components/icons/chatbotui-svg"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import { ChatbotUIContext } from "@/context/context"
import { cn } from "@/lib/utils"

function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function formatDay(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  })
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

interface StatProps {
  label: string
  value: string | number
  sub: string
}
const Stat: FC<StatProps> = ({ label, value, sub }) => (
  <Card className="p-[18px]">
    <Eyebrow className="text-[10px]">{label}</Eyebrow>
    <div className="font-display text-ink mt-1.5 text-[30px] tracking-[-0.01em]">
      {value}
    </div>
    <div className="text-ink-3 mt-0.5 text-[11.5px]">{sub}</div>
  </Card>
)

export default function WorkspacePage() {
  const router = useRouter()
  const { selectedWorkspace, profile, designs, reports, chats } =
    useContext(ChatbotUIContext)
  const [query, setQuery] = useState("")

  const firstName =
    profile?.display_name?.split(" ")[0] || profile?.username || "there"
  const wsId = selectedWorkspace?.id

  const sortedDesigns = useMemo(
    () =>
      [...designs]
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
        )
        .slice(0, 8),
    [designs]
  )

  const filter: "all" | "active" | "done" = "all"
  const filteredDesigns = sortedDesigns

  const startDesign = (seed?: string) => {
    if (!wsId) return
    const base = `/${wsId}/designs/new`
    router.push(seed ? `${base}?q=${encodeURIComponent(seed)}` : base)
  }

  return (
    <div className="bg-paper h-full overflow-auto px-10 pb-16 pt-7">
      <div className="mx-auto max-w-[1060px]">
        {/* Hero */}
        <div className="mb-7 flex items-end justify-between gap-5">
          <div>
            <Eyebrow>
              {selectedWorkspace?.name || "Workspace"} · {formatDay(new Date())}
            </Eyebrow>
            <DisplayHeading as="h1" className="mb-1 mt-1.5 text-[42px]">
              {greeting()}, <span className="text-rust">{firstName}</span>
            </DisplayHeading>
            <div className="text-ink-2 text-[14px] leading-relaxed">
              {designs.length} design{designs.length === 1 ? "" : "s"} ·{" "}
              {reports.length} report{reports.length === 1 ? "" : "s"}
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={() => startDesign()}>
            <IconPlus size={14} stroke={2.4} /> New design
          </Button>
        </div>

        {/* Quick start */}
        <Card className="mb-7 grid grid-cols-[auto_1fr_auto] items-center gap-[18px] p-5">
          <div className="bg-ink flex size-11 items-center justify-center rounded-xl">
            <ShadowAISVG scale={22 / 24} />
          </div>
          <div>
            <div className="text-ink mb-0.5 text-[14px] font-semibold">
              Start a design by describing your research question
            </div>
            <div className="text-ink-3 text-[13px]">
              Shadow will ask follow-ups, scope the problem, and run literature
              for you.
            </div>
          </div>
          <form
            onSubmit={e => {
              e.preventDefault()
              startDesign(query)
            }}
            className="border-line bg-paper flex min-w-[360px] items-center gap-2 rounded-full border py-2 pl-3.5 pr-2"
          >
            <IconSearch size={14} className="text-ink-3" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. why is my mAb aggregating at high pH?"
              className="text-ink placeholder:text-ink-3 flex-1 border-none bg-transparent text-[13px] outline-none"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="rounded-full"
            >
              Start <IconArrowRight size={12} />
            </Button>
          </form>
        </Card>

        {/* Stats */}
        <div className="mb-7 grid grid-cols-4 gap-3.5">
          <Stat
            label="Active designs"
            value={designs.length}
            sub={designs.length === 0 ? "none yet" : "in progress"}
          />
          <Stat
            label="Reports"
            value={reports.length}
            sub={reports.length === 0 ? "none yet" : "generated"}
          />
          <Stat
            label="Chats"
            value={chats.length}
            sub={chats.length === 0 ? "none yet" : "threads"}
          />
          <Stat
            label="Workspace"
            value={firstName}
            sub={selectedWorkspace?.name || "current"}
          />
        </div>

        {/* Designs list */}
        <div className="mb-3.5 flex items-baseline justify-between">
          <DisplayHeading as="h2" className="text-[22px]">
            Your designs
          </DisplayHeading>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="font-medium">
              All ({designs.length})
            </Button>
            <Button variant="ghost" size="sm">
              Recent
            </Button>
            <Button variant="ghost" size="sm">
              Archived
            </Button>
          </div>
        </div>

        {filteredDesigns.length === 0 ? (
          <Card className="p-10 text-center">
            <IconFlask size={28} className="text-ink-3 mx-auto mb-3" />
            <div className="text-ink mb-1 text-[14px] font-semibold">
              No designs yet
            </div>
            <div className="text-ink-3 mb-5 text-[13px]">
              Describe your research question above, or create one from scratch.
            </div>
            <Button variant="primary" size="sm" onClick={() => startDesign()}>
              <IconPlus size={12} /> New design
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredDesigns.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => wsId && router.push(`/${wsId}/designs/${d.id}`)}
                className={cn(
                  "border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto_auto] items-center gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
                )}
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Chip variant="default" className="h-[18px] text-[10px]">
                      Design
                    </Chip>
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
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div
                      key={n}
                      className={cn(
                        "h-1 w-[18px] rounded-sm",
                        n === 1 ? "bg-ink" : "bg-paper-3"
                      )}
                    />
                  ))}
                </div>
                <div className="text-ink-3 min-w-[90px] text-right font-mono text-[12px]">
                  {relativeTime(d.updated_at || d.created_at)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
