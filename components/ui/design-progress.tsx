"use client"

import { FC, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Settings,
  Search,
  BarChart3,
  Beaker,
  FileText,
  CheckCircle,
  Clock,
  Loader2
} from "lucide-react"

interface WorkflowStep {
  id: string
  name: string
  description: string
  icon: any
  estimatedTime: number // in seconds
  status: "pending" | "running" | "completed" | "error"
}

interface DesignProgressProps {
  isGenerating: boolean
  onComplete?: () => void
}

const workflowSteps: WorkflowStep[] = [
  {
    id: "planner",
    name: "Planning Agent",
    description: "Analyzing research problem and initial parameters",
    icon: Settings,
    estimatedTime: 15,
    status: "pending"
  },
  {
    id: "literature",
    name: "Literature Research Agent",
    description: "Searching PubMed, ArXiv, Scholar, and other sources",
    icon: Search,
    estimatedTime: 45,
    status: "pending"
  },
  {
    id: "data",
    name: "Data Analyzer Agent",
    description: "Analyzing uploaded datasets and extracting insights",
    icon: BarChart3,
    estimatedTime: 25,
    status: "pending"
  },
  {
    id: "doe",
    name: "Design of Experiments Agent",
    description: "Generating hypothesis and experimental design",
    icon: Beaker,
    estimatedTime: 30,
    status: "pending"
  },
  {
    id: "report",
    name: "Report Writer Agent",
    description: "Compiling comprehensive experimental design report",
    icon: FileText,
    estimatedTime: 20,
    status: "pending"
  }
]

export const DesignProgress: FC<DesignProgressProps> = ({
  isGenerating,
  onComplete
}) => {
  const [steps, setSteps] = useState<WorkflowStep[]>(workflowSteps)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [stepProgress, setStepProgress] = useState(0)

  // Timer for overall elapsed time
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (isGenerating) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isGenerating])

  // Simulate workflow progress
  useEffect(() => {
    if (!isGenerating) {
      // Reset state when not generating
      setSteps(workflowSteps.map(step => ({ ...step, status: "pending" })))
      setCurrentStepIndex(-1)
      setElapsedTime(0)
      setStepProgress(0)
      return
    }

    let stepTimeout: NodeJS.Timeout
    let progressInterval: NodeJS.Timeout

    const startNextStep = (index: number) => {
      if (index >= steps.length) {
        // All steps completed
        setSteps(prev => prev.map(step => ({ ...step, status: "completed" })))
        onComplete?.()
        return
      }

      setCurrentStepIndex(index)
      setStepProgress(0)

      // Update step status to running
      setSteps(prev =>
        prev.map((step, i) =>
          i === index
            ? { ...step, status: "running" }
            : i < index
              ? { ...step, status: "completed" }
              : step
        )
      )

      // Progress animation for current step
      const stepDuration = steps[index].estimatedTime * 1000
      const progressUpdateInterval = 100 // Update every 100ms
      const progressIncrement = (100 / stepDuration) * progressUpdateInterval

      progressInterval = setInterval(() => {
        setStepProgress(prev => {
          const newProgress = prev + progressIncrement
          return newProgress >= 100 ? 100 : newProgress
        })
      }, progressUpdateInterval)

      // Move to next step after estimated time
      stepTimeout = setTimeout(() => {
        clearInterval(progressInterval)
        setStepProgress(100)

        // Mark current step as completed and move to next
        setSteps(prev =>
          prev.map((step, i) =>
            i === index ? { ...step, status: "completed" } : step
          )
        )

        setTimeout(() => startNextStep(index + 1), 500)
      }, stepDuration)
    }

    // Start the first step after a short delay
    setTimeout(() => startNextStep(0), 1000)

    return () => {
      if (stepTimeout) clearTimeout(stepTimeout)
      if (progressInterval) clearInterval(progressInterval)
    }
  }, [isGenerating, steps.length, onComplete])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getOverallProgress = () => {
    const completedSteps = steps.filter(
      step => step.status === "completed"
    ).length
    const currentProgress = currentStepIndex >= 0 ? stepProgress / 100 : 0
    return ((completedSteps + currentProgress) / steps.length) * 100
  }

  const getStatusIcon = (step: WorkflowStep, index: number) => {
    if (step.status === "completed") {
      return <CheckCircle className="size-5 text-green-600" />
    } else if (step.status === "running") {
      return <Loader2 className="size-5 animate-spin text-blue-600" />
    } else if (step.status === "error") {
      return <div className="size-5 rounded-full bg-red-600" />
    } else {
      return <Clock className="size-5 text-gray-400" />
    }
  }

  const getStatusColor = (step: WorkflowStep) => {
    switch (step.status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200"
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "error":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-600 border-gray-200"
    }
  }

  if (!isGenerating) {
    return null
  }

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin text-blue-600" />
            Generating Experimental Design
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">{formatTime(elapsedTime)}</Badge>
            <Badge variant="secondary">
              {Math.round(getOverallProgress())}% Complete
            </Badge>
          </div>
        </CardTitle>
        <div className="space-y-2">
          <Progress value={getOverallProgress()} className="h-3" />
          <p className="text-sm text-gray-600">
            Multi-agent workflow processing your experimental design...
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStepIndex

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 rounded-lg border p-4 transition-all ${
                  isActive
                    ? "border-blue-200 bg-blue-50"
                    : step.status === "completed"
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="shrink-0">{getStatusIcon(step, index)}</div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="size-4 text-gray-600" />
                    <h3 className="font-medium text-gray-900">{step.name}</h3>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(step)}`}
                    >
                      {step.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {step.status === "running" ? (
                      <div className="space-y-1">
                        <p>
                          Currently analyzing research parameters and setting up
                          the literature search...
                        </p>
                        <p className="text-xs opacity-75">
                          This shouldn&apos;t take too long!
                        </p>
                      </div>
                    ) : step.status === "completed" ? (
                      <p className="text-green-600 dark:text-green-400">
                        ✓ {step.description}
                      </p>
                    ) : (
                      <p className="opacity-60">{step.description}</p>
                    )}
                  </div>

                  {isActive && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Progress</span>
                        <span>{Math.round(stepProgress)}%</span>
                      </div>
                      <Progress value={stepProgress} className="h-2" />
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-xs text-gray-500">
                  ~{step.estimatedTime}s
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <div className="size-2 animate-pulse rounded-full bg-blue-600" />
            </div>
            <div>
              <div className="space-y-1">
                <h4 className="text-sm font-medium">
                  What&apos;s happening now?
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Your design is being generated by our multi-agent AI system.
                  Each agent specializes in a different aspect of experimental
                  design, from literature review to statistical planning.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
