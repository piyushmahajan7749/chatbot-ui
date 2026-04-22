"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  IconArrowRight,
  IconFileText,
  IconInfoCircle,
  IconUpload
} from "@tabler/icons-react"
import { FC } from "react"

export type ReportTab = "overview" | "inputs" | "report"

interface OverviewTabProps {
  report: any
  fileCount: number
  generationStatus: "idle" | "generating" | "ready" | "error"
  generationError: string | null
  onGoToTab: (tab: ReportTab) => void
}

const STATUS_COPY: Record<
  OverviewTabProps["generationStatus"],
  { label: string; tone: string }
> = {
  idle: {
    label: "Not started — fill inputs to generate",
    tone: "bg-ink-50 text-ink-600 border-ink-200"
  },
  generating: {
    label: "Generating…",
    tone: "bg-amber-50 text-amber-700 border-amber-200"
  },
  ready: {
    label: "Ready",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200"
  },
  error: {
    label: "Generation failed",
    tone: "bg-red-50 text-red-700 border-red-200"
  }
}

export const OverviewTab: FC<OverviewTabProps> = ({
  report,
  fileCount,
  generationStatus,
  generationError,
  onGoToTab
}) => {
  const statusMeta = STATUS_COPY[generationStatus]
  const draft = report?.report_draft ?? null
  const hasDraft = draft && typeof draft === "object"

  const phaseCards: Array<{
    key: ReportTab
    title: string
    summary: string
    icon: React.ReactNode
    accent: string
  }> = [
    {
      key: "inputs",
      title: "Inputs",
      summary: fileCount
        ? `${fileCount} file${fileCount === 1 ? "" : "s"} attached`
        : "No files attached",
      icon: <IconUpload size={20} />,
      accent: "text-ink-900"
    },
    {
      key: "report",
      title: "Report",
      summary: hasDraft ? "Theory, method, and analysis sections" : "Pending",
      icon: <IconFileText size={20} />,
      accent: "text-teal-journey"
    }
  ]

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-teal-journey text-lg">
            Report Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                "rounded-full border px-3 py-1 text-xs font-semibold " +
                statusMeta.tone
              }
            >
              {statusMeta.label}
            </span>
            {report?.name && (
              <span className="text-ink-500 text-sm">{report.name}</span>
            )}
          </div>

          {report?.description ? (
            <div>
              <div className="text-ink-400 mb-1 text-[11px] font-bold uppercase tracking-widest">
                Objective
              </div>
              <p className="text-ink-700 text-sm leading-relaxed">
                {report.description}
              </p>
            </div>
          ) : (
            <div className="border-ink-200 flex items-start gap-2 rounded-xl border border-dashed p-3">
              <IconInfoCircle size={16} className="text-ink-400 mt-0.5" />
              <div className="text-ink-500 text-sm">
                Add an objective on the <strong>Inputs</strong> tab to describe
                what this report should cover.
              </div>
            </div>
          )}

          {generationStatus === "error" && generationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {generationError}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {phaseCards.map(card => (
          <button
            key={card.key}
            onClick={() => onGoToTab(card.key)}
            className="border-ink-200 hover:border-teal-journey hover:bg-teal-journey-tint/40 group flex items-center justify-between rounded-2xl border bg-white p-4 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={card.accent}>{card.icon}</span>
              <div>
                <div className="text-ink-900 text-sm font-semibold">
                  {card.title}
                </div>
                <div className="text-ink-500 text-xs">{card.summary}</div>
              </div>
            </div>
            <IconArrowRight
              size={16}
              className="text-ink-400 group-hover:text-teal-journey"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
