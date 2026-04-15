"use client"

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

export type AccentKey =
  | "teal-journey"
  | "orange-product"
  | "purple-persona"
  | "sage-brand"
  | "neutral"

export interface AccentTabDef {
  key: string
  label: string
  accent: AccentKey
  icon?: ReactNode
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
        "border-ink-200 bg-ink-50 flex w-full gap-1 border-b px-2 pt-2",
        className
      )}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        const c = ACCENT_CLASSES[tab.accent]
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-t-xl border-t-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all",
              isActive
                ? c.active
                : cn(c.inactive, "border-transparent hover:brightness-95")
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span className="truncate">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function accentAccentColor(accent: AccentKey): string {
  return ACCENT_CLASSES[accent].activeText
}
