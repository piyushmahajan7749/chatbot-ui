"use client"

import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Kbd } from "@/components/ui/kbd"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { AccentTabs, type TabStatus } from "@/components/canvas/accent-tabs"
import {
  Stepper,
  type StageId as DesignStageId
} from "@/components/design-flow/stepper"
// Side chat rail (right split-screen) scoped to this design. Re-introduced
// for the experiment-design pivot: chat lives next to the design so the user
// can ask for edits while looking at it.
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import ShareDialog from "@/components/design-flow/share-dialog"
import type { Sharing } from "@/types/sharing"
import { addPaperToLibrary } from "@/db/paper-library"
import { supabase } from "@/lib/supabase/browser-client"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  DESIGN_DOMAIN_OPTIONS,
  DESIGN_PHASE_OPTIONS,
  PHASE_ORDER,
  type DesignContentV2,
  type DesignDomain,
  type DesignPhase,
  type DesignSection,
  type DesignVersionSnapshot,
  type GeneratedDesign,
  type Hypothesis,
  type Paper,
  type PhaseKey,
  type ProblemContext
} from "@/lib/design-agent"
import { buildDesignChatContext } from "@/lib/design/chat-context"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBookmark,
  IconBookmarkFilled,
  IconBulb,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconClipboardText,
  IconFlask,
  IconInfoCircle,
  IconLayoutGrid,
  IconMessageCircle,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShare,
  IconSparkles,
  IconTargetArrow,
  IconUpload,
  IconVariable,
  IconX
} from "@tabler/icons-react"

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function runAgentPhase(
  designId: string,
  body: Record<string, unknown>
): Promise<DesignContentV2> {
  const res = await fetch(`/api/design/${designId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => "")
    throw new Error(msg || `Generation failed (${res.status})`)
  }
  const json = await res.json()
  return json.content as DesignContentV2
}

export type PhaseProgress = {
  step: string
  message: string
  [k: string]: unknown
}

export type LiteratureProgress = PhaseProgress & {
  primaryQuery?: string
  totalPapers?: number
  sourceCounts?: Record<string, number>
  papersCount?: number
  // Per-round + filter step fields (#paper-finder). All optional so
  // the union still parses when an older event arrives without them.
  round?: number
  totalRounds?: number
  uniqueSoFar?: number
  dropped?: number
  remaining?: number
  // Richer commentary fields. `detail` is a short freeform string the
  // UI renders below the message line. `query` + `elapsedMs` are
  // emitted by the per-round event so we can show "q: '…' · 23.4s".
  // `intent` is the LLM-assigned angle for this round (mechanism /
  // methods / applications / etc.) — used in the round detail line.
  detail?: string
  query?: string
  elapsedMs?: number
  intent?: string
  // Dedup + post-rank funnel counts. `totalCandidates` carries the
  // "from N searched" count rendered in the surfaced-papers header.
  rawCount?: number
  uniqueCount?: number
  totalCandidates?: number
}

async function runPhaseStreaming(
  designId: string,
  body: Record<string, unknown>,
  onProgress: (ev: PhaseProgress) => void
): Promise<DesignContentV2> {
  const res = await fetch(`/api/design/${designId}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(body)
  })
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "")
    throw new Error(msg || `Generation failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalContent: DesignContentV2 | null = null
  let streamError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)

      let eventName = "message"
      let dataLine = ""
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim()
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim()
      }
      if (!dataLine) continue

      try {
        const parsed = JSON.parse(dataLine)
        if (eventName === "progress") {
          onProgress(parsed as PhaseProgress)
        } else if (eventName === "result") {
          finalContent = parsed.content as DesignContentV2
        } else if (eventName === "error") {
          streamError = parsed.message || "Stream error"
        }
      } catch {
        // ignore malformed event
      }
    }
  }

  if (streamError) throw new Error(streamError)
  if (!finalContent) throw new Error("Stream ended without a result")
  return finalContent
}

// Background (Inngest) design generation. The design phase runs 4 long gpt-5.5
// sections per hypothesis — too slow for a 300s serverless function — so the
// route enqueues an Inngest job (processDesignGeneration) and returns 202. Here
// we poll the design doc's `designJob` for progress + completion. Mirrors
// runPhaseStreaming's signature so the phase handlers swap in with one word.
async function pollDesignJob(
  designId: string,
  onProgress: (ev: PhaseProgress) => void,
  startIndex = 0
): Promise<DesignContentV2> {
  const POLL_MS = 4000
  const MAX_MS = 20 * 60 * 1000
  const startedAt = Date.now()
  let seen = startIndex
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise(r => setTimeout(r, POLL_MS))
    if (Date.now() - startedAt > MAX_MS) {
      throw new Error("Design generation timed out. Please try again.")
    }
    let doc: any
    try {
      const res = await fetch(`/api/design/${designId}`)
      if (!res.ok) continue // transient — keep polling
      doc = await res.json()
    } catch {
      continue
    }
    const job = doc?.designJob
    const progress: PhaseProgress[] = Array.isArray(job?.progress)
      ? job.progress
      : []
    for (let i = seen; i < progress.length; i++) onProgress(progress[i])
    seen = progress.length

    if (job?.state === "failed") {
      throw new Error(job?.error || "Design generation failed.")
    }
    if (job?.state === "complete") {
      const content = parseContent(doc.content)
      if (!content) throw new Error("Design completed but returned no content.")
      return content
    }
  }
}

async function runPhaseBackground(
  designId: string,
  body: Record<string, unknown>,
  onProgress: (ev: PhaseProgress) => void
): Promise<DesignContentV2> {
  const startRes = await fetch(`/api/design/${designId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!startRes.ok) {
    const msg = await startRes.text().catch(() => "")
    throw new Error(
      msg || `Failed to start design generation (${startRes.status})`
    )
  }
  return pollDesignJob(designId, onProgress)
}

function parseContent(raw: unknown): DesignContentV2 | null {
  if (!raw) return null
  try {
    if (typeof raw === "string") return JSON.parse(raw)
    if (typeof raw === "object") return raw as DesignContentV2
  } catch {
    return null
  }
  return null
}

