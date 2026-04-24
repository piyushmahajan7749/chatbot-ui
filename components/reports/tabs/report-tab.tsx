"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { IconRefresh, IconSparkles } from "@tabler/icons-react"
import { Maximize2 } from "lucide-react"
import { FC, useCallback, useEffect, useRef, useState } from "react"
import { ReportSection } from "./report-section"
import {
  getSectionGroups,
  getTemplate,
  ReportTemplate
} from "@/lib/report/templates"

interface ReportTabProps {
  draft: Record<string, any> | null
  chartImage: string | null
  regenerating: string | null
  onRegenerate: (sectionKey: string, feedback: string) => Promise<void>
  onEditContent: (sectionKey: string, value: string) => void
  onRegenerateChart: (feedback: string) => Promise<void>
  regeneratingChart: boolean
  onOpenPreview: () => void
  templateId?: string | null
  reportTitle?: string
}

const sectionAnchor = (key: string) => `section-${key}`

const ChartBlock: FC<{
  chartImage: string
  regeneratingChart: boolean
  onRegenerateChart: (feedback: string) => Promise<void>
}> = ({ chartImage, regeneratingChart, onRegenerateChart }) => {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState("")

  const handleSubmit = async () => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    await onRegenerateChart(trimmed)
    setFeedback("")
    setShowFeedback(false)
  }

  return (
    <div className="border-ink-100 space-y-3 rounded-xl border bg-white/70 p-4">
      <div className="flex items-center justify-between">
        <div className="text-ink-500 text-[11px] font-bold uppercase tracking-widest">
          Visualization
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowFeedback(v => !v)}
          disabled={regeneratingChart}
        >
          <IconRefresh size={14} />
          {showFeedback ? "Cancel" : "Edit chart with AI"}
        </Button>
      </div>
      <img
        src={chartImage}
        alt="Report chart"
        className="border-ink-100 max-w-full rounded-lg border"
      />
      {showFeedback && (
        <div className="border-ink-100 space-y-2 border-t pt-3">
          <Textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="How should the chart change? e.g. switch to pie chart, sort bars descending, update title"
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={regeneratingChart || !feedback.trim()}
              className="gap-1.5"
            >
              <IconSparkles size={14} />
              {regeneratingChart ? "Regenerating…" : "Regenerate with AI"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const ReportTab: FC<ReportTabProps> = ({
  draft,
  chartImage,
  regenerating,
  onRegenerate,
  onEditContent,
  onRegenerateChart,
  regeneratingChart,
  onOpenPreview,
  templateId,
  reportTitle
}) => {
  const template: ReportTemplate = getTemplate(templateId)
  const sectionGroups = getSectionGroups(template)
  const firstAnchor = sectionAnchor(template.sections[0]?.key ?? "aim")

  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeAnchor, setActiveAnchor] = useState<string>(firstAnchor)

  const handleJump = useCallback((anchor: string) => {
    const container = scrollRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(
      `[data-anchor="${anchor}"]`
    )
    if (!target) return
    const top = target.offsetTop - 12
    container.scrollTo({ top, behavior: "smooth" })
    setActiveAnchor(anchor)
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-anchor]")
      )
      if (!nodes.length) return
      const threshold = container.scrollTop + 48
      let current = nodes[0].dataset.anchor || ""
      for (const node of nodes) {
        if (node.offsetTop <= threshold) {
          current = node.dataset.anchor || current
        } else {
          break
        }
      }
      if (current) setActiveAnchor(current)
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => container.removeEventListener("scroll", handleScroll)
  }, [chartImage, draft, templateId])

  const chartCapable = template.includeChart && !!chartImage

  return (
    <div className="flex gap-6">
      <aside className="sticky top-0 hidden h-[calc(100vh-11rem)] w-56 shrink-0 md:block">
        <nav className="border-ink-200 h-full overflow-y-auto rounded-2xl border bg-white/80 p-3 text-sm">
          <div className="text-ink-400 mb-2 px-2 text-[11px] font-bold uppercase tracking-widest">
            Contents
          </div>
          {sectionGroups.map(group => (
            <div key={group.label} className="mb-2">
              <div
                className={
                  "px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest " +
                  group.accentClassName
                }
              >
                {group.label}
              </div>
              {group.sections.map(section => {
                const anchor = sectionAnchor(section.key)
                const isActive = activeAnchor === anchor
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => handleJump(anchor)}
                    className={
                      "block w-full rounded-lg px-2 py-1.5 text-left transition-colors " +
                      (isActive
                        ? "bg-teal-journey-tint/50 text-teal-journey font-semibold"
                        : "text-ink-700 hover:bg-ink-50")
                    }
                  >
                    {section.title}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div
        ref={scrollRef}
        className="max-h-[calc(100vh-11rem)] min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
      >
        <div className="flex items-center justify-between">
          <div>
            {reportTitle && (
              <h2 className="text-ink-900 text-2xl font-bold">{reportTitle}</h2>
            )}
            <div className="text-ink-500 mt-0.5 flex items-center gap-2 text-xs">
              <span className="text-ink-400 font-bold uppercase tracking-widest">
                Template
              </span>
              <span className="text-ink-700 font-medium">{template.name}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onOpenPreview}
          >
            <Maximize2 className="size-4" />
            Preview
          </Button>
        </div>

        {sectionGroups.map(group =>
          group.sections.map(section => {
            const raw = draft?.[section.key]
            const content =
              typeof raw === "string"
                ? raw
                : raw
                  ? JSON.stringify(raw, null, 2)
                  : ""
            const isDataAnalysis = section.key === "dataAnalysis"
            return (
              <div
                key={section.key}
                data-anchor={sectionAnchor(section.key)}
                className="scroll-mt-4"
              >
                <ReportSection
                  sectionKey={section.key}
                  title={section.title}
                  content={content}
                  onRegenerate={onRegenerate}
                  onEditContent={onEditContent}
                  isBusy={regenerating === section.key}
                  accentClassName={group.accentClassName}
                  afterContent={
                    isDataAnalysis && chartCapable ? (
                      <ChartBlock
                        chartImage={chartImage as string}
                        regeneratingChart={regeneratingChart}
                        onRegenerateChart={onRegenerateChart}
                      />
                    ) : null
                  }
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
