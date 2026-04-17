"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { IconRefresh, IconSparkles } from "@tabler/icons-react"
import { FC, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface ReportSectionProps {
  sectionKey: string
  title: string
  content: string
  onRegenerate: (sectionKey: string, feedback: string) => Promise<void>
  isBusy: boolean
  accentClassName?: string
}

export const ReportSection: FC<ReportSectionProps> = ({
  sectionKey,
  title,
  content,
  onRegenerate,
  isBusy,
  accentClassName
}) => {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState("")

  const handleRegenerate = async () => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    await onRegenerate(sectionKey, trimmed)
    setFeedback("")
    setShowFeedback(false)
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className={"text-lg " + (accentClassName ?? "text-ink-900")}>
          {title}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowFeedback(v => !v)}
          disabled={isBusy || !content}
        >
          <IconRefresh size={14} />
          {showFeedback ? "Cancel" : "Regenerate"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {content ? (
          <div className="prose prose-sm text-ink-800 max-w-none leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-ink-400 text-sm italic">
            No content generated yet.
          </p>
        )}

        {showFeedback && (
          <div className="border-ink-100 space-y-2 border-t pt-3">
            <Textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="What should change about this section?"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleRegenerate}
                disabled={isBusy || !feedback.trim()}
                className="gap-1.5"
              >
                <IconSparkles size={14} />
                {isBusy ? "Regenerating…" : "Regenerate with feedback"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
