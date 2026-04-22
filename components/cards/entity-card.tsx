"use client"

import { cn } from "@/lib/utils"
import { IconClock } from "@tabler/icons-react"
import { ReactNode } from "react"
import type { AccentKey } from "@/components/canvas/accent-tabs"

export interface CompletionChip {
  label: string
  filled: boolean
  accent: AccentKey
}

interface EntityCardProps {
  title: string
  description?: string
  thumbnail?: ReactNode
  chips?: CompletionChip[]
  timestampLabel?: string
  timestamp?: string
  badges?: string[]
  actions?: ReactNode
  onClick?: () => void
  className?: string
}

const CHIP_FILLED_BG: Record<AccentKey, string> = {
  "teal-journey": "bg-teal-journey border-teal-journey",
  "orange-product": "bg-orange-product border-orange-product",
  "purple-persona": "bg-purple-persona border-purple-persona",
  "sage-brand": "bg-sage-brand border-sage-brand",
  neutral: "bg-ink-500 border-ink-500"
}

export function EntityCard({
  title,
  description,
  thumbnail,
  chips,
  timestampLabel,
  timestamp,
  badges,
  actions,
  onClick,
  className
}: EntityCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "border-ink-200 hover:border-teal-journey/40 group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      {thumbnail && (
        <div className="bg-teal-journey-tint flex h-20 items-center justify-center">
          {thumbnail}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            title={title}
            className="text-ink-900 line-clamp-3 min-w-0 flex-1 break-words text-sm font-bold leading-snug"
          >
            {title}
          </h3>
          {actions && (
            <div
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={e => e.stopPropagation()}
            >
              {actions}
            </div>
          )}
        </div>

        {description && (
          <p className="text-ink-500 line-clamp-2 text-xs">{description}</p>
        )}

        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.slice(0, 3).map(b => (
              <span
                key={b}
                className="bg-ink-100 text-ink-500 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              >
                {b}
              </span>
            ))}
            {badges.length > 3 && (
              <span className="bg-ink-100 text-ink-400 rounded-md px-2 py-0.5 text-[10px] font-semibold">
                +{badges.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          {chips && chips.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {chips.map(chip => (
                <span
                  key={chip.label}
                  title={`${chip.label}${chip.filled ? " — present" : " — none yet"}`}
                  className={cn(
                    "size-2.5 rounded-full border",
                    chip.filled
                      ? CHIP_FILLED_BG[chip.accent]
                      : "border-ink-200 bg-white"
                  )}
                />
              ))}
            </div>
          ) : (
            <span />
          )}

          {timestamp && (
            <div className="text-ink-400 flex items-center gap-1 text-[10px]">
              <IconClock size={11} />
              <span>
                {timestampLabel ? `${timestampLabel} ` : ""}
                {timestamp}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
