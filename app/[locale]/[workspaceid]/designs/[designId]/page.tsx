"use client"

import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import { SplitRailLayout } from "@/components/canvas/split-rail-layout"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  DESIGN_DOMAIN_OPTIONS,
  DESIGN_PHASE_OPTIONS,
  PHASE_ORDER,
  type DesignContentV2,
  type DesignDomain,
  type DesignPhase,
  type DesignSection,
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

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function DesignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile, setUserInput } = useContext(ChatbotUIContext)
  void profile

  const designId = params.designId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [design, setDesign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [busy, setBusy] = useState<
    null | "literature" | "hypotheses" | "design" | "save"
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

  // Rail toggle
  const [showRail, setShowRail] = useState(false)

  // Agent popover
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState("")

  // Autosave debounce for Problem tab
  const problemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        router.push(`/${locale}/${workspaceId}/projects`)
        return
      }
      const data = await response.json()
      setDesign(data)

      const content = parseContent(data.content)
      const problem = content?.problem ?? {}
      setTitle(problem.title ?? data.name ?? "")
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
    await fetch(`/api/design/${designId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(extra?.name !== undefined ? { name: extra.name } : {}),
        content: JSON.stringify({
          schemaVersion: 2 as const,
          ...(parseContent(design?.content) ?? {}),
          ...patch
        })
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

  const rail = (
    <ScopedChatRail
      scope="design"
      scopeId={designId}
      scopeName={design?.name ?? title}
      autoStart
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

  const activeDesign =
    generatedDesigns.find(d => d.id === activeDesignId) ?? generatedDesigns[0]

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
                  const projectId = design?.project_id
                  router.push(
                    projectId
                      ? `/${locale}/${workspaceId}/projects/${projectId}`
                      : `/${locale}/${workspaceId}/projects`
                  )
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
                Agent
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <AccentTabs
          activeKey={activeTab}
          onChange={handleTabChange}
          tabs={tabDefs}
        />

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
                  placeholder="e.g. ≤ 500 mg API; limited to in-house excipients"
                  rows={2}
                  disabled={isApproved}
                />
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
    onRevise
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
          <div className="border-orange-product/30 bg-orange-product-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
            {isBusy
              ? "Searching literature..."
              : "No literature yet. Approve the Problem tab to kick off the search."}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {papers.map(paper => (
            <div
              key={paper.id}
              className="border-ink-200 flex items-start gap-3 rounded-xl border bg-white p-4"
            >
              <Checkbox
                checked={paper.selected}
                onCheckedChange={() => onTogglePaper(paper.id)}
                className="mt-1"
                disabled={isApproved}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-ink-900 flex-1 text-sm font-semibold">
                    {paper.title}
                  </h4>
                  {paper.userAdded && (
                    <span className="bg-orange-product-tint text-orange-product rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      Uploaded
                    </span>
                  )}
                </div>
                <p className="text-ink-500 mt-1 text-xs leading-relaxed">
                  {paper.summary}
                </p>
                {paper.sourceUrl && (
                  <a
                    href={paper.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-product mt-1 inline-block text-[11px] underline"
                  >
                    View source
                  </a>
                )}
              </div>
              {!isApproved && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeletePaper(paper.id)}
                  className="text-ink-400 hover:text-red-500"
                >
                  <IconTrash size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
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

  return (
    <div className="space-y-4">
      <PhaseBanner
        isApproved={isApproved}
        phaseName="Hypotheses"
        onRevise={onRevise}
      />

      <div>
        <h3 className="text-purple-persona text-sm font-bold uppercase tracking-widest">
          Candidate Hypotheses
        </h3>
        <p className="text-ink-500 mt-0.5 text-xs">
          {isApproved
            ? "Hypotheses approved. Selected hypotheses were used to generate experiment designs."
            : "Review the hypotheses and select the ones to carry into experimental design."}
        </p>
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-purple-persona hover:bg-purple-persona-tint mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold">
                      <IconInfoCircle size={13} />
                      Why this hypothesis
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-xs">
                    <div className="space-y-2">
                      <div>
                        <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                          Reasoning
                        </div>
                        <p className="text-ink-700 mt-1">{h.reasoning}</p>
                      </div>
                      <div>
                        <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                          Based on
                        </div>
                        <ul className="text-ink-700 mt-1 list-disc space-y-0.5 pl-4">
                          {h.basedOnPaperIds.map(pid => (
                            <li key={pid}>
                              {paperById.get(pid)?.title ?? pid}
                            </li>
                          ))}
                          {h.basedOnPaperIds.length === 0 && (
                            <li className="text-ink-400 list-none">
                              No source papers attached.
                            </li>
                          )}
                        </ul>
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

function DesignSectionContent(props: { section: DesignSection }) {
  const { section } = props
  const id = `section-${slugifyHeading(section.heading)}`

  const lines = section.body.split(/\r?\n/).map(l => l.trim())
  const nonEmpty = lines.filter(l => l.length > 0)
  const allBulleted =
    nonEmpty.length > 1 && nonEmpty.every(l => /^([-*•]|\d+\.)\s+/.test(l))

  return (
    <section
      id={id}
      data-section-id={id}
      className="scroll-mt-4 border-b border-dashed border-transparent pb-6 last:border-b-0 last:pb-0"
    >
      <h3 className="text-ink-900 mb-3 text-base font-semibold">
        {section.heading}
      </h3>
      {allBulleted ? (
        <ul className="text-ink-700 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {nonEmpty.map((l, i) => (
            <li key={i}>{l.replace(/^([-*•]|\d+\.)\s+/, "")}</li>
          ))}
        </ul>
      ) : (
        <div className="text-ink-700 space-y-2 text-sm leading-relaxed">
          {section.body
            .split(/\n{2,}/)
            .map(p => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p}
              </p>
            ))}
        </div>
      )}
    </section>
  )
}

function DesignTab(props: {
  designs: GeneratedDesign[]
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
}) {
  const {
    designs,
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
    onRevise
  } = props

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
              return (
                <button
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (isActive
                      ? "border-sage-brand bg-sage-brand-active text-sage-brand"
                      : "border-ink-200 text-ink-500 hover:bg-ink-100")
                  }
                >
                  {d.title.length > 48 ? d.title.slice(0, 48) + "..." : d.title}
                  {d.saved && (
                    <span className="bg-sage-brand ml-2 inline-block size-1.5 rounded-full" />
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
                <CardHeader className="pb-3">
                  <div>
                    <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
                      Experiment Design
                    </div>
                    <CardTitle className="text-sage-brand mt-1 text-lg">
                      {activeDesign.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    id={scrollContainerId}
                    className="max-h-[60vh] space-y-5 overflow-auto pr-2"
                  >
                    {activeDesign.sections.map(sec => (
                      <DesignSectionContent key={sec.heading} section={sec} />
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
                {PHASE_ORDER.map(pipelinePhase => {
                  const approved = approvedPhases.includes(pipelinePhase)
                  return (
                    <div
                      key={pipelinePhase}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                        approved
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-ink-100 text-ink-400"
                      )}
                    >
                      {approved && <IconCheck size={11} />}
                      {pipelinePhase}
                    </div>
                  )
                })}
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
              <OverviewField label="Problem Statement">
                {problemStatement || "\u2014"}
              </OverviewField>
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
                Manage
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
                Manage
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
                Open
              </Button>
            </CardHeader>
            <CardContent>
              {activeDesign ? (
                <div className="space-y-5">
                  <div>
                    <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
                      Title
                    </div>
                    <div className="text-ink-900 mt-1 text-sm font-semibold">
                      {activeDesign.title}
                    </div>
                  </div>
                  {activeDesign.sections.map(sec => (
                    <DesignSectionContent key={sec.heading} section={sec} />
                  ))}
                </div>
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
