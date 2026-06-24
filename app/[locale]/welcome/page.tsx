"use client"

/**
 * First-run greeting: three intro slides about Shadow AI, then a CTA into
 * signup. Sets a `seen_welcome` cookie so returning visitors skip straight to
 * the app/auth. Middleware redirects an unauthenticated first visit here.
 */

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

import { Brand } from "@/components/ui/brand"
import { Button } from "@/components/ui/button"
import {
  IconArrowRight,
  IconChecklist,
  IconFlask,
  IconShieldCheck
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

const SLIDES = [
  {
    icon: IconFlask,
    title: "From a question to a bench-ready design",
    body: "Type a plain research question. Shadow AI builds the whole experiment — hypothesis, DOE, controls, materials, and a statistical plan — in minutes."
  },
  {
    icon: IconShieldCheck,
    title: "Rigor you can defend",
    body: "Every design is literature-backed, cited, and auditable — built to stand up in group meeting, cross-functional review, and regulatory scrutiny."
  },
  {
    icon: IconChecklist,
    title: "Built for how you actually work",
    body: "Open it after a meeting or fresh data. Design, refine it in chat, and export a protocol your bench can run today. Let's make your first one."
  }
]

const setSeen = () => {
  try {
    document.cookie = `seen_welcome=1; path=/; max-age=${60 * 60 * 24 * 365}`
  } catch {
    /* ignore */
  }
}

export default function WelcomePage() {
  const router = useRouter()
  const params = useParams() as { locale?: string }
  const locale = params.locale ?? "en"
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const Slide = SLIDES[i]
  const Icon = Slide.icon

  const next = () => {
    if (last) {
      setSeen()
      router.push(`/${locale}/signup`)
      return
    }
    setI(n => n + 1)
  }

  const skip = () => {
    setSeen()
    router.push(`/${locale}/signup`)
  }

  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-6 py-5">
        <Brand size={24} />
        <button
          type="button"
          onClick={skip}
          className="text-ink-3 hover:text-ink text-[13px]"
        >
          Skip
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="bg-rust-soft text-rust mx-auto mb-7 flex size-16 items-center justify-center rounded-2xl">
            <Icon size={30} />
          </div>
          <h1 className="font-display text-ink text-[30px] leading-tight tracking-[-0.01em]">
            {Slide.title}
          </h1>
          <p className="text-ink-2 mx-auto mt-3 max-w-sm text-[15px] leading-relaxed">
            {Slide.body}
          </p>

          {/* Dots */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Slide ${idx + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === i ? "bg-rust w-6" : "bg-line w-1.5"
                )}
              />
            ))}
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={next}
            className="mt-8 w-full max-w-xs gap-2"
          >
            {last ? "Get started" : "Next"}
            <IconArrowRight size={16} />
          </Button>

          <p className="text-ink-3 mt-4 text-[13px]">
            Already have an account?{" "}
            <Link
              href={`/${locale}/login`}
              onClick={setSeen}
              className="text-rust font-medium underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
