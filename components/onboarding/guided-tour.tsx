"use client"

/**
 * Interactive first-run tour that DRIVES the app — it spotlights the real
 * element on the real page and walks the user through making their first
 * design: New design → type the question → problem → continue. "Next" performs
 * the step's action (navigate / focus); the tour also AUTO-ADVANCES when the
 * user does the action themselves (e.g. clicks New design, submits the create
 * modal). Mounted once in the app layout so it survives client navigation.
 *
 * Targets are `data-tour="…"` attributes on the live elements. Activation is
 * the localStorage flag set on first run (see design-coach.setWalkthroughActive);
 * finishing/skipping clears it + marks the walkthrough viewed server-side.
 */

import {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react"
import { useParams, useRouter } from "next/navigation"

import { ChatbotUIContext } from "@/context/context"
import { markWalkthroughViewed } from "@/app/[locale]/onboarding/walkthrough-actions"
import { isWalkthroughActive, setWalkthroughActive } from "./design-coach"
import { cn } from "@/lib/utils"

type AdvanceOn = "navigate" | "manual"

interface GuidedStep {
  target: string
  title: string
  body: string
  side?: "top" | "bottom" | "left" | "right"
  /** "navigate" → advance when the NEXT target appears (user/Next acted). */
  advanceOn: AdvanceOn
  /** Action performed when the user clicks Next (drive the app for them). */
  onNext?: (ctx: { router: any; locale: string; wsId: string }) => void
  last?: boolean
}

const TOOLTIP_W = 340
const TOOLTIP_H = 190
const PAD = 10
const GAP = 14
const STEP_KEY = "sa_tour_step"

const focusTarget = (sel: string) => {
  const el = document.querySelector(sel) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => el.focus?.(), 350)
  }
}

const SCRIPT: GuidedStep[] = [
  {
    target: "[data-tour='new-design']",
    title: "Start your first experiment",
    body: "Click New design — or hit Next and I'll open it for you.",
    side: "bottom",
    advanceOn: "navigate",
    onNext: ({ router, locale, wsId }) =>
      router.push(`/${locale}/${wsId}/designs/new`)
  },
  {
    target: "[data-tour='design-question']",
    title: "Type your research question",
    body: "Put the question on your mind here, then Create. I'll turn it into a full experiment.",
    side: "top",
    advanceOn: "navigate",
    onNext: () => focusTarget("[data-tour='design-question']")
  },
  {
    target: "[data-tour='problem-statement']",
    title: "Refine your problem",
    body: "Here's your problem statement — tweak it, and set the domain + phase below.",
    side: "right",
    advanceOn: "manual",
    onNext: () => focusTarget("[data-tour='problem-statement']")
  },
  {
    target: "[data-tour='problem-continue']",
    title: "Continue when you're ready",
    body: "Click here and I'll ask a few sharp clarifying questions, then scout the literature. A guide rides along from here.",
    side: "top",
    advanceOn: "manual",
    last: true
  }
]

