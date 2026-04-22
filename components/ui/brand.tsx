"use client"

import { FC } from "react"

import { ShadowAISVG } from "@/components/icons/chatbotui-svg"
import { cn } from "@/lib/utils"

interface BrandProps {
  /** Retained for API compatibility; the editorial brand is theme-agnostic. */
  theme?: "dark" | "light"
  size?: number
  collapsed?: boolean
  className?: string
}

/**
 * Editorial brand lockup: half-moon monogram + "Shadow." wordmark in
 * Instrument Serif, with a rust period.
 */
export const Brand: FC<BrandProps> = ({
  size = 22,
  collapsed = false,
  className
}) => {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <ShadowAISVG scale={size / 24} />
      {!collapsed && (
        <span className="font-display text-ink pt-0.5 text-[22px] leading-none tracking-[-0.01em]">
          Shadow<span className="text-rust">.</span>
        </span>
      )}
    </div>
  )
}
