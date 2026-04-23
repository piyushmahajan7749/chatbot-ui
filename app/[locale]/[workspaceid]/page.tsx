"use client"

import {
  IconArrowRight,
  IconBulb,
  IconChartBar,
  IconClipboardText,
  IconFlask,
  IconPlus,
  IconSearch,
  IconSparkles,
  type Icon as TablerIconType
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
      [...designs].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [designs]
  )

  // In-progress heuristic: touched in the last 14 days (in lieu of loading
  // approvedPhases from Firestore for every design). Completed = total − active.
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000
  const inProgressCount = useMemo(
    () =>
      designs.filter(d => {
        const ts = d.updated_at || d.created_at
        return ts && Date.now() - new Date(ts).getTime() < FOURTEEN_DAYS_MS
      }).length,
    [designs]
  )
  const completedCount = designs.length - inProgressCount

  const filter: "all" | "active" | "done" = "all"
  const filteredDesigns = sortedDesigns.slice(0, 8)

  const startDesign = (seed?: string) => {
    if (!wsId) return
    const base = `/${wsId}/designs/new`
    router.push(seed ? `${base}?q=${encodeURIComponent(seed)}` : base)
  }

  type EntryMode =
    | "from-scratch"
    | "from-hypothesis"
    | "from-plan"
    | "check-stats"
    | "make-plan"

  const openMode = (mode: EntryMode) => {
    if (!wsId) return
    // "Existing-design" modes need a design to act on. Route to the dedicated
    // picker when any design exists; else guide the user to create one first.
    const needsExisting = mode === "check-stats" || mode === "make-plan"
    if (needsExisting) {
      const target = designs.length
        ? `/${wsId}/designs/pick?mode=${mode}`
        : `/${wsId}/designs/new`
      router.push(target)
      return
    }
    router.push(`/${wsId}/designs/new?mode=${mode}`)
  }

  const entryTiles: Array<{
    mode: EntryMode
    label: string
    desc: string
    icon: TablerIconType
    badge?: string
  }> = [
    {
      mode: "from-scratch",
      label: "Design from a research question",
      desc: "Scope a problem, surface literature, generate hypotheses — the full 5-stage flow.",
      icon: IconSparkles
    },
    {
      mode: "from-hypothesis",
      label: "Design from a hypothesis",
      desc: "You already have a hypothesis. Skip straight to the experiment design.",
      icon: IconBulb
    },
    {
      mode: "from-plan",
      label: "Structure an existing plan",
      desc: "Paste a draft procedure — Shadow AI fills the SOP sections around it.",
      icon: IconClipboardText
    },
    {
      mode: "check-stats",
      label: "Check a design statistically",
      desc: "Pick an existing design. Shadow AI reviews the stats plan: power, test choice, sample size.",
      icon: IconChartBar,
      badge: designs.length ? undefined : "needs a design"
    },
    {
      mode: "make-plan",
      label: "Make a plan for a design",
      desc: "Pick an existing design. Shadow AI produces a dated execution plan with owners and checkpoints.",
      icon: IconClipboardText,
      badge: designs.length ? undefined : "needs a design"
    }
  ]

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

        {/* Entry-point tiles — four ways to kick off work */}
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow>Start</Eyebrow>
        </div>
        <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {entryTiles.map(tile => {
            const Icon = tile.icon
            return (
              <button
                key={tile.mode}
                type="button"
                onClick={() => openMode(tile.mode)}
                className="border-line bg-surface hover:border-line-strong hover:bg-paper group flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="bg-paper-2 group-hover:bg-rust-soft flex size-9 items-center justify-center rounded-md transition-colors">
                    <Icon
                      size={18}
                      className="text-ink-2 group-hover:text-rust"
                    />
                  </div>
                  {tile.badge && (
                    <span className="text-ink-3 font-mono text-[10px] uppercase tracking-[0.08em]">
                      {tile.badge}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-ink text-[14px] font-semibold leading-snug">
                    {tile.label}
                  </div>
                  <div className="text-ink-3 mt-1 text-[12.5px] leading-relaxed">
                    {tile.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Stats */}
        <div className="mb-7 grid grid-cols-3 gap-3.5">
          <Stat
            label="Total designs"
            value={designs.length}
            sub={
              designs.length === 0
                ? "none yet"
                : `${inProgressCount} in progress · ${completedCount} completed`
            }
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
