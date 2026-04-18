"use client"

import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import { IconCheck, IconLock } from "@tabler/icons-react"

export type AccentKey =
  | "teal-journey"
  | "orange-product"
  | "purple-persona"
  | "sage-brand"
  | "neutral"

export type TabStatus = "locked" | "active" | "review" | "approved"

export interface AccentTabDef {
  key: string
  label: string
  accent: AccentKey
  icon?: ReactNode
  disabled?: boolean
  status?: TabStatus
  primary?: boolean
  sublabel?: string
}

interface AccentTabsProps {
  tabs: AccentTabDef[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

const ACCENT_CLASSES: Record<
  AccentKey,
  { active: string; inactive: string; activeText: string }
> = {
  "teal-journey": {
    active:
      "bg-teal-journey-active border-teal-journey text-teal-journey shadow-sm",
    inactive: "bg-teal-journey-tint text-ink-500 hover:text-teal-journey",
    activeText: "text-teal-journey"
  },
  "orange-product": {
    active:
      "bg-orange-product-active border-orange-product text-orange-product shadow-sm",
    inactive: "bg-orange-product-tint text-ink-500 hover:text-orange-product",
    activeText: "text-orange-product"
  },
  "purple-persona": {
    active:
      "bg-purple-persona-active border-purple-persona text-purple-persona shadow-sm",
    inactive: "bg-purple-persona-tint text-ink-500 hover:text-purple-persona",
    activeText: "text-purple-persona"
  },
  "sage-brand": {
    active: "bg-sage-brand-active border-sage-brand text-sage-brand shadow-sm",
    inactive: "bg-sage-brand-tint text-ink-500 hover:text-sage-brand",
    activeText: "text-sage-brand"
  },
  neutral: {
    active: "bg-white border-ink-500 text-ink-900 shadow-sm",
    inactive: "bg-ink-50 text-ink-500 hover:text-ink-900",
    activeText: "text-ink-900"
  }
}

export function AccentTabs({
  tabs,
  activeKey,
  onChange,
  className
}: AccentTabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "border-ink-200 flex w-full items-stretch gap-3 border-b bg-white px-6 pb-3 pt-4",
        className
      )}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        const isDisabled = tab.disabled === true
        const c = ACCENT_CLASSES[tab.accent]
        const status = tab.status
        const isPrimary = tab.primary === true

        const baseBtnClasses = cn(
          "user-select-none relative flex items-center rounded-lg border-2 transition-all duration-200",
          isPrimary
            ? "h-[56px] min-w-0 flex-[1.5] justify-start gap-2 border-b-[5px] px-4 py-2"
            : "h-[50px] min-w-0 flex-[0.8] justify-center gap-2 px-3 py-2",
          isDisabled
            ? "bg-ink-100 text-ink-300 cursor-not-allowed border-transparent opacity-60"
            : isActive
              ? cn(
                  c.active,
                  isPrimary
                    ? "-translate-y-0.5 scale-[1.04] shadow-lg"
                    : "z-[2] -translate-y-0.5"
                )
              : cn(
                  c.inactive,
                  "border-black/10 hover:-translate-y-0.5 hover:scale-[1.03]",
                  isPrimary && "border-b-[5px] border-b-black/20"
                )
        )

        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) onChange(tab.key)
            }}
            className={baseBtnClasses}
          >
            {isDisabled && <IconLock size={14} className="shrink-0" />}
            {!isDisabled && tab.icon && (
              <span
                className={cn("shrink-0 opacity-80", isActive && "opacity-100")}
              >
                {tab.icon}
              </span>
            )}

            <span
              className={cn(
                "flex min-w-0 flex-1 flex-col items-start overflow-hidden leading-tight",
                !isPrimary && "items-start"
              )}
            >
              <span
                className={cn(
                  "max-w-full truncate text-[10px] font-bold uppercase tracking-[0.07em] opacity-80",
                  isActive && "opacity-100"
                )}
              >
                {tab.label}
              </span>
              {tab.sublabel && (
                <span
                  className={cn(
                    "max-w-full truncate text-[13px]",
                    isPrimary
                      ? isActive
                        ? "text-ink-900 font-extrabold"
                        : "text-ink-500 font-semibold"
                      : "text-ink-600 font-normal"
                  )}
                >
                  {tab.sublabel}
                </span>
              )}
            </span>

            {/* Status chip on the right */}
            {!isDisabled && (
              <span className="ml-auto flex shrink-0 items-center">
                {status === "approved" ? (
                  <span className="flex size-[18px] items-center justify-center rounded-full bg-current">
                    <IconCheck size={11} className="text-white" />
                  </span>
                ) : status === "review" ? (
                  <span className="size-2 animate-pulse rounded-full bg-amber-400" />
                ) : (
                  <span className="size-[18px] rounded-full border-2 border-current opacity-50" />
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function accentAccentColor(accent: AccentKey): string {
  return ACCENT_CLASSES[accent].activeText
}
