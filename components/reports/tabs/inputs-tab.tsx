"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tables } from "@/supabase/types"
import {
  IconLoader2,
  IconRefresh,
  IconSparkles,
  IconUpload
} from "@tabler/icons-react"
import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"
import { ChatbotUIContext } from "@/context/context"
import { createFileBasedOnExtension } from "@/db/files"
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

// Accepted upload formats per the scientist's spec: pdf / docx / csv / jpeg.
// `.jpg` is the same MIME family as `.jpeg`; both are allowed.
const ACCEPTED_FILE_EXTS = ".pdf,.docx,.csv,.jpeg,.jpg"

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

  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)
  const [uploadingType, setUploadingType] = useState<
    "protocol" | "papers" | "dataFiles" | null
  >(null)

  // One hidden <input type="file"> per field so the Upload buttons can
  // trigger their own picker. Refs are kept stable across renders.
  const protocolUploadRef = useRef<HTMLInputElement>(null)
  const papersUploadRef = useRef<HTMLInputElement>(null)
  const dataFilesUploadRef = useRef<HTMLInputElement>(null)

  // Shared upload handler. Drives `createFileBasedOnExtension`, which
  // both uploads to storage and emits the `files.process` event so the
  // file becomes part of the RAG corpus. Once persisted we feed the
  // resulting row straight into `onToggleFile` so the new file shows up
  // as selected (no separate "now pick the file you just uploaded"
  // step).
  const handleUploadFiles = async (
    type: "protocol" | "papers" | "dataFiles",
    fileList: FileList | null
  ) => {
    if (!fileList || fileList.length === 0) return
    if (!profile || !selectedWorkspace) {
      toast.error("Sign in and select a workspace before uploading.")
      return
    }
    setUploadingType(type)
    try {
      for (const file of Array.from(fileList)) {
        try {
          const created = await createFileBasedOnExtension(
            file,
            {
              user_id: profile.user_id,
              description: "",
              file_path: "",
              name: file.name,
              size: file.size,
              tokens: 0,
              type: file.type,
              sharing: "private"
            },
            selectedWorkspace.id,
            (selectedWorkspace.embeddings_provider as "openai" | "local") ??
              "openai"
          )
          // `createFileBasedOnExtension` returns a Promise<Tables<"files">>
          // shape on success.
          onToggleFile(type, created as Tables<"files">)
        } catch (err: any) {
          console.error("Upload failed for file:", file.name, err)
          toast.error(`Upload failed: ${file.name}`)
        }
      }
      toast.success("File(s) uploaded")
    } finally {
      setUploadingType(null)
    }
  }

  // Helper that renders the dropdown picker, the upload-button row, the
  // hidden file input, and a tiny caption underneath. Centralises the
  // three near-identical fields without forcing a separate component
  // file. The label / caption are passed in so each field stays
  // self-explanatory.
  const renderFileField = (params: {
    label: string
    required?: boolean
    type: "protocol" | "papers" | "dataFiles"
    selected: Tables<"files">[]
    uploadRef: React.RefObject<HTMLInputElement>
    caption: string
  }) => {
    const isUploading = uploadingType === params.type
    return (
      <div className="space-y-1.5">
        <Label>
          {params.label}{" "}
          {params.required ? <span className="text-red-500">*</span> : null}
        </Label>
        <ReportRetrievalSelect
          selectedRetrievalItems={params.selected}
          onRetrievalItemSelect={item =>
            onToggleFile(params.type, item as Tables<"files">)
          }
          fileType={params.type}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-ink-400 text-xs">{params.caption}</p>
          <div>
            <input
              ref={params.uploadRef}
              type="file"
              accept={ACCEPTED_FILE_EXTS}
              multiple
              className="hidden"
              onChange={e => {
                void handleUploadFiles(params.type, e.target.files)
                // Reset value so re-picking the same file fires the
                // change event again.
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => params.uploadRef.current?.click()}
              disabled={isUploading || isGenerating}
            >
              {isUploading ? (
                <>
                  <IconLoader2 size={14} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <IconUpload size={14} />
                  Upload file
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

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
                    {/* "Visualization" replaces the old "chart" label so
                        the template card reads consistently with the
                        section heading inside the report. */}
                    {t.includeChart ? " · visualization" : ""}
                  </div>
                  {/* Use-case caption - tells a PhD/postdoc *when* to
                      pick this template. Kept to 3-5 words by spec. */}
                  <div className="text-ink-700 mt-1 text-[11px] italic">
                    {t.useCase}
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
            <p className="text-ink-400 text-xs">
              One short paragraph that frames the question this report answers -
              used by the agents to focus the analysis.
            </p>
          </div>

          {/* Field rename: Protocol → Design/Plan/Procedure. The internal
              `protocol` key stays the same so persisted reports and the
              report-outline route signature don't need migrating. */}
          {renderFileField({
            label: "Design / Plan / Procedure",
            required: true,
            type: "protocol",
            selected: protocol,
            uploadRef: protocolUploadRef,
            caption:
              "The experimental design, plan, or step-by-step procedure document this report is built from."
          })}

          {/* Field rename: Preparation / Reference Papers → Reference
              Documents / Other Files. Caption tells the user what to
              put here. */}
          {renderFileField({
            label: "Reference Documents / Other Files",
            type: "papers",
            selected: papers,
            uploadRef: papersUploadRef,
            caption:
              "Supporting papers, prior reports, SOPs, or notes the report should cite or draw context from."
          })}

          {renderFileField({
            label: "Data Files",
            type: "dataFiles",
            selected: dataFiles,
            uploadRef: dataFilesUploadRef,
            caption: "Experimental data the analysis agent should work from."
          })}

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
