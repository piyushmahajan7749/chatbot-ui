"use client"

import { IconArrowRight } from "@tabler/icons-react"
import Link from "next/link"

import { ShadowAISVG } from "@/components/icons/chatbotui-svg"
import { Eyebrow } from "@/components/ui/typography"

export default function HomePage() {
  return (
    <div className="bg-paper flex size-full flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <ShadowAISVG scale={2.5} />
        <div className="flex flex-col items-center gap-1.5">
          <Eyebrow>Shadow AI</Eyebrow>
          <h1 className="font-display text-ink text-center text-[52px] font-normal leading-none tracking-[-0.02em]">
            Your AI research <span className="text-rust">co-scientist</span>
          </h1>
          <p className="text-ink-2 mt-2 max-w-md text-center text-[14px] leading-relaxed">
            Tools for research scientists — scope a problem, surface literature,
            generate hypotheses, and design experiments.
          </p>
        </div>
        <Link
          href="/login"
          className="bg-rust text-paper mt-2 inline-flex h-10 items-center gap-2 rounded-md px-[18px] text-[14px] font-medium transition-colors hover:bg-[color:var(--rust-hover)]"
        >
          Get started
          <IconArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}
