"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tables } from "@/supabase/types"
import { IconSparkles, IconLoader2, IconRefresh } from "@tabler/icons-react"
import { FC } from "react"
import { ReportRetrievalSelect } from "../report-retrieval-select"
import { DEFAULT_TEMPLATE_ID, REPORT_TEMPLATES } from "@/lib/report/templates"

interface InputsTabProps {
  objective: string
  onObjectiveChange: (value: string) => void
  protocol: Tables<"files">[]
  papers: Tables<"files">[]
  dataFiles: Tables<"files">[]
  onToggleFile: (
    type: "protocol" | "papers" | "dataFiles",
    item: Tables<"files">
  ) => void
  isGenerating: boolean
  hasDraft: boolean
  onGenerate: () => void
  generationError: string | null
  templateId: string
  onTemplateChange: (id: string) => void
}

export const InputsTab: FC<InputsTabProps> = ({
  objective,
  onObjectiveChange,
  protocol,
  papers,
  dataFiles,
  onToggleFile,
  isGenerating,
  hasDraft,
  onGenerate,
  generationError,
  templateId,
  onTemplateChange
}) => {
  const canGenerate = !!objective.trim() && protocol.length > 0 && !isGenerating
  const activeTemplateId = templateId || DEFAULT_TEMPLATE_ID

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-ink-900 text-lg">Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-ink-500 text-sm">
            Choose the structure for this report.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {REPORT_TEMPLATES.map(t => {
              const selected = activeTemplateId === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => onTemplateChange(t.id)}
                  className={
                    "rounded-xl border p-3 text-left transition-colors " +
                    (selected
                      ? "border-teal-journey bg-teal-journey-tint/30"
                      : "border-ink-200 bg-white hover:bg-ink-50")
                  }
                >
                  <div
                    className={
                      "text-sm font-semibold " +
                      (selected ? "text-teal-journey" : "text-ink-900")
                    }
                  >
                    {t.name}
                  </div>
                  <div className="text-ink-500 mt-1 text-xs leading-snug">
                    {t.description}
                  </div>
                  <div className="text-ink-400 mt-2 text-[11px] font-bold uppercase tracking-widest">
                    {t.sections.length} sections
                    {t.includeChart ? " · chart" : ""}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-ink-900 text-lg">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>
              Objective <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={objective}
              onChange={e => onObjectiveChange(e.target.value)}
              placeholder="Describe what this report should investigate and report on."
              rows={3}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Protocol <span className="text-red-500">*</span>
            </Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={protocol}
              onRetrievalItemSelect={item =>
                onToggleFile("protocol", item as Tables<"files">)
              }
              fileType="protocol"
            />
            <p className="text-ink-400 text-xs">
              A single experimental protocol document.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Preparation / Reference Papers</Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={papers}
              onRetrievalItemSelect={item =>
                onToggleFile("papers", item as Tables<"files">)
              }
              fileType="papers"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data Files</Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={dataFiles}
              onRetrievalItemSelect={item =>
                onToggleFile("dataFiles", item as Tables<"files">)
              }
              fileType="dataFiles"
            />
            <p className="text-ink-400 text-xs">
              Experimental data the analysis agent should work from.
            </p>
          </div>

          {generationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {generationError}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="border-ink-100 flex items-center justify-end border-t pt-4">
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="bg-brick hover:bg-brick-hover gap-1.5"
        >
          {isGenerating ? (
            <>
              <IconLoader2 size={16} className="animate-spin" />
              Generating…
            </>
          ) : hasDraft ? (
            <>
              <IconRefresh size={16} />
              Regenerate Report
            </>
          ) : (
            <>
              <IconSparkles size={16} />
              Generate Report
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
