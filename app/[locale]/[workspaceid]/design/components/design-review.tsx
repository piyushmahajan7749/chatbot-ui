"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DesignPlanLogEntry,
  DesignPlanStatus,
  DesignPlanHypothesis
} from "@/types/design-plan"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  AlertTriangle,
  Atom,
  Beaker,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Target
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { designAgentPromptSchemas } from "@/lib/design/prompt-schemas"
import { AgentPromptUsage } from "@/types/design-prompts"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { MaterialCalculator } from "@/components/design/material-calculator"

interface DesignReviewProps {
  designData: {
    name?: string
    description?: string
    objectives?: string[]
    variables?: string[]
    specialConsiderations?: string[]
    reportWriterOutput?: any
  } | null
  planStatus?: DesignPlanStatus | null
  topHypotheses?: DesignPlanHypothesis[]
  logs?: DesignPlanLogEntry[]
  onGenerateDesign?: (hypothesis: DesignPlanHypothesis) => void
  generatingHypothesisId?: string | null
  selectedHypothesisId?: string | null
  generatedDesign?: any | null
  generatedLiteratureSummary?: any | null
  generatedStatReview?: any | null
  designError?: string | null
  onRegenerateDesign?: () => Promise<void> | void
  onCustomizePrompts?: (hypothesis: DesignPlanHypothesis) => void
  promptsUsed?: AgentPromptUsage[] | null
  onLoadSavedDesign?: (hypothesis: DesignPlanHypothesis) => void
}

const markdownClasses =
  "prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-li:marker:text-muted-foreground"

const normalizeListFormatting = (text: string) =>
  text
    .replace(/\s*-\s+/g, "\n- ")
    .replace(/\s+(\d+\.)\s+/g, "\n$1 ")
    .replace(/\n{2,}/g, "\n")
    .trim()

const SectionCard = ({
  title,
  description,
  children,
  badge
}: {
  title: string
  description?: string
  children: ReactNode
  badge?: string
}) => (
  <div className="border-border from-background via-background/60 to-background rounded-xl border bg-gradient-to-b p-4 shadow-inner">
    <div className="border-border/70 flex flex-col gap-1 border-b pb-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-foreground text-lg font-semibold">{title}</h3>
        {badge && (
          <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">
            {badge}
          </span>
        )}
      </div>
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
    <div className="text-muted-foreground pt-3 text-sm">{children}</div>
  </div>
)

const InfoTile = ({
  label,
  value,
  icon: Icon
}: {
  label: string
  value?: string
  icon?: React.ElementType
}) => {
  if (!value) return null

  return (
    <div className="border-border/70 bg-background/80 flex flex-col gap-2 rounded-lg border p-3 shadow-sm">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {Icon && <Icon className="text-primary size-4" />}
        {label}
      </div>
      <p className="text-foreground text-sm">{value}</p>
    </div>
  )
}

type StepAccent = "emerald" | "blue" | "violet" | "amber" | "rose"

type ExecutionStep = {
  label: string
  value?: string
  accent: StepAccent
}

const StepCard = ({
  title,
  body,
  accent = "emerald"
}: {
  title: string
  body?: string
  accent?: StepAccent
}) => {
  if (!body) return null

  const accentMap: Record<StepAccent, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/5",
    blue: "border-sky-500/40 bg-sky-500/5",
    violet: "border-violet-500/40 bg-violet-500/5",
    amber: "border-amber-500/40 bg-amber-500/5",
    rose: "border-rose-500/40 bg-rose-500/5"
  } as const

  const baseClass = accentMap[accent] || accentMap.emerald

  const formatted = normalizeListFormatting(body)

  return (
    <div
      className={`rounded-lg border ${baseClass} p-3 shadow-sm backdrop-blur`}
    >
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {title}
      </p>
      <ReactMarkdown className={`${markdownClasses} mt-2`}>
        {formatted}
      </ReactMarkdown>
    </div>
  )
}

