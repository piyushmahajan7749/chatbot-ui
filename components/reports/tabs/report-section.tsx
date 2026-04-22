"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { IconEdit, IconRefresh, IconSparkles } from "@tabler/icons-react"
import { FC, useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface ReportSectionProps {
  sectionKey: string
  title: string
  content: string
  onRegenerate: (sectionKey: string, feedback: string) => Promise<void>
  onEditContent?: (sectionKey: string, value: string) => void
  isBusy: boolean
  accentClassName?: string
}

export const ReportSection: FC<ReportSectionProps> = ({
  sectionKey,
  title,
  content,
  onRegenerate,
  onEditContent,
  isBusy,
  accentClassName
}) => {
  const [mode, setMode] = useState<"view" | "edit" | "ai">("view")
  const [draftText, setDraftText] = useState(content)
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    if (mode !== "edit") setDraftText(content)
  }, [content, mode])

  const handleRegenerate = async () => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    await onRegenerate(sectionKey, trimmed)
    setFeedback("")
    setMode("view")
  }

  const handleSaveEdit = () => {
    if (onEditContent && draftText !== content) {
      onEditContent(sectionKey, draftText)
    }
    setMode("view")
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className={"text-lg " + (accentClassName ?? "text-ink-900")}>
          {title}
        </CardTitle>
        <div className="flex gap-2">
          {onEditContent && mode !== "ai" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (mode === "edit") {
                  handleSaveEdit()
                } else {
                  setDraftText(content)
                  setMode("edit")
                }
              }}
              disabled={isBusy}
            >
              <IconEdit size={14} />
              {mode === "edit" ? "Save" : "Edit"}
            </Button>
          )}
          {mode !== "edit" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setMode(mode === "ai" ? "view" : "ai")}
              disabled={isBusy || !content}
            >
              <IconRefresh size={14} />
              {mode === "ai" ? "Cancel" : "Edit with AI"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "edit" ? (
          <Textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            rows={Math.max(6, Math.min(24, draftText.split("\n").length + 1))}
            className="font-mono text-sm"
          />
        ) : content ? (
          <div className="prose prose-sm text-ink-800 max-w-none leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-ink-400 text-sm italic">
            No content generated yet.
          </p>
        )}

        {mode === "ai" && (
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
                {isBusy ? "Regenerating…" : "Regenerate with AI"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
