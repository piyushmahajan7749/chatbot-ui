"use client"

import {
  IconArrowLeft,
  IconArrowRight,
  IconFlask,
  IconLayoutGrid,
  IconMessage,
  IconReport,
  IconSparkles,
  IconX
} from "@tabler/icons-react"
import { useParams, useRouter } from "next/navigation"
import { FC, ReactNode, useState, useTransition } from "react"

import { Brand } from "@/components/ui/brand"
import { cn } from "@/lib/utils"
import { markWalkthroughViewed } from "@/app/[locale]/onboarding/walkthrough-actions"

interface WalkthroughStep {
  eyebrow: string
  title: string
  body: string
  icon: ReactNode
  /** Destination if user clicks the step's CTA button. */
  ctaPath?: (locale: string, workspaceId: string) => string
  ctaLabel?: string
}

const STEPS: WalkthroughStep[] = [
  {
    eyebrow: "Step 1",
    title: "Welcome to Shadow AI",
    body: "Your editorial research workspace. Design experiments, generate reports, and chat with every paper or design you bring in - grounded answers, citations clickable back to the source.",
    icon: <IconSparkles size={28} />
  },
  {
    eyebrow: "Step 2",
    title: "Design an experiment",
    body: "Start with a research question. The agent pipeline scouts literature, generates hypotheses, and produces a structured design - all editable, all cited.",
    icon: <IconFlask size={28} />,
    ctaPath: (locale, ws) => `/${locale}/${ws}/designs/new`,
    ctaLabel: "Try designing one"
  },
  {
    eyebrow: "Step 3",
    title: "Write a report",
    body: "Drop in your protocol, reference docs, and data files. Pick a template - documentation, sharing with your PI, or a presentation update - and Shadow AI drafts every section.",
    icon: <IconReport size={28} />,
    ctaPath: (locale, ws) => `/${locale}/${ws}/reports`,
    ctaLabel: "See reports"
  },
  {
    eyebrow: "Step 4",
    title: "Chat with your workspace",
    body: "Ask questions across everything: the whole workspace, one project, a specific design, a report, or a hand-picked set of files. Answers cite the source - click to jump back to it.",
    icon: <IconMessage size={28} />,
    ctaPath: (locale, ws) => `/${locale}/${ws}/chat`,
    ctaLabel: "Open chat"
  },
  {
    eyebrow: "Step 5",
    title: "You're set",
    body: "Everything lives under your home workspace. New designs, reports, and chats sync automatically. You can reopen this tour any time from the help menu.",
    icon: <IconLayoutGrid size={28} />
  }
]

interface WalkthroughProps {
  /** Initial open state - parent decides based on profile.viewed_walkthrough. */
  initialOpen: boolean
}

/**
 * First-run product tour. Renders as a centered overlay over the
 * dashboard the first time a user lands after onboarding. State is
 * persisted via {@link markWalkthroughViewed} on Finish OR Skip, so
 * the next visit doesn't re-prompt.
 *
 * Designed to be re-triggerable later from a Help menu (just pass
 * `initialOpen={true}` from a button click).
 */
export const Walkthrough: FC<WalkthroughProps> = ({ initialOpen }) => {
  const router = useRouter()
  const params = useParams() as { locale?: string; workspaceid?: string }
  const [open, setOpen] = useState(initialOpen)
  const [stepIdx, setStepIdx] = useState(0)
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  const step = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast = stepIdx === STEPS.length - 1

  const dismiss = () => {
    setOpen(false)
    // Persist in the background. We don't await - the user is already
    // moving on; failures just mean the tour reappears, which is fine.
    startTransition(() => {
      void markWalkthroughViewed()
    })
  }

  const handleCta = () => {
    if (!step.ctaPath || !params.locale || !params.workspaceid) return
    dismiss()
    router.push(step.ctaPath(params.locale, params.workspaceid))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="border-line bg-surface relative w-full max-w-[520px] overflow-hidden rounded-2xl border shadow-2xl">
        {/* Header strip with brand + skip */}
        <div
          className="relative flex items-center justify-between px-6 py-4"
          style={{ background: "#0E0B40" }}
        >
          <Brand size={20} className="[&_span]:text-[#F4F1EA]" />
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip walkthrough"
            className="rounded p-1.5 text-[#A3A0C2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconX size={16} />
          </button>
          {/* Decorative cyan/magenta glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-12 right-0 h-24 w-48 rounded-full opacity-50 blur-2xl"
            style={{
              background:
                "radial-gradient(closest-side, rgba(34,211,238,0.40), transparent 70%)"
            }}
          />
        </div>

        {/* Step body */}
        <div className="p-7 sm:p-8">
          <div className="bg-rust-soft text-rust mb-5 inline-flex size-12 items-center justify-center rounded-full">
            {step.icon}
          </div>
          <div className="text-ink-3 mb-1 text-[11px] font-bold uppercase tracking-[0.13em]">
            {step.eyebrow}
          </div>
          <h2 className="font-display text-ink text-[24px] font-medium leading-tight tracking-[-0.01em]">
            {step.title}
          </h2>
          <p className="text-ink-2 mt-3 text-[14px] leading-relaxed">
            {step.body}
          </p>

          {step.ctaPath && (
            <button
              type="button"
              onClick={handleCta}
              disabled={isPending}
              className="bg-rust-soft text-rust-ink border-rust-soft hover:bg-rust hover:text-paper mt-5 inline-flex h-9 items-center gap-2 rounded-md border px-4 text-[13px] font-medium transition-colors"
            >
              {step.ctaLabel}
              <IconArrowRight size={14} />
            </button>
          )}
        </div>

        {/* Footer: progress + nav */}
        <div className="border-line bg-paper-2 flex items-center justify-between border-t px-6 py-4">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === stepIdx
                    ? "bg-rust w-6"
                    : i < stepIdx
                      ? "bg-rust/40 w-2"
                      : "bg-line w-2"
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                className="text-ink-2 hover:text-ink inline-flex h-9 items-center gap-1 rounded-md px-3 text-[13px] font-medium transition-colors"
              >
                <IconArrowLeft size={14} />
                Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIdx(i => i + 1)}
                className="bg-rust text-paper inline-flex h-9 items-center gap-1 rounded-md px-4 text-[13px] font-medium transition-colors hover:bg-[color:var(--rust-hover)]"
              >
                Next
                <IconArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="bg-rust text-paper inline-flex h-9 items-center gap-1 rounded-md px-4 text-[13px] font-medium transition-colors hover:bg-[color:var(--rust-hover)]"
              >
                Get started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
