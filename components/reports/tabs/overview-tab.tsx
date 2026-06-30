"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  IconArrowRight,
  IconExternalLink,
  IconFileText,
  IconFlask,
  IconInfoCircle,
  IconUpload
} from "@tabler/icons-react"
import { FC, ReactNode } from "react"

export type ReportTab = "overview" | "inputs" | "report"

interface OverviewTabProps {
  report: any
  fileCount: number
  generationStatus: "idle" | "generating" | "ready" | "error"
  generationError: string | null
  onGoToTab: (tab: ReportTab) => void
  /** Parent design this report was generated from (when applicable). */
  sourceDesignName?: string | null
  onOpenDesign?: () => void
}

const STATUS_COPY: Record<
  OverviewTabProps["generationStatus"],
  { label: string; tone: string }
> = {
  idle: {
    label: "Not started - fill inputs to generate",
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

// Light markdown → plain text for the poster summary boxes.
const toPlain = (s: unknown, limit = 420): string => {
  if (typeof s !== "string") return ""
  const t = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|.*\|/g, " ") // drop table rows - too dense for a poster box
    .replace(/[#>*_`]/g, "")
    .replace(/^\s*[-•]\s+/gm, "• ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return t.length > limit ? t.slice(0, limit).trimEnd() + " …" : t
}

const firstNonEmpty = (draft: any, keys: string[]): string => {
  for (const k of keys) {
    const v = toPlain(draft?.[k])
    if (v) return v
  }
  return ""
}

/** A labelled poster box. */
const PosterBox: FC<{
  label: string
  accent: string
  body: string
  children?: ReactNode
  className?: string
}> = ({ label, accent, body, children, className }) => (
  <div
    className={
      "border-ink-200 flex flex-col rounded-2xl border bg-white p-4 " +
      (className ?? "")
    }
  >
    <div
      className={
        "mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] " + accent
      }
    >
      {label}
    </div>
    {body ? (
      <p className="text-ink-700 whitespace-pre-line text-[12.5px] leading-relaxed">
        {body}
      </p>
    ) : (
      <p className="text-ink-400 text-[12.5px] italic">Not available yet.</p>
    )}
    {children}
  </div>
)

export const OverviewTab: FC<OverviewTabProps> = ({
  report,
  fileCount,
  generationStatus,
  generationError,
  onGoToTab,
  sourceDesignName,
  onOpenDesign
}) => {
  const statusMeta = STATUS_COPY[generationStatus]
  const draft = report?.report_draft ?? null
  const hasDraft = draft && typeof draft === "object"
  const chart =
    typeof report?.chart_image === "string" && report.chart_image
      ? (report.chart_image as string)
      : null

  // Poster fields, mapped from the draft section keys.
  const objective =
    toPlain(report?.description) ||
    firstNonEmpty(draft, ["aim", "introduction"])
  const design = firstNonEmpty(draft, [
    "procedure",
    "preparation",
    "material",
    "setup"
  ])
  const data = firstNonEmpty(draft, ["dataAnalysis"])
  const result = firstNonEmpty(draft, ["results", "discussion"])
  const conclusion = firstNonEmpty(draft, ["conclusion", "nextSteps"])

  const StatusRow = (
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
      {report?.source_design_id && onOpenDesign && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={onOpenDesign}
        >
          <IconFlask size={13} className="text-teal-journey" />
          {sourceDesignName || report.source_design_name || "design"}
          <IconExternalLink size={12} />
        </Button>
      )}
    </div>
  )

  // ── Poster view (a one-pager once the report has a draft) ────────────────
  if (hasDraft) {
    return (
      <div className="space-y-4">
        {StatusRow}

        <div className="border-ink-200 overflow-hidden rounded-2xl border bg-white">
          <div className="border-ink-200 from-teal-journey-tint/50 border-b bg-gradient-to-r to-transparent px-5 py-4">
            <div className="text-teal-journey text-[10px] font-bold uppercase tracking-[0.16em]">
              Report at a glance
            </div>
            <h2 className="text-ink-900 mt-0.5 text-lg font-bold leading-tight">
              {report?.name || "Report"}
            </h2>
          </div>

          <div className="space-y-3 p-4">
            <PosterBox
              label="Objective"
              accent="text-teal-journey"
              body={objective}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <PosterBox
                label="Design & method"
                accent="text-orange-product"
                body={design}
              />
              <PosterBox label="Data" accent="text-purple-persona" body={data}>
                {chart && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chart}
                    alt="Result visualization"
                    className="border-ink-200 mt-3 w-full rounded-lg border bg-white"
                  />
                )}
              </PosterBox>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <PosterBox
                label="Result"
                accent="text-sage-brand"
                body={result}
              />
              <PosterBox
                label="Conclusion"
                accent="text-brick"
                body={conclusion}
              />
            </div>
          </div>

          <div className="border-ink-200 flex items-center justify-between border-t px-5 py-3">
            <span className="text-ink-400 text-xs">
              A summary - open the full report for every section.
            </span>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => onGoToTab("report")}
            >
              <IconFileText size={14} /> Open full report
              <IconArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Pre-generation view (no draft yet) ───────────────────────────────────
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
      summary: "Pending - generate to see sections",
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
          {StatusRow}

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