// buildDesignChatContext + TIER3_MAX_CHARS now live in
// @/lib/design/chat-context (imported above) so the design-chat context
// builder — the seam that guarantees the chat actually has the experiment's
// content — is unit-tested. Do not re-inline it here.

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function DesignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  // "auto" tells us the picker routed the user in with an intent to fire a
  // specific action once the design finishes loading. We run it exactly once
  // per mount and strip the param so it doesn't re-fire on back/forward.
  const autoAction = searchParams.get("auto")
  const autoFiredRef = useRef(false)
  const { toast } = useToast()
  const { profile, setUserInput, selectedWorkspace, chatSettings, setDesigns } =
    useContext(ChatbotUIContext)
  void profile

  const designId = params.designId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [design, setDesign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Collaboration access. Derived from the GET design `_access` field. Defaults
  // are permissive (canEdit=true, isOwner=true) so the owner's own designs never
  // flicker into a read-only state before the fetch resolves; the fetch then
  // narrows them for invited viewers/editors.
  const [canEdit, setCanEdit] = useState(true)
  const [isOwner, setIsOwner] = useState(true)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [sharingState, setSharingState] = useState<{
    sharing: Sharing
    share_token: string | null
  }>({ sharing: "private", share_token: null })
  // Default landing tab is "problem" - newly-created designs should drop the
  // user straight into editing instead of showing the Overview placeholder.
  // Initial tab honours `?tab=` from the new-design dialog so non-
  // from-scratch modes land where they need to (hypotheses after
  // from-hypothesis, literature after from-plan, design after
  // check-stats / make-plan). Falls back to "problem". The resume
  // effect downstream still moves the user to the first non-approved
  // phase once the loader catches up.
  const initialTab = (() => {
    const t = searchParams?.get("tab") ?? ""
    return ["problem", "literature", "hypotheses", "design"].includes(t)
      ? t
      : "problem"
  })()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [busy, setBusy] = useState<
    | null
    | "literature"
    | "hypotheses"
    | "design"
    | "save"
    | "stats-review"
    | "make-plan"
  >(null)

  // Streaming agent runs (literature search / hypothesis generation / design
  // generation) take 1–3 minutes and lose all progress if the tab closes
  // mid-flight. While one of those phases is busy we attach a native
  // `beforeunload` warning so the browser prompts before close/refresh/back.
  // The in-page banner (rendered further down) handles the visual nudge.
  const isAgentRunning =
    busy === "literature" || busy === "hypotheses" || busy === "design"
  useEffect(() => {
    if (!isAgentRunning) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy browsers need a non-empty `returnValue` to trigger the prompt;
      // modern ones ignore the string and use a built-in message.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isAgentRunning])

  // Phase gating
  const [approvedPhases, setApprovedPhases] = useState<PhaseKey[]>([])

  // Problem tab state
  const [title, setTitle] = useState("")
  const [problemStatement, setProblemStatement] = useState("")
  const [domain, setDomain] = useState<DesignDomain | "">("")
  const [phase, setPhase] = useState<DesignPhase | "">("")
  const [objective, setObjective] = useState("")
  const [constraintMaterial, setConstraintMaterial] = useState("")
  const [constraintTime, setConstraintTime] = useState("")
  const [constraintEquipment, setConstraintEquipment] = useState("")
  const [variablesKnown, setVariablesKnown] = useState("")
  const [variablesUnknown, setVariablesUnknown] = useState("")
  // Issue #9 - non-mandatory free-text field. Captures the scientist's
  // definition of "what would count as a successful experiment" so the
  // hypothesis and design agents can target it directly.
  const [successCriteria, setSuccessCriteria] = useState("")
  // Issue #28 - explicit replicates toggle. "" = unset, "yes"/"no" otherwise.
  // Defaults to "" so the field renders empty (same UX as Domain/Phase),
  // and the Yes/No selection flows through to the design agent context.
  const [includeReplicates, setIncludeReplicates] = useState<"" | "yes" | "no">(
    ""
  )

  // Literature tab state
  const [papers, setPapers] = useState<Paper[]>([])
  const [literatureProgress, setLiteratureProgress] = useState<
    LiteratureProgress[]
  >([])
  // Total candidates the pipeline sifted through (post-dedup +
  // post-review-filter, pre top-N cut). Drives the "from N searched"
  // label under the surfaced-papers header. Sourced from the most
  // recent `papers_found` progress event that carried the count.
  //
  // Also persisted into content.literatureStats so the count survives
  // navigation away from the design — the in-memory `literatureProgress`
  // stream resets on remount, but the persisted value stays put.
  const [persistedLitTotalCandidates, setPersistedLitTotalCandidates] =
    useState<number | undefined>(undefined)
  const literatureTotalCandidates = useMemo(() => {
    for (let i = literatureProgress.length - 1; i >= 0; i--) {
      const ev = literatureProgress[i]
      if (
        ev.step === "papers_found" &&
        typeof ev.totalCandidates === "number"
      ) {
        return ev.totalCandidates
      }
    }
    return persistedLitTotalCandidates
  }, [literatureProgress, persistedLitTotalCandidates])

  // Hypotheses tab state
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [hypothesesProgress, setHypothesesProgress] = useState<PhaseProgress[]>(
    []
  )
  // Last hypothesis-generation error, so the Hypotheses tab can show an
  // accurate "generation failed — retry" state instead of the misleading
  // "approve literature" prompt after a transient backend failure.
  const [hypothesesError, setHypothesesError] = useState<string | null>(null)

  // Designs state
  const [generatedDesigns, setGeneratedDesigns] = useState<GeneratedDesign[]>(
    []
  )
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null)
  const [designProgress, setDesignProgress] = useState<PhaseProgress[]>([])
  const [designVersions, setDesignVersions] = useState<DesignVersionSnapshot[]>(
    []
  )

  // Rail toggle
  const [showRail, setShowRail] = useState(false)
  // Width of the design chat rail (px). User-resizable via the drag handle on
  // its left edge so they can give the chat more room.
  const [railWidth, setRailWidth] = useState(440)

  // Agent popover
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState("")

  // Autosave debounce for Problem tab
  const problemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-fresh snapshot of the server-side design content. `design` state is
  // only populated on fetchDesign and does NOT reflect updates from streamed
  // phase runs or prior persistContent calls. Using the stale state as the
  // merge base caused PATCH writes to overwrite fields the server had just
  // saved (e.g. paper selections disappearing after reload, literatureContext
  // being wiped by a problem-autosave). This ref is kept current on every
  // fetch, every runPhaseStreaming result, and every persistContent write so
  // that persistContent always merges with the true latest content.
  const latestContentRef = useRef<DesignContentV2>({ schemaVersion: 2 })

  // ── Phase helpers ─────────────────────────────────────────────────────

  const isPhaseApproved = (phase: PhaseKey) => approvedPhases.includes(phase)

  const getPhaseState = (phase: PhaseKey): TabStatus => {
    if (isPhaseApproved(phase)) return "approved"
    const idx = PHASE_ORDER.indexOf(phase)
    if (idx === 0) return problemValid ? "review" : "active"
    const allPrevApproved = PHASE_ORDER.slice(0, idx).every(p =>
      approvedPhases.includes(p)
    )
    if (!allPrevApproved) return "locked"
    switch (phase) {
      case "literature":
        return papers.length > 0 ? "review" : "active"
      case "hypotheses":
        return hypotheses.length > 0 ? "review" : "active"
      case "design":
        return generatedDesigns.length > 0 ? "review" : "active"
      default:
        return "active"
    }
  }

  const clearDownstreamState = (fromPhase: PhaseKey) => {
    const idx = PHASE_ORDER.indexOf(fromPhase)
    const downstream = PHASE_ORDER.slice(idx + 1)
    for (const phase of downstream) {
      if (phase === "literature") setPapers([])
      if (phase === "hypotheses") setHypotheses([])
      if (phase === "design") {
        setGeneratedDesigns([])
        setActiveDesignId(null)
      }
    }
    const keep = approvedPhases.filter(p => PHASE_ORDER.indexOf(p) < idx)
    setApprovedPhases(keep)
    return keep
  }

  // ── Data fetch ────────────────────────────────────────────────────────

  useEffect(() => {
    if (designId) void fetchDesign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId])

  const fetchDesign = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/design/${designId}`)
      if (!response.ok) {
        toast({
          title: "Not found",
          description: "Design not found.",
          variant: "destructive"
        })
        router.push(`/${locale}/${workspaceId}`)
        return
      }
      const data = await response.json()
      setDesign(data)

      // Collaboration access for this viewer. The server returns `_access`
      // {isOwner, role, canEdit} for any user allowed to read the design; an
      // invited viewer gets canEdit=false (read-only), an editor canEdit=true.
      const access = (data as any)?._access ?? {}
      setCanEdit(access.canEdit ?? true)
      setIsOwner(access.isOwner ?? true)
      setSharingState({
        sharing: (data as any)?.sharing ?? "private",
        share_token: (data as any)?.share_token ?? null
      })

      const content = parseContent(data.content)
      latestContentRef.current = content ?? { schemaVersion: 2 }
      const problem = content?.problem ?? {}
      const loadedTitle = problem.title ?? data.name ?? ""
      setTitle(loadedTitle)
      // Always preserve the user-supplied problem statement. The previous
      // heuristic wiped it when it equalled the title (a workaround for
      // legacy seeding that mirrored title→description); now create-design
      // sends both fields explicitly so we trust what we get.
      setProblemStatement(problem.problemStatement ?? data.description ?? "")
      setDomain((problem.domain as DesignDomain | undefined) ?? "")
      setPhase((problem.phase as DesignPhase | undefined) ?? "")
      setObjective(problem.objective ?? problem.goal ?? "")
      setConstraintMaterial(problem.constraintsStructured?.material ?? "")
      setConstraintTime(problem.constraintsStructured?.time ?? "")
      setConstraintEquipment(problem.constraintsStructured?.equipment ?? "")
      // Migrate legacy array fields into the Known-variables textarea so older
      // designs don't lose content on first load.
      setVariablesKnown(
        problem.variablesStructured?.known ??
          (problem.variables?.length
            ? problem.variables.filter(Boolean).join("\n")
            : "")
      )
      setVariablesUnknown(problem.variablesStructured?.unknown ?? "")
      // New fields (issues #9 + #28). Optional; default to empty so legacy
      // designs that don't have them stored render with blank inputs.
      setSuccessCriteria(
        ((problem as any).successCriteria as string | undefined) ?? ""
      )
      const repRaw =
        ((problem as any).includeReplicates as string | undefined) ?? ""
      setIncludeReplicates(repRaw === "yes" || repRaw === "no" ? repRaw : "")

      if (content?.papers) setPapers(content.papers)
      // Restore the "from N searched" total from prior runs so the
      // Literature header still reads correctly after coming back to the
      // page (the progress-event stream resets on remount).
      setPersistedLitTotalCandidates(content?.literatureStats?.totalCandidates)
      if (content?.hypotheses) setHypotheses(content.hypotheses)
      if (content?.designs) {
        setGeneratedDesigns(content.designs)
        setActiveDesignId(content.designs[0]?.id ?? null)
      }
      if (content?.designVersions) setDesignVersions(content.designVersions)
      if (content?.approvedPhases) setApprovedPhases(content.approvedPhases)

      // Resume polling if a background design job is still running (e.g. the
      // user refreshed mid-generation). The Inngest job keeps going server-side
      // regardless — we just reattach the progress UI and apply the result.
      const job = (data as any)?.designJob
      if (job && (job.state === "queued" || job.state === "running")) {
        const prior: PhaseProgress[] = Array.isArray(job.progress)
          ? job.progress
          : []
        setBusy("design")
        setActiveTab("design")
        setDesignProgress(prior)
        pollDesignJob(
          designId,
          ev => setDesignProgress(prev => [...prev, ev]),
          prior.length
        )
          .then(jobContent => {
            latestContentRef.current = jobContent
            // Apply whatever the resumed phase produced (literature → papers,
            // hypotheses → hypotheses, design → designs).
            if (jobContent.papers) setPapers(jobContent.papers)
            if (jobContent.hypotheses) setHypotheses(jobContent.hypotheses)
            const designs = jobContent.designs ?? []
            setGeneratedDesigns(designs)
            if (designs.length) setActiveDesignId(designs[0]?.id ?? null)
          })
          .catch((err: any) => {
            toast({
              title: "Design generation failed",
              description: err?.message ?? "Try again in a moment.",
              variant: "destructive"
            })
          })
          .finally(() => setBusy(null))
      }
    } catch (error) {
      console.error("Error fetching design:", error)
      toast({
        title: "Error",
        description: "Failed to load design.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  const persistContent = async (
    patch: Partial<DesignContentV2>,
    extra?: { name?: string }
  ) => {
    // Merge against the freshest content we know about (updated on every
    // fetch and every phase run) - NOT the React `design` state, which can
    // be stale after an SSE phase run or a prior PATCH.
    const merged: DesignContentV2 = {
      ...latestContentRef.current,
      ...patch,
      schemaVersion: 2
    }
    latestContentRef.current = merged
    const serialized = JSON.stringify(merged)
    // Keep the shared context in sync so the Designs list + dashboard reflect
    // the new status (e.g. "Completed" after the design phase is approved)
    // immediately, instead of only after a full page refresh. getDesignProgress
    // reads `content`, so updating it here flips the slab's status chip live.
    setDesigns(prev =>
      prev.map(d =>
        d.id === designId
          ? ({
              ...d,
              ...(extra?.name !== undefined ? { name: extra.name } : {}),
              content: serialized,
              updated_at: new Date().toISOString()
            } as typeof d)
          : d
      )
    )
    await fetch(`/api/design/${designId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(extra?.name !== undefined ? { name: extra.name } : {}),
        content: serialized
      })
    })
  }

  const currentProblem = (): ProblemContext =>
    ({
      title,
      problemStatement,
      domain: domain || undefined,
      phase: phase || undefined,
      objective,
      goal: objective, // mirror into legacy field so old consumers still read a value
      constraintsStructured: {
        material: constraintMaterial,
        time: constraintTime,
        equipment: constraintEquipment
      },
      variablesStructured: {
        known: variablesKnown,
        unknown: variablesUnknown
      },
      // Issue #9 / #28 - both are optional so we only emit when set.
      ...(successCriteria.trim()
        ? { successCriteria: successCriteria.trim() }
        : {}),
      ...(includeReplicates ? { includeReplicates } : {})
    }) as ProblemContext

  useEffect(() => {
    // Read-only viewers must never trigger a (doomed) autosave PATCH.
    if (loading || !design || !canEdit) return
    if (problemSaveTimer.current) clearTimeout(problemSaveTimer.current)
    problemSaveTimer.current = setTimeout(() => {
      persistContent({ problem: currentProblem() }, { name: title }).catch(
        err => console.warn("Problem autosave failed:", err)
      )
    }, 800)
    return () => {
      if (problemSaveTimer.current) clearTimeout(problemSaveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    problemStatement,
    domain,
    phase,
    objective,
    constraintMaterial,
    constraintTime,
    constraintEquipment,
    variablesKnown,
    variablesUnknown,
    successCriteria,
    includeReplicates
  ])

  const problemValid =
    problemStatement.trim() !== "" &&
    objective.trim() !== "" &&
    domain !== "" &&
    phase !== ""

  // Gate every mutation behind edit access. A read-only (viewer) collaborator
  // is blocked here with a clear toast — the server also rejects the write, so
  // this is the UX layer over the real (backend) guard.
  const ensureCanEdit = () => {
    if (!canEdit) {
      toast({
        title: "Read-only access",
        description:
          "You have view-only access to this design. Ask the owner for editor access to make changes.",
        variant: "destructive"
      })
      return false
    }
    return true
  }

  // ── Approve & Generate handlers ───────────────────────────────────────

  const handleApproveAndGenerateLiterature = async () => {
    if (!ensureCanEdit()) return
    if (!problemValid) {
      toast({
        title: "Missing fields",
        description: "Problem statement and goal are required.",
        variant: "destructive"
      })
      return
    }
    const nextApproved: PhaseKey[] = ["problem"]
    setApprovedPhases(nextApproved)
    setActiveTab("literature")
    setBusy("literature")
    setLiteratureProgress([])
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "literature",
          problem: currentProblem(),
          approvedPhases: nextApproved
        },
        ev => setLiteratureProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      if (content.papers) setPapers(content.papers)
      // Persist the "from N searched" total alongside the papers so the
      // Literature header still shows it when the user navigates away and
      // comes back. We pluck it from the just-streamed progress events; if
      // nothing reported (legacy run, pre-warm only, etc.), the field stays
      // undefined and the header gracefully drops the total.
      let totalFromRun: number | undefined
      for (let i = literatureProgress.length - 1; i >= 0; i--) {
        const ev = literatureProgress[i]
        if (
          ev.step === "papers_found" &&
          typeof ev.totalCandidates === "number"
        ) {
          totalFromRun = ev.totalCandidates
          break
        }
      }
      if (typeof totalFromRun === "number") {
        setPersistedLitTotalCandidates(totalFromRun)
        void persistContent({
          literatureStats: { totalCandidates: totalFromRun }
        })
      }
    } catch (error: any) {
      toast({
        title: "Literature search failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleApproveAndGenerateHypotheses = async () => {
    if (!ensureCanEdit()) return
    if (selectedPapers.length === 0) {
      toast({
        title: "No papers selected",
        description: "Select at least one paper to generate hypotheses.",
        variant: "destructive"
      })
      return
    }
    const nextApproved: PhaseKey[] = ["problem", "literature"]
    setApprovedPhases(nextApproved)
    setActiveTab("hypotheses")
    setBusy("hypotheses")
    setHypothesesProgress([])
    setHypothesesError(null)
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "hypotheses",
          problem: currentProblem(),
          papers,
          approvedPhases: nextApproved
        },
        ev => setHypothesesProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      if (content.papers) setPapers(content.papers)
      if (content.hypotheses) setHypotheses(content.hypotheses)
    } catch (error: any) {
      const msg = error?.message ?? "Try again in a moment."
      setHypothesesError(msg)
      toast({
        title: "Hypothesis generation failed",
        description: msg,
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleApproveAndGenerateDesign = async () => {
    if (!ensureCanEdit()) return
    if (selectedHypotheses.length === 0) {
      toast({
        title: "No hypotheses selected",
        description: "Select at least one hypothesis to generate a design.",
        variant: "destructive"
      })
      return
    }
    const nextApproved: PhaseKey[] = ["problem", "literature", "hypotheses"]
    setApprovedPhases(nextApproved)
    setActiveTab("design")
    setBusy("design")
    setDesignProgress([])
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "design",
          problem: currentProblem(),
          hypotheses,
          approvedPhases: nextApproved
        },
        ev => setDesignProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      const designs = content.designs ?? []
      setGeneratedDesigns(designs)
      setActiveDesignId(designs[0]?.id ?? null)
    } catch (error: any) {
      toast({
        title: "Design generation failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleApproveDesignAndContinue = async () => {
    if (!ensureCanEdit()) return
    const nextApproved: PhaseKey[] = [
      "problem",
      "literature",
      "hypotheses",
      "design"
    ]
    setApprovedPhases(nextApproved)
    await persistContent({ approvedPhases: nextApproved })
    setActiveTab("overview")
    toast({ title: "Design finalized", description: "All phases approved." })
  }

  // ── Regenerate handlers ───────────────────────────────────────────────

  const handleGenerateMoreLiterature = async () => {
    if (!ensureCanEdit()) return
    setBusy("literature")
    setLiteratureProgress([])
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "literature",
          mode: "append",
          problem: currentProblem(),
          approvedPhases
        },
        ev => setLiteratureProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      if (content.papers) setPapers(content.papers)
      // Persist the "from N searched" total alongside the papers so the
      // Literature header still shows it when the user navigates away and
      // comes back. We pluck it from the just-streamed progress events; if
      // nothing reported (legacy run, pre-warm only, etc.), the field stays
      // undefined and the header gracefully drops the total.
      let totalFromRun: number | undefined
      for (let i = literatureProgress.length - 1; i >= 0; i--) {
        const ev = literatureProgress[i]
        if (
          ev.step === "papers_found" &&
          typeof ev.totalCandidates === "number"
        ) {
          totalFromRun = ev.totalCandidates
          break
        }
      }
      if (typeof totalFromRun === "number") {
        setPersistedLitTotalCandidates(totalFromRun)
        void persistContent({
          literatureStats: { totalCandidates: totalFromRun }
        })
      }
    } catch (error: any) {
      toast({
        title: "Literature search failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRegenerateHypotheses = async () => {
    if (!ensureCanEdit()) return
    const keep = clearDownstreamState("hypotheses")
    // Re-approve literature so a retry after a transient failure doesn't get
    // gated: clearDownstreamState keeps problem + literature, but be explicit.
    const keepWithLiterature = keep.includes("literature")
      ? keep
      : ([...keep, "literature"] as PhaseKey[])
    setApprovedPhases(keepWithLiterature)
    setBusy("hypotheses")
    setHypothesesProgress([])
    setHypothesesError(null)
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "hypotheses",
          problem: currentProblem(),
          papers,
          approvedPhases: keepWithLiterature
        },
        ev => setHypothesesProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      if (content.papers) setPapers(content.papers)
      if (content.hypotheses) setHypotheses(content.hypotheses)
    } catch (error: any) {
      const msg = error?.message ?? "Try again in a moment."
      setHypothesesError(msg)
      toast({
        title: "Hypothesis generation failed",
        description: msg,
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRegenerateDesign = async () => {
    if (!ensureCanEdit()) return
    // Snapshot the current design set into history before regenerating so
    // the user can restore it later via the version switcher.
    let snapshotVersions = designVersions
    if (generatedDesigns.length > 0) {
      const nextVersionNumber = (designVersions[0]?.versionNumber ?? 0) + 1 || 1
      const snapshot: DesignVersionSnapshot = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `v-${Date.now()}`,
        versionNumber: nextVersionNumber,
        designs: generatedDesigns,
        createdAt: new Date().toISOString()
      }
      snapshotVersions = [snapshot, ...designVersions]
      setDesignVersions(snapshotVersions)
      await persistContent({ designVersions: snapshotVersions })
    }

    const keep = clearDownstreamState("design")
    setBusy("design")
    setDesignProgress([])
    try {
      const content = await runPhaseBackground(
        designId,
        {
          phase: "design",
          problem: currentProblem(),
          hypotheses,
          approvedPhases: keep
        },
        ev => setDesignProgress(prev => [...prev, ev])
      )
      latestContentRef.current = {
        ...content,
        designVersions: snapshotVersions
      }
      const designs = content.designs ?? []
      setGeneratedDesigns(designs)
      setActiveDesignId(designs[0]?.id ?? null)
      // Persist designVersions alongside the regenerated designs so they
      // survive a reload.
      await persistContent({ designVersions: snapshotVersions })
    } catch (error: any) {
      toast({
        title: "Design generation failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRestoreDesignVersion = async (versionId: string) => {
    if (!ensureCanEdit()) return
    const version = designVersions.find(v => v.id === versionId)
    if (!version) return

    // Snapshot current designs as a new version, then restore the selected one
    // as the current designs. Drop the restored version from history to avoid
    // duplicates, keeping it as "current".
    let nextVersions = designVersions
    if (generatedDesigns.length > 0) {
      const nextNumber = (designVersions[0]?.versionNumber ?? 0) + 1 || 1
      const snapshot: DesignVersionSnapshot = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `v-${Date.now()}`,
        versionNumber: nextNumber,
        designs: generatedDesigns,
        createdAt: new Date().toISOString()
      }
      nextVersions = [snapshot, ...designVersions]
    }
    nextVersions = nextVersions.filter(v => v.id !== versionId)

    setGeneratedDesigns(version.designs)
    setActiveDesignId(version.designs[0]?.id ?? null)
    setDesignVersions(nextVersions)
    await persistContent({
      designs: version.designs,
      designVersions: nextVersions
    })
    toast({
      title: `Restored v${version.versionNumber}`,
      description:
        "Previous design restored. Prior current set saved to history."
    })
  }

  // ── Revise handler ────────────────────────────────────────────────────

  const handleRevisePhase = async (phase: PhaseKey) => {
    if (!ensureCanEdit()) return
    // A completed (Design-approved) design is locked: its scientific content
    // can't be edited in place. To change a hypothesis or an input, the user
    // duplicates it from the Designs list (the Duplicate icon reopens the copy
    // for editing while preserving the agent outputs).
    if (approvedPhases.includes("design")) {
      toast({
        title: "This design is locked",
        description:
          "Completed designs can't be edited. Duplicate it from the Designs list to branch a variant you can change.",
        variant: "destructive"
      })
      return
    }
    const keep = clearDownstreamState(phase)
    const revised = keep.filter(p => p !== phase)
    setApprovedPhases(revised)
    await persistContent({ approvedPhases: revised })
    setActiveTab(phase)
  }

  // ── Per-item toggle helpers ───────────────────────────────────────────

  const handleTogglePaper = (id: string) => {
    if (!ensureCanEdit()) return
    setPapers(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, selected: !p.selected } : p
      )
      void persistContent({ papers: next })
      return next
    })
  }

  // Tracks which papers the user has saved into the design's library this
  // session, so the card's save icon can flip to a "Saved" state.
  const [savedPaperIds, setSavedPaperIds] = useState<Set<string>>(
    () => new Set<string>()
  )

  /**
   * Save a paper into the workspace paper library, tagged with this design so
   * it surfaces under the design name in the Library section. Optimistic +
   * fire-and-forget: the icon flips immediately and failures roll back with a
   * soft toast. (The card's own "Link ↗" is how the user opens the source —
   * saving no longer hijacks a new browser tab.)
   */
  const handleSavePaper = (paper: Paper) => {
    if (!workspaceId) return
    setSavedPaperIds(prev => {
      const next = new Set(prev)
      next.add(paper.id)
      return next
    })
    void addPaperToLibrary({
      workspaceId,
      paper: {
        title: paper.title,
        url: paper.sourceUrl || "",
        summary: paper.summary || "",
        authors: paper.authors ?? [],
        year: paper.year || "",
        journal: paper.journal || "",
        source: paper.source || undefined
      },
      sourceDesignId: designId
    })
      .then((res: any) => {
        if (res?.deduplicated) {
          console.log("[paper-library] paper already saved:", paper.title)
        } else {
          toast({
            title: "Saved to library",
            description: `"${paper.title.slice(0, 60)}" added to this design's library.`
          })
        }
      })
      .catch(err => {
        console.warn("[paper-library] save failed:", err)
        // Roll back the optimistic flag so the user can retry.
        setSavedPaperIds(prev => {
          const next = new Set(prev)
          next.delete(paper.id)
          return next
        })
        toast({
          title: "Couldn't save to library",
          description: err?.message ?? "Workspace save failed — try again.",
          variant: "destructive"
        })
      })
  }

  const handleUploadPdfs = (files: FileList | null) => {
    if (!ensureCanEdit()) return
    if (!files || files.length === 0) return
    const added: Paper[] = Array.from(files)
      .filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"))
      .map((f, i) => ({
        id: `u-${Date.now()}-${i}`,
        title: f.name.replace(/\.pdf$/i, ""),
        summary:
          "Summary pending - the agentic system will analyze this upload and return a structured abstract.",
        userAdded: true,
        selected: true
      }))
    if (added.length === 0) {
      toast({
        title: "No PDFs detected",
        description: "Drop PDF files to add them to the literature set.",
        variant: "destructive"
      })
      return
    }
    setPapers(prev => {
      const next = [...added, ...prev]
      void persistContent({ papers: next })
      return next
    })
  }

  const selectedPapers = useMemo(() => papers.filter(p => p.selected), [papers])

  const handleToggleHypothesis = (id: string) => {
    if (!ensureCanEdit()) return
    setHypotheses(prev => {
      const next = prev.map(h =>
        h.id === id ? { ...h, selected: !h.selected } : h
      )
      void persistContent({ hypotheses: next })
      return next
    })
  }

  /**
   * Inline edit on a hypothesis's text (#2). Lets the scientist tweak
   * a generated hypothesis with their own phrasing before approval.
   * Persists immediately so downstream agents see the edited text on
   * the next phase.
   */
  const handleEditHypothesis = (id: string, nextText: string) => {
    if (!ensureCanEdit()) return
    const trimmed = nextText.trim()
    if (!trimmed) return
    setHypotheses(prev => {
      const next = prev.map(h => (h.id === id ? { ...h, text: trimmed } : h))
      void persistContent({ hypotheses: next })
      return next
    })
  }

  const selectedHypotheses = useMemo(
    () => hypotheses.filter(h => h.selected),
    [hypotheses]
  )

  const handleSaveDesign = async (id: string) => {
    if (!ensureCanEdit()) return
    setBusy("save")
    try {
      const next = generatedDesigns.map(d =>
        d.id === id ? { ...d, saved: true } : d
      )
      setGeneratedDesigns(next)
      await persistContent({ designs: next })
      toast({
        title: "Design saved",
        description: "Saved to this design's persistent content."
      })
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Re-run ONLY the statistical-analysis portion of phase 4 for a specific
   * generated design. Writes the result into that design's Statistical
   * Analysis section via the same edit path.
   */
  const handleReviewStatistics = async (targetGeneratedDesignId: string) => {
    if (!ensureCanEdit()) return
    setBusy("stats-review")
    try {
      const res = await fetch(`/api/design/${designId}/stats-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedDesignId: targetGeneratedDesignId })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || "Stats review failed")
      }
      const { statisticalAnalysis } = (await res.json()) as {
        statisticalAnalysis: string
      }
      if (!statisticalAnalysis?.trim()) {
        throw new Error("Agent returned empty statistics")
      }
      // Upsert (not edit-only) so external designs that don't yet have a
      // Statistical Analysis section get one created on first review.
      await handleUpsertSection(
        targetGeneratedDesignId,
        "Statistical Analysis",
        statisticalAnalysis.trim()
      )
      toast({
        title: "Statistics refreshed",
        description: "Statistical Analysis section has been updated."
      })
    } catch (err: any) {
      toast({
        title: "Stats review failed",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Upsert a section onto a specific generated design - adds if missing,
   * edits if present. Shares the persist+rollback path with edits.
   */
  const handleUpsertSection = async (
    targetDesignId: string,
    heading: string,
    body: string
  ) => {
    if (!ensureCanEdit()) return
    const target = generatedDesigns.find(d => d.id === targetDesignId)
    if (!target) return
    const previousDesigns = generatedDesigns

    const existsAt = target.sections.findIndex(s => s.heading === heading)
    const nextDesigns = generatedDesigns.map(d => {
      if (d.id !== targetDesignId) return d
      const nextSections =
        existsAt === -1
          ? [...d.sections, { heading, body }]
          : d.sections.map((s, i) => (i === existsAt ? { ...s, body } : s))
      return { ...d, saved: false, sections: nextSections }
    })
    setGeneratedDesigns(nextDesigns)

    try {
      await persistContent({ designs: nextDesigns })
    } catch (err: any) {
      setGeneratedDesigns(previousDesigns)
      toast({
        title: "Couldn't save section",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    }
  }

  /**
   * Call the make-plan endpoint to generate a dated execution plan for
   * the active design, then upsert it onto the design as a new section
   * "Execution Plan" (or replace if already present).
   */
  const handleMakePlan = async () => {
    if (!ensureCanEdit()) return
    if (!activeDesign) return
    setBusy("make-plan")
    try {
      const res = await fetch(`/api/design/${designId}/make-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedDesignId: activeDesign.id })
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b?.error || "Plan generation failed")
      }
      const { executionPlan } = (await res.json()) as {
        executionPlan: string
      }
      if (!executionPlan?.trim()) {
        throw new Error("Agent returned empty execution plan")
      }
      await handleUpsertSection(
        activeDesign.id,
        "Execution Plan",
        executionPlan.trim()
      )
      toast({
        title: "Execution plan ready",
        description: "Added as a new section on this design."
      })
    } catch (err: any) {
      toast({
        title: "Couldn't make a plan",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Edit a single section's body inline. Writes the updated `designs` array
   * to Firestore via the shared persist path. Optimistic - local state
   * flips immediately; rolls back on persist failure.
   */
  const handleEditSection = async (
    designId: string,
    heading: string,
    nextBody: string
  ) => {
    if (!ensureCanEdit()) return
    const target = generatedDesigns.find(d => d.id === designId)
    if (!target) return
    const sectionIndex = target.sections.findIndex(s => s.heading === heading)
    if (sectionIndex === -1) return
    const previous = target.sections[sectionIndex].body
    if (previous === nextBody) return

    const nextDesigns = generatedDesigns.map(d =>
      d.id !== designId
        ? d
        : {
            ...d,
            // Clear `saved` so the user knows there are unsaved edits since
            // the last "Save" action - keeps the Save button meaningful.
            saved: false,
            sections: d.sections.map((s, i) =>
              i === sectionIndex ? { ...s, body: nextBody } : s
            )
          }
    )
    setGeneratedDesigns(nextDesigns)

    try {
      await persistContent({ designs: nextDesigns })
    } catch (err: any) {
      // Roll back on failure so the UI doesn't lie to the user.
      setGeneratedDesigns(generatedDesigns)
      toast({
        title: "Couldn't save edit",
        description: err?.message ?? "Your change wasn't persisted. Try again.",
        variant: "destructive"
      })
    }
  }

  // ── Tab configuration ─────────────────────────────────────────────────

  const tabDefs = useMemo(() => {
    const phaseTabConfig: Array<{
      key: PhaseKey
      label: string
      sublabel: string
      accent:
        | "teal-journey"
        | "orange-product"
        | "purple-persona"
        | "sage-brand"
      icon: React.ReactNode
    }> = [
      {
        key: "problem",
        label: "Problem",
        sublabel: title || "Define problem",
        accent: "teal-journey",
        icon: <IconTargetArrow size={18} />
      },
      {
        key: "literature",
        label: "Literature",
        sublabel: papers.length > 0 ? `${papers.length} papers` : "No papers",
        accent: "orange-product",
        icon: <IconBook size={18} />
      },
      {
        key: "hypotheses",
        label: "Hypotheses",
        sublabel:
          hypotheses.length > 0
            ? `${hypotheses.length} hypotheses`
            : "No hypotheses",
        accent: "purple-persona",
        icon: <IconBulb size={18} />
      },
      {
        key: "design",
        label: "Design",
        sublabel:
          generatedDesigns.length > 0
            ? `${generatedDesigns.length} designs`
            : "No designs",
        accent: "sage-brand",
        icon: <IconClipboardText size={18} />
      }
    ]

    return [
      {
        key: "overview",
        label: "Design Overview",
        sublabel: title || design?.name || "Untitled Design",
        accent: "teal-journey" as const,
        icon: <IconLayoutGrid size={20} />,
        disabled: false,
        status: undefined as TabStatus | undefined,
        primary: true
      },
      ...phaseTabConfig.map(t => ({
        ...t,
        disabled: getPhaseState(t.key) === "locked",
        status: getPhaseState(t.key) as TabStatus | undefined,
        primary: false
      }))
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    approvedPhases,
    papers,
    hypotheses,
    generatedDesigns,
    problemValid,
    title
  ])

  // ── Agent popover helpers ──────────────────────────────────────────

  const sendAgentPrompt = (prompt: string) => {
    if (!prompt.trim()) return
    setUserInput(prompt.trim())
    setShowRail(true)
    setAgentPopoverOpen(false)
    setAgentPrompt("")
  }

  type QuickAction = { label: string; prompt: string; icon: React.ReactNode }

  const QUICK_ACTIONS: Record<
    string,
    { heading: string; actions: QuickAction[] }
  > = {
    problem: {
      heading: "Problem Definition",
      actions: [
        {
          label: "Refine problem statement",
          prompt:
            "Help me refine and sharpen my problem statement to make it more specific and testable.",
          icon: <IconPencil size={14} />
        },
        {
          label: "Suggest key variables",
          prompt:
            "Based on my problem statement and goal, suggest additional key variables I should consider for this experiment.",
          icon: <IconVariable size={14} />
        },
        {
          label: "Recommend constraints",
          prompt:
            "What practical constraints should I add to make this experiment design more realistic and feasible?",
          icon: <IconTargetArrow size={14} />
        },
        {
          label: "Clarify research goal",
          prompt:
            "Help me clarify and improve my research goal to better guide the experiment design.",
          icon: <IconBulb size={14} />
        }
      ]
    },
    literature: {
      heading: "Literature Search",
      actions: [
        {
          label: "Find more related papers",
          prompt:
            "Search for more relevant papers related to my research problem that I might have missed.",
          icon: <IconSearch size={14} />
        },
        {
          label: "Summarize selected papers",
          prompt:
            "Provide a concise summary of the key findings and methodologies from the selected papers.",
          icon: <IconClipboardText size={14} />
        },
        {
          label: "Identify research gaps",
          prompt:
            "Analyze the selected literature and identify gaps or unexplored areas relevant to my problem.",
          icon: <IconSparkles size={14} />
        },
        {
          label: "Compare methodologies",
          prompt:
            "Compare the research methodologies used across the selected papers and highlight their strengths and weaknesses.",
          icon: <IconBook size={14} />
        }
      ]
    },
    hypotheses: {
      heading: "Hypotheses",
      actions: [
        {
          label: "Generate alternative hypotheses",
          prompt:
            "Suggest alternative hypotheses I haven't considered based on the literature and problem context.",
          icon: <IconPlus size={14} />
        },
        {
          label: "Strengthen reasoning",
          prompt:
            "Help me strengthen the reasoning and justification behind my selected hypotheses.",
          icon: <IconBulb size={14} />
        },
        {
          label: "Identify potential confounds",
          prompt:
            "What confounding variables or biases might affect the validity of these hypotheses?",
          icon: <IconInfoCircle size={14} />
        },
        {
          label: "Simplify hypotheses",
          prompt:
            "Simplify the language and structure of my hypotheses to make them clearer and more testable.",
          icon: <IconPencil size={14} />
        }
      ]
    },
    design: {
      heading: "Experiment Design",
      actions: [
        {
          label: "Improve methodology",
          prompt:
            "Review and suggest improvements to the experimental methodology to strengthen internal validity.",
          icon: <IconSparkles size={14} />
        },
        {
          label: "Suggest control groups",
          prompt:
            "Recommend appropriate control groups and conditions for this experiment design.",
          icon: <IconFlask size={14} />
        },
        {
          label: "Refine sample size",
          prompt:
            "Help me determine an appropriate sample size with a power analysis justification.",
          icon: <IconChartBar size={14} />
        },
        {
          label: "Strengthen validity",
          prompt:
            "How can I improve the internal and external validity of this experiment design?",
          icon: <IconCheck size={14} />
        }
      ]
    },
    overview: {
      heading: "Summary",
      actions: [
        {
          label: "Generate abstract",
          prompt:
            "Generate a concise academic abstract summarizing this entire research design.",
          icon: <IconClipboardText size={14} />
        },
        {
          label: "Summarize findings",
          prompt:
            "Summarize the key findings and decisions made across all phases of this design.",
          icon: <IconSparkles size={14} />
        },
        {
          label: "Identify limitations",
          prompt:
            "What are the key limitations of this research design that should be acknowledged?",
          icon: <IconInfoCircle size={14} />
        }
      ]
    }
  }

  const currentActions = QUICK_ACTIONS[activeTab] ?? QUICK_ACTIONS.problem

  // ── Render ────────────────────────────────────────────────────────────

  const activeDesign =
    generatedDesigns.find(d => d.id === activeDesignId) ?? generatedDesigns[0]

  // Auto-fire picker-routed actions once the design is loaded. Strips the
  // `auto` query param so a back/forward doesn't re-trigger the action.
  useEffect(() => {
    if (autoFiredRef.current) return
    if (loading) return
    if (!autoAction) return
    if (!activeDesign) return
    autoFiredRef.current = true
    // Make sure the user sees the design tab where the action lands.
    if (activeTab !== "design") setActiveTab("design")
    const locale = (params.locale as string) ?? "en"
    const wsId = params.workspaceid as string
    router.replace(`/${locale}/${wsId}/designs/${designId}`)

    if (autoAction === "stats-review") {
      void handleReviewStatistics(activeDesign.id)
    } else if (autoAction === "make-plan") {
      void handleMakePlan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAction, loading, activeDesign?.id])

  // Tier-3 long-context dump: pass the full design (all hypotheses, all
  // papers, all generated designs). buildDesignChatContext caps at
  // ~75k tokens; if oversize, RAG fallback would kick in (not yet wired).
  const baseChatContextPrompt = buildDesignChatContext({
    title,
    problemStatement,
    objective,
    domain,
    phase,
    selectedHypotheses: hypotheses.filter(h => h.selected),
    hypotheses,
    papers,
    generatedDesigns,
    activeDesign
  })
  // When the user asks for a change ("change the buffer to 20 mM",
  // "swap the readout method") we want the assistant to PROPOSE an edit
  // they can approve, not silently rewrite the design. The block below
  // teaches the LLM a structured `<design-patch>` format; the chat
  // renderer parses that block out and shows an Approve / Reject card
  // (see components/messages/design-patch-block.tsx). On Approve, the
  // card fires a `design:apply-patch` window event which the listener
  // below applies to generatedDesigns + persists.
  const chatContextPrompt = `${baseChatContextPrompt}

## When the user asks you to change the design

If the user requests an edit to the current design, do NOT silently rewrite it.
Instead, after a brief explanation, emit ONE proposed edit inside a
\`<design-patch>\` block containing valid JSON. Two shapes are supported:

Find / replace within a section:
<design-patch>
{ "sectionHeading": "Materials & Setup", "find": "5 mM phosphate buffer", "replace": "20 mM phosphate buffer" }
</design-patch>

Or replace the section body entirely:
<design-patch>
{ "sectionHeading": "Statistical Analysis", "newBody": "..." }
</design-patch>

Rules:
- \`sectionHeading\` MUST match exactly one of the section headings shown above.
- Either \`find\`+\`replace\` OR \`newBody\` — not both.
- Emit at most one \`<design-patch>\` per response. If multiple edits are
  needed, ask the user to confirm the first before proposing the next.
- Wrap the JSON in the tags exactly as shown; do not add markdown fencing.`

  // ── Apply patches that the chat proposed and the user approved ────────
  // The DesignPatchBlock card fires `design:apply-patch` on the window when
  // the user clicks Approve. We listen for that and apply the patch to the
  // active design (or the design at `designIndex` if specified), then
  // persist + sync the shared context.
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{
        sectionHeading: string
        find?: string
        replace?: string
        newBody?: string
        designIndex?: number
      }>
      const patch = evt.detail
      if (!patch?.sectionHeading) return
      // Read-only collaborators can chat, but can't apply AI-suggested edits.
      if (!canEdit) return
      setGeneratedDesigns(prev => {
        if (prev.length === 0) return prev
        const idx =
          typeof patch.designIndex === "number" && patch.designIndex >= 0
            ? Math.min(patch.designIndex, prev.length - 1)
            : Math.max(
                0,
                prev.findIndex(d => d.id === activeDesignId)
              )
        const target = prev[idx]
        if (!target) return prev
        const sectionIdx = target.sections.findIndex(
          s => s.heading === patch.sectionHeading
        )
        if (sectionIdx === -1) {
          toast({
            title: "Couldn't apply edit",
            description: `No section called "${patch.sectionHeading}" — the assistant may have hallucinated the heading.`,
            variant: "destructive"
          })
          return prev
        }
        const section = target.sections[sectionIdx]
        let nextBody: string
        if (patch.newBody !== undefined) {
          nextBody = patch.newBody
        } else if (patch.find !== undefined && patch.replace !== undefined) {
          if (!section.body.includes(patch.find)) {
            toast({
              title: "Couldn't apply edit",
              description:
                "The text to find wasn't present in the section anymore.",
              variant: "destructive"
            })
            return prev
          }
          nextBody = section.body.split(patch.find).join(patch.replace)
        } else {
          return prev
        }
        const nextSections = [...target.sections]
        nextSections[sectionIdx] = { ...section, body: nextBody }
        const nextDesigns = [...prev]
        nextDesigns[idx] = { ...target, sections: nextSections }
        void persistContent({ designs: nextDesigns })
        toast({
          title: "Design updated",
          description: `Applied edit to "${patch.sectionHeading}".`
        })
        return nextDesigns
      })
    }
    window.addEventListener("design:apply-patch", handler as EventListener)
    return () =>
      window.removeEventListener("design:apply-patch", handler as EventListener)
    // persistContent + toast are stable across renders; activeDesignId is
    // the one piece that changes and we want the closure to see the latest.
    // canEdit is included so a permission change re-binds the (read-only) guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDesignId, canEdit])

  if (loading) {
    return (
      <div className="bg-ink-50 flex h-full items-center justify-center">
        <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
      </div>
    )
  }

  if (!design) {
    return (
      <div className="bg-ink-50 flex h-full items-center justify-center">
        <p className="text-ink-400">Design not found</p>
      </div>
    )
  }

  const handleTabChange = (key: string) => {
    if (key !== "overview") {
      const phase = key as PhaseKey
      if (getPhaseState(phase) === "locked") return
    }
    setActiveTab(key)
  }

  // The design-scoped chat now lives in a right-side rail (ScopedChatRail)
  // rather than a full-screen route. The rail is only available once the
  // design has been generated. Toggled by the header "Chat" button.
  const designGenerated = generatedDesigns.length > 0
  const toggleChatRail = () => setShowRail(s => !s)
  // Drag-to-resize the chat rail horizontally. Clamp between a usable minimum
  // and ~70% of the viewport so it can't swallow the whole screen.
  const startRailResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      const next = window.innerWidth - ev.clientX
      const max = Math.min(960, Math.round(window.innerWidth * 0.7))
      setRailWidth(Math.max(360, Math.min(max, next)))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.userSelect = ""
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  // A completed (Design-approved) design is locked — edits require duplicating.
  const designLocked = approvedPhases.includes("design")

  return (
    <div className="bg-ink-50 flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Honor browser history if we have any - takes the user
                // back to wherever they came from (dashboard, project,
                // designs list). Deep-linked entries fall back to the
                // workspace dashboard rather than the projects index.
                if (
                  typeof window !== "undefined" &&
                  window.history.length > 1
                ) {
                  router.back()
                } else {
                  router.push(`/${locale}/${workspaceId}`)
                }
              }}
              className="text-ink-500 gap-1"
            >
              <IconArrowLeft size={16} />
              Back
            </Button>
            <div>
              <div className="text-ink-400 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em]">
                <span>Design</span>
                {designLocked && (
                  <span
                    className="rounded border border-[#1F4A2C]/20 bg-[#DDE9DF] px-2 py-0.5 normal-case tracking-normal text-[#1F4A2C]"
                    title="Completed designs are locked — duplicate to edit"
                  >
                    Locked
                  </span>
                )}
                {!canEdit && (
                  <span
                    className="border-ink-300 bg-ink-100 text-ink-600 rounded border px-2 py-0.5 normal-case tracking-normal"
                    title="You have view-only access — ask the owner for editor access to make changes"
                  >
                    Read-only
                  </span>
                )}
                {busy && (
                  <span className="bg-teal-journey-tint text-teal-journey border-teal-journey/30 rounded border px-2 py-0.5 normal-case tracking-normal">
                    Running {busy}...
                  </span>
                )}
              </div>
              <h1 className="text-ink-900 text-xl font-bold">
                {title || design.name || "Untitled Design"}
              </h1>
              {/* Persistent context strip - problem statement is the
                    second most important piece of context after the title
                    and stays visible across every stage of the timeline.
                    During an agent run we expand it to the full statement
                    (issue #10) so the scientist sees exactly what the agent
                    is working on without flipping back to the Problem tab. */}
              {problemStatement?.trim() && (
                <div
                  className={cn(
                    "text-ink-500 mt-0.5 max-w-3xl text-[12.5px]",
                    busy ? "" : "line-clamp-1"
                  )}
                  title={problemStatement}
                >
                  <span className="text-ink-400 mr-1.5 font-medium uppercase tracking-wider">
                    Problem
                  </span>
                  {problemStatement}
                </div>
              )}
            </div>
          </div>

          {/* ── Toolbar actions (right side) ───────────────── */}
          {/* "Chat" opens a right-side rail scoped to this design so the user
                can ask for edits while looking at it. Only available once the
                design has been generated. */}
          <div className="flex items-center gap-2">
            {designGenerated && (
              <button
                onClick={toggleChatRail}
                aria-pressed={showRail}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold uppercase tracking-wide shadow-sm ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
                  showRail
                    ? "bg-ink text-paper ring-white/20"
                    : "from-brick to-brick-hover bg-gradient-to-r text-white ring-white/20"
                )}
                title="Chat with this design"
              >
                <IconSparkles size={14} className="shrink-0" />
                {showRail ? "Hide chat" : "Chat"}
              </button>
            )}
            {/* Sharing is owner-only (the /share + /collaborators routes reject
                non-owners), so only surface the button to the owner. */}
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareDialogOpen(true)}
                className="gap-1.5"
                title="Share this design or invite collaborators"
              >
                <IconShare size={14} /> Share
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal split directly under the top header so the design chat rail
          spans the FULL height beneath it (it was cramped when it only filled
          the area below the stepper/tabs). Left column = stepper + tabs +
          content; right column = the resizable chat rail. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Stage stepper - 5-stage editorial rail */}
          {(() => {
            const tabToStage: Record<string, DesignStageId> = {
              overview: "overview",
              problem: "problem",
              literature: "lit",
              hypotheses: "hyp",
              design: "design"
            }
            const stageToTab: Record<DesignStageId, string> = {
              overview: "overview",
              problem: "problem",
              lit: "literature",
              hyp: "hypotheses",
              design: "design"
            }
            const completedStages: DesignStageId[] = approvedPhases
              .filter(p => p !== "simulation")
              .map(p => {
                if (p === "literature") return "lit"
                if (p === "hypotheses") return "hyp"
                return p as DesignStageId
              })
            const meta: Partial<Record<DesignStageId, string>> = {
              overview:
                title || design?.name
                  ? ((title || design?.name) as string)
                  : "untitled",
              problem: title ? "defined" : "not defined",
              lit:
                papers.length > 0
                  ? `${papers.length} paper${papers.length === 1 ? "" : "s"}`
                  : "no papers",
              hyp:
                hypotheses.length > 0
                  ? `${hypotheses.length === 1 ? "1 hypothesis" : `${hypotheses.length} hypotheses`}`
                  : "no hypotheses",
              design:
                generatedDesigns.length > 0
                  ? `${generatedDesigns.length} design${generatedDesigns.length === 1 ? "" : "s"}`
                  : "no designs"
            }
            const currentStage = tabToStage[activeTab] || "overview"
            return (
              <Stepper
                current={currentStage}
                completed={completedStages}
                meta={meta}
                onGoto={id => handleTabChange(stageToTab[id] as any)}
              />
            )
          })()}

          {/* Long agent runs (literature / hypotheses / design generation) take
          1–3 minutes. Surface a clear "stay on this page" warning so the
          scientist doesn't accidentally lose 90s of work mid-stream. Paired
          with the beforeunload handler attached at mount-time. */}
          {isAgentRunning && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-[12.5px] text-amber-900">
              <IconAlertTriangle size={14} className="shrink-0" />
              <span>
                <b>Agent is working — keep this tab open.</b>{" "}
                {busy === "literature"
                  ? "We're scouting the literature."
                  : busy === "hypotheses"
                    ? "We're generating hypotheses."
                    : "We're drafting your design."}{" "}
                Closing or leaving this page will cancel the run and lose
                progress.
              </span>
            </div>
          )}

          {/* Body: tab content on the left, design chat rail on the right */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">
              <div
                className={
                  // Design tab fills the full width (the section text needs the
                  // room); overview stays a centered reading column; the form-style
                  // tabs (problem/literature/hypotheses) stay narrower.
                  activeTab === "design"
                    ? "w-full p-6"
                    : activeTab === "overview"
                      ? "mx-auto max-w-6xl p-6"
                      : "mx-auto max-w-4xl p-6"
                }
              >
                {activeTab === "problem" && (
                  <ProblemTab
                    title={title}
                    setTitle={setTitle}
                    problemStatement={problemStatement}
                    setProblemStatement={setProblemStatement}
                    domain={domain}
                    setDomain={setDomain}
                    phase={phase}
                    setPhase={setPhase}
                    objective={objective}
                    setObjective={setObjective}
                    constraintMaterial={constraintMaterial}
                    setConstraintMaterial={setConstraintMaterial}
                    constraintTime={constraintTime}
                    setConstraintTime={setConstraintTime}
                    constraintEquipment={constraintEquipment}
                    setConstraintEquipment={setConstraintEquipment}
                    variablesKnown={variablesKnown}
                    setVariablesKnown={setVariablesKnown}
                    variablesUnknown={variablesUnknown}
                    setVariablesUnknown={setVariablesUnknown}
                    successCriteria={successCriteria}
                    setSuccessCriteria={setSuccessCriteria}
                    includeReplicates={includeReplicates}
                    setIncludeReplicates={setIncludeReplicates}
                    onApproveAndGenerate={handleApproveAndGenerateLiterature}
                    canSubmit={problemValid}
                    isApproved={isPhaseApproved("problem")}
                    canEdit={canEdit}
                    isBusy={busy === "literature"}
                    onRevise={() => handleRevisePhase("problem")}
                  />
                )}

                {activeTab === "literature" && (
                  <LiteratureTab
                    papers={papers}
                    onTogglePaper={handleTogglePaper}
                    onUploadPdfs={handleUploadPdfs}
                    onApproveAndGenerate={handleApproveAndGenerateHypotheses}
                    // `handleGenerateMoreLiterature` was the pre-2026-05-19
                    // "Generate more" handler that re-ran the entire search.
                    // We've switched the in-tab button to local pagination
                    // ("Show more" = next 10 of the already-ranked pool),
                    // which is way faster + matches user expectation. Kept
                    // as `onSearchMore` so a future "search again" UI can
                    // re-wire it without re-implementing the full search.
                    onSearchMore={handleGenerateMoreLiterature}
                    canGenerate={selectedPapers.length > 0}
                    isApproved={isPhaseApproved("literature")}
                    canEdit={canEdit}
                    isBusy={busy === "hypotheses" || busy === "literature"}
                    isSearching={busy === "literature"}
                    progress={literatureProgress}
                    totalCandidates={literatureTotalCandidates}
                    onRevise={() => handleRevisePhase("literature")}
                    onSavePaper={handleSavePaper}
                    savedPaperIds={savedPaperIds}
                  />
                )}

                {activeTab === "hypotheses" && (
                  <HypothesesTab
                    hypotheses={hypotheses}
                    papers={papers}
                    onToggle={handleToggleHypothesis}
                    onEdit={handleEditHypothesis}
                    onApproveAndGenerate={handleApproveAndGenerateDesign}
                    onRegenerate={handleRegenerateHypotheses}
                    canGenerate={selectedHypotheses.length > 0}
                    isApproved={isPhaseApproved("hypotheses")}
                    canEdit={canEdit}
                    isBusy={busy === "design" || busy === "hypotheses"}
                    isGenerating={busy === "hypotheses"}
                    progress={hypothesesProgress}
                    onRevise={() => handleRevisePhase("hypotheses")}
                    genError={hypothesesError}
                  />
                )}

                {activeTab === "design" && (
                  <DesignTab
                    designs={generatedDesigns}
                    hypotheses={hypotheses}
                    activeId={activeDesignId}
                    onSelect={setActiveDesignId}
                    activeDesign={activeDesign}
                    onSave={handleSaveDesign}
                    onApproveAndContinue={handleApproveDesignAndContinue}
                    onRegenerate={handleRegenerateDesign}
                    isApproved={isPhaseApproved("design")}
                    canEdit={canEdit}
                    isBusy={busy === "design"}
                    isGenerating={busy === "design"}
                    progress={designProgress}
                    onRevise={() => handleRevisePhase("design")}
                    designVersions={designVersions}
                    onRestoreVersion={handleRestoreDesignVersion}
                    onEditSection={handleEditSection}
                  />
                )}

                {activeTab === "overview" && (
                  <OverviewTab
                    title={title}
                    problemStatement={problemStatement}
                    domain={domain}
                    phase={phase}
                    objective={objective}
                    constraintMaterial={constraintMaterial}
                    constraintTime={constraintTime}
                    constraintEquipment={constraintEquipment}
                    variablesKnown={variablesKnown}
                    variablesUnknown={variablesUnknown}
                    papers={papers}
                    hypotheses={hypotheses}
                    designs={generatedDesigns}
                    approvedPhases={approvedPhases}
                    activeDesign={activeDesign}
                    onGoToTab={setActiveTab}
                  />
                )}
              </div>
            </div>
          </div>
          {/* ↑ body (content area) ─── ↓ close the left column */}
        </div>
        {showRail && designGenerated && (
          <div
            className="border-ink-200 relative flex shrink-0 border-l"
            style={{ width: railWidth }}
          >
            {/* Drag handle on the rail's left edge — resize horizontally. */}
            <div
              onMouseDown={startRailResize}
              className="hover:bg-brick/40 absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
              title="Drag to resize the chat"
            />
            <div className="min-h-0 min-w-0 flex-1">
              <ScopedChatRail
                scope="design"
                scopeId={designId}
                scopeName={title || design?.name || "Design"}
                autoStart
                contextPrompt={chatContextPrompt}
                headerSlot={
                  <button
                    onClick={toggleChatRail}
                    title="Close chat"
                    className="text-ink-3 hover:bg-paper-2 hover:text-ink rounded p-1"
                  >
                    <IconX size={16} />
                  </button>
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Owner-only share/collaborate dialog (link visibility, invite editors
          by email, export). Non-owners can't manage sharing, so it's gated. */}
      {isOwner && (
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          designId={designId}
          design={{
            id: designId,
            name: title || design?.name,
            description: design?.description,
            content: design?.content,
            sharing: sharingState.sharing,
            share_token: sharingState.share_token
          }}
          onSharingChange={setSharingState}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Reusable phase UI components
// ─────────────────────────────────────────────────────────────────────────

function PhaseBanner(props: {
  isApproved: boolean
  phaseName: string
  onRevise: () => void
}) {
  if (!props.isApproved) return null
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <IconCheck size={16} />
        {props.phaseName} approved
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={props.onRevise}
        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
      >
        <IconRefresh size={14} />
        Revise
      </Button>
    </div>
  )
}

function PhaseActionBar(props: {
  onApprove: () => void
  approveLabel: string
  approveDisabled: boolean
  onRegenerate?: () => void
  regenerateLabel?: string
  regenerateIcon?: React.ReactNode
  isBusy: boolean
  isApproved: boolean
}) {
  if (props.isApproved) return null
  return (
    <div className="border-ink-100 mt-6 flex items-center justify-between border-t pt-4">
      <div>
        {props.onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={props.onRegenerate}
            disabled={props.isBusy}
            className="gap-1.5"
          >
            {props.regenerateIcon ?? <IconRefresh size={14} />}
            {props.regenerateLabel ?? "Regenerate"}
          </Button>
        )}
      </div>
      <Button
        onClick={props.onApprove}
        disabled={props.approveDisabled || props.isBusy}
        className="bg-brick hover:bg-brick-hover gap-2"
      >
        {props.isBusy ? (
          <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <IconArrowRight size={16} />
        )}
        {props.isBusy ? "Generating..." : props.approveLabel}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Tab components
// ─────────────────────────────────────────────────────────────────────────

function ProblemTab(props: {
  title: string
  setTitle: (v: string) => void
  problemStatement: string
  setProblemStatement: (v: string) => void
  domain: DesignDomain | ""
  setDomain: (v: DesignDomain | "") => void
  phase: DesignPhase | ""
  setPhase: (v: DesignPhase | "") => void
  objective: string
  setObjective: (v: string) => void
  constraintMaterial: string
  setConstraintMaterial: (v: string) => void
  constraintTime: string
  setConstraintTime: (v: string) => void
  constraintEquipment: string
  setConstraintEquipment: (v: string) => void
  variablesKnown: string
  setVariablesKnown: (v: string) => void
  variablesUnknown: string
  setVariablesUnknown: (v: string) => void
  successCriteria: string
  setSuccessCriteria: (v: string) => void
  includeReplicates: "" | "yes" | "no"
  setIncludeReplicates: (v: "" | "yes" | "no") => void
  onApproveAndGenerate: () => void
  canSubmit: boolean
  isApproved: boolean
  canEdit: boolean
  isBusy: boolean
  onRevise: () => void
}) {
  const {
    title,
    setTitle,
    problemStatement,
    setProblemStatement,
    domain,
    setDomain,
    phase,
    setPhase,
    objective,
    setObjective,
    constraintMaterial,
    setConstraintMaterial,
    constraintTime,
    setConstraintTime,
    constraintEquipment,
    setConstraintEquipment,
    variablesKnown,
    setVariablesKnown,
    variablesUnknown,
    setVariablesUnknown,
    successCriteria,
    setSuccessCriteria,
    includeReplicates,
    setIncludeReplicates,
    onApproveAndGenerate,
    canSubmit,
    isApproved,
    canEdit,
    isBusy,
    onRevise
  } = props

  return (
    <div className="space-y-5">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Research Problem"
        onRevise={onRevise}
      />

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-teal-journey text-lg">
            Research Problem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short descriptive title"
              disabled={isApproved || !canEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Problem Statement <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={problemStatement}
              onChange={e => setProblemStatement(e.target.value)}
              placeholder="What is the specific research problem you're investigating?"
              rows={4}
              disabled={isApproved || !canEdit}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Domain <span className="text-red-500">*</span>
              </Label>
              <Select
                value={domain || undefined}
                onValueChange={value => setDomain(value as DesignDomain)}
                disabled={isApproved || !canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scientific domain" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGN_DOMAIN_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                Phase <span className="text-red-500">*</span>
              </Label>
              <Select
                value={phase || undefined}
                onValueChange={value => setPhase(value as DesignPhase)}
                disabled={isApproved || !canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select development phase" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGN_PHASE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Objective <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder="What should this experiment achieve?"
              rows={3}
              disabled={isApproved || !canEdit}
            />
          </div>

          {/* Success criteria - issue #9. Optional; gives the hypothesis +
              design agents a concrete bar to aim for ("≥30% viscosity drop
              at 50 mg/mL"). Kept distinct from Objective on purpose - the
              objective is qualitative, success criteria are quantitative. */}
          <div className="space-y-1.5">
            {/* "optional" suffix dropped per scientist's spec - the
                label stands alone, the field still allows empty. */}
            <Label>Success criteria</Label>
            <Textarea
              value={successCriteria}
              onChange={e => setSuccessCriteria(e.target.value)}
              placeholder="What would count as a successful experiment? e.g. viscosity below 20 cP at 100 mg/mL; recovery > 95%."
              rows={2}
              disabled={isApproved || !canEdit}
            />
          </div>

          {/* Include replicates - issue #28. Yes/No dropdown so the design
              agent knows whether to bake replicates into its sample-budget
              math by default. Optional; the agent has a sensible default
              when unset. */}
          <div className="space-y-1.5 md:max-w-xs">
            <Label>Include replicates</Label>
            <Select
              value={includeReplicates || undefined}
              onValueChange={value =>
                setIncludeReplicates(value as "yes" | "no")
              }
              disabled={isApproved || !canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Constraints</Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Material
                </Label>
                <Textarea
                  value={constraintMaterial}
                  onChange={e => setConstraintMaterial(e.target.value)}
                  placeholder="e.g. ≤ 500 mg API total; max 30 runs total (including replicates)"
                  rows={2}
                  disabled={isApproved || !canEdit}
                />
                <p className="text-ink-3 text-[11.5px]">
                  Include replicates in any run / condition budget you specify -
                  the design agent treats this as the total including all
                  replicate conditions.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Time</Label>
                <Textarea
                  value={constraintTime}
                  onChange={e => setConstraintTime(e.target.value)}
                  placeholder="e.g. Must complete within 2 weeks of receipt"
                  rows={2}
                  disabled={isApproved || !canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Equipment
                </Label>
                <Textarea
                  value={constraintEquipment}
                  onChange={e => setConstraintEquipment(e.target.value)}
                  placeholder="e.g. UPLC, plate reader, no DLS available"
                  rows={2}
                  disabled={isApproved || !canEdit}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Variables</Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Known</Label>
                <Textarea
                  value={variablesKnown}
                  onChange={e => setVariablesKnown(e.target.value)}
                  placeholder="Variables you want to vary or control - one per line (e.g. pH 5–7, polymer concentration 0.1–0.6%)"
                  rows={3}
                  disabled={isApproved || !canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Unknown</Label>
                <Textarea
                  value={variablesUnknown}
                  onChange={e => setVariablesUnknown(e.target.value)}
                  placeholder="Variables you suspect matter but don't fully characterize yet - one per line"
                  rows={3}
                  disabled={isApproved || !canEdit}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PhaseActionBar
        onApprove={onApproveAndGenerate}
        approveLabel="Approve & Start Literature Search"
        approveDisabled={!canSubmit || !canEdit}
        isBusy={isBusy}
        isApproved={isApproved}
      />
    </div>
  )
}

// ─── Shared progress view for long-running phase operations ──────────────
function PhaseProgressView(props: {
  accentClass?: string
  title: string
  subtitle?: string
  events: Array<{ step: string; message: string; detail?: string }>
  isDone?: boolean
}) {
  const { accentClass, title, subtitle, events, isDone } = props
  const activeIdx = events.length - 1
  return (
    <div
      className={cn(
        "rounded-xl border p-6",
        accentClass ?? "border-orange-product/30 bg-orange-product-tint"
      )}
    >
      <div className="mb-4">
        <p className="text-ink-900 text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-ink-500 mt-0.5 text-xs">{subtitle}</p>}
      </div>
      {events.length === 0 ? (
        <div className="text-ink-500 flex items-center gap-2 text-xs">
          <span className="border-ink-300 border-t-ink-700 size-3 animate-spin rounded-full border-2" />
          Starting…
        </div>
      ) : (
        <ol className="space-y-2">
          {events.map((ev, i) => {
            const status = isDone
              ? "done"
              : i < activeIdx
                ? "done"
                : i === activeIdx
                  ? "active"
                  : "pending"
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {status === "done" ? (
                    <span className="bg-ink-800 flex size-4 items-center justify-center rounded-full">
                      <IconCheck size={10} className="text-white" />
                    </span>
                  ) : status === "active" ? (
                    <span className="border-ink-300 border-t-ink-700 size-3 animate-spin rounded-full border-2" />
                  ) : (
                    <span className="border-ink-300 size-3 rounded-full border-2" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      status === "pending" ? "text-ink-400" : "text-ink-900",
                      status === "active" && "font-semibold"
                    )}
                  >
                    {ev.message}
                  </span>
                  {ev.detail && (
                    <span className="text-ink-500 mt-0.5 block font-mono text-[11px]">
                      {ev.detail}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// Plain-language headlines for each stage of the literature search. The
// server emits terse/technical `message` strings; we override them here with
// clear, human descriptions so the scientist can see — and trust — exactly
// what the agent is doing at each step. The dynamic `detail` line (live
// counts, timings, queries) is kept underneath for credibility.
const FRIENDLY_STEP_MESSAGE: Record<string, string> = {
  optimizing_query: "Reading your problem to craft precise search queries",
  searching_sources:
    "Searching PubMed, arXiv, Semantic Scholar, Google Scholar, and the web",
  deduping: "Merging the same paper found across different sources",
  papers_found: "Gathering everything we found",
  searching_round: "Running deeper, angle-specific searches",
  filtering_reviews: "Setting aside reviews to keep original research",
  ranking: "Ranking each paper against your research problem",
  summarizing_papers: "Writing a short, problem-focused summary for each paper"
}

function progressToEvents(
  events: LiteratureProgress[]
): Array<{ step: string; message: string; detail?: string }> {
  return events.map(ev => {
    const message = FRIENDLY_STEP_MESSAGE[ev.step] ?? ev.message
    if (ev.step === "optimizing_query") {
      return {
        step: ev.step,
        message,
        detail: ev.primaryQuery
      }
    }
    if (ev.step === "searching_sources") {
      // Carries per-source count breakdown (PubMed: 8 · arXiv: 3 · …)
      // when the pre-warm completes, plain message before.
      return {
        step: ev.step,
        message,
        detail: ev.detail
      }
    }
    // Dedup funnel - raw count from all sources → unique after dedup.
    // Surfaces the "we considered N candidates, kept M unique" stage.
    if (ev.step === "deduping") {
      const raw = typeof ev.rawCount === "number" ? ev.rawCount : null
      const unique = typeof ev.uniqueCount === "number" ? ev.uniqueCount : null
      const dropped = raw !== null && unique !== null ? raw - unique : null
      return {
        step: ev.step,
        message,
        detail:
          dropped !== null && dropped > 0
            ? `${dropped} duplicate${dropped === 1 ? "" : "s"} merged across sources`
            : undefined
      }
    }
    if (ev.step === "papers_found") {
      const counts = Object.entries(ev.sourceCounts ?? {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join("  ·  ")
      // When totalCandidates > delivered count, prepend the funnel
      // ratio so the user sees "Top 10 of 95 ranked · pubmed: 12 · …"
      const ratio =
        typeof ev.totalCandidates === "number" &&
        typeof ev.totalPapers === "number" &&
        ev.totalCandidates > ev.totalPapers
          ? `top ${ev.totalPapers} of ${ev.totalCandidates} ranked`
          : null
      const detail = [ratio, counts].filter(Boolean).join("  ·  ")
      return {
        step: ev.step,
        message,
        detail: detail || undefined
      }
    }
    // Per-round search ticker - surfaces "Round 2 of 5 - 7 papers so
    // far · 23.4s" so the scientist sees genuine progress instead of
    // a single static line. The agent emits TWO events per round (a
    // pre-call event without elapsedMs, then a post-call event with
    // elapsedMs), so the detail line composes the unique-count + the
    // (optional) elapsed time + the (optional) round-query.
    if (ev.step === "searching_round") {
      const parts: string[] = []
      parts.push(
        `${ev.uniqueSoFar} unique paper${ev.uniqueSoFar === 1 ? "" : "s"} so far`
      )
      if (typeof ev.elapsedMs === "number") {
        parts.push(`${(ev.elapsedMs / 1000).toFixed(1)}s`)
      }
      if (ev.intent && ev.intent !== "primary") {
        // LLM-assigned angle (mechanism / methods / applications /
        // recent_advances / comparative / failure_modes). Renders the
        // raw label - short, scientist-readable, no extra dictionary
        // lookup needed.
        parts.push(`angle: ${ev.intent.replace(/_/g, " ")}`)
      }
      if (ev.query) {
        parts.push(`q: "${ev.query}"`)
      }
      return {
        step: ev.step,
        message,
        detail: parts.join("  ·  ")
      }
    }
    if (ev.step === "filtering_reviews") {
      const dropped = ev.dropped ?? 0
      const remaining = ev.remaining ?? 0
      return {
        step: ev.step,
        message,
        detail:
          dropped > 0
            ? `${dropped} review${dropped === 1 ? "" : "s"} dropped, ${remaining} primary research kept`
            : undefined
      }
    }
    if (ev.step === "ranking") {
      // Cohere reranker over the post-filter pool. `remaining` is
      // populated by the agent with the input count.
      return {
        step: ev.step,
        message,
        detail:
          typeof ev.remaining === "number"
            ? `Scoring ${ev.remaining} candidate${ev.remaining === 1 ? "" : "s"} against your problem statement`
            : undefined
      }
    }
    if (ev.step === "summarizing_papers") {
      // Per-paper LLM summary pass that runs only over the top-N
      // post-rank papers, so the user sees "Summarising 10 papers
      // (~5s)" as a distinct phase from the broader rerank.
      return {
        step: ev.step,
        message,
        detail:
          typeof ev.papersCount === "number"
            ? `Writing problem-aware blurbs for the top ${ev.papersCount}`
            : undefined
      }
    }
    return { step: ev.step, message: ev.message }
  })
}

function LiteratureTab(props: {
  papers: Paper[]
  onTogglePaper: (id: string) => void
  onUploadPdfs: (files: FileList | null) => void
  onApproveAndGenerate: () => void
  /**
   * Hook to kick off a fresh paper-finder pass when the user wants
   * more candidates than what was returned. Wired but NOT exposed
   * in the UI today - the "Show more" button paginates the existing
   * ranked pool instead. Kept on the props so a future "search
   * again from scratch" affordance can plug into it without re-
   * implementing the run.
   */
  onSearchMore: () => void
  canGenerate: boolean
  isApproved: boolean
  canEdit: boolean
  isBusy: boolean
  isSearching?: boolean
  progress?: LiteratureProgress[]
  /**
   * Total candidates the pipeline considered before the top-N cut.
   * Rendered as "from N searched" in the surfaced-papers header so
   * the scientist sees the funnel - we didn't just find 10 papers,
   * we sifted through 95.
   */
  totalCandidates?: number
  onRevise: () => void
  /** Save the paper into this design's library (workspace paper library). */
  onSavePaper: (paper: Paper) => void
  /** Ids of papers already saved this session — flips the save icon state. */
  savedPaperIds: Set<string>
}) {
  const {
    papers,
    onTogglePaper,
    onUploadPdfs,
    onApproveAndGenerate,
    onSearchMore,
    canGenerate,
    isApproved,
    canEdit,
    isBusy,
    isSearching,
    progress,
    totalCandidates,
    onRevise,
    onSavePaper,
    savedPaperIds
  } = props

  // Sort dropdown (issue #14). Default to relevance - that's what the
  // literature agent's scoring is for - but let the user flip to recency
  // when they need the latest work.
  const [sortMode, setSortMode] = useState<"relevance" | "recency">("relevance")

  // ── Show-more pagination ────────────────────────────────────────────
  // The lit-scout returns up to 40 ranked papers per run. We initially
  // surface 10 - enough to scan without overwhelming the scientist -
  // and let them click "Show more" to reveal the next 10 from the
  // already-ranked pool. Pure client-side pagination, no extra API
  // call. Resets whenever the papers array identity changes (e.g.
  // after a real re-search or after problem revision).
  const PAGE_SIZE = 10
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [papers])
  const handleShowMore = () => {
    setVisibleCount(c => Math.min(c + PAGE_SIZE, papers.length))
  }

  // Smart secondary action - paginate locally when there are still
  // un-shown papers in the pool; fall back to a fresh paper-finder
  // run when the pool is exhausted. Without this fallback, runs that
  // returned < 10 papers (or where the user has already paged through
  // everything) leave the user with no action button at all - they
  // can't ask the agent for MORE candidates. Always-on affordance.
  const morePaperFinderUnshown = visibleCount < papers.length
  const secondaryActionHandler = morePaperFinderUnshown
    ? handleShowMore
    : onSearchMore
  const secondaryActionLabel = morePaperFinderUnshown
    ? `Show more (${Math.min(PAGE_SIZE, papers.length - visibleCount)})`
    : "Search for more papers"

  return (
    <div className="space-y-4">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Literature Search"
        onRevise={onRevise}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-orange-product text-sm font-bold uppercase tracking-widest">
            Relevant Literature
          </h3>
          <p className="text-ink-500 mt-0.5 text-xs">
            {isApproved
              ? "Literature approved. These papers were used to generate hypotheses."
              : "Review the papers surfaced by the literature agent. Select the ones to build hypotheses from."}
          </p>
          {!isApproved && (
            <p className="text-ink-400 mt-1 text-[11px] italic">
              Tip: select <b>at least 1 paper</b> (or several) — your picks
              become the basis for the hypotheses on the next step.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sort dropdown (issue #14). Sits to the right of the header
              row so the action is right where the user is scanning the
              list. Hidden when there are no papers yet. */}
          {papers.length > 0 && (
            <Select
              value={sortMode}
              onValueChange={v => setSortMode(v as "relevance" | "recency")}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Ranked by relevance</SelectItem>
                <SelectItem value="recency">Ranked by latest</SelectItem>
              </SelectContent>
            </Select>
          )}
          {!isApproved && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={e => {
                  onUploadPdfs(e.target.files)
                  e.currentTarget.value = ""
                }}
              />
              <span className="border-orange-product/40 text-orange-product hover:bg-orange-product-tint inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold">
                <IconUpload size={14} />
                Upload PDFs
              </span>
            </label>
          )}
        </div>
      </div>

      {papers.length === 0 ? (
        isSearching ? (
          <PhaseProgressView
            title="Searching literature"
            subtitle="Querying PubMed, arXiv, Semantic Scholar, Scholar, and the web."
            events={progressToEvents(progress ?? [])}
          />
        ) : (
          // Single-CTA empty state. Replaces the older multi-option
          // fallback the scientist flagged ("says no papers found
          // then gives 4 options"). One primary action - upload your
          // own PDFs - and one secondary - go back and tweak the
          // problem so the next search has more signal. Both
          // approve/regenerate live in PhaseActionBar which is
          // suppressed in this branch (see below).
          <div className="border-line bg-paper-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <div className="text-ink text-sm font-semibold">
              {isBusy
                ? "Searching literature…"
                : "No papers surfaced for this problem."}
            </div>
            {!isBusy && (
              <p className="text-ink-3 max-w-sm text-xs leading-relaxed">
                The literature agent couldn&apos;t find primary research
                matching your problem statement. Upload PDFs you already have,
                or revise the problem to broaden the search.
              </p>
            )}
            {!isBusy && (
              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={e => {
                      onUploadPdfs(e.target.files)
                      e.currentTarget.value = ""
                    }}
                  />
                  <span className="bg-rust text-paper inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold hover:bg-[color:var(--rust-hover)]">
                    <IconUpload size={14} />
                    Upload PDFs
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onRevise}
                  className="border-line text-ink-2 hover:bg-paper inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-xs font-semibold"
                >
                  Revise problem statement
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        (() => {
          // Sort mode controlled by the dropdown above the list.
          //   relevance → relevanceScore DESC, year DESC tiebreak
          //   recency   → year DESC,         relevanceScore DESC tiebreak
          // User-uploaded papers float to the top within a tie group.
          //
          // Papers without an explicit relevanceScore (pre-warm direct hits,
          // user-uploaded PDFs) get a fallback derived from their arrival
          // index — `1 - i/N` — so they sort in API order but DON'T all
          // collapse to a 0-tie. Without this fallback, "Ranked by relevance"
          // was a visible no-op whenever the lit-scout didn't run the LLM
          // relevance judgement, and the user couldn't see the sort working.
          const withFallbackScore = papers.map((p, i) => ({
            paper: p,
            score: p.relevanceScore ?? 1 - i / Math.max(papers.length, 1),
            year: Number(p.year) || 0
          }))
          const ranked = [...withFallbackScore]
            .sort((a, b) => {
              if (sortMode === "recency") {
                if (b.year !== a.year) return b.year - a.year
                if (b.score !== a.score) return b.score - a.score
              } else {
                if (b.score !== a.score) return b.score - a.score
                if (b.year !== a.year) return b.year - a.year
              }
              if (a.paper.userAdded !== b.paper.userAdded)
                return a.paper.userAdded ? -1 : 1
              return 0
            })
            .map(x => x.paper)
          const sourceLabel: Record<string, string> = {
            pubmed: "PubMed",
            arxiv: "arXiv",
            semantic_scholar: "Semantic Scholar",
            scholar: "Google Scholar",
            tavily: "Web",
            user: "Uploaded"
          }
          const selectedCount = ranked.filter(p => p.selected).length
          // Cap how many cards we render at once. The Paper[] from the
          // server can be up to 40; we surface the first `visibleCount`
          // and gate the rest behind the "Show more" button below the
          // list. `visiblePapers.length` is what the header displays so
          // the count matches what the user actually sees on screen.
          const visiblePapers = ranked.slice(0, visibleCount)
          const moreAvailable = visibleCount < ranked.length
          // Choose what "N searched" reflects: prefer the server-
          // reported `totalCandidates` (pre-truncation pool size,
          // typically much larger than ranked.length); fall back to
          // ranked.length when the run hasn't reported it (older
          // payloads, user-uploaded-only runs).
          const searchedTotal =
            typeof totalCandidates === "number" &&
            totalCandidates > ranked.length
              ? totalCandidates
              : ranked.length
          return (
            <div className="space-y-3">
              <div className="text-ink-3 flex items-center justify-between text-[12px]">
                <span>
                  <b className="text-ink">{visiblePapers.length}</b> of{" "}
                  <b className="text-ink">{ranked.length}</b> paper
                  {ranked.length === 1 ? "" : "s"} surfaced · ranked by{" "}
                  {sortMode === "recency" ? "latest" : "relevance"}
                  {searchedTotal > ranked.length && (
                    <>
                      {" · from "}
                      <b className="text-ink">{searchedTotal}</b> searched
                    </>
                  )}
                </span>
                {selectedCount > 0 && (
                  <span>
                    <b className="text-ink">{selectedCount}</b> selected
                  </span>
                )}
              </div>
              {visiblePapers.map((paper, idx) => (
                <div
                  key={paper.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-xl border p-4 transition-colors",
                    paper.selected
                      ? "border-ink bg-paper-2"
                      : "border-line bg-surface hover:border-line-strong"
                  )}
                >
                  <Checkbox
                    checked={paper.selected}
                    onCheckedChange={() => onTogglePaper(paper.id)}
                    className="mt-1"
                    disabled={isApproved || !canEdit}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Card layout per issue #15: an explicit, labelled
                        sequence (Paper / Authors / Year / Summary / Source
                        / Link) so the scientist can scan each field at a
                        glance instead of decoding a meta-line of dots. */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-rust font-mono text-[11px] font-semibold">
                        #{idx + 1}
                      </span>
                      <h4 className="text-ink flex-1 text-[14px] font-semibold leading-snug">
                        {paper.title}
                      </h4>
                    </div>
                    {(() => {
                      const authorList = paper.authors ?? []
                      const authorStr =
                        authorList.length === 0
                          ? ""
                          : authorList.length <= 5
                            ? authorList.join(", ")
                            : `${authorList.slice(0, 5).join(", ")} et al.`
                      return authorStr ? (
                        <p className="text-ink-2 mt-1.5 text-[12px]">
                          <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
                            Authors
                          </span>
                          {authorStr}
                        </p>
                      ) : null
                    })()}
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
                      {paper.userAdded
                        ? "Uploaded by you"
                        : paper.source
                          ? (sourceLabel[paper.source] ?? paper.source)
                          : "Unknown"}
                    </p>
                    {paper.sourceUrl && (
                      <p className="mt-1 text-[12px]">
                        <span className="text-ink-3 mr-1.5 font-mono text-[10.5px] uppercase tracking-wide">
                          Link
                        </span>
                        <a
                          href={paper.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-rust inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline"
                        >
                          {paper.sourceUrl
                            .replace(/^https?:\/\//, "")
                            .slice(0, 80)}
                          {" ↗"}
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(() => {
                      const isSaved = savedPaperIds.has(paper.id)
                      return (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={e => {
                            e.stopPropagation()
                            if (!isSaved) onSavePaper(paper)
                          }}
                          className={
                            isSaved ? "text-rust" : "text-ink-3 hover:text-rust"
                          }
                          title={
                            isSaved
                              ? "Saved to this design's library"
                              : "Save to this design's library"
                          }
                        >
                          {isSaved ? (
                            <IconBookmarkFilled size={14} />
                          ) : (
                            <IconBookmark size={14} />
                          )}
                        </Button>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      )}

      {/* PhaseActionBar suppressed entirely in the no-papers branch -
          there's nothing to approve or regenerate, so showing it just
          adds dead buttons next to the empty-state CTA. Rendered as
          soon as the search has produced at least one paper.

          The secondary "Show more" button paginates the already-
          ranked pool by PAGE_SIZE (= 10) per click. Hidden once every
          paper is on screen so the user isn't left clicking a
          dead-end button. */}
      {papers.length > 0 && (
        <PhaseActionBar
          onApprove={onApproveAndGenerate}
          approveLabel="Approve & Generate Hypotheses"
          approveDisabled={!canGenerate || !canEdit}
          onRegenerate={secondaryActionHandler}
          regenerateLabel={secondaryActionLabel}
          regenerateIcon={
            morePaperFinderUnshown ? (
              <IconPlus size={14} />
            ) : (
              <IconRefresh size={14} />
            )
          }
          isBusy={isBusy}
          isApproved={isApproved}
        />
      )}
    </div>
  )
}

function HypothesesTab(props: {
  hypotheses: Hypothesis[]
  papers: Paper[]
  onToggle: (id: string) => void
  /** Persist scientist-edited hypothesis text (#2). */
  onEdit: (id: string, nextText: string) => void
  onApproveAndGenerate: () => void
  onRegenerate: () => void
  canGenerate: boolean
  isApproved: boolean
  canEdit: boolean
  isBusy: boolean
  isGenerating?: boolean
  progress?: PhaseProgress[]
  onRevise: () => void
  /** Set when the last generation attempt failed, so the empty state can show
   *  an accurate "generation failed — retry" message instead of the
   *  misleading "approve literature" prompt. */
  genError?: string | null
}) {
  const {
    hypotheses,
    papers,
    onToggle,
    onEdit,
    onApproveAndGenerate,
    onRegenerate,
    canGenerate,
    isApproved,
    canEdit,
    isBusy,
    isGenerating,
    progress,
    onRevise,
    genError
  } = props

  const paperById = useMemo(() => {
    const m = new Map<string, Paper>()
    for (const p of papers) m.set(p.id, p)
    return m
  }, [papers])

  const selectedCount = hypotheses.filter(h => h.selected).length

  return (
    <div className="space-y-4">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Hypotheses"
        onRevise={onRevise}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-purple-persona text-sm font-bold uppercase tracking-widest">
            Review &amp; select hypotheses
          </h3>
          <p className="text-ink-500 mt-0.5 text-xs">
            {isApproved
              ? "Hypotheses approved. The selected hypotheses were used to generate experiment designs."
              : "Review the hypotheses below and select one or more to carry into experimental design."}
          </p>
          {!isApproved && (
            <p className="text-ink-400 mt-1 text-[11px] italic">
              Tip: choose <b>at least 1 hypothesis</b> (or several) — your picks
              drive the design that gets generated next.
            </p>
          )}
        </div>
        {hypotheses.length > 0 && (
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              selectedCount > 0
                ? "border-purple-persona bg-purple-persona-tint text-purple-persona"
                : "border-ink-200 text-ink-500"
            )}
          >
            {selectedCount} of {hypotheses.length} selected
          </span>
        )}
      </div>

      {hypotheses.length === 0 ? (
        isGenerating ? (
          <PhaseProgressView
            accentClass="border-purple-persona/30 bg-purple-persona-tint"
            title="Generating hypotheses"
            subtitle="Five generation agents, then rank, reflect, evolve, and meta-review."
            events={progress ?? []}
          />
        ) : genError ? (
          <div className="space-y-3 rounded-xl border border-dashed border-red-300 bg-red-50 p-8 text-center">
            <p className="text-[13px] font-semibold text-red-700">
              Hypothesis generation didn&apos;t complete
            </p>
            <p className="text-[12px] text-red-600">{genError}</p>
            <p className="text-ink-500 text-[11.5px]">
              This is usually a transient hiccup — your literature is still
              approved. Try generating again.
            </p>
            <Button
              onClick={onRegenerate}
              disabled={isBusy}
              className="bg-purple-persona hover:bg-purple-persona/90 text-white"
            >
              <IconRefresh size={14} className="mr-1.5" />
              Try again
            </Button>
          </div>
        ) : (
          <div className="border-purple-persona/30 bg-purple-persona-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
            {isBusy
              ? "Generating hypotheses..."
              : "No hypotheses yet. Approve Literature to generate hypotheses."}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {hypotheses.map((h, hi) => (
            <div
              key={h.id}
              className="border-ink-200 flex items-start gap-3 rounded-xl border bg-white p-4"
            >
              <Checkbox
                checked={h.selected}
                onCheckedChange={() => onToggle(h.id)}
                className="mt-1"
                disabled={isApproved || !canEdit}
              />
              <div className="min-w-0 flex-1">
                {/* Issue #27 - render an auto-generated short title above
                    the full hypothesis text. `autoTitleFromHypothesis`
                    picks the first ~6 words so the scientist can scan a
                    list of hypotheses at a glance, then the full text
                    follows in EditableHypothesis. */}
                <div className="text-purple-persona mb-1 text-[12px] font-bold uppercase tracking-wide">
                  Hypothesis #{hi + 1}: {autoTitleFromHypothesis(h.text)}
                </div>
                <EditableHypothesis
                  text={h.text}
                  disabled={isApproved || !canEdit}
                  onSave={next => onEdit(h.id, next)}
                />
                {/* Cited-from chips: surface paper titles inline so the user
                    sees the evidence chain without opening the popover. */}
                {h.basedOnPaperIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                      Cited from
                    </span>
                    {h.basedOnPaperIds.slice(0, 3).map(pid => {
                      const paper = paperById.get(pid)
                      const label = paper?.title
                        ? paper.title.length > 60
                          ? `${paper.title.slice(0, 60)}…`
                          : paper.title
                        : `Reference ${pid}`
                      return (
                        <span
                          key={pid}
                          title={paper?.title ?? pid}
                          className="text-ink-700 border-ink-200 bg-ink-50 inline-flex max-w-[220px] truncate rounded-full border px-2 py-0.5 text-[10.5px]"
                        >
                          {label}
                        </span>
                      )
                    })}
                    {h.basedOnPaperIds.length > 3 && (
                      <span className="text-ink-400 text-[10.5px]">
                        +{h.basedOnPaperIds.length - 3} more
                      </span>
                    )}
                  </div>
                )}
                {/* Reasoning rendered inline so the user sees the "why"
                    without clicking. We split on blank lines so multi-
                    paragraph reasoning (premise → mechanism → prediction)
                    stays legible. Long reasoning is collapsed with a
                    "Show more" toggle to keep the list scannable. */}
                <ReasoningInline reasoning={h.reasoning ?? ""} />

                {/* "Based on" papers - full citation block - stays behind
                    a popover since the inline chips already surface the
                    paper names. The popover gives authors / year / journal /
                    source link without dominating the card. */}
                {h.basedOnPaperIds.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-purple-persona hover:bg-purple-persona-tint mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold">
                        <IconInfoCircle size={13} />
                        Reference details
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 text-xs">
                      <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                        Based on
                      </div>
                      <ul className="mt-1 space-y-2">
                        {h.basedOnPaperIds.map(pid => {
                          const paper = paperById.get(pid)
                          if (!paper) {
                            return (
                              <li key={pid} className="text-ink-400 italic">
                                Reference {pid} (not available)
                              </li>
                            )
                          }
                          const authorLabel =
                            paper.authors && paper.authors.length
                              ? paper.authors.length <= 3
                                ? paper.authors.join(", ")
                                : `${paper.authors.slice(0, 3).join(", ")} et al.`
                              : ""
                          const meta = [authorLabel, paper.year, paper.journal]
                            .filter(Boolean)
                            .join(" · ")
                          return (
                            <li
                              key={pid}
                              className="border-ink-100 bg-ink-50 rounded-md border p-2"
                            >
                              <div className="text-ink-900 font-semibold leading-snug">
                                {paper.title}
                              </div>
                              {meta && (
                                <div className="text-ink-500 mt-0.5 text-[10px]">
                                  {meta}
                                </div>
                              )}
                              {paper.sourceUrl && (
                                <a
                                  href={paper.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-orange-product mt-1 inline-block text-[10px] underline"
                                >
                                  Open source
                                </a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PhaseActionBar
        onApprove={onApproveAndGenerate}
        approveLabel="Approve & Generate Design"
        approveDisabled={!canGenerate || !canEdit}
        onRegenerate={hypotheses.length > 0 ? onRegenerate : undefined}
        regenerateLabel="Regenerate Hypotheses"
        isBusy={isBusy}
        isApproved={isApproved}
      />
    </div>
  )
}

/**
 * Inline editor for a single hypothesis text (#2). Click-to-edit; Save
 * persists via the parent `onSave`. Disabled when the phase is already
 * approved (text becomes plain read-only).
 */
function EditableHypothesis(props: {
  text: string
  disabled?: boolean
  onSave: (nextText: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.text)
  useEffect(() => {
    if (!editing) setDraft(props.text)
  }, [props.text, editing])
  if (!editing) {
    return (
      <div className="group flex items-start gap-1.5">
        <p className="text-ink-900 flex-1 text-sm leading-relaxed">
          {props.text}
        </p>
        {!props.disabled && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setEditing(true)
            }}
            className="text-ink-3 hover:text-ink opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Edit hypothesis"
            title="Edit"
          >
            <IconPencil size={14} />
          </button>
        )}
      </div>
    )
  }
  const trimmed = draft.trim()
  const dirty = trimmed.length > 0 && trimmed !== props.text.trim()
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onClick={e => e.stopPropagation()}
        autoFocus
        rows={3}
        className="text-ink-900 text-sm leading-relaxed"
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={e => {
            e.stopPropagation()
            setDraft(props.text)
            setEditing(false)
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!dirty}
          onClick={e => {
            e.stopPropagation()
            props.onSave(trimmed)
            setEditing(false)
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

/**
 * Renders hypothesis reasoning inline (not behind a popover). Multi-paragraph
 * reasoning (premise → mechanism → prediction) is split on blank lines. The
 * first paragraph is always visible; the rest is collapsed with a Show-more
 * toggle so the hypothesis list stays scannable.
 */
function ReasoningInline({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false)
  const paragraphs = useMemo(
    () =>
      reasoning
        .split(/\n{2,}|\r{2,}/)
        .map(s => s.trim())
        .filter(Boolean),
    [reasoning]
  )

  if (paragraphs.length === 0) return null

  const visible = expanded ? paragraphs : paragraphs.slice(0, 1)
  const hasMore = paragraphs.length > 1

  return (
    <div className="mt-2">
      <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
        Why this hypothesis
      </div>
      <div className="text-ink-700 mt-1 space-y-2 text-[12.5px] leading-relaxed">
        {visible.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-purple-persona hover:text-purple-persona/80 mt-1 text-[11px] font-semibold"
        >
          {expanded ? "Show less" : `Show ${paragraphs.length - 1} more`}
        </button>
      )}
    </div>
  )
}

function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function DesignSectionIndex(props: {
  sections: { heading: string }[]
  containerId: string
}) {
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    const container = document.getElementById(props.containerId)
    if (!container) return
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>("[data-section-id]")
    )
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) {
          setActiveId(visible[0].target.getAttribute("data-section-id") ?? "")
        }
      },
      {
        root: container,
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1]
      }
    )
    headings.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [props.containerId, props.sections])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    const container = document.getElementById(props.containerId)
    if (!el || !container) return
    const top = el.offsetTop - container.offsetTop - 16
    container.scrollTo({ top, behavior: "smooth" })
  }

  return (
    <nav className="sticky top-0 space-y-1">
      <div className="text-ink-400 mb-3 text-[10px] font-bold uppercase tracking-[0.13em]">
        On this page
      </div>
      <ul className="space-y-1">
        {props.sections.map(sec => {
          const id = `section-${slugifyHeading(sec.heading)}`
          const isActive = id === activeId
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => handleClick(id)}
                className={cn(
                  "w-full border-l-2 py-1.5 pl-3 pr-2 text-left text-xs leading-snug transition-colors",
                  isActive
                    ? "border-sage-brand text-sage-brand font-semibold"
                    : "border-ink-200 text-ink-500 hover:border-sage-brand/60 hover:text-ink-900"
                )}
              >
                {sec.heading}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function DesignSectionContent(props: {
  section: DesignSection
  index?: number
  /** When true, hovering/click reveals an Edit affordance. */
  editable?: boolean
  /** Called when the user hits Save. Resolves once persisted. */
  onSave?: (nextBody: string) => Promise<void>
}) {
  const { section, index, editable, onSave } = props
  const id = `section-${slugifyHeading(section.heading)}`

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(section.body)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Re-sync the draft any time the section body changes from outside
  // (e.g. regenerate, or another device edited it). No-op while the user is
  // actively editing so we don't stomp in-flight changes.
  useEffect(() => {
    if (!isEditing) setDraft(section.body)
  }, [section.body, isEditing])

  const enterEdit = () => {
    if (!editable || !onSave) return
    setDraft(section.body)
    setIsEditing(true)
    // Focus the textarea after the swap. Use a microtask so it's in the DOM.
    queueMicrotask(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      // Fit to content on first open.
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    })
  }

  const cancelEdit = () => {
    setDraft(section.body)
    setIsEditing(false)
  }

  const commitEdit = async () => {
    if (!onSave) return
    const next = draft.trim()
    if (next === section.body.trim()) {
      setIsEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void commitEdit()
    }
  }

  // Promote any paragraph-embedded bullet markers onto their own line so the
  // markdown renderer turns them into a real list (fixes runs that squash
  // bullets into a wall of text).
  const normalized = section.body
    .replace(/\s+([-*•])\s+(?=\S)/g, "\n$1 ")
    .replace(/\s+(\d+\.)\s+(?=\S)/g, "\n$1 ")

  return (
    <section
      id={id}
      data-section-id={id}
      className="group/section border-line scroll-mt-4 border-b pb-8 pt-1 last:border-b-0 last:pb-0"
    >
      <div className="mb-4 flex items-baseline gap-3">
        {typeof index === "number" && (
          <span className="text-ink-4 font-mono text-[12px] tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <h3 className="font-display text-ink m-0 text-[22px] font-normal leading-tight tracking-[-0.01em]">
          {section.heading}
        </h3>
        {editable && !isEditing && (
          <button
            type="button"
            onClick={enterEdit}
            className="text-ink-3 hover:text-ink hover:bg-paper-2 ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] opacity-0 transition-opacity focus:opacity-100 group-hover/section:opacity-100"
            title="Edit section"
          >
            <IconPencil size={13} /> Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-3">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = `${el.scrollHeight}px`
            }}
            onKeyDown={onTextareaKeyDown}
            spellCheck
            disabled={saving}
            className={cn(
              "border-line bg-surface text-ink focus-visible:border-rust focus-visible:ring-rust-soft w-full resize-y rounded-md border px-3 py-2.5 font-mono text-[13px] leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring",
              saving && "cursor-not-allowed opacity-60"
            )}
            placeholder="Markdown. Bold **like this**. Lists start with -, 1. - tables use | …"
            style={{ minHeight: 180 }}
          />
          <div className="text-ink-3 flex items-center gap-2 text-[12px]">
            <span>
              Markdown. Hit <Kbd>⌘</Kbd> <Kbd>⏎</Kbd> to save, <Kbd>Esc</Kbd> to
              cancel.
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={commitEdit}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        // SOP-styled markdown:
        //   - bold tags get rust-tinted ink + semibold to serve as lead-in labels
        //   - lists have roomy spacing, numbered lists use circled numerals
        //   - tables get warm-paper header + line borders
        //   - headings inside the body (H3/H4 from the prompt) are editorial
        <div
          className={cn(
            "text-ink-2 text-[14.5px] leading-[1.65]",
            "[&_p]:my-3",
            "[&_strong]:text-ink [&_strong]:font-semibold",
            "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6",
            "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
            "[&_li>p]:my-1 [&_li]:pl-1",
            "[&_h3]:font-display [&_h3]:text-ink [&_h3]:mt-6 [&_h3]:text-[18px] [&_h3]:font-normal [&_h3]:tracking-[-0.01em]",
            "[&_h4]:text-ink [&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-[14px] [&_h4]:font-semibold",
            "[&_blockquote]:border-rust [&_blockquote]:text-ink-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic",
            "[&_code]:bg-paper-2 [&_code]:text-ink [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]",
            "[&_table]:bg-surface [&_table]:border-line [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_table]:text-[12.5px]",
            "[&_thead]:bg-paper-2",
            "[&_th]:text-ink-3 [&_th]:border-line [&_th]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.08em]",
            "[&_td]:text-ink [&_td]:border-line [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
            "[&_tbody_tr:last-child_td]:border-b-0"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {normalized}
          </ReactMarkdown>
        </div>
      )}
    </section>
  )
}

/**
 * Synthesize a short tab label from the full hypothesis text. We don't ask
 * the model for a title - the user is browsing several hypotheses side by
 * side and wants something quick to scan. ~6 words is enough to recognize
 * the hypothesis without dominating the tab strip.
 */
function autoTitleFromHypothesis(text?: string): string {
  if (!text) return "Untitled"
  const cleaned = text.trim().replace(/\s+/g, " ")
  if (!cleaned) return "Untitled"
  const words = cleaned.split(" ")
  const head = words.slice(0, 6).join(" ")
  return words.length > 6 ? `${head}…` : head
}

function DesignTab(props: {
  designs: GeneratedDesign[]
  hypotheses: Hypothesis[]
  activeId: string | null
  onSelect: (id: string) => void
  activeDesign?: GeneratedDesign
  onSave: (id: string) => void
  onApproveAndContinue: () => void
  onRegenerate: () => void
  isApproved: boolean
  canEdit: boolean
  isBusy: boolean
  isGenerating?: boolean
  progress?: PhaseProgress[]
  onRevise: () => void
  designVersions?: DesignVersionSnapshot[]
  onRestoreVersion?: (versionId: string) => void
  onEditSection?: (
    designId: string,
    heading: string,
    nextBody: string
  ) => Promise<void>
}) {
  const {
    designs,
    hypotheses,
    activeId,
    onSelect,
    activeDesign,
    onSave,
    onApproveAndContinue,
    onRegenerate,
    isApproved,
    canEdit,
    isBusy,
    isGenerating,
    progress,
    onRevise,
    designVersions = [],
    onRestoreVersion,
    onEditSection
  } = props

  // Look up the hypothesis backing the active design so we can show its
  // statement under the experiment title (makes it clear what the experiment
  // is testing).
  const activeHypothesis = activeDesign
    ? hypotheses.find(h => h.id === activeDesign.hypothesisId)
    : undefined

  const scrollContainerId = "design-detail-scroll"

  return (
    <div className="space-y-4">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Experiment Design"
        onRevise={onRevise}
      />

      {designs.length === 0 ? (
        isGenerating ? (
          <>
            {/* Issue #25 - while the design is being generated, the user
                should still see the hypotheses that drove it. We pull the
                selected hypotheses from the parent and render them as a
                pinned slab above the progress view so the scientist has
                continuous context during the (often slow) generation. */}
            {hypotheses.filter(h => h.selected).length > 0 && (
              <div className="border-purple-persona/30 bg-purple-persona-tint space-y-2 rounded-xl border p-4">
                <div className="text-purple-persona text-[10.5px] font-bold uppercase tracking-widest">
                  Generating from {hypotheses.filter(h => h.selected).length}{" "}
                  hypothes
                  {hypotheses.filter(h => h.selected).length === 1
                    ? "is"
                    : "es"}
                </div>
                {hypotheses
                  .filter(h => h.selected)
                  .map((h, i) => (
                    <div
                      key={h.id}
                      className="border-purple-persona/20 rounded-lg border bg-white p-3"
                    >
                      <div className="text-purple-persona mb-1 text-[11.5px] font-bold uppercase tracking-wide">
                        Hypothesis #{i + 1}: {autoTitleFromHypothesis(h.text)}
                      </div>
                      <p className="text-ink-900 text-[13px] leading-relaxed">
                        {h.text}
                      </p>
                    </div>
                  ))}
              </div>
            )}
            <PhaseProgressView
              accentClass="border-sage-brand/30 bg-sage-brand-tint"
              title="Generating experiment designs"
              subtitle="Four phases per hypothesis: setup, materials, protocol, analysis."
              events={progress ?? []}
            />
          </>
        ) : (
          <div className="border-sage-brand/30 bg-sage-brand-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
            {isBusy
              ? "Generating experiment designs..."
              : "No designs yet. Approve Hypotheses to generate designs."}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {designs.map(d => {
              const isActive = d.id === (activeId ?? designs[0].id)
              const hyp = hypotheses.find(h => h.id === d.hypothesisId)
              const hypIdx = hyp
                ? hypotheses.findIndex(h => h.id === hyp.id) + 1
                : null
              const shortHyp = autoTitleFromHypothesis(hyp?.text)
              const tabLabel = hyp
                ? `Hypothesis #${hypIdx}: ${shortHyp}`
                : d.title
              return (
                <button
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  title={hyp?.text ?? d.title}
                  className={
                    "flex max-w-full items-center gap-2 whitespace-normal break-words rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition-colors md:max-w-[360px] " +
                    (isActive
                      ? "border-sage-brand bg-sage-brand-active text-sage-brand"
                      : "border-ink-200 text-ink-500 hover:bg-ink-100")
                  }
                >
                  <span className="min-w-0 flex-1">{tabLabel}</span>
                  {d.saved && (
                    <span
                      aria-label="Saved"
                      className="bg-sage-brand mt-0.5 inline-block size-1.5 shrink-0 rounded-full"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {activeDesign && (
            <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6">
              <aside className="hidden md:block">
                <DesignSectionIndex
                  sections={activeDesign.sections}
                  containerId={scrollContainerId}
                />
              </aside>

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
                      Experiment Design
                    </div>
                    <CardTitle
                      className="text-sage-brand mt-1 whitespace-normal break-words text-lg leading-tight"
                      title={activeDesign.title}
                    >
                      {activeDesign.title}
                    </CardTitle>
                    {activeHypothesis?.text && (
                      <div
                        className="text-ink-2 mt-2 border-l-2 border-[color:var(--rust)] pl-3 text-[13.5px] italic leading-relaxed"
                        title={activeHypothesis.text}
                      >
                        <span className="text-ink-3 mr-2 font-mono text-[11px] uppercase not-italic tracking-widest">
                          Hypothesis
                        </span>
                        {activeHypothesis.text}
                      </div>
                    )}
                  </div>
                  {/* Per-design "Check statistics" + "Make a plan" actions
                      were removed from this view. Both flows are now reached
                      via the dashboard "New design" dropdown using the
                      `check-stats` / `make-plan` modes against an existing
                      design. */}
                  {designVersions.length > 0 && onRestoreVersion && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 gap-1 text-xs"
                        >
                          <IconRefresh size={12} />v
                          {(designVersions[0]?.versionNumber ?? 0) + 1} ·
                          history
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-2">
                        <div className="text-ink-400 mb-2 px-1 text-[10px] font-bold uppercase tracking-widest">
                          Prior versions
                        </div>
                        <ul className="space-y-1">
                          {designVersions.map(v => (
                            <li key={v.id}>
                              <button
                                onClick={() => onRestoreVersion(v.id)}
                                className="hover:bg-ink-100 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs"
                              >
                                <span className="font-semibold">
                                  v{v.versionNumber}
                                </span>
                                <span className="text-ink-400">
                                  {new Date(v.createdAt).toLocaleDateString()}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className="text-ink-400 mt-2 px-1 text-[10px]">
                          Selecting a version restores it and archives the
                          current design.
                        </p>
                      </PopoverContent>
                    </Popover>
                  )}
                </CardHeader>
                <CardContent>
                  <div
                    id={scrollContainerId}
                    className="max-h-[60vh] space-y-5 overflow-auto pr-2"
                  >
                    {activeDesign.sections.map((sec, i) => (
                      <DesignSectionContent
                        key={sec.heading}
                        section={sec}
                        index={i}
                        editable={
                          !isApproved && canEdit && Boolean(onEditSection)
                        }
                        onSave={
                          onEditSection
                            ? async next =>
                                onEditSection(
                                  activeDesign.id,
                                  sec.heading,
                                  next
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>

                  <DesignActionsBar design={activeDesign} onSave={onSave} />
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <PhaseActionBar
        onApprove={onApproveAndContinue}
        approveLabel="Approve & Finalize Design"
        approveDisabled={designs.length === 0 || !canEdit}
        onRegenerate={designs.length > 0 ? onRegenerate : undefined}
        regenerateLabel="Regenerate Designs"
        isBusy={isBusy}
        isApproved={isApproved}
      />
    </div>
  )
}

function DesignActionsBar(props: {
  design: GeneratedDesign
  onSave: (id: string) => void
}) {
  const { design, onSave } = props

  // Download + Share moved out of this bar: Save is the only per-design action
  // here now. Export (Markdown / JSON / PDF) and sharing/collaborators live in
  // the top-right Share dialog so there's a single place to manage them.
  return (
    <div className="border-ink-100 mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
      <Button
        size="sm"
        onClick={() => onSave(design.id)}
        disabled={design.saved}
        className="bg-brick hover:bg-brick-hover gap-1.5"
      >
        <IconFlask size={14} />
        {design.saved ? "Saved" : "Save Design"}
      </Button>
    </div>
  )
}

function OverviewTab(props: {
  title: string
  problemStatement: string
  domain: DesignDomain | ""
  phase: DesignPhase | ""
  objective: string
  constraintMaterial: string
  constraintTime: string
  constraintEquipment: string
  variablesKnown: string
  variablesUnknown: string
  papers: Paper[]
  hypotheses: Hypothesis[]
  designs: GeneratedDesign[]
  approvedPhases: PhaseKey[]
  activeDesign?: GeneratedDesign
  onGoToTab: (key: string) => void
}) {
  const {
    title,
    problemStatement,
    domain,
    phase,
    objective,
    constraintMaterial,
    constraintTime,
    constraintEquipment,
    variablesKnown,
    variablesUnknown,
    papers,
    hypotheses,
    designs,
    approvedPhases,
    activeDesign,
    onGoToTab
  } = props

  const domainLabel =
    DESIGN_DOMAIN_OPTIONS.find(option => option.value === domain)?.label ?? ""
  const phaseLabel =
    DESIGN_PHASE_OPTIONS.find(option => option.value === phase)?.label ?? ""
  const splitLines = (value: string) =>
    value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  const knownList = splitLines(variablesKnown)
  const unknownList = splitLines(variablesUnknown)
  const constraintRows = [
    { label: "Material", value: constraintMaterial },
    { label: "Time", value: constraintTime },
    { label: "Equipment", value: constraintEquipment }
  ].filter(row => row.value.trim().length > 0)

  const selectedPapers = papers.filter(p => p.selected)
  const selectedHypotheses = hypotheses.filter(h => h.selected)
  const scrollContainerId = "overview-detail-scroll"

  const sections: { id: string; heading: string }[] = [
    { id: "section-summary", heading: "Summary" },
    { id: "section-problem", heading: "Problem & Goal" },
    { id: "section-variables", heading: "Variables & Constraints" },
    { id: "section-literature", heading: "Literature" },
    { id: "section-hypotheses", heading: "Hypotheses" },
    { id: "section-design", heading: "Experiment Design" }
  ]

  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6">
      {/* Floating section index */}
      <aside className="hidden md:block">
        <OverviewIndex sections={sections} containerId={scrollContainerId} />
      </aside>

      {/* Right scrollable content */}
      <div
        id={scrollContainerId}
        className="max-h-[calc(100vh-220px)] space-y-5 overflow-auto pr-2"
      >
        {/* Summary */}
        <section
          id="section-summary"
          data-section-id="section-summary"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
                Design Overview
              </div>
              <CardTitle className="text-ink-900 mt-1 text-xl">
                {title || "Untitled Design"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {PHASE_ORDER.filter(p => p !== "simulation").map(
                  pipelinePhase => {
                    const approved = approvedPhases.includes(pipelinePhase)
                    return (
                      <div
                        key={pipelinePhase}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                          approved
                            ? "bg-[#DDE9DF] text-[#1F4A2C]"
                            : "bg-paper-2 text-ink-3"
                        )}
                      >
                        {approved && <IconCheck size={11} />}
                        {pipelinePhase}
                      </div>
                    )
                  }
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <OverviewStat
                  label="Papers reviewed"
                  value={`${selectedPapers.length}/${papers.length}`}
                />
                <OverviewStat
                  label="Hypotheses selected"
                  value={`${selectedHypotheses.length}/${hypotheses.length}`}
                />
                <OverviewStat label="Designs" value={`${designs.length}`} />
                <OverviewStat
                  label="Saved designs"
                  value={`${designs.filter(d => d.saved).length}`}
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Problem & Objective */}
        <section
          id="section-problem"
          data-section-id="section-problem"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-teal-journey text-base font-bold uppercase tracking-widest">
                Problem & Objective
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGoToTab("problem")}
                className="text-ink-500 h-7 text-xs"
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <OverviewField label="Domain">
                  {domainLabel || "\u2014"}
                </OverviewField>
                <OverviewField label="Phase">
                  {phaseLabel || "\u2014"}
                </OverviewField>
              </div>
              {(() => {
                const statement = (problemStatement || "").trim()
                const titleForCompare = (title || "").trim()
                const showStatement =
                  statement !== "" &&
                  statement.toLowerCase() !== titleForCompare.toLowerCase()
                return showStatement ? (
                  <OverviewField label="Problem Statement">
                    {statement}
                  </OverviewField>
                ) : null
              })()}
              <OverviewField label="Objective">
                {objective || "\u2014"}
              </OverviewField>
            </CardContent>
          </Card>
        </section>

        {/* Variables & Constraints - structured */}
        <section
          id="section-variables"
          data-section-id="section-variables"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-teal-journey text-base font-bold uppercase tracking-widest">
                Variables & Constraints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-ink-400 mb-2 text-[10px] font-bold uppercase tracking-[0.13em]">
                    Known variables
                  </div>
                  {knownList.length > 0 ? (
                    <ul className="border-ink-200 divide-ink-100 divide-y overflow-hidden rounded-lg border bg-white text-sm">
                      {knownList.map((v, i) => (
                        <li
                          key={i}
                          className="text-ink-700 flex items-center gap-2 px-3 py-2"
                        >
                          <span className="text-ink-400 w-5 shrink-0 text-[11px]">
                            {i + 1}.
                          </span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-ink-400 text-xs">
                      No known variables specified.
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-ink-400 mb-2 text-[10px] font-bold uppercase tracking-[0.13em]">
                    Unknown variables
                  </div>
                  {unknownList.length > 0 ? (
                    <ul className="border-ink-200 divide-ink-100 divide-y overflow-hidden rounded-lg border bg-white text-sm">
                      {unknownList.map((v, i) => (
                        <li
                          key={i}
                          className="text-ink-700 flex items-center gap-2 px-3 py-2"
                        >
                          <span className="text-ink-400 w-5 shrink-0 text-[11px]">
                            {i + 1}.
                          </span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-ink-400 text-xs">
                      No unknown variables specified.
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <div className="text-ink-400 mb-2 text-[10px] font-bold uppercase tracking-[0.13em]">
                  Constraints
                </div>
                {constraintRows.length > 0 ? (
                  <ul className="border-ink-200 divide-ink-100 divide-y overflow-hidden rounded-lg border bg-white text-sm">
                    {constraintRows.map(row => (
                      <li
                        key={row.label}
                        className="text-ink-700 flex items-start gap-3 px-3 py-2"
                      >
                        <span className="text-ink-400 w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide">
                          {row.label}
                        </span>
                        <span>{row.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-ink-400 text-xs">
                    No constraints specified.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Literature table */}
        <section
          id="section-literature"
          data-section-id="section-literature"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-orange-product text-base font-bold uppercase tracking-widest">
                Literature ({selectedPapers.length}/{papers.length} selected)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGoToTab("literature")}
                className="text-ink-500 h-7 text-xs"
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              {papers.length === 0 ? (
                <div className="text-ink-400 text-xs">No papers yet.</div>
              ) : (
                <div className="border-ink-200 overflow-hidden rounded-lg border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-ink-50 text-ink-500 text-[10px] font-bold uppercase tracking-wide">
                      <tr>
                        <th className="w-8 px-3 py-2">#</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="w-20 px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-ink-100 divide-y bg-white">
                      {papers.map((p, i) => (
                        <tr key={p.id}>
                          <td className="text-ink-400 px-3 py-2 text-xs">
                            {i + 1}
                          </td>
                          <td className="text-ink-800 px-3 py-2">
                            <div className="font-medium">{p.title}</div>
                            {p.summary && (
                              <div className="text-ink-500 mt-0.5 line-clamp-2 text-xs">
                                {p.summary}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {p.selected ? (
                              <span className="text-orange-product bg-orange-product-tint rounded px-2 py-0.5 text-[10px] font-bold uppercase">
                                Selected
                              </span>
                            ) : (
                              <span className="text-ink-400 text-[10px]">
                                -
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Hypotheses */}
        <section
          id="section-hypotheses"
          data-section-id="section-hypotheses"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-purple-persona text-base font-bold uppercase tracking-widest">
                Hypotheses ({selectedHypotheses.length}/{hypotheses.length}{" "}
                selected)
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGoToTab("hypotheses")}
                className="text-ink-500 h-7 text-xs"
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              {hypotheses.length === 0 ? (
                <div className="text-ink-400 text-xs">No hypotheses yet.</div>
              ) : (
                <ol className="space-y-2">
                  {hypotheses.map((h, i) => (
                    <li
                      key={h.id}
                      className={cn(
                        "border-ink-200 flex items-start gap-3 rounded-lg border bg-white p-3 text-sm",
                        h.selected &&
                          "border-purple-persona bg-purple-persona-tint"
                      )}
                    >
                      <span className="text-ink-400 w-5 shrink-0 text-xs">
                        {i + 1}.
                      </span>
                      <span className="text-ink-800">{h.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Experiment Design sections */}
        <section
          id="section-design"
          data-section-id="section-design"
          className="scroll-mt-4"
        >
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sage-brand text-base font-bold uppercase tracking-widest">
                Experiment Design
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGoToTab("design")}
                className="text-ink-500 h-7 text-xs"
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              {activeDesign ? (
                <DesignCompactCard
                  design={activeDesign}
                  designCount={designs.length}
                  onOpen={() => onGoToTab("design")}
                />
              ) : (
                <div className="text-ink-400 text-xs">
                  No design generated yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

function DesignCompactCard(props: {
  design: GeneratedDesign
  designCount: number
  onOpen: () => void
}) {
  const { design, designCount, onOpen } = props
  const sectionCount = design.sections.length
  const summarySection =
    design.sections.find(s => /summary|overview/i.test(s.heading)) ??
    design.sections[0]
  const preview = summarySection
    ? summarySection.body.trim().replace(/\s+/g, " ").slice(0, 280)
    : ""
  const truncated = summarySection
    ? summarySection.body.trim().length > 280
    : false

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
            Active design {designCount > 1 ? `(1 of ${designCount})` : ""}
          </div>
          <div
            className="text-ink-900 mt-1 whitespace-normal break-words text-sm font-semibold leading-tight"
            title={design.title}
          >
            {design.title}
          </div>
        </div>
        {design.saved && (
          <span className="bg-sage-brand-tint text-sage-brand shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Saved
          </span>
        )}
      </div>

      {preview && (
        <p className="text-ink-600 text-xs leading-relaxed">
          {preview}
          {truncated ? "…" : ""}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="border-ink-200 rounded-md border bg-white px-2.5 py-1.5">
          <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
            Sections
          </div>
          <div className="text-ink-900 mt-0.5 text-sm font-semibold">
            {sectionCount}
          </div>
        </div>
        <div className="border-ink-200 rounded-md border bg-white px-2.5 py-1.5">
          <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
            Hypothesis ref
          </div>
          <div className="text-ink-900 mt-0.5 truncate text-sm font-semibold">
            {design.hypothesisId.slice(0, 10)}…
          </div>
        </div>
      </div>

      {design.sections.length > 0 && (
        <div>
          <div className="text-ink-400 mb-1.5 text-[10px] font-bold uppercase tracking-wide">
            Sections included
          </div>
          <div className="flex flex-wrap gap-1.5">
            {design.sections.map(sec => (
              <span
                key={sec.heading}
                className="border-ink-200 bg-ink-50 text-ink-600 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
              >
                {sec.heading}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpen}
          className="text-ink-700 h-8 text-xs"
        >
          Open full design
        </Button>
      </div>
    </div>
  )
}

function OverviewIndex(props: {
  sections: { id: string; heading: string }[]
  containerId: string
}) {
  const [activeId, setActiveId] = useState(props.sections[0]?.id ?? "")

  useEffect(() => {
    const container = document.getElementById(props.containerId)
    if (!container) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) {
          setActiveId(visible[0].target.getAttribute("data-section-id") ?? "")
        }
      },
      {
        root: container,
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1]
      }
    )
    props.sections.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [props.containerId, props.sections])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    const container = document.getElementById(props.containerId)
    if (!el || !container) return
    const top = el.offsetTop - container.offsetTop - 8
    container.scrollTo({ top, behavior: "smooth" })
  }

  return (
    <nav className="sticky top-0 space-y-1">
      <div className="text-ink-400 mb-3 text-[10px] font-bold uppercase tracking-[0.13em]">
        On this page
      </div>
      <ul className="space-y-1">
        {props.sections.map(sec => {
          const isActive = sec.id === activeId
          return (
            <li key={sec.id}>
              <button
                type="button"
                onClick={() => handleClick(sec.id)}
                className={cn(
                  "w-full border-l-2 py-1.5 pl-3 pr-2 text-left text-xs leading-snug transition-colors",
                  isActive
                    ? "border-teal-journey text-teal-journey font-semibold"
                    : "border-ink-200 text-ink-500 hover:border-teal-journey/60 hover:text-ink-900"
                )}
              >
                {sec.heading}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function OverviewField(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
        {props.label}
      </div>
      <div className="text-ink-700 mt-1 whitespace-pre-wrap">
        {props.children}
      </div>
    </div>
  )
}

function OverviewStat(props: { label: string; value: string }) {
  return (
    <div className="border-ink-200 rounded-xl border bg-white p-3">
      <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
        {props.label}
      </div>
      <div className="text-ink-900 mt-1 text-xl font-bold">{props.value}</div>
    </div>
  )
}
