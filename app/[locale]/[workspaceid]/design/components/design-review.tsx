import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DesignPlanLogEntry,
  DesignPlanStatus,
  DesignPlanHypothesis
} from "@/types/design-plan"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"

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
  designError?: string | null
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
            <ReactMarkdown>
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
  generatingHypothesisId,
  selectedHypothesisId,
  generatedDesign,
  designError
}: DesignReviewProps) {
  const objectives = designData?.objectives || []
  const variables = designData?.variables || []
  const specialConsiderations = designData?.specialConsiderations || []

  const designReportCard = generatedDesign &&
    typeof generatedDesign === "object" && (
      <Card>
        <CardHeader>
          <CardTitle>Experiment Design</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4 text-sm">
          {generatedDesign.researchObjective && (
            <section>
              <h3 className="text-foreground text-base font-semibold">
                Research Objective
              </h3>
              <p>{generatedDesign.researchObjective}</p>
            </section>
          )}
          {generatedDesign.literatureSummary && (
            <section className="space-y-2">
              <h3 className="text-foreground text-base font-semibold">
                Literature Summary
              </h3>
              <ReactMarkdown className="prose max-w-none">
                {[
                  generatedDesign.literatureSummary.whatOthersHaveDone,
                  generatedDesign.literatureSummary.goodMethodsAndTools,
                  generatedDesign.literatureSummary.potentialPitfalls
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              </ReactMarkdown>
            </section>
          )}
          {generatedDesign.hypothesis && (
            <section>
              <h3 className="text-foreground text-base font-semibold">
                Selected Hypothesis
              </h3>
              <p className="text-foreground font-medium">
                {generatedDesign.hypothesis.hypothesis}
              </p>
              <p>{generatedDesign.hypothesis.explanation}</p>
            </section>
          )}
          {generatedDesign.experimentDesign && (
            <section className="space-y-2">
              <h3 className="text-foreground text-base font-semibold">
                Experiment Design
              </h3>
              <ReactMarkdown className="prose max-w-none">
                {Object.entries(
                  generatedDesign.experimentDesign.experimentDesign || {}
                )
                  .map(([key, value]) => `**${key}**: ${value}`)
                  .join("\n\n")}
              </ReactMarkdown>
              {generatedDesign.experimentDesign.executionPlan && (
                <ReactMarkdown className="prose max-w-none">
                  {Object.entries(
                    generatedDesign.experimentDesign.executionPlan
                  )
                    .map(([key, value]) => `**${key}**: ${value}`)
                    .join("\n\n")}
                </ReactMarkdown>
              )}
              {generatedDesign.experimentDesign.rationale && (
                <p>{generatedDesign.experimentDesign.rationale}</p>
              )}
            </section>
          )}
          {generatedDesign.statisticalReview && (
            <section className="space-y-2">
              <h3 className="text-foreground text-base font-semibold">
                Statistical Review
              </h3>
              <ReactMarkdown className="prose max-w-none">
                {[
                  generatedDesign.statisticalReview.whatLooksGood,
                  generatedDesign.statisticalReview.problemsOrRisks
                    ?.map((item: string) => `- ${item}`)
                    .join("\n"),
                  generatedDesign.statisticalReview.suggestedImprovements
                    ?.map((item: string) => `- ${item}`)
                    .join("\n"),
                  generatedDesign.statisticalReview.overallAssessment
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              </ReactMarkdown>
            </section>
          )}
          {generatedDesign.finalNotes && (
            <section>
              <h3 className="text-foreground text-base font-semibold">
                Final Notes
              </h3>
              <p>{generatedDesign.finalNotes}</p>
            </section>
          )}
        </CardContent>
      </Card>
    )

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

      {planStatus && renderPlanStatus(planStatus)}

      {topHypotheses && topHypotheses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hypotheses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {topHypotheses.map(hypothesis => {
              const isSelected =
                selectedHypothesisId === hypothesis.hypothesisId
              const isGenerating =
                generatingHypothesisId === hypothesis.hypothesisId

              return (
                <div
                  key={hypothesis.hypothesisId}
                  className={`border-border space-y-2 rounded-lg border p-4 ${
                    isSelected ? "border-primary" : ""
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
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {typeof hypothesis.elo === "number" && (
                        <span className="bg-secondary text-secondary-foreground rounded px-2 py-1 text-xs font-semibold">
                          Elo: {Math.round(hypothesis.elo)}
                        </span>
                      )}
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
            {designError && (
              <p className="text-destructive text-sm">{designError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {logs && logs.length > 0 && renderLogs(logs)}

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
    </div>
  )
}
