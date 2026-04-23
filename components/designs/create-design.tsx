"use client"

import { IconBulb, IconClipboardText, IconSparkles } from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"
import { linkDesignToProject } from "@/db/designs"
import { createDesign, updateDesign } from "@/db/designs-firestore"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * CreateDesign supports three creation modes:
 *
 *   "from-scratch"   — name only; user fills problem/literature/hypotheses/design.
 *   "from-hypothesis" — user supplies a hypothesis up front; design is seeded
 *                       with that hypothesis pre-approved so the user can
 *                       generate an experiment design immediately.
 *   "from-plan"      — user pastes a draft procedure; stored on the design
 *                       so the design-generation agent uses it as priming
 *                       context. The pipeline still fills the SOP sections.
 */
export type CreateDesignMode = "from-scratch" | "from-hypothesis" | "from-plan"

interface CreateDesignProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  projectId?: string | null
  mode?: CreateDesignMode
  /** Optional seed text from the dashboard quick-start composer. */
  initialQuery?: string
}

const MODE_COPY: Record<
  CreateDesignMode,
  {
    title: string
    subtitle: string
    icon: typeof IconSparkles
    cta: string
  }
> = {
  "from-scratch": {
    title: "New design",
    subtitle:
      "We'll walk the 5-stage flow: Problem → Literature → Hypotheses → Design.",
    icon: IconSparkles,
    cta: "Create"
  },
  "from-hypothesis": {
    title: "Design from a hypothesis",
    subtitle:
      "You supply the hypothesis; Shadow AI jumps to experiment design. Problem + Literature + Hypothesis phases are pre-approved.",
    icon: IconBulb,
    cta: "Seed and open"
  },
  "from-plan": {
    title: "Structure an existing plan",
    subtitle:
      "Paste your draft procedure. The design agent will slot it into the SOP sections and fill the gaps.",
    icon: IconClipboardText,
    cta: "Create"
  }
}