export function GuidedTour() {
  const router = useRouter()
  const params = useParams() as { locale?: string; workspaceid?: string }
  const { selectedWorkspace, profile } = useContext(ChatbotUIContext)
  const locale = params.locale ?? "en"
  const wsId = params.workspaceid ?? selectedWorkspace?.id ?? ""

  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const tickRef = useRef(0)

  // Activate on first run (localStorage flag set when the dashboard detects a
  // not-yet-onboarded profile). Re-check periodically (it can flip after the
  // profile loads).
  useEffect(() => {
    const sync = () => {
      const on = isWalkthroughActive()
      setActive(on)
      if (on) {
        const saved = Number(
          (typeof window !== "undefined" && localStorage.getItem(STEP_KEY)) || 0
        )
        setStepIdx(Number.isFinite(saved) ? saved : 0)
      }
    }
    sync()
    const id = setInterval(sync, 1500)
    return () => clearInterval(id)
  }, [])

  const persistStep = useCallback((i: number) => {
    try {
      localStorage.setItem(STEP_KEY, String(i))
    } catch {
      /* ignore */
    }
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    setWalkthroughActive(false)
    try {
      localStorage.removeItem(STEP_KEY)
    } catch {
      /* ignore */
    }
    void markWalkthroughViewed().catch(() => undefined)
  }, [])

  // Measure the current target + auto-advance across page/modal transitions.
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      const step = SCRIPT[stepIdx]
      if (!step) return
      const el = document.querySelector(step.target) as HTMLElement | null
      const next = SCRIPT[stepIdx + 1]
      const nextEl = next
        ? (document.querySelector(next.target) as HTMLElement | null)
        : null

      // Auto-advance: for "navigate" steps, when the current target is gone
      // and the next one has appeared, the user moved forward.
      if (step.advanceOn === "navigate" && !el && nextEl) {
        const ni = stepIdx + 1
        setStepIdx(ni)
        persistStep(ni)
        return
      }
      setRect(el ? el.getBoundingClientRect() : null)
    }
    loop()
    const interval = setInterval(loop, 500)
    const onScroll = () => {
      tickRef.current++
      loop()
    }
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    raf = requestAnimationFrame(loop)
    return () => {
      clearInterval(interval)
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [active, stepIdx, persistStep])

  if (!active || !wsId) return null
  const step = SCRIPT[stepIdx]
  if (!step) return null

  // While a "navigate" step's target isn't on screen yet (mid-transition),
  // stay invisible so we don't block the page.
  if (!rect && step.advanceOn === "navigate") return null

  const handleNext = () => {
    step.onNext?.({ router, locale, wsId })
    if (step.last) {
      finish()
      return
    }
    if (step.advanceOn === "manual") {
      const ni = Math.min(SCRIPT.length - 1, stepIdx + 1)
      setStepIdx(ni)
      persistStep(ni)
    }
    // "navigate" steps advance via the auto-advance effect.
  }

  const cutout = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2
      }
    : null

  const tooltipStyle: CSSProperties = (() => {
    if (!cutout)
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: TOOLTIP_W,
        position: "fixed"
      }
    const side = step.side ?? "bottom"
    let top = cutout.top
    let left = cutout.left
    if (side === "bottom") top = cutout.top + cutout.height + GAP
    else if (side === "top") top = cutout.top - TOOLTIP_H - GAP
    else if (side === "right") left = cutout.left + cutout.width + GAP
    else if (side === "left") left = cutout.left - TOOLTIP_W - GAP
    const vw = window.innerWidth
    const vh = window.innerHeight
    top = Math.max(8, Math.min(vh - TOOLTIP_H - 8, top))
    left = Math.max(8, Math.min(vw - TOOLTIP_W - 8, left))
    return { top, left, width: TOOLTIP_W, position: "fixed" }
  })()

  return (
    <div className="fixed inset-0 z-[80]" aria-modal="true" role="dialog">
      {cutout ? (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 top-0 bg-black/60"
            style={{ height: Math.max(0, cutout.top) }}
          />
          <div
            className="pointer-events-none fixed bg-black/60"
            style={{
              top: cutout.top,
              left: 0,
              width: Math.max(0, cutout.left),
              height: cutout.height
            }}
          />
          <div
            className="pointer-events-none fixed bg-black/60"
            style={{
              top: cutout.top,
              left: cutout.left + cutout.width,
              right: 0,
              height: cutout.height
            }}
          />
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 bg-black/60"
            style={{ top: cutout.top + cutout.height }}
          />
          <div
            className="ring-rust pointer-events-none fixed rounded-lg ring-2"
            style={{
              top: cutout.top,
              left: cutout.left,
              width: cutout.width,
              height: cutout.height
            }}
          />
        </>
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/60" />
      )}

      <div
        style={tooltipStyle}
        className="border-line bg-surface rounded-xl border p-5 shadow-2xl"
      >
        <div className="text-rust mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em]">
          Step {stepIdx + 1} of {SCRIPT.length}
        </div>
        <h3 className="font-display text-ink text-[17px] font-semibold leading-tight">
          {step.title}
        </h3>
        <p className="text-ink-2 mt-2 text-[13px] leading-relaxed">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-1.5">
          {SCRIPT.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIdx
                  ? "bg-rust w-5"
                  : i < stepIdx
                    ? "bg-rust/40 w-2"
                    : "bg-line w-2"
              )}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-ink-3 hover:text-ink text-[12.5px] font-medium"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="bg-rust text-paper inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-medium hover:bg-[color:var(--rust-hover)]"
          >
            {step.last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  )
}
