"use client"

import {
  IconArrowRight,
  IconBulb,
  IconChartBar,
  IconChevronDown,
  IconClipboardText,
  IconFileText,
  IconFlask,
  IconMessage,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"
import { STAGES, type StageId } from "@/components/design-flow/stepper"
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
  active?: boolean
  onClick?: () => void
}
const Stat: FC<StatProps> = ({ label, value, sub, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "border-line bg-surface hover:border-line-strong rounded-xl border p-[18px] text-left transition-colors",
      active && "border-ink ring-rust-soft ring-2"
    )}
    aria-pressed={active}
  >
    <Eyebrow className="text-[10px]">{label}</Eyebrow>
    <div className="font-display text-ink mt-1.5 text-[30px] tracking-[-0.01em]">
      {value}
    </div>
    <div className="text-ink-3 mt-0.5 text-[11.5px]">{sub}</div>
  </button>
)

type EntryMode =
  | "from-scratch"
  | "from-hypothesis"
  | "from-plan"
  | "check-stats"
  | "make-plan"

type ListKind = "designs" | "reports" | "chats"

export default function WorkspacePage() {
  const router = useRouter()
  const { selectedWorkspace, profile, designs, reports, chats } =
    useContext(ChatbotUIContext)
  const [query, setQuery] = useState("")
  const [activeList, setActiveList] = useState<ListKind>("designs")

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
  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [reports]
  )
  const sortedChats = useMemo(
    () =>
      [...chats].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      ),
    [chats]
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

  const startDesign = (seed?: string) => {
    if (!wsId) return
    const base = `/${wsId}/designs/new`
    router.push(seed ? `${base}?q=${encodeURIComponent(seed)}` : base)
  }

  const openMode = (mode: EntryMode) => {
    if (!wsId) return
    // All five modes funnel through the create-design dialog at /designs/new.
    // The dialog branches on `mode` for mode-specific fields (hypothesis text,
    // existing plan, external design paste/upload).
    router.push(`/${wsId}/designs/new?mode=${mode}`)
  }

  const startChat = () => {
    if (!wsId) return
    router.push(`/${wsId}/chat`)
  }

  const entryModes: Array<{
    mode: EntryMode
    label: string
    desc: string
    icon: TablerIconType
  }> = [
    {
      mode: "from-scratch",
      label: "From a research question",
      desc: "Full 5-stage flow",
      icon: IconSparkles
    },
    {
      mode: "from-hypothesis",
      label: "From a hypothesis",
      desc: "Skip to experiment design",
      icon: IconBulb
    },
    {
      mode: "from-plan",
      label: "Structure an existing plan",
      desc: "Paste your draft procedure",
      icon: IconClipboardText
    },
    {
      mode: "check-stats",
      label: "Check a design statistically",
      desc: "Review power, test choice, sample size",
      icon: IconChartBar
    },
    {
      mode: "make-plan",
      label: "Make a plan for a design",
      desc: "Generate dated execution plan",
      icon: IconClipboardText
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
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={startChat}>
              <IconMessage size={14} stroke={2.4} /> Start chat
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" size="lg">
                  <IconPlus size={14} stroke={2.4} /> New design
                  <IconChevronDown size={14} stroke={2.4} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px] p-1.5">
                {entryModes.map(m => {
                  const Icon = m.icon
                  return (
                    <DropdownMenuItem
                      key={m.mode}
                      onSelect={() => openMode(m.mode)}
                      className="flex cursor-pointer items-start gap-3 rounded-md p-2.5"
                    >
                      <div className="bg-paper-2 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
                        <Icon size={14} className="text-ink-2" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-ink text-[13px] font-semibold leading-snug">
                          {m.label}
                        </div>
                        <div className="text-ink-3 mt-0.5 text-[11.5px] leading-snug">
                          {m.desc}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

        {/* Stats — clicking switches the list shown below */}
        <div className="mb-7 grid grid-cols-3 gap-3.5">
          <Stat
            label="Total designs"
            value={designs.length}
            sub={
              designs.length === 0
                ? "none yet"
                : `${inProgressCount} in progress · ${completedCount} completed`
            }
            active={activeList === "designs"}
            onClick={() => setActiveList("designs")}
          />
          <Stat
            label="Reports"
            value={reports.length}
            sub={reports.length === 0 ? "none yet" : "generated"}
            active={activeList === "reports"}
            onClick={() => setActiveList("reports")}
          />
          <Stat
            label="Chats"
            value={chats.length}
            sub={chats.length === 0 ? "none yet" : "threads"}
            active={activeList === "chats"}
            onClick={() => setActiveList("chats")}
          />
        </div>

        {/* Active list */}
        {activeList === "designs" && (
          <DesignsList
            items={sortedDesigns.slice(0, 8)}
            wsId={wsId}
            onNew={() => startDesign()}
          />
        )}
        {activeList === "reports" && (
          <ReportsList items={sortedReports.slice(0, 8)} wsId={wsId} />
        )}
        {activeList === "chats" && (
          <ChatsList items={sortedChats.slice(0, 8)} wsId={wsId} />
        )}
      </div>
    </div>
  )
}

function ListHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between">
      <DisplayHeading as="h2" className="text-[22px]">
        {title}
      </DisplayHeading>
      <div className="text-ink-3 font-mono text-[12px]">{count} total</div>
    </div>
  )
}

interface DesignsListProps {
  items: Array<{
    id: string
    name: string
    description?: string | null
    updated_at?: string | null
    created_at: string
    current_stage?: StageId | null
    approved_phases?: StageId[] | null
  }>
  wsId?: string
  onNew: () => void
}

function DesignsList({ items, wsId, onNew }: DesignsListProps) {
  const router = useRouter()
  if (items.length === 0) {
    return (
      <>
        <ListHeader title="Your designs" count={0} />
        <Card className="p-10 text-center">
          <IconFlask size={28} className="text-ink-3 mx-auto mb-3" />
          <div className="text-ink mb-1 text-[14px] font-semibold">
            No designs yet
          </div>
          <div className="text-ink-3 mb-5 text-[13px]">
            Describe your research question above, or create one from scratch.
          </div>
          <Button variant="primary" size="sm" onClick={onNew}>
            <IconPlus size={12} /> New design
          </Button>
        </Card>
      </>
    )
  }
  return (
    <>
      <ListHeader title="Your designs" count={items.length} />
      <div className="flex flex-col gap-2.5">
        {items.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => wsId && router.push(`/${wsId}/designs/${d.id}`)}
            className="border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto_auto] items-center gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
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
            <PhaseBar
              currentStage={d.current_stage ?? null}
              approvedPhases={d.approved_phases ?? null}
            />
            <div className="text-ink-3 min-w-[90px] text-right font-mono text-[12px]">
              {relativeTime(d.updated_at || d.created_at)}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * Five-segment stage bar. Each segment carries a `title` tooltip naming its
 * phase + status. When `currentStage` / `approvedPhases` are unknown we
 * still render labels so hover explains the bar — phase 1 is shown as the
 * placeholder active step.
 */
function PhaseBar({
  currentStage,
  approvedPhases
}: {
  currentStage: StageId | null
  approvedPhases: StageId[] | null
}) {
  const curIdx = currentStage ? STAGES.findIndex(s => s.id === currentStage) : 0
  const knownStatus = !!(currentStage || approvedPhases)
  return (
    <div className="flex gap-1">
      {STAGES.map((stage, i) => {
        const isDone = approvedPhases?.includes(stage.id) || i < curIdx
        const isActive = i === curIdx && knownStatus
        const status = isDone ? "done" : isActive ? "active" : "pending"
        const title = `Phase ${i + 1} of 5 · ${stage.label}${
          knownStatus ? ` (${status})` : " — status not loaded"
        }`
        return (
          <div
            key={stage.id}
            title={title}
            aria-label={title}
            className={cn(
              "h-1 w-[18px] rounded-sm transition-colors",
              isDone && "bg-ink",
              isActive && "bg-rust",
              !isDone && !isActive && "bg-paper-3"
            )}
          />
        )
      })}
    </div>
  )
}

interface ReportsListProps {
  items: Array<{
    id: string
    name?: string | null
    description?: string | null
    updated_at?: string | null
    created_at: string
  }>
  wsId?: string
}

function ReportsList({ items, wsId }: ReportsListProps) {
  const router = useRouter()
  if (items.length === 0) {
    return (
      <>
        <ListHeader title="Your reports" count={0} />
        <Card className="p-10 text-center">
          <IconFileText size={28} className="text-ink-3 mx-auto mb-3" />
          <div className="text-ink mb-1 text-[14px] font-semibold">
            No reports yet
          </div>
          <div className="text-ink-3 text-[13px]">
            Reports appear here once you generate one from a design.
          </div>
        </Card>
      </>
    )
  }
  return (
    <>
      <ListHeader title="Your reports" count={items.length} />
      <div className="flex flex-col gap-2.5">
        {items.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => wsId && router.push(`/${wsId}/reports/${r.id}`)}
            className="border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto] items-center gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
          >
            <div className="min-w-0">
              <Chip variant="default" className="mb-1 h-[18px] text-[10px]">
                Report
              </Chip>
              <div className="text-ink truncate text-[15px] font-semibold">
                {r.name || "Untitled report"}
              </div>
              {r.description && (
                <div className="text-ink-3 mt-1 line-clamp-1 text-[12.5px]">
                  {r.description}
                </div>
              )}
            </div>
            <div className="text-ink-3 min-w-[90px] text-right font-mono text-[12px]">
              {relativeTime(r.updated_at || r.created_at)}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

interface ChatsListProps {
  items: Array<{
    id: string
    name?: string | null
    updated_at?: string | null
    created_at: string
  }>
  wsId?: string
}

function ChatsList({ items, wsId }: ChatsListProps) {
  const router = useRouter()
  if (items.length === 0) {
    return (
      <>
        <ListHeader title="Your chats" count={0} />
        <Card className="p-10 text-center">
          <IconMessage size={28} className="text-ink-3 mx-auto mb-3" />
          <div className="text-ink mb-1 text-[14px] font-semibold">
            No chats yet
          </div>
          <div className="text-ink-3 text-[13px]">
            Start a chat to see threads here.
          </div>
        </Card>
      </>
    )
  }
  return (
    <>
      <ListHeader title="Your chats" count={items.length} />
      <div className="flex flex-col gap-2.5">
        {items.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => wsId && router.push(`/${wsId}/chat/${c.id}`)}
            className="border-line bg-surface hover:border-line-strong hover:bg-paper grid grid-cols-[1fr_auto] items-center gap-5 rounded-lg border px-5 py-4 text-left transition-colors"
          >
            <div className="min-w-0">
              <Chip variant="default" className="mb-1 h-[18px] text-[10px]">
                Chat
              </Chip>
              <div className="text-ink truncate text-[15px] font-semibold">
                {c.name || "Untitled chat"}
              </div>
            </div>
            <div className="text-ink-3 min-w-[90px] text-right font-mono text-[12px]">
              {relativeTime(c.updated_at || c.created_at)}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
