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
import { AccentTabs } from "@/components/canvas/accent-tabs"
import { ScopedChatRail } from "@/components/canvas/scoped-chat-rail"
import { SplitRailLayout } from "@/components/canvas/split-rail-layout"
import { ChatbotUIContext } from "@/context/context"
import { useToast } from "@/app/hooks/use-toast"
import type {
  DesignContentV2,
  GeneratedDesign,
  Hypothesis,
  Paper,
  ProblemContext
} from "@/lib/design-agent"
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBulb,
  IconChartBar,
  IconClipboardText,
  IconDownload,
  IconFlask,
  IconInfoCircle,
  IconLayoutGrid,
  IconPlus,
  IconShare,
  IconSparkles,
  IconTargetArrow,
  IconTrash,
  IconUpload,
  IconX
} from "@tabler/icons-react"

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

/**
 * Agent calls run through /api/design/[designid]/generate. The server
 * persists the result into the design's `content` JSON, so the client just
 * needs to swap its state to whatever comes back.
 */
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

export default function DesignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  void profile

  const designId = params.designId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [design, setDesign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("problem")
  const [busy, setBusy] = useState<
    null | "literature" | "hypotheses" | "design" | "simulation" | "save"
  >(null)

  // Problem tab state
  const [title, setTitle] = useState("")
  const [problemStatement, setProblemStatement] = useState("")
  const [goal, setGoal] = useState("")
  const [variables, setVariables] = useState<string[]>([""])
  const [constraints, setConstraints] = useState<string[]>([""])

  // Literature tab state
  const [papers, setPapers] = useState<Paper[]>([])

  // Hypotheses tab state
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])

  // Designs + simulations state
  const [generatedDesigns, setGeneratedDesigns] = useState<GeneratedDesign[]>(
    []
  )
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null)
  const [activeSimDesignId, setActiveSimDesignId] = useState<string | null>(
    null
  )

  // Autosave debounce for Problem tab
  const problemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setGoal(problem.goal ?? "")
      setVariables(
        problem.variables && problem.variables.length > 0
          ? problem.variables
          : [""]
      )
      setConstraints(
        problem.constraints && problem.constraints.length > 0
          ? problem.constraints
          : [""]
      )

      if (content?.papers) setPapers(content.papers)
      if (content?.hypotheses) setHypotheses(content.hypotheses)
      if (content?.designs) {
        setGeneratedDesigns(content.designs)
        setActiveDesignId(content.designs[0]?.id ?? null)
        const firstSim = content.designs.find(d => d.simulation)
        if (firstSim) setActiveSimDesignId(firstSim.id)
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
    goal,
    variables: variables.filter(v => v.trim() !== ""),
    constraints: constraints.filter(c => c.trim() !== "")
  })

  // Debounced autosave for Problem tab fields.
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
  }, [title, problemStatement, goal, variables, constraints])

  // ── Problem tab helpers ───────────────────────────────────────────────
  const updateListAt = (
    list: string[],
    idx: number,
    value: string
  ): string[] => {
    const next = [...list]
    next[idx] = value
    return next
  }

  const problemValid = problemStatement.trim() !== "" && goal.trim() !== ""

  const handleStartLiteratureSearch = async () => {
    if (!problemValid) {
      toast({
        title: "Missing fields",
        description: "Problem statement and goal are required.",
        variant: "destructive"
      })
      return
    }
    setActiveTab("literature")
    if (papers.length > 0) return
    setBusy("literature")
    try {
      const content = await runAgentPhase(designId, {
        phase: "literature",
        problem: currentProblem()
      })
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

  // ── Literature tab helpers ────────────────────────────────────────────
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

  const handleGenerateHypotheses = async () => {
    if (selectedPapers.length === 0) return
    setBusy("hypotheses")
    try {
      const content = await runAgentPhase(designId, {
        phase: "hypotheses",
        problem: currentProblem(),
        papers
      })
      if (content.hypotheses) setHypotheses(content.hypotheses)
      setActiveTab("hypotheses")
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

  // ── Hypotheses tab helpers ────────────────────────────────────────────
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

  const handleGenerateDesign = async () => {
    if (selectedHypotheses.length === 0) return
    setBusy("design")
    try {
      const content = await runAgentPhase(designId, {
        phase: "design",
        problem: currentProblem(),
        hypotheses
      })
      const designs = content.designs ?? []
      setGeneratedDesigns(designs)
      setActiveDesignId(designs[0]?.id ?? null)
      setActiveTab("design")
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

  // ── Design tab helpers ────────────────────────────────────────────────
  const handleGenerateSimulation = async (targetDesignId: string) => {
    setBusy("simulation")
    try {
      const content = await runAgentPhase(designId, {
        phase: "simulation",
        problem: currentProblem(),
        designId: targetDesignId
      })
      if (content.designs) setGeneratedDesigns(content.designs)
      setActiveSimDesignId(targetDesignId)
      toast({
        title: "Simulation ready",
        description: "Review it under the Simulation tab."
      })
    } catch (error: any) {
      toast({
        title: "Simulation failed",
        description: error?.message ?? "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setBusy(null)
    }
  }

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
    if (d.simulation) {
      body.push("## Simulation")
      body.push(d.simulation.summary)
      body.push("")
      body.push(...d.simulation.metrics.map(m => `- ${m.name}: ${m.value}`))
    }
    const blob = new Blob([body.join("\n")], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${d.title.slice(0, 40).replace(/[^a-z0-9\-]+/gi, "-")}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const simulatedDesigns = useMemo(
    () => generatedDesigns.filter(d => d.simulation),
    [generatedDesigns]
  )

  const rail = (
    <ScopedChatRail
      scope="design"
      scopeId={designId}
      scopeName={design?.name ?? title}
    />
  )

  if (loading) {
    return (
      <SplitRailLayout rail={rail}>
        <div className="bg-ink-50 flex h-full items-center justify-center">
          <div className="border-ink-200 border-t-teal-journey size-8 animate-spin rounded-full border-2" />
        </div>
      </SplitRailLayout>
    )
  }

  if (!design) {
    return (
      <SplitRailLayout rail={rail}>
        <div className="bg-ink-50 flex h-full items-center justify-center">
          <p className="text-ink-400">Design not found</p>
        </div>
      </SplitRailLayout>
    )
  }

  const activeDesign =
    generatedDesigns.find(d => d.id === activeDesignId) ?? generatedDesigns[0]
  const activeSimDesign =
    simulatedDesigns.find(d => d.id === activeSimDesignId) ??
    simulatedDesigns[0]

  return (
    <SplitRailLayout rail={rail}>
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
                      Running {busy}…
                    </span>
                  )}
                </div>
                <h1 className="text-ink-900 text-xl font-bold">
                  {title || design.name || "Untitled Design"}
                </h1>
              </div>
            </div>
          </div>
        </div>

        {/* 6-tab bar */}
        <AccentTabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabs={[
            {
              key: "problem",
              label: "Problem",
              accent: "teal-journey",
              icon: <IconTargetArrow size={14} />
            },
            {
              key: "literature",
              label: "Literature Search",
              accent: "orange-product",
              icon: <IconBook size={14} />
            },
            {
              key: "hypotheses",
              label: "Hypotheses",
              accent: "purple-persona",
              icon: <IconBulb size={14} />
            },
            {
              key: "design",
              label: "Design",
              accent: "sage-brand",
              icon: <IconClipboardText size={14} />
            },
            {
              key: "simulation",
              label: "Simulation",
              accent: "teal-journey",
              icon: <IconChartBar size={14} />
            },
            {
              key: "overview",
              label: "Overview",
              accent: "neutral",
              icon: <IconLayoutGrid size={14} />
            }
          ]}
        />

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl p-6">
            {activeTab === "problem" && (
              <ProblemTab
                title={title}
                setTitle={setTitle}
                problemStatement={problemStatement}
                setProblemStatement={setProblemStatement}
                goal={goal}
                setGoal={setGoal}
                variables={variables}
                setVariables={setVariables}
                constraints={constraints}
                setConstraints={setConstraints}
                updateListAt={updateListAt}
                onStartLiteratureSearch={handleStartLiteratureSearch}
                canSubmit={problemValid}
              />
            )}

            {activeTab === "literature" && (
              <LiteratureTab
                papers={papers}
                onTogglePaper={handleTogglePaper}
                onDeletePaper={handleDeletePaper}
                onUploadPdfs={handleUploadPdfs}
                onGenerateHypotheses={handleGenerateHypotheses}
                canGenerate={selectedPapers.length > 0}
              />
            )}

            {activeTab === "hypotheses" && (
              <HypothesesTab
                hypotheses={hypotheses}
                papers={papers}
                onToggle={handleToggleHypothesis}
                onGenerateDesign={handleGenerateDesign}
                canGenerate={selectedHypotheses.length > 0}
              />
            )}

            {activeTab === "design" && (
              <DesignTab
                designs={generatedDesigns}
                activeId={activeDesignId}
                onSelect={setActiveDesignId}
                activeDesign={activeDesign}
                onGenerateSimulation={handleGenerateSimulation}
                onSave={handleSaveDesign}
                onDownload={handleDownloadDesign}
              />
            )}

            {activeTab === "simulation" && (
              <SimulationTab
                designs={simulatedDesigns}
                activeId={activeSimDesignId}
                onSelect={setActiveSimDesignId}
                activeDesign={activeSimDesign}
                onSave={handleSaveDesign}
                onDownload={handleDownloadDesign}
              />
            )}

            {activeTab === "overview" && (
              <OverviewTab
                title={title}
                problemStatement={problemStatement}
                goal={goal}
                variables={variables.filter(v => v.trim() !== "")}
                constraints={constraints.filter(c => c.trim() !== "")}
                papers={papers}
                hypotheses={hypotheses}
                designs={generatedDesigns}
              />
            )}
          </div>
        </div>
      </div>
    </SplitRailLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────

function ProblemTab(props: {
  title: string
  setTitle: (v: string) => void
  problemStatement: string
  setProblemStatement: (v: string) => void
  goal: string
  setGoal: (v: string) => void
  variables: string[]
  setVariables: (v: string[]) => void
  constraints: string[]
  setConstraints: (v: string[]) => void
  updateListAt: (list: string[], idx: number, v: string) => string[]
  onStartLiteratureSearch: () => void
  canSubmit: boolean
}) {
  const {
    title,
    setTitle,
    problemStatement,
    setProblemStatement,
    goal,
    setGoal,
    variables,
    setVariables,
    constraints,
    setConstraints,
    updateListAt,
    onStartLiteratureSearch,
    canSubmit
  } = props

  return (
    <div className="space-y-5">
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
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Goal of the Experiment Design{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="What should the design achieve — hypothesis confirmation, optimization, mechanistic insight?"
              rows={3}
            />
          </div>

          <ListInput
            label="Variables"
            items={variables}
            placeholder="e.g. Concentration (0.1–0.6%)"
            onAdd={() => setVariables([...variables, ""])}
            onRemove={idx =>
              setVariables(variables.filter((_, i) => i !== idx))
            }
            onChange={(idx, v) => setVariables(updateListAt(variables, idx, v))}
          />

          <ListInput
            label="Constraints"
            items={constraints}
            placeholder="e.g. Budget ≤ $5k; must run within 2 weeks"
            onAdd={() => setConstraints([...constraints, ""])}
            onRemove={idx =>
              setConstraints(constraints.filter((_, i) => i !== idx))
            }
            onChange={(idx, v) =>
              setConstraints(updateListAt(constraints, idx, v))
            }
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={!canSubmit}
          onClick={onStartLiteratureSearch}
          className="bg-brick hover:bg-brick-hover gap-2"
        >
          <IconSparkles size={16} />
          Start Literature Search
          <IconArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}

function ListInput(props: {
  label: string
  items: string[]
  placeholder: string
  onAdd: () => void
  onRemove: (idx: number) => void
  onChange: (idx: number, value: string) => void
}) {
  const { label, items, placeholder, onAdd, onRemove, onChange } = props
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Textarea
              value={item}
              onChange={e => onChange(idx, e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="flex-1"
            />
            {items.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(idx)}
                className="text-ink-400 hover:text-red-500"
              >
                <IconX size={16} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="gap-1"
      >
        <IconPlus size={14} />
        Add {label.toLowerCase().replace(/s$/, "")}
      </Button>
    </div>
  )
}

function LiteratureTab(props: {
  papers: Paper[]
  onTogglePaper: (id: string) => void
  onDeletePaper: (id: string) => void
  onUploadPdfs: (files: FileList | null) => void
  onGenerateHypotheses: () => void
  canGenerate: boolean
}) {
  const {
    papers,
    onTogglePaper,
    onDeletePaper,
    onUploadPdfs,
    onGenerateHypotheses,
    canGenerate
  } = props

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-orange-product text-sm font-bold uppercase tracking-widest">
            Relevant Literature
          </h3>
          <p className="text-ink-500 mt-0.5 text-xs">
            Papers surfaced by the literature agent. Select the ones to build
            hypotheses from. Add your own PDFs anytime.
          </p>
        </div>
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
      </div>

      {papers.length === 0 ? (
        <div className="border-orange-product/30 bg-orange-product-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
          No literature yet. Finish the Problem tab to kick off the search.
        </div>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDeletePaper(paper.id)}
                className="text-ink-400 hover:text-red-500"
              >
                <IconTrash size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          disabled={!canGenerate}
          onClick={onGenerateHypotheses}
          className="bg-brick hover:bg-brick-hover gap-2"
        >
          <IconBulb size={16} />
          Generate Hypotheses
          <IconArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}

function HypothesesTab(props: {
  hypotheses: Hypothesis[]
  papers: Paper[]
  onToggle: (id: string) => void
  onGenerateDesign: () => void
  canGenerate: boolean
}) {
  const { hypotheses, papers, onToggle, onGenerateDesign, canGenerate } = props

  const paperById = useMemo(() => {
    const m = new Map<string, Paper>()
    for (const p of papers) m.set(p.id, p)
    return m
  }, [papers])

  if (hypotheses.length === 0) {
    return (
      <div className="border-purple-persona/30 bg-purple-persona-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
        No hypotheses yet. Select papers in Literature Search and click Generate
        Hypotheses.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-purple-persona text-sm font-bold uppercase tracking-widest">
          Candidate Hypotheses
        </h3>
        <p className="text-ink-500 mt-0.5 text-xs">
          Select the hypotheses to carry into experimental design.
        </p>
      </div>

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
                          <li key={pid}>{paperById.get(pid)?.title ?? pid}</li>
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

      <div className="flex justify-end pt-2">
        <Button
          disabled={!canGenerate}
          onClick={onGenerateDesign}
          className="bg-brick hover:bg-brick-hover gap-2"
        >
          <IconClipboardText size={16} />
          Generate Design
          <IconArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}

function DesignTab(props: {
  designs: GeneratedDesign[]
  activeId: string | null
  onSelect: (id: string) => void
  activeDesign?: GeneratedDesign
  onGenerateSimulation: (id: string) => void
  onSave: (id: string) => void
  onDownload: (d: GeneratedDesign) => void
}) {
  const {
    designs,
    activeId,
    onSelect,
    activeDesign,
    onGenerateSimulation,
    onSave,
    onDownload
  } = props

  if (designs.length === 0) {
    return (
      <div className="border-sage-brand/30 bg-sage-brand-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
        No designs yet. Pick hypotheses in the previous tab and click Generate
        Design.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Per-hypothesis design tabs */}
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
              {d.title.length > 48 ? d.title.slice(0, 48) + "…" : d.title}
              {d.saved && (
                <span className="bg-sage-brand ml-2 inline-block size-1.5 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {activeDesign && (
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
                Experiment Design
              </div>
              <CardTitle className="text-sage-brand mt-1 text-lg">
                {activeDesign.title}
              </CardTitle>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                onClick={() => onGenerateSimulation(activeDesign.id)}
                className="bg-brick hover:bg-brick-hover gap-1.5"
              >
                <IconChartBar size={14} />
                Generate Simulation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[55vh] space-y-5 overflow-auto pr-2">
              {activeDesign.sections.map(sec => (
                <div key={sec.heading}>
                  <h4 className="text-ink-900 mb-1 text-sm font-semibold">
                    {sec.heading}
                  </h4>
                  <p className="text-ink-700 whitespace-pre-wrap text-sm leading-relaxed">
                    {sec.body}
                  </p>
                </div>
              ))}
              {activeDesign.simulation && (
                <div className="bg-teal-journey-tint border-teal-journey/20 rounded-xl border p-4">
                  <div className="text-teal-journey text-[10px] font-bold uppercase tracking-[0.13em]">
                    Simulation attached
                  </div>
                  <p className="text-ink-700 mt-1 text-xs">
                    See the Simulation tab for the full rollout.
                  </p>
                </div>
              )}
            </div>

            <DesignActionsBar
              design={activeDesign}
              onSave={onSave}
              onDownload={onDownload}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SimulationTab(props: {
  designs: GeneratedDesign[]
  activeId: string | null
  onSelect: (id: string) => void
  activeDesign?: GeneratedDesign
  onSave: (id: string) => void
  onDownload: (d: GeneratedDesign) => void
}) {
  const { designs, activeId, onSelect, activeDesign, onSave, onDownload } =
    props

  if (designs.length === 0) {
    return (
      <div className="border-teal-journey/30 bg-teal-journey-tint text-ink-500 rounded-xl border border-dashed p-8 text-center text-xs">
        No simulations yet. Run one from the Design tab to populate this view.
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
                  ? "border-teal-journey bg-teal-journey-active text-teal-journey"
                  : "border-ink-200 text-ink-500 hover:bg-ink-100")
              }
            >
              {d.title.length > 48 ? d.title.slice(0, 48) + "…" : d.title}
            </button>
          )
        })}
      </div>

      {activeDesign?.simulation && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="text-ink-400 text-[10px] font-bold uppercase tracking-[0.13em]">
              Simulation
            </div>
            <CardTitle className="text-teal-journey mt-1 text-lg">
              {activeDesign.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink-700 text-sm leading-relaxed">
              {activeDesign.simulation.summary}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {activeDesign.simulation.metrics.map(m => (
                <div
                  key={m.name}
                  className="border-ink-200 rounded-lg border bg-white p-3"
                >
                  <div className="text-ink-400 text-[10px] font-bold uppercase tracking-wide">
                    {m.name}
                  </div>
                  <div className="text-ink-900 mt-1 text-sm font-semibold">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <DesignActionsBar
              design={activeDesign}
              onSave={onSave}
              onDownload={onDownload}
            />
          </CardContent>
        </Card>
      )}
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
      // ResearchGate doesn't take a public share-compose URL; surface the
      // user's research page so they can paste. Backend slice can replace
      // with the proper API.
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
  goal: string
  variables: string[]
  constraints: string[]
  papers: Paper[]
  hypotheses: Hypothesis[]
  designs: GeneratedDesign[]
}) {
  const {
    title,
    problemStatement,
    goal,
    variables,
    constraints,
    papers,
    hypotheses,
    designs
  } = props

  const selectedPapers = papers.filter(p => p.selected)
  const selectedHypotheses = hypotheses.filter(h => h.selected)
  const withSimulation = designs.filter(d => d.simulation)

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-ink-900 text-lg">
            {title || "Untitled Design"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <OverviewSection label="Problem Statement">
            {problemStatement || "—"}
          </OverviewSection>
          <OverviewSection label="Goal">{goal || "—"}</OverviewSection>
          <OverviewSection label="Variables">
            {variables.length > 0 ? (
              <ul className="list-disc pl-5">
                {variables.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </OverviewSection>
          <OverviewSection label="Constraints">
            {constraints.length > 0 ? (
              <ul className="list-disc pl-5">
                {constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </OverviewSection>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <OverviewStat
          label="Papers reviewed"
          value={`${selectedPapers.length}/${papers.length}`}
        />
        <OverviewStat
          label="Hypotheses selected"
          value={`${selectedHypotheses.length}/${hypotheses.length}`}
        />
        <OverviewStat label="Designs generated" value={`${designs.length}`} />
        <OverviewStat
          label="Simulations"
          value={`${withSimulation.length}/${designs.length}`}
        />
      </div>
    </div>
  )
}

function OverviewSection(props: { label: string; children: React.ReactNode }) {
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
