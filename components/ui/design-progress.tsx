"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DesignPlanLogEntry,
  DesignPlanProgress,
  DesignPlanStatusType
} from "@/types/design-plan"
import { format } from "date-fns"
import { AlertCircle } from "lucide-react"

interface DesignProgressProps {
  isGenerating: boolean
  status?: DesignPlanStatusType
  progress?: DesignPlanProgress
  logs?: DesignPlanLogEntry[]
  error?: string | null
}

export const DesignProgress = ({
  isGenerating,
  status,
  progress,
  logs,
  error
}: DesignProgressProps) => {
  if (!isGenerating) {
    return null
  }

  const totalSeed = progress?.seedCount ?? 0
  const generated = progress?.generated ?? 0
  const percentComplete =
    totalSeed > 0 ? Math.min((generated / totalSeed) * 100, 100) : 0

  const latestLog = logs?.[0]

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Generating Experimental Design</span>
          <Badge variant="secondary">{status || "processing"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="text-foreground font-semibold">
              {Math.round(percentComplete)}%
            </span>
          </div>
          <Progress value={percentComplete} className="h-3" />
          {progress && (
            <div className="border-border text-muted-foreground grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2">
              <div className="flex items-center justify-between">
                <span>Hypotheses generated</span>
                <span className="text-foreground font-semibold">
                  {progress.generated}/{progress.seedCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Completed (ranked/refined)</span>
                <span className="text-foreground font-semibold">
                  {progress.completed}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Failed or discarded</span>
                <span className="text-foreground font-semibold">
                  {progress.failed}
                </span>
              </div>
            </div>
          )}
        </div>

        {latestLog && (
          <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground font-semibold">
                Latest activity
              </span>
              <span>{format(new Date(latestLog.timestamp), "PPP p")}</span>
            </div>
            <p className="mt-2">{latestLog.message}</p>
          </div>
        )}

        {error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
            <AlertCircle className="size-4" />
            <span>{error}</span>
          </div>
        )}

        {logs && logs.length > 1 && (
          <div className="text-muted-foreground space-y-2 text-xs">
            <span className="text-foreground font-semibold">Recent events</span>
            <ul className="space-y-1">
              {logs.slice(0, 5).map(log => (
                <li
                  key={`${log.timestamp}-${log.actor}`}
                  className="flex items-start gap-2"
                >
                  <span className="bg-primary mt-0.5 size-1.5 rounded-full" />
                  <span>
                    <span className="text-foreground font-semibold">
                      {log.actor}
                    </span>{" "}
                    {log.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
