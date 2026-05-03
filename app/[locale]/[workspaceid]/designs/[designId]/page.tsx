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
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import { SplitRailLayout } from "@/components/canvas/split-rail-layout"
import { addPaperToLibrary } from "@/db/paper-library"
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
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBulb,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconClipboardText,
  IconDownload,
  IconFlask,
  IconInfoCircle,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShare,
  IconSparkles,
  IconTargetArrow,
  IconTrash,
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

/**
 * Build the system-prompt context for tier-3 (single-design) chat.
 *
 * Tier-3 strategy is "long-context dump" (locked decision in
 * /Users/piyush/.claude/plans/rosy-rolling-flute.md): the whole design
 * goes into the system prompt so the model has the full document and
 * doesn't have to play retrieval games on its own document.
 *
 * Hard cap at TIER3_MAX_CHARS (~75k tokens) to leave room for chat
 * history + the user's question + the model's response. If the design
 * exceeds the cap we trim the lowest-priority sections (papers,
 * unselected hypotheses) before truncating the active design body.
 */
const TIER3_MAX_CHARS = 300_000

function buildDesignChatContext(input: {
  title: string
  problemStatement: string
  objective: string
  domain: string
  phase: string
  selectedHypotheses: Hypothesis[]
  hypotheses?: Hypothesis[]
  papers?: Paper[]
  generatedDesigns?: GeneratedDesign[]
  activeDesign: GeneratedDesign | undefined
}): string {
  const lines: string[] = []
  lines.push(
    "You are Shadow AI, the scientific design assistant for this experiment. The full experiment is provided below — refer to it directly without asking the user to re-supply which design they mean. Use numeric values from the design's procedure and materials when calculations are requested."
  )

  const problemLines: string[] = []
  if (input.title) problemLines.push(`Title: ${input.title}`)
  if (input.problemStatement)
    problemLines.push(`Problem: ${input.problemStatement}`)
  if (input.objective) problemLines.push(`Objective: ${input.objective}`)
  if (input.domain) problemLines.push(`Domain: ${input.domain}`)
  if (input.phase) problemLines.push(`Phase: ${input.phase}`)
  if (problemLines.length) {
    lines.push("", "## Problem", ...problemLines)
  }

  // All hypotheses (selected first, then the rest) — full reasoning, no
  // truncation. The model needs to know what was rejected to answer
  // "why didn't we test X" questions.
  const allHyp = [
    ...input.selectedHypotheses,
    ...(input.hypotheses ?? []).filter(
      h => !input.selectedHypotheses.find(s => s.id === h.id)
    )
  ]
  if (allHyp.length) {
    lines.push("", "## Hypotheses")
    allHyp.forEach((h, i) => {
      const tag = input.selectedHypotheses.find(s => s.id === h.id)
        ? "[selected]"
        : "[not selected]"
      lines.push(`${i + 1}. ${tag} ${h.text}`)
      if (h.reasoning) lines.push(`   Reasoning: ${h.reasoning}`)
    })
  }

  if (input.papers?.length) {
    lines.push("", "## Cited literature")
    input.papers.forEach((p, i) => {
      const meta = [
        p.authors?.length ? p.authors.join(", ") : "",
        (p as any).year ?? "",
        (p as any).journal ?? ""
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(
        `${i + 1}. ${p.title}${meta ? ` — ${meta}` : ""}${
          p.sourceUrl ? ` (${p.sourceUrl})` : ""
        }`
      )
      if (p.summary) lines.push(`   ${p.summary}`)
    })
  }

  // All generated designs — the active one first, full body. Other
  // designs included as alternates so the model can compare/contrast.
  const ordered = input.activeDesign
    ? [
        input.activeDesign,
        ...(input.generatedDesigns ?? []).filter(
          d => d.id !== input.activeDesign!.id
        )
      ]
    : (input.generatedDesigns ?? [])
  ordered.forEach((d, idx) => {
    const heading =
      idx === 0
        ? `## Active design: ${d.title}`
        : `## Alternate design: ${d.title}`
    lines.push("", heading)
    d.sections.forEach(sec => {
      lines.push("", `### ${sec.heading}`)
      lines.push(sec.body.trim())
    })
  })

  let context = lines.join("\n")

  // Hard cap. If we blow past, log so we know to wire tier-3 RAG
  // fallback (PR-9-ish work — left as a known gap for now).
  if (context.length > TIER3_MAX_CHARS) {
    console.warn(
      `[design-chat-context] design content ${context.length} chars exceeds tier-3 cap ${TIER3_MAX_CHARS}; truncating. Consider RAG fallback.`
    )
    context = context.slice(0, TIER3_MAX_CHARS) + "\n\n…[truncated]"
  }

  return context
}

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
  const { profile, setUserInput } = useContext(ChatbotUIContext)
  void profile

  const designId = params.designId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [design, setDesign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Default landing tab is "problem" — newly-created designs should drop the
  // user straight into editing instead of showing the Overview placeholder.
  // Once the loader sees an `approvedPhases` list with progress past Problem,
  // the resume effect below jumps to the first non-approved phase.
  const [activeTab, setActiveTab] = useState("problem")
  const [busy, setBusy] = useState<
    | null
    | "literature"
    | "hypotheses"
    | "design"
    | "save"
    | "stats-review"
    | "make-plan"
  >(null)

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

  // Literature tab state
  const [papers, setPapers] = useState<Paper[]>([])
  const [literatureProgress, setLiteratureProgress] = useState<
    LiteratureProgress[]
  >([])

  // Hypotheses tab state
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [hypothesesProgress, setHypothesesProgress] = useState<PhaseProgress[]>(
    []
  )

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

      if (content?.papers) setPapers(content.papers)
      if (content?.hypotheses) setHypotheses(content.hypotheses)
      if (content?.designs) {
        setGeneratedDesigns(content.designs)
        setActiveDesignId(content.designs[0]?.id ?? null)
      }
      if (content?.designVersions) setDesignVersions(content.designVersions)
      if (content?.approvedPhases) setApprovedPhases(content.approvedPhases)
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
    // fetch and every phase run) — NOT the React `design` state, which can
    // be stale after an SSE phase run or a prior PATCH.
    const merged: DesignContentV2 = {
      ...latestContentRef.current,
      ...patch,
      schemaVersion: 2
    }
    latestContentRef.current = merged
    await fetch(`/api/design/${designId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(extra?.name !== undefined ? { name: extra.name } : {}),
        content: JSON.stringify(merged)
      })
    })
  }

  const currentProblem = (): ProblemContext => ({
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
    }
  })

  useEffect(() => {
    if (loading || !design) return
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
    variablesUnknown
  ])

  const problemValid =
    problemStatement.trim() !== "" &&
    objective.trim() !== "" &&
    domain !== "" &&
    phase !== ""

  // ── Approve & Generate handlers ───────────────────────────────────────

  const handleApproveAndGenerateLiterature = async () => {
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
      const content = await runPhaseStreaming(
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
    try {
      const content = await runPhaseStreaming(
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
      toast({
        title: "Hypothesis generation failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleApproveAndGenerateDesign = async () => {
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
      const content = await runPhaseStreaming(
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
    setBusy("literature")
    setLiteratureProgress([])
    try {
      const content = await runPhaseStreaming(
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
    const keep = clearDownstreamState("hypotheses")
    setBusy("hypotheses")
    setHypothesesProgress([])
    try {
      const content = await runPhaseStreaming(
        designId,
        {
          phase: "hypotheses",
          problem: currentProblem(),
          papers,
          approvedPhases: keep
        },
        ev => setHypothesesProgress(prev => [...prev, ev])
      )
      latestContentRef.current = content
      if (content.papers) setPapers(content.papers)
      if (content.hypotheses) setHypotheses(content.hypotheses)
    } catch (error: any) {
      toast({
        title: "Hypothesis generation failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRegenerateDesign = async () => {
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
      const content = await runPhaseStreaming(
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
    const keep = clearDownstreamState(phase)
    const revised = keep.filter(p => p !== phase)
    setApprovedPhases(revised)
    await persistContent({ approvedPhases: revised })
    setActiveTab(phase)
  }

  // ── Per-item toggle helpers ───────────────────────────────────────────

  const handleTogglePaper = (id: string) => {
    setPapers(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, selected: !p.selected } : p
      )
      void persistContent({ papers: next })
      return next
    })
  }

  const handleDeletePaper = (id: string) => {
    setPapers(prev => {
      const next = prev.filter(p => p.id !== id)
      void persistContent({ papers: next })
      return next
    })
  }

  /**
   * Save paper into the workspace paper library + open the source URL in a
   * new tab so the user can read / actually download. Library save is
   * fire-and-forget — failures only log; the user-visible action (open
   * URL) always runs.
   */
  const handleDownloadPaper = (paper: Paper) => {
    if (paper.sourceUrl) {
      window.open(paper.sourceUrl, "_blank", "noopener,noreferrer")
    }
    if (!workspaceId) return
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
          // Already in library — keep the toast quiet to avoid noise on
          // repeat clicks. Just a console line for observability.
          console.log("[paper-library] paper already saved:", paper.title)
        } else {
          toast({
            title: "Saved to library",
            description: `"${paper.title.slice(0, 60)}" added to workspace papers.`
          })
        }
      })
      .catch(err => {
        console.warn("[paper-library] save failed:", err)
        // Don't block the user — the URL already opened. Surface a soft
        // toast so they know the library save didn't take.
        toast({
          title: "Couldn't save to library",
          description:
            err?.message ?? "Paper opened, but workspace save failed.",
          variant: "destructive"
        })
      })
  }

  const handleUploadPdfs = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const added: Paper[] = Array.from(files)
      .filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"))
      .map((f, i) => ({
        id: `u-${Date.now()}-${i}`,
        title: f.name.replace(/\.pdf$/i, ""),
        summary:
          "Summary pending — the agentic system will analyze this upload and return a structured abstract.",
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
    setHypotheses(prev => {
      const next = prev.map(h =>
        h.id === id ? { ...h, selected: !h.selected } : h
      )
      void persistContent({ hypotheses: next })
      return next
    })
  }

  const selectedHypotheses = useMemo(
    () => hypotheses.filter(h => h.selected),
    [hypotheses]
  )

  const handleSaveDesign = async (id: string) => {
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
   * Upsert a section onto a specific generated design — adds if missing,
   * edits if present. Shares the persist+rollback path with edits.
   */
  const handleUpsertSection = async (
    targetDesignId: string,
    heading: string,
    body: string
  ) => {
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
   * to Firestore via the shared persist path. Optimistic — local state
   * flips immediately; rolls back on persist failure.
   */
  const handleEditSection = async (
    designId: string,
    heading: string,
    nextBody: string
  ) => {
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
            // the last "Save" action — keeps the Save button meaningful.
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

  const handleDownloadDesign = (d: GeneratedDesign) => {
    const body = [
      `# ${d.title}`,
      "",
      ...d.sections.flatMap(s => [`## ${s.heading}`, s.body, ""])
    ]
    const blob = new Blob([body.join("\n")], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${d.title.slice(0, 40).replace(/[^a-z0-9\-]+/gi, "-")}.md`
    a.click()
    URL.revokeObjectURL(url)
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
  const chatContextPrompt = buildDesignChatContext({
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

  const rail = (
    <ScopedChatRail
      scope="design"
      scopeId={designId}
      scopeName={design?.name ?? title}
      autoStart
      contextPrompt={chatContextPrompt}
    />
  )

  if (loading) {
    return (
      <SplitRailLayout
        rail={rail}
        showRail={showRail}
        onToggleRail={() => setShowRail(v => !v)}
      >
        <div className="bg-ink-50 flex h-full items-center justify-center">
          <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
        </div>
      </SplitRailLayout>
    )
  }

  if (!design) {
    return (
      <SplitRailLayout
        rail={rail}
        showRail={showRail}
        onToggleRail={() => setShowRail(v => !v)}
      >
        <div className="bg-ink-50 flex h-full items-center justify-center">
          <p className="text-ink-400">Design not found</p>
        </div>
      </SplitRailLayout>
    )
  }

  const handleTabChange = (key: string) => {
    if (key !== "overview") {
      const phase = key as PhaseKey
      if (getPhaseState(phase) === "locked") return
    }
    setActiveTab(key)
  }

  return (
    <SplitRailLayout
      rail={rail}
      showRail={showRail}
      onToggleRail={() => setShowRail(v => !v)}
    >
      <div className="bg-ink-50 flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="border-ink-200 shrink-0 border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Honor browser history if we have any — takes the user
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
                  {busy && (
                    <span className="bg-teal-journey-tint text-teal-journey border-teal-journey/30 rounded border px-2 py-0.5 normal-case tracking-normal">
                      Running {busy}...
                    </span>
                  )}
                </div>
                <h1 className="text-ink-900 text-xl font-bold">
                  {title || design.name || "Untitled Design"}
                </h1>
                {/* Persistent context strip — problem statement is the second
                    most important piece of context after the title and stays
                    visible across every stage of the timeline. */}
                {problemStatement?.trim() && (
                  <div
                    className="text-ink-500 mt-0.5 line-clamp-1 max-w-screen-sm text-[12.5px]"
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
            <div className="flex items-center gap-3">
              {/* Agent: toggles chat rail */}
              <button
                onClick={() => setShowRail(v => !v)}
                className={
                  "ml-2 flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-sm ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 " +
                  (showRail
                    ? "bg-ink-700 hover:bg-ink-800 ring-white/10"
                    : "from-brick to-brick-hover bg-gradient-to-r ring-white/20")
                }
              >
                <IconSparkles size={14} className="shrink-0" />
                Chat
              </button>
            </div>
          </div>
        </div>

        {/* Stage stepper — 5-stage editorial rail */}
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

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className={
              activeTab === "overview" || activeTab === "design"
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
                onApproveAndGenerate={handleApproveAndGenerateLiterature}
                canSubmit={problemValid}
                isApproved={isPhaseApproved("problem")}
                isBusy={busy === "literature"}
                onRevise={() => handleRevisePhase("problem")}
              />
            )}

            {activeTab === "literature" && (
              <LiteratureTab
                papers={papers}
                onTogglePaper={handleTogglePaper}
                onDeletePaper={handleDeletePaper}
                onUploadPdfs={handleUploadPdfs}
                onApproveAndGenerate={handleApproveAndGenerateHypotheses}
                onRegenerate={handleGenerateMoreLiterature}
                canGenerate={selectedPapers.length > 0}
                isApproved={isPhaseApproved("literature")}
                isBusy={busy === "hypotheses" || busy === "literature"}
                isSearching={busy === "literature"}
                progress={literatureProgress}
                onRevise={() => handleRevisePhase("literature")}
                onDownloadPaper={handleDownloadPaper}
              />
            )}

            {activeTab === "hypotheses" && (
              <HypothesesTab
                hypotheses={hypotheses}
                papers={papers}
                onToggle={handleToggleHypothesis}
                onApproveAndGenerate={handleApproveAndGenerateDesign}
                onRegenerate={handleRegenerateHypotheses}
                canGenerate={selectedHypotheses.length > 0}
                isApproved={isPhaseApproved("hypotheses")}
                isBusy={busy === "design" || busy === "hypotheses"}
                isGenerating={busy === "hypotheses"}
                progress={hypothesesProgress}
                onRevise={() => handleRevisePhase("hypotheses")}
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
                onDownload={handleDownloadDesign}
                onApproveAndContinue={handleApproveDesignAndContinue}
                onRegenerate={handleRegenerateDesign}
                isApproved={isPhaseApproved("design")}
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
    </SplitRailLayout>
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
  onApproveAndGenerate: () => void
  canSubmit: boolean
  isApproved: boolean
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
    onApproveAndGenerate,
    canSubmit,
    isApproved,
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
              disabled={isApproved}
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
              disabled={isApproved}
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
                disabled={isApproved}
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
                disabled={isApproved}
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
              disabled={isApproved}
            />
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
                  disabled={isApproved}
                />
                <p className="text-ink-3 text-[11.5px]">
                  Include replicates in any run / condition budget you specify —
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
                  disabled={isApproved}
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
                  disabled={isApproved}
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
                  placeholder="Variables you want to vary or control — one per line (e.g. pH 5–7, polymer concentration 0.1–0.6%)"
                  rows={3}
                  disabled={isApproved}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Unknown</Label>
                <Textarea
                  value={variablesUnknown}
                  onChange={e => setVariablesUnknown(e.target.value)}
                  placeholder="Variables you suspect matter but don't fully characterize yet — one per line"
                  rows={3}
                  disabled={isApproved}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PhaseActionBar
        onApprove={onApproveAndGenerate}
        approveLabel="Approve & Start Literature Search"
        approveDisabled={!canSubmit}
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

function progressToEvents(
  events: LiteratureProgress[]
): Array<{ step: string; message: string; detail?: string }> {
  return events.map(ev => {
    if (ev.step === "optimizing_query") {
      return {
        step: ev.step,
        message: ev.message,
        detail: ev.primaryQuery
      }
    }
    if (ev.step === "papers_found") {
      const counts = Object.entries(ev.sourceCounts ?? {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join("  ·  ")
      return {
        step: ev.step,
        message: ev.message,
        detail: counts || undefined
      }
    }
    return { step: ev.step, message: ev.message }
  })
}

function LiteratureTab(props: {
  papers: Paper[]
  onTogglePaper: (id: string) => void
  onDeletePaper: (id: string) => void
  onUploadPdfs: (files: FileList | null) => void
  onApproveAndGenerate: () => void
  onRegenerate: () => void
  canGenerate: boolean
  isApproved: boolean
  isBusy: boolean
  isSearching?: boolean
  progress?: LiteratureProgress[]
  onRevise: () => void
  /** Save the paper to the workspace paper library + trigger browser open. */
  onDownloadPaper: (paper: Paper) => void
}) {
  const {
    papers,
    onTogglePaper,
    onDeletePaper,
    onUploadPdfs,
    onApproveAndGenerate,
    onRegenerate,
    canGenerate,
    isApproved,
    isBusy,
    isSearching,
    progress,
    onRevise,
    onDownloadPaper
  } = props

  return (
    <div className="space-y-4">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Literature Search"
        onRevise={onRevise}
      />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-orange-product text-sm font-bold uppercase tracking-widest">
            Relevant Literature
          </h3>
          <p className="text-ink-500 mt-0.5 text-xs">
            {isApproved
              ? "Literature approved. These papers were used to generate hypotheses."
              : "Review the papers surfaced by the literature agent. Select the ones to build hypotheses from."}
          </p>
        </div>
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

      {papers.length === 0 ? (
        isSearching ? (
          <PhaseProgressView
            title="Searching literature"
            subtitle="Querying PubMed, arXiv, Semantic Scholar, Scholar, and the web."
            events={progressToEvents(progress ?? [])}
          />
        ) : (
          <div className="border-line bg-paper-2 text-ink-3 rounded-xl border border-dashed p-8 text-center text-xs">
            {isBusy
              ? "Searching literature..."
              : "No literature yet. Approve the Problem tab to kick off the search."}
          </div>
        )
      ) : (
        (() => {
          // Rank papers by relevance (desc), then by selected/userAdded so
          // user-added + selected items surface at the top in ties.
          const ranked = [...papers].sort((a, b) => {
            const ra = a.relevanceScore ?? 0
            const rb = b.relevanceScore ?? 0
            if (rb !== ra) return rb - ra
            if (a.userAdded !== b.userAdded) return a.userAdded ? -1 : 1
            return 0
          })
          const sourceLabel: Record<string, string> = {
            pubmed: "PubMed",
            arxiv: "arXiv",
            semantic_scholar: "Semantic Scholar",
            scholar: "Google Scholar",
            tavily: "Web",
            user: "Uploaded"
          }
          const selectedCount = ranked.filter(p => p.selected).length
          return (
            <div className="space-y-3">
              <div className="text-ink-3 flex items-center justify-between text-[12px]">
                <span>
                  <b className="text-ink">{ranked.length}</b> paper
                  {ranked.length === 1 ? "" : "s"} surfaced · ranked by
                  relevance
                </span>
                {selectedCount > 0 && (
                  <span>
                    <b className="text-ink">{selectedCount}</b> selected
                  </span>
                )}
              </div>
              {ranked.map((paper, idx) => (
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
                    disabled={isApproved}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-rust font-mono text-[11px] font-semibold">
                        #{idx + 1}
                      </span>
                      <h4 className="text-ink flex-1 text-[14px] font-semibold leading-snug">
                        {paper.title}
                      </h4>
                      {paper.userAdded ? (
                        <span className="bg-rust-soft text-rust-ink shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                          Uploaded
                        </span>
                      ) : paper.source ? (
                        <span className="bg-paper-2 text-ink-3 border-line shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                          {sourceLabel[paper.source] ?? paper.source}
                        </span>
                      ) : null}
                      {typeof paper.relevanceScore === "number" &&
                        paper.relevanceScore > 0 && (
                          <span
                            title={`Relevance ${(paper.relevanceScore * 100).toFixed(0)}%`}
                            className="text-ink-3 shrink-0 font-mono text-[10.5px]"
                          >
                            {(paper.relevanceScore * 100).toFixed(0)}% match
                          </span>
                        )}
                    </div>
                    {(() => {
                      const authorList = paper.authors ?? []
                      const authorStr =
                        authorList.length === 0
                          ? ""
                          : authorList.length <= 3
                            ? authorList.join(", ")
                            : `${authorList.slice(0, 3).join(", ")} et al.`
                      const metaParts = [
                        authorStr,
                        paper.year,
                        paper.journal
                      ].filter(Boolean)
                      return metaParts.length ? (
                        <p className="text-ink-3 mt-1 text-[11.5px]">
                          {metaParts.join(" · ")}
                        </p>
                      ) : null
                    })()}
                    {paper.summary && (
                      <p className="text-ink-2 mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed">
                        {paper.summary}
                      </p>
                    )}
                    {paper.sourceUrl && (
                      <a
                        href={paper.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-rust mt-2 inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline"
                      >
                        {paper.sourceUrl
                          .replace(/^https?:\/\//, "")
                          .slice(0, 64)}
                        {" ↗"}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {paper.sourceUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                          e.stopPropagation()
                          onDownloadPaper(paper)
                        }}
                        className="text-ink-3 hover:text-ink"
                        title="Download paper + save to workspace library"
                      >
                        <IconDownload size={14} />
                      </Button>
                    )}
                    {!isApproved && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeletePaper(paper.id)}
                        className="text-ink-3 hover:text-destructive"
                        title="Remove paper"
                      >
                        <IconTrash size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      )}

      <PhaseActionBar
        onApprove={onApproveAndGenerate}
        approveLabel="Approve & Generate Hypotheses"
        approveDisabled={!canGenerate}
        onRegenerate={papers.length > 0 ? onRegenerate : undefined}
        regenerateLabel="Generate more"
        regenerateIcon={<IconPlus size={14} />}
        isBusy={isBusy}
        isApproved={isApproved}
      />
    </div>
  )
}

function HypothesesTab(props: {
  hypotheses: Hypothesis[]
  papers: Paper[]
  onToggle: (id: string) => void
  onApproveAndGenerate: () => void
  onRegenerate: () => void
  canGenerate: boolean
  isApproved: boolean
  isBusy: boolean
  isGenerating?: boolean
  progress?: PhaseProgress[]
  onRevise: () => void
}) {
  const {
    hypotheses,
    papers,
    onToggle,
    onApproveAndGenerate,
    onRegenerate,
    canGenerate,
    isApproved,
    isBusy,
    isGenerating,
    progress,
    onRevise
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
        ) : (
          <div className="border-purple-persona/30 bg-purple-persona-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
            {isBusy
              ? "Generating hypotheses..."
              : "No hypotheses yet. Approve Literature to generate hypotheses."}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {hypotheses.map(h => (
            <div
              key={h.id}
              className="border-ink-200 flex items-start gap-3 rounded-xl border bg-white p-4"
            >
              <Checkbox
                checked={h.selected}
                onCheckedChange={() => onToggle(h.id)}
                className="mt-1"
                disabled={isApproved}
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink-900 text-sm leading-relaxed">{h.text}</p>
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-purple-persona hover:bg-purple-persona-tint mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold">
                      <IconInfoCircle size={13} />
                      Why this hypothesis
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 text-xs">
                    <div className="space-y-3">
                      <div>
                        <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                          Reasoning
                        </div>
                        {/* Render multi-paragraph reasoning legibly. The
                            model often emits a 3-paragraph structure
                            (premise → mechanism → prediction) — splitting on
                            blank lines keeps that intact. */}
                        <div className="text-ink-700 mt-1 space-y-2 leading-relaxed">
                          {(h.reasoning ?? "")
                            .split(/\n{2,}|\r{2,}/)
                            .map(s => s.trim())
                            .filter(Boolean)
                            .map((para, i) => (
                              <p key={i}>{para}</p>
                            ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                          Based on
                        </div>
                        {h.basedOnPaperIds.length === 0 ? (
                          <p className="text-ink-400 mt-1">
                            No reference paper attached.
                          </p>
                        ) : (
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
                              const meta = [
                                authorLabel,
                                paper.year,
                                paper.journal
                              ]
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
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))}
        </div>
      )}

      <PhaseActionBar
        onApprove={onApproveAndGenerate}
        approveLabel="Approve & Generate Design"
        approveDisabled={!canGenerate}
        onRegenerate={hypotheses.length > 0 ? onRegenerate : undefined}
        regenerateLabel="Regenerate Hypotheses"
        isBusy={isBusy}
        isApproved={isApproved}
      />
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
            placeholder="Markdown. Bold **like this**. Lists start with -, 1. — tables use | …"
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
 * the model for a title — the user is browsing several hypotheses side by
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
  onDownload: (d: GeneratedDesign) => void
  onApproveAndContinue: () => void
  onRegenerate: () => void
  isApproved: boolean
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
    onDownload,
    onApproveAndContinue,
    onRegenerate,
    isApproved,
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
          <PhaseProgressView
            accentClass="border-sage-brand/30 bg-sage-brand-tint"
            title="Generating experiment designs"
            subtitle="Four phases per hypothesis: setup, materials, protocol, analysis."
            events={progress ?? []}
          />
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
                        editable={!isApproved && Boolean(onEditSection)}
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

                  <DesignActionsBar
                    design={activeDesign}
                    onSave={onSave}
                    onDownload={onDownload}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <PhaseActionBar
        onApprove={onApproveAndContinue}
        approveLabel="Approve & Finalize Design"
        approveDisabled={designs.length === 0}
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
  onDownload: (d: GeneratedDesign) => void
}) {
  const { design, onSave, onDownload } = props

  const shareTo = (target: "reddit" | "researchgate") => {
    const title = encodeURIComponent(design.title)
    if (target === "reddit") {
      const url = `https://www.reddit.com/submit?title=${title}`
      window.open(url, "_blank", "noopener")
    } else {
      window.open("https://www.researchgate.net/", "_blank", "noopener")
    }
  }

  return (
    <div className="border-ink-100 mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onDownload(design)}
        className="gap-1.5"
      >
        <IconDownload size={14} />
        Download
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <IconShare size={14} />
            Share
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2" align="end">
          <button
            onClick={() => shareTo("reddit")}
            className="hover:bg-ink-100 block w-full rounded-md px-2 py-1.5 text-left text-xs"
          >
            Share on Reddit
          </button>
          <button
            onClick={() => shareTo("researchgate")}
            className="hover:bg-ink-100 block w-full rounded-md px-2 py-1.5 text-left text-xs"
          >
            Share on ResearchGate
          </button>
        </PopoverContent>
      </Popover>
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

        {/* Variables & Constraints — structured */}
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
                                —
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
