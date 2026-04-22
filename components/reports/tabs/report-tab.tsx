"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { IconRefresh, IconSparkles } from "@tabler/icons-react"
import { Maximize2 } from "lucide-react"
import { FC, useCallback, useEffect, useRef, useState } from "react"
import { ReportSection } from "./report-section"

interface ReportTabProps {
  draft: Record<string, any> | null
  chartImage: string | null
  regenerating: string | null
  onRegenerate: (sectionKey: string, feedback: string) => Promise<void>
  onEditContent: (sectionKey: string, value: string) => void
  onRegenerateChart: (feedback: string) => Promise<void>
  regeneratingChart: boolean
  onOpenPreview: () => void
}

type SectionGroup = {
  label: string
  accentClassName: string
  sections: Array<{ key: string; title: string }>
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    label: "Theory",
    accentClassName: "text-purple-persona",
    sections: [
      { key: "aim", title: "Aim" },
      { key: "introduction", title: "Introduction" },
      { key: "principle", title: "Principle" }
    ]
  },
  {
    label: "Method",
    accentClassName: "text-orange-product",
    sections: [
      { key: "material", title: "Material" },
      { key: "preparation", title: "Preparation" },
      { key: "procedure", title: "Procedure" },
      { key: "setup", title: "Setup" }
    ]
  },
  {
    label: "Analysis",
    accentClassName: "text-sage-brand",
    sections: [
      { key: "dataAnalysis", title: "Data Analysis" },
      { key: "results", title: "Results" },
      { key: "discussion", title: "Discussion" },
      { key: "conclusion", title: "Conclusion" },
      { key: "nextSteps", title: "Next Steps" }
    ]
  }
]

const CHART_ANCHOR = "chart"

const sectionAnchor = (key: string) => `section-${key}`

const ChartCard: FC<{
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
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sage-brand text-lg">Chart</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowFeedback(v => !v)}
          disabled={regeneratingChart}
        >
          <IconRefresh size={14} />
          {showFeedback ? "Cancel" : "Edit with AI"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
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
              placeholder="How should the chart change? e.g. sort bars descending, update title, change axis label"
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
      </CardContent>
    </Card>
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
  onOpenPreview
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeAnchor, setActiveAnchor] = useState<string>(
    chartImage ? CHART_ANCHOR : sectionAnchor(SECTION_GROUPS[0].sections[0].key)
  )

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
  }, [chartImage, draft])

  return (
    <div className="flex gap-6">
      <aside className="sticky top-0 hidden h-[calc(100vh-11rem)] w-56 shrink-0 md:block">
        <nav className="border-ink-200 h-full overflow-y-auto rounded-2xl border bg-white/80 p-3 text-sm">
          <div className="text-ink-400 mb-2 px-2 text-[11px] font-bold uppercase tracking-widest">
            Contents
          </div>
          {chartImage && (
            <button
              type="button"
              onClick={() => handleJump(CHART_ANCHOR)}
              className={
                "mb-1 block w-full rounded-lg px-2 py-1.5 text-left transition-colors " +
                (activeAnchor === CHART_ANCHOR
                  ? "bg-teal-journey-tint/50 text-teal-journey font-semibold"
                  : "text-ink-700 hover:bg-ink-50")
              }
            >
              Chart
            </button>
          )}
          {SECTION_GROUPS.map(group => (
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
        <div className="flex justify-end">
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

        {chartImage && (
          <div data-anchor={CHART_ANCHOR} className="scroll-mt-4">
            <ChartCard
              chartImage={chartImage}
              regeneratingChart={regeneratingChart}
              onRegenerateChart={onRegenerateChart}
            />
          </div>
        )}

        {SECTION_GROUPS.map(group =>
          group.sections.map(section => {
            const raw = draft?.[section.key]
            const content =
              typeof raw === "string"
                ? raw
                : raw
                  ? JSON.stringify(raw, null, 2)
                  : ""
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
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