function formatList(label: string, values?: string[]) {
  if (!values || values.length === 0) return null
  return (
    <div>
      <h4 className="text-muted-foreground text-sm font-semibold">{label}</h4>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        {values.map((item, index) => (
          <li key={`${label}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function renderPlanStatus(status: DesignPlanStatus) {
  const progress = status.progress
  const percentComplete =
    progress.seedCount > 0
      ? Math.min((progress.generated / progress.seedCount) * 100, 100)
      : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Status</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <span className="text-foreground font-semibold">Status: </span>
            {status.status.replaceAll("_", " ")}
          </div>
          <div>
            <span className="text-foreground font-semibold">Created: </span>
            {formatDistanceToNow(new Date(status.createdAt), {
              addSuffix: true
            })}
          </div>
          {status.completedAt && (
            <div>
              <span className="text-foreground font-semibold">Completed: </span>
              {formatDistanceToNow(new Date(status.completedAt), {
                addSuffix: true
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="text-foreground font-semibold">
              {Math.round(percentComplete)}%
            </span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        <div className="border-border grid gap-2 rounded-lg border p-3 text-xs">
          <div className="flex items-center justify-between">
            <span>Hypotheses generated</span>
            <span className="text-foreground font-semibold">
              {progress.generated}/{progress.seedCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Ranked / completed</span>
            <span className="text-foreground font-semibold">
              {progress.completed}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Failed / discarded</span>
            <span className="text-foreground font-semibold">
              {progress.failed}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function renderLogs(logs: DesignPlanLogEntry[]) {
  if (!logs.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {logs.slice(0, 10).map(log => (
          <div
            key={`${log.timestamp}-${log.actor}-${log.message}`}
            className="border-border rounded-md border p-3"
          >
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
              <span className="text-foreground font-semibold">{log.actor}</span>
              <span>{log.level.toUpperCase()}</span>
              <span>
                {formatDistanceToNow(new Date(log.timestamp), {
                  addSuffix: true
                })}
              </span>
            </div>
            <p className="text-muted-foreground mt-2">{log.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function renderLegacyReport(report: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Legacy Report</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-6 text-sm">
        {report.researchObjective && (
          <div>
            <h3 className="text-foreground text-base font-semibold">
              Research Objective
            </h3>
            <p>{report.researchObjective}</p>
          </div>
        )}
        {report.literatureSummary && (
          <div>
            <h3 className="text-foreground text-base font-semibold">
              Literature Summary
            </h3>
            <ReactMarkdown className={markdownClasses}>
              {report.literatureSummary.whatOthersHaveDone}
            </ReactMarkdown>
          </div>
        )}
        {report.hypothesis && (
          <div>
            <h3 className="text-foreground text-base font-semibold">
              Hypothesis
            </h3>
            <p className="text-foreground font-medium">
              {report.hypothesis.hypothesis}
            </p>
            <p>{report.hypothesis.explanation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DesignReview({
  designData,
  planStatus,
  topHypotheses,
  logs,
  onGenerateDesign,
  onCustomizePrompts,
  generatingHypothesisId,
  selectedHypothesisId,
  generatedDesign,
  generatedLiteratureSummary,
  generatedStatReview,
  designError,
  onRegenerateDesign,
  promptsUsed,
  onLoadSavedDesign
}: DesignReviewProps) {
  const [showAllHypotheses, setShowAllHypotheses] =
    useState(!selectedHypothesisId)
  const [reasoningDialogOpen, setReasoningDialogOpen] = useState(false)
  const [reasoningHypothesis, setReasoningHypothesis] =
    useState<DesignPlanHypothesis | null>(null)
  const [hypothesesWithSavedDesigns, setHypothesesWithSavedDesigns] = useState<
    Set<string>
  >(new Set())

  useEffect(() => {
    setShowAllHypotheses(!selectedHypothesisId)
  }, [selectedHypothesisId])

  // Check which hypotheses have saved designs
  useEffect(() => {
    const checkSavedDesigns = async () => {
      if (!topHypotheses || topHypotheses.length === 0) {
        console.log("[DESIGN_REVIEW] No hypotheses to check for saved designs")
        return
      }

      console.log(
        `[DESIGN_REVIEW] Checking ${topHypotheses.length} hypotheses for saved designs...`
      )
      const savedSet = new Set<string>()

      await Promise.all(
        topHypotheses.map(async hypothesis => {
          try {
            const response = await fetch(
              `/api/design/draft/hypothesis/${hypothesis.hypothesisId}/saved-design`
            )
            console.log(
              `[DESIGN_REVIEW] Hypothesis ${hypothesis.hypothesisId.slice(0, 8)}... saved design check:`,
              response.ok ? "✅ HAS SAVED DESIGN" : "❌ No saved design"
            )
            if (response.ok) {
              savedSet.add(hypothesis.hypothesisId)
            }
          } catch (error) {
            console.error(
              `[DESIGN_REVIEW] Error checking saved design for ${hypothesis.hypothesisId.slice(0, 8)}...:`,
              error
            )
          }
        })
      )

      console.log(
        `[DESIGN_REVIEW] Found ${savedSet.size} hypotheses with saved designs`
      )
      setHypothesesWithSavedDesigns(savedSet)
    }

    checkSavedDesigns()
  }, [topHypotheses])

  const objectives = designData?.objectives || []
  const variables = designData?.variables || []
  const specialConsiderations = designData?.specialConsiderations || []
  const selectedHypothesis =
    selectedHypothesisId && topHypotheses
      ? topHypotheses.find(h => h.hypothesisId === selectedHypothesisId) || null
      : null
  const isGeneratingDesign =
    !!selectedHypothesisId &&
    generatingHypothesisId === selectedHypothesisId &&
    !generatedDesign
  const isDesignComplete = !!generatedDesign && !!selectedHypothesis
  const promptsAvailable =
    !!generatedDesign && !!promptsUsed && promptsUsed.length > 0

  const handleDownloadPrompts = useCallback(async () => {
    if (!promptsAvailable || !promptsUsed) {
      return
    }

    const fileBaseName = `experiment-prompts-${
      selectedHypothesis?.hypothesisId || "design"
    }`

    const downloadBlob = (blob: Blob, extension: string) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileBaseName}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }

    const fallbackPlainText = () => {
      const lines: string[] = []
      lines.push("Experiment Prompt Pack")
      lines.push(
        `Hypothesis: ${selectedHypothesis?.content || "No hypothesis selected"}`
      )
      lines.push(`Generated: ${new Date().toLocaleString()}`)
      lines.push("")
      promptsUsed.forEach(entry => {
        const schema = designAgentPromptSchemas[entry.agentId]
        lines.push(
          `${schema?.title || entry.agentId} (${entry.agentId
            .replace(/([A-Z])/g, " $1")
            .trim()})`
        )
        lines.push("")
        lines.push("System Prompt:")
        lines.push(entry.systemPrompt.trim())
        if (entry.userPrompt) {
          lines.push("")
          lines.push("User Prompt:")
          lines.push(entry.userPrompt.trim())
        }
        lines.push("")
      })
      return lines.join("\n")
    }

    try {
      const docChildren: Paragraph[] = []
      const now = new Date()
      docChildren.push(
        new Paragraph({
          text: "Experiment Prompt Pack",
          heading: HeadingLevel.TITLE
        })
      )
      docChildren.push(
        new Paragraph({
          text: `Hypothesis: ${
            selectedHypothesis?.content || "No hypothesis selected"
          }`
        })
      )
      docChildren.push(
        new Paragraph({
          text: `Generated: ${now.toLocaleString()}`
        })
      )
      docChildren.push(new Paragraph({ text: "" }))

      const addMultiline = (text?: string) => {
        if (!text) {
          docChildren.push(new Paragraph({ text: "—" }))
          return
        }
        text.split(/\r?\n/).forEach(line => {
          docChildren.push(new Paragraph({ text: line || " " }))
        })
      }

      promptsUsed.forEach(entry => {
        const schema = designAgentPromptSchemas[entry.agentId]
        const headingLabel = schema
          ? `${schema.title} (${schema.id})`
          : entry.agentId
        docChildren.push(
          new Paragraph({
            text: headingLabel,
            heading: HeadingLevel.HEADING_2
          })
        )
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: "System Prompt:", bold: true })]
          })
        )
        addMultiline(entry.systemPrompt)
        if (entry.userPrompt) {
          docChildren.push(new Paragraph({ text: "" }))
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: "User Prompt:", bold: true })]
            })
          )
          addMultiline(entry.userPrompt)
        }
        docChildren.push(new Paragraph({ text: "" }))
      })

      const doc = new Document({
        sections: [
          {
            children: docChildren
          }
        ]
      })

      const docBlob = await Packer.toBlob(doc)
      downloadBlob(docBlob, "docx")
    } catch (error) {
      console.error("[DESIGN_REVIEW] Failed to build DOCX:", error)
      const fallbackBlob = new Blob([fallbackPlainText()], {
        type: "text/plain"
      })
      downloadBlob(fallbackBlob, "txt")
    }
  }, [promptsAvailable, promptsUsed, selectedHypothesis])

  const designReportCard = generatedDesign &&
    typeof generatedDesign === "object" && (
      <Card>
        <CardHeader>
          <CardTitle>Experiment Design</CardTitle>
          {generatedDesign && (
            <div className="flex flex-wrap gap-2 pt-3">
              {promptsAvailable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPrompts}
                >
                  <Download className="mr-2 size-4" />
                  Download Prompts (.docx)
                </Button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRegenerateDesign?.()}
                    >
                      <RefreshCw className="mr-2 size-4" />
                      Regenerate
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Run the entire design pipeline again with fresh agents.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4 text-sm">
          {generatedDesign.researchObjective && (
            <SectionCard
              title="Research Objective"
              description="Primary goal the experiment must accomplish."
            >
              <p className="text-foreground">
                {generatedDesign.researchObjective}
              </p>
            </SectionCard>
          )}
          {generatedDesign.literatureSummary && (
            <SectionCard
              title="Literature Summary"
              description="Key learnings from recent papers."
              badge={`${generatedLiteratureSummary?.citations?.length || 0} refs`}
            >
              <ReactMarkdown className={markdownClasses}>
                {[
                  generatedDesign.literatureSummary.whatOthersHaveDone,
                  generatedDesign.literatureSummary.goodMethodsAndTools,
                  generatedDesign.literatureSummary.potentialPitfalls
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              </ReactMarkdown>
            </SectionCard>
          )}
          {generatedDesign.hypothesis && (
            <SectionCard title="Selected Hypothesis" badge="Final pick">
              <p className="text-foreground font-medium">
                {generatedDesign.hypothesis.hypothesis}
              </p>
              <p>{generatedDesign.hypothesis.explanation}</p>
            </SectionCard>
          )}
          {generatedDesign.experimentDesign && (
            <SectionCard
              title="Experiment Blueprint"
              description="Design parameters and execution plan."
            >
              {(() => {
                const blueprint =
                  generatedDesign.experimentDesign.experimentDesign || {}
                const executionPlan =
                  generatedDesign.experimentDesign.executionPlan || {}
                const blueprintHighlights = [
                  {
                    label: "What is Tested",
                    value: blueprint.whatWillBeTested,
                    icon: Target
                  },
                  {
                    label: "What is Measured",
                    value: blueprint.whatWillBeMeasured,
                    icon: ClipboardList
                  },
                  {
                    label: "Control Groups",
                    value: blueprint.controlGroups,
                    icon: ShieldCheck
                  },
                  {
                    label: "Experimental Groups",
                    value: blueprint.experimentalGroups,
                    icon: Layers
                  },
                  {
                    label: "Sample Types",
                    value: blueprint.sampleTypes,
                    icon: Beaker
                  },
                  {
                    label: "Tools Needed",
                    value: blueprint.toolsNeeded,
                    icon: AlertTriangle
                  },
                  {
                    label: "Replicates & Conditions",
                    value: blueprint.replicatesAndConditions,
                    icon: Copy
                  },
                  {
                    label: "Specific Requirements",
                    value: blueprint.specificRequirements,
                    icon: Atom
                  }
                ].filter(tile => tile.value)

                const executionSteps = (
                  [
                    {
                      label: "Materials List",
                      value: executionPlan.materialsList,
                      accent: "emerald"
                    },
                    {
                      label: "Material Preparation",
                      value: executionPlan.materialPreparation,
                      accent: "blue"
                    },
                    {
                      label: "Step-by-Step Procedure",
                      value: executionPlan.stepByStepProcedure,
                      accent: "violet"
                    },
                    {
                      label: "Timeline",
                      value: executionPlan.timeline,
                      accent: "amber"
                    },
                    {
                      label: "Setup Instructions",
                      value: executionPlan.setupInstructions,
                      accent: "blue"
                    },
                    {
                      label: "Data Collection Plan",
                      value: executionPlan.dataCollectionPlan,
                      accent: "emerald"
                    },
                    {
                      label: "Conditions Table",
                      value: executionPlan.conditionsTable,
                      accent: "rose"
                    },
                    {
                      label: "Storage & Disposal",
                      value: executionPlan.storageDisposal,
                      accent: "amber"
                    },
                    {
                      label: "Safety Notes",
                      value: executionPlan.safetyNotes,
                      accent: "rose"
                    }
                  ] satisfies ExecutionStep[]
                ).filter(step => step.value)

                return (
                  <div className="space-y-5">
                    {blueprintHighlights.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {blueprintHighlights.map(tile => (
                          <InfoTile
                            key={tile.label}
                            label={tile.label}
                            value={tile.value}
                            icon={tile.icon}
                          />
                        ))}
                      </div>
                    )}
                    {executionSteps.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                            Execution Plan
                          </p>
                          {executionPlan.timeline && (
                            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">
                              Timeline in plan
                            </span>
                          )}
                        </div>
                        <div className="grid gap-3">
                          {executionSteps.map(step => (
                            <StepCard
                              key={step.label}
                              title={step.label}
                              body={step.value}
                              accent={step.accent}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {generatedDesign.experimentDesign.rationale && (
                      <p className="text-foreground italic">
                        {generatedDesign.experimentDesign.rationale}
                      </p>
                    )}
                  </div>
                )
              })()}
            </SectionCard>
          )}
          {generatedDesign.experimentDesign &&
            (generatedDesign.experimentDesign.executionPlan?.materialsList ||
              generatedDesign.experimentDesign.executionPlan
                ?.materialPreparation) && (
              <MaterialCalculator
                materialsListText={
                  generatedDesign.experimentDesign.executionPlan.materialsList
                }
                materialPreparationText={
                  generatedDesign.experimentDesign.executionPlan
                    .materialPreparation
                }
                replicatesAndConditionsText={
                  generatedDesign.experimentDesign.experimentDesign
                    ?.replicatesAndConditions
                }
                conditionsTableText={
                  generatedDesign.experimentDesign.executionPlan.conditionsTable
                }
                stepByStepProcedure={
                  generatedDesign.experimentDesign.executionPlan
                    .stepByStepProcedure
                }
              />
            )}
          {generatedDesign.statisticalReview && (
            <SectionCard
              title="Statistical Review"
              description="Quality checks by the StatCheck agent."
              badge="QA"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                    What Looks Good
                  </p>
                  <ReactMarkdown className={markdownClasses}>
                    {generatedDesign.statisticalReview.whatLooksGood ||
                      "No notes provided."}
                  </ReactMarkdown>
                </div>
                <div className="rounded-lg bg-rose-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-400">
                    Problems / Risks
                  </p>
                  <ReactMarkdown className={markdownClasses}>
                    {generatedDesign.statisticalReview.problemsOrRisks
                      ?.map((item: string) => `- ${item}`)
                      .join("\n") || "None reported."}
                  </ReactMarkdown>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                    Suggested Improvements
                  </p>
                  <ReactMarkdown className={markdownClasses}>
                    {generatedDesign.statisticalReview.suggestedImprovements
                      ?.map((item: string) => `- ${item}`)
                      .join("\n") || "No improvements suggested."}
                  </ReactMarkdown>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                    Overall Assessment
                  </p>
                  <ReactMarkdown className={markdownClasses}>
                    {generatedDesign.statisticalReview.overallAssessment ||
                      "No assessment provided."}
                  </ReactMarkdown>
                </div>
              </div>
            </SectionCard>
          )}
          {generatedDesign.finalNotes && (
            <SectionCard title="Final Notes">
              <p>{generatedDesign.finalNotes}</p>
            </SectionCard>
          )}
        </CardContent>
      </Card>
    )

  const citationsCard =
    generatedLiteratureSummary &&
    (generatedLiteratureSummary.citations?.length ||
      generatedLiteratureSummary.citationsDetailed?.length) ? (
      <Card>
        <CardHeader>
          <CardTitle>Citations & Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4 text-sm">
          {generatedLiteratureSummary.citationsDetailed &&
            generatedLiteratureSummary.citationsDetailed.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-foreground text-base font-semibold">
                  Detailed Citations
                </h3>
                <ol className="list-decimal space-y-2 pl-5">
                  {generatedLiteratureSummary.citationsDetailed.map(
                    (cite: any, idx: number) => (
                      <li key={`${cite.title}-${idx}`}>
                        <span className="text-foreground font-semibold">
                          {cite.title}
                        </span>
                        {cite.authors?.length > 0 && (
                          <span className="text-muted-foreground block text-xs">
                            {cite.authors.join(", ")}
                          </span>
                        )}
                        {cite.journal && (
                          <span className="text-muted-foreground block text-xs">
                            {cite.journal}
                            {cite.year ? ` (${cite.year})` : ""}
                          </span>
                        )}
                        {cite.url && (
                          <a
                            href={cite.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-xs underline"
                          >
                            View Source
                          </a>
                        )}
                      </li>
                    )
                  )}
                </ol>
              </div>
            )}
          {generatedLiteratureSummary.citations &&
            generatedLiteratureSummary.citations.length > 0 &&
            (!generatedLiteratureSummary.citationsDetailed ||
              generatedLiteratureSummary.citationsDetailed.length === 0) && (
              <div>
                <h3 className="text-foreground text-base font-semibold">
                  Citations
                </h3>
                <ol className="list-decimal space-y-2 pl-5">
                  {generatedLiteratureSummary.citations.map(
                    (cite: string, idx: number) => (
                      <li key={`cite-${idx}`}>{cite}</li>
                    )
                  )}
                </ol>
              </div>
            )}
          {generatedDesign?.finalNotes && (
            <div>
              <h3 className="text-foreground text-base font-semibold">Notes</h3>
              <p>{generatedDesign.finalNotes}</p>
            </div>
          )}
          {generatedStatReview && (
            <div className="space-y-2">
              <h3 className="text-foreground text-base font-semibold">
                Review Highlights
              </h3>
              <ul className="list-disc space-y-1 pl-5">
                {generatedStatReview.problemsOrRisks?.map(
                  (issue: string, idx: number) => (
                    <li key={`issue-${idx}`}>{issue}</li>
                  )
                )}
                {generatedStatReview.suggestedImprovements?.map(
                  (tip: string, idx: number) => (
                    <li key={`improve-${idx}`}>{tip}</li>
                  )
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    ) : null

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Research Overview</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4 text-sm">
          <p>{designData?.description || "No description provided."}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {formatList("Objectives", objectives)}
            {formatList("Variables", variables)}
            {formatList("Special Considerations", specialConsiderations)}
          </div>
        </CardContent>
      </Card>

      {!selectedHypothesis && planStatus && renderPlanStatus(planStatus)}

      {planStatus?.literatureContext && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-5" />
              Literature Context
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Research insights that informed hypothesis generation
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <SectionCard title="What Others Have Done">
              <ReactMarkdown className={markdownClasses}>
                {planStatus.literatureContext.whatOthersHaveDone}
              </ReactMarkdown>
            </SectionCard>

            <SectionCard title="Good Methods & Tools">
              <ReactMarkdown className={markdownClasses}>
                {planStatus.literatureContext.goodMethodsAndTools}
              </ReactMarkdown>
            </SectionCard>

            <SectionCard title="Potential Pitfalls">
              <ReactMarkdown className={markdownClasses}>
                {planStatus.literatureContext.potentialPitfalls}
              </ReactMarkdown>
            </SectionCard>

            {planStatus.literatureContext.citationsDetailed &&
              planStatus.literatureContext.citationsDetailed.length > 0 && (
                <SectionCard
                  title="Citations"
                  badge={`${planStatus.literatureContext.citationsDetailed.length} sources`}
                >
                  <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
                    {planStatus.literatureContext.citationsDetailed.map(
                      (citation, idx) => (
                        <div
                          key={idx}
                          className="border-border/50 rounded-lg border p-3"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                              [{citation.index}]
                            </span>
                            <div className="space-y-1">
                              <p className="text-foreground text-sm font-medium">
                                {citation.title}
                              </p>
                              {citation.authors.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  {citation.authors.join(", ")}
                                </p>
                              )}
                              <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                                {citation.journal && (
                                  <span>{citation.journal}</span>
                                )}
                                {citation.year && (
                                  <span>({citation.year})</span>
                                )}
                                {citation.source && (
                                  <span className="bg-muted rounded px-1.5 py-0.5">
                                    {citation.source}
                                  </span>
                                )}
                              </div>
                              {citation.url && (
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary text-xs hover:underline"
                                >
                                  View source →
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </SectionCard>
              )}
          </CardContent>
        </Card>
      )}

      {topHypotheses && topHypotheses.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Hypotheses</CardTitle>
              {selectedHypothesis && (
                <p className="text-muted-foreground text-xs">
                  {isDesignComplete
                    ? "Experiment design generated."
                    : isGeneratingDesign
                      ? "Generating experiment design…"
                      : "Hypothesis selected. Pick another if needed."}
                </p>
              )}
            </div>
            {selectedHypothesis && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllHypotheses(prev => !prev)}
              >
                {showAllHypotheses ? "Hide list" : "Change hypothesis"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedHypothesis && (
              <div className="border-border/70 bg-background/80 rounded-lg border p-4 shadow-sm">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-foreground text-sm font-semibold">
                        {selectedHypothesis.content}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {selectedHypothesis.explanation}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isDesignComplete
                          ? "bg-emerald-500/10 text-emerald-500"
                          : isGeneratingDesign
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {isDesignComplete
                        ? "Design ready"
                        : isGeneratingDesign
                          ? "In progress"
                          : "Selected"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                      {typeof selectedHypothesis.elo === "number" && (
                        <span className="bg-secondary/20 rounded-full px-2 py-1 font-semibold">
                          Elo {Math.round(selectedHypothesis.elo)}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        Hypothesis ID: {selectedHypothesis.hypothesisId}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReasoningHypothesis(selectedHypothesis)
                        setReasoningDialogOpen(true)
                      }}
                    >
                      <Info className="mr-1.5 size-3.5" />
                      Why this hypothesis?
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {(!selectedHypothesis || showAllHypotheses) && (
              <div className="space-y-4">
                {topHypotheses.map(hypothesis => {
                  const isSelected =
                    selectedHypothesisId === hypothesis.hypothesisId
                  const isGenerating =
                    generatingHypothesisId === hypothesis.hypothesisId

                  return (
                    <div
                      key={hypothesis.hypothesisId}
                      className={`border-border space-y-2 rounded-lg border p-4 ${
                        isSelected ? "border-primary shadow-md" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <h3 className="text-foreground text-base font-semibold">
                            {hypothesis.content}
                          </h3>
                          {hypothesis.explanation && (
                            <p className="text-muted-foreground text-sm">
                              {hypothesis.explanation}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground mt-1"
                            onClick={() => {
                              setReasoningHypothesis(hypothesis)
                              setReasoningDialogOpen(true)
                            }}
                          >
                            <Info className="mr-1.5 size-3.5" />
                            Why this hypothesis?
                          </Button>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {typeof hypothesis.elo === "number" && (
                            <span className="bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs font-semibold">
                              Elo: {Math.round(hypothesis.elo)}
                            </span>
                          )}
                          <div className="flex flex-col items-end gap-2">
                            <Button
                              size="sm"
                              disabled={isGenerating}
                              onClick={() => onGenerateDesign?.(hypothesis)}
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Generating…
                                </>
                              ) : (
                                "Generate Experiment Design"
                              )}
                            </Button>
                            {hypothesesWithSavedDesigns.has(
                              hypothesis.hypothesisId
                            ) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isGenerating}
                                onClick={() => onLoadSavedDesign?.(hypothesis)}
                              >
                                <Download className="mr-2 size-4" />
                                Load Design
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isGenerating}
                              onClick={() => onCustomizePrompts?.(hypothesis)}
                            >
                              Customize Prompts
                            </Button>
                          </div>
                        </div>
                      </div>
                      {isSelected && isGenerating && (
                        <p className="text-muted-foreground text-xs">
                          Generating experiment design…
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {designError && (
              <p className="text-destructive text-sm">{designError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {selectedHypothesis && isGeneratingDesign && (
        <Card>
          <CardHeader>
            <CardTitle>Design Agent Progress</CardTitle>
            <p className="text-muted-foreground text-xs">
              Tracking multi-agent pipeline for “
              {selectedHypothesis.content.slice(0, 80)}
              {selectedHypothesis.content.length > 80 ? "…" : ""}”
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                title: "Literature Scout",
                description: "Reviewing and summarizing relevant papers."
              },
              {
                title: "Experiment Designer",
                description: "Constructing the experimental blueprint."
              },
              {
                title: "Stat Check",
                description: "Validating assumptions and power."
              },
              {
                title: "Report Writer",
                description: "Compiling the final document."
              }
            ].map((step, index) => {
              const isCurrent = index === 0
              return (
                <div
                  key={step.title}
                  className="border-border/70 bg-background/80 flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="mt-1">
                    {isCurrent ? (
                      <Loader2 className="text-primary size-4 animate-spin" />
                    ) : (
                      <Clock className="text-muted-foreground size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">
                      {step.title}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {!selectedHypothesis && logs && logs.length > 0 && renderLogs(logs)}

      {(!planStatus || planStatus.status !== "completed") &&
        designData?.reportWriterOutput &&
        renderLegacyReport(designData.reportWriterOutput)}

      {!planStatus && !designData?.reportWriterOutput && (
        <Card>
          <CardHeader>
            <CardTitle>Design Output</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No generated output is available for this design yet.
            </p>
          </CardContent>
        </Card>
      )}

      {designReportCard}
      {citationsCard}

      <Dialog open={reasoningDialogOpen} onOpenChange={setReasoningDialogOpen}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hypothesis Reasoning</DialogTitle>
            <DialogDescription>
              Detailed explanation of why this hypothesis was generated and
              selected
            </DialogDescription>
          </DialogHeader>
          {reasoningHypothesis && (
            <div className="space-y-4">
              <div className="border-border rounded-lg border p-4">
                <h4 className="text-foreground mb-2 font-semibold">
                  Hypothesis
                </h4>
                <p className="text-foreground text-sm">
                  {reasoningHypothesis.content}
                </p>
              </div>

              <div className="border-border rounded-lg border p-4">
                <h4 className="text-foreground mb-2 font-semibold">
                  Scientific Rationale
                </h4>
                <p className="text-muted-foreground text-sm">
                  {reasoningHypothesis.explanation ||
                    "No explanation provided."}
                </p>
              </div>

              {reasoningHypothesis.provenance &&
                reasoningHypothesis.provenance.length > 0 && (
                  <div className="border-border rounded-lg border p-4">
                    <h4 className="text-foreground mb-2 font-semibold">
                      Provenance & Sources
                    </h4>
                    <div className="text-muted-foreground space-y-2 text-sm">
                      {reasoningHypothesis.provenance.map((source, idx) => (
                        <div
                          key={idx}
                          className="border-border/50 rounded border p-2"
                        >
                          {typeof source === "string" ? (
                            <p>{source}</p>
                          ) : (
                            <ReactMarkdown className={markdownClasses}>
                              {JSON.stringify(source, null, 2)}
                            </ReactMarkdown>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {planStatus?.literatureContext?.citationsDetailed && (
                <div className="border-border rounded-lg border p-4">
                  <h4 className="text-foreground mb-2 font-semibold">
                    Related Citations from Literature Review
                  </h4>
                  <p className="text-muted-foreground mb-3 text-xs">
                    These papers informed the generation of all hypotheses for
                    this research plan
                  </p>
                  <div className="max-h-60 space-y-3 overflow-y-auto pr-2">
                    {planStatus.literatureContext.citationsDetailed.map(
                      (citation, idx) => (
                        <div
                          key={idx}
                          className="border-border/50 rounded-lg border p-3"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                              [{citation.index}]
                            </span>
                            <div className="space-y-1">
                              <p className="text-foreground text-sm font-medium">
                                {citation.title}
                              </p>
                              {citation.authors.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  {citation.authors.join(", ")}
                                </p>
                              )}
                              <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                                {citation.journal && (
                                  <span>{citation.journal}</span>
                                )}
                                {citation.year && (
                                  <span>({citation.year})</span>
                                )}
                                {citation.source && (
                                  <span className="bg-muted rounded px-1.5 py-0.5">
                                    {citation.source}
                                  </span>
                                )}
                              </div>
                              {citation.url && (
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary text-xs hover:underline"
                                >
                                  View source →
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {reasoningHypothesis.metadata && (
                <div className="border-border rounded-lg border p-4">
                  <h4 className="text-foreground mb-2 font-semibold">
                    Quality Metrics
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {typeof reasoningHypothesis.metadata.feasibility_score ===
                      "number" && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs">
                          Feasibility Score
                        </p>
                        <p className="text-foreground text-lg font-semibold">
                          {(
                            reasoningHypothesis.metadata.feasibility_score * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    )}
                    {typeof reasoningHypothesis.metadata.novelty_score ===
                      "number" && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs">
                          Novelty Score
                        </p>
                        <p className="text-foreground text-lg font-semibold">
                          {(
                            reasoningHypothesis.metadata.novelty_score * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    )}
                    {typeof reasoningHypothesis.elo === "number" && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs">
                          Tournament Elo Rating
                        </p>
                        <p className="text-foreground text-lg font-semibold">
                          {Math.round(reasoningHypothesis.elo)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