export const CreateDesign: FC<CreateDesignProps> = ({
  isOpen,
  onOpenChange,
  projectId,
  mode = "from-scratch",
  initialQuery = ""
}) => {
  const { profile, selectedWorkspace, designs, setDesigns } =
    useContext(ChatbotUIContext)
  const { setSelectedDesign } = useDesignContext()

  const router = useRouter()
  const params = useParams()

  const [name, setName] = useState("")
  const [problem, setProblem] = useState("")
  const [hypothesis, setHypothesis] = useState("")
  const [planText, setPlanText] = useState("")
  const [creating, setCreating] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    // Seed fields on open. If the user composed a query on the dashboard,
    // prefill it into the primary text field for the current mode.
    setName(initialQuery.slice(0, 80))
    setProblem(mode === "from-hypothesis" ? initialQuery : initialQuery)
    setHypothesis("")
    setPlanText("")
    setTimeout(() => nameRef.current?.focus(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode])

  if (!profile || !selectedWorkspace) return null

  const copy = MODE_COPY[mode]
  const HeaderIcon = copy.icon

  const canSubmit = (() => {
    if (creating) return false
    if (!name.trim()) return false
    if (mode === "from-hypothesis" && hypothesis.trim().length < 10)
      return false
    if (mode === "from-plan" && planText.trim().length < 20) return false
    return true
  })()

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setCreating(true)
    try {
      // 1) Create the base design row (Supabase).
      const created = await createDesign(
        {
          user_id: profile.user_id,
          name: trimmedName,
          problem: problem.trim() || trimmedName,
          description: (problem.trim() || trimmedName).slice(0, 240),
          sharing: "private" as const,
          objectives: [],
          variables: [],
          specialConsiderations: [],
          project_id: projectId ?? null
        },
        selectedWorkspace.id
      )

      if (projectId && created?.id && created.project_id !== projectId) {
        try {
          await linkDesignToProject(created.id, projectId)
          created.project_id = projectId
        } catch (err) {
          console.warn("Failed to link new design to project:", err)
        }
      }

      // 2) Mode-specific post-create seeding. For hypothesis mode, pre-seed
      //    the design content so the downstream design-detail page opens
      //    ready to generate an experiment design (problem / literature /
      //    hypotheses phases are marked approved).
      if (mode === "from-hypothesis" && created?.id) {
        const hypText = hypothesis.trim()
        const problemText = problem.trim() || trimmedName
        const seededContent = {
          schemaVersion: 2,
          approvedPhases: ["problem", "literature", "hypotheses"],
          problem: {
            title: trimmedName,
            problemStatement: problemText,
            objective: problemText,
            goal: problemText
          },
          papers: [],
          hypotheses: [
            {
              id: `h-${Date.now()}`,
              text: hypText,
              reasoning: "User-provided hypothesis.",
              basedOnPaperIds: [],
              selected: true,
              userSupplied: true
            }
          ]
        }
        try {
          await updateDesign(created.id, {
            content: JSON.stringify(seededContent)
          })
        } catch (err) {
          console.warn(
            "Failed to seed hypothesis-mode content; user can re-enter in the design:",
            err
          )
        }
      }

      if (mode === "from-plan" && created?.id) {
        // Stash the user-supplied plan on the design's problem text so the
        // generation agents pick it up as priming context. Backend prompt
        // changes can promote this to its own field later.
        const planned = planText.trim()
        const problemText = problem.trim() || trimmedName
        const seededContent = {
          schemaVersion: 2,
          approvedPhases: ["problem"],
          problem: {
            title: trimmedName,
            problemStatement: problemText,
            objective: problemText,
            goal: problemText,
            userProvidedPlan: planned
          },
          papers: [],
          hypotheses: []
        }
        try {
          await updateDesign(created.id, {
            content: JSON.stringify(seededContent)
          })
        } catch (err) {
          console.warn("Failed to seed plan-mode content:", err)
        }
      }

      setDesigns([created, ...designs])
      setSelectedDesign(created)

      const locale = (params.locale as string) ?? "en"
      const wsId = params.workspaceid as string
      router.push(`/${locale}/${wsId}/designs/${created.id}`)
    } catch (error) {
      console.error("Failed to create design:", error)
      toast.error("Failed to create design.")
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault()
      void handleCreate()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-rust-soft text-rust flex size-9 shrink-0 items-center justify-center rounded-md">
              <HeaderIcon size={18} />
            </div>
            <div className="min-w-0">
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] leading-relaxed">
                {copy.subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="design-name">Name</Label>
            <Input
              id="design-name"
              ref={nameRef}
              placeholder="e.g. Effect of pH on enzyme activity"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Problem is useful for every mode but optional for from-scratch. */}
          <div className="space-y-1.5">
            <Label htmlFor="design-problem">
              Problem statement
              {mode === "from-scratch" && (
                <span className="text-ink-3 ml-1 text-[11px] font-normal">
                  (optional — you can fill in later)
                </span>
              )}
            </Label>
            <Textarea
              id="design-problem"
              rows={2}
              placeholder="What's the research problem or question?"
              value={problem}
              onChange={e => setProblem(e.target.value)}
            />
          </div>

          {mode === "from-hypothesis" && (
            <div className="space-y-1.5">
              <Label htmlFor="design-hypothesis">
                Hypothesis <span className="text-rust">*</span>
              </Label>
              <Textarea
                id="design-hypothesis"
                rows={4}
                placeholder="State the hypothesis you want to test. Shadow AI skips hypothesis generation and jumps to experiment design from here."
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
              />
              <p className="text-ink-3 text-[11.5px]">
                Problem, Literature, and Hypothesis phases will be auto-marked
                as approved so you land on the Design stage ready to generate.
              </p>
            </div>
          )}

          {mode === "from-plan" && (
            <div className="space-y-1.5">
              <Label htmlFor="design-plan">
                Existing plan / draft procedure{" "}
                <span className="text-rust">*</span>
              </Label>
              <Textarea
                id="design-plan"
                rows={8}
                placeholder="Paste the draft protocol, SOP excerpt, or planned procedure. Bullets, numbered steps, rough tables — any structure is fine."
                value={planText}
                onChange={e => setPlanText(e.target.value)}
                className="font-mono text-[13px]"
              />
              <p className="text-ink-3 text-[11.5px]">
                The design agent will slot this into the SOP sections and
                complete the missing parts (materials math, stats, safety).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!canSubmit}
            className={cn(creating && "opacity-80")}
          >
            {creating ? "Creating…" : copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
