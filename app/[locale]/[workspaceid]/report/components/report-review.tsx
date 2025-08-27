"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader } from "@/components/ui/loader"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  ChevronRight,
  Edit,
  X,
  Check,
  RefreshCcw,
  CopyIcon,
  ChevronUp,
  Sparkles,
  DownloadIcon
} from "lucide-react"
import { getReportFilesByReportId } from "@/db/report-files"
import Loading from "@/app/[locale]/loading"
import ReactMarkdown from "react-markdown"
import PptxGenJS from "pptxgenjs"
import { getContentSlide, getIntroSlide } from "./utils"
import { getReportWithDetails, updateReport } from "@/db/reports"

interface ReportReviewProps {
  onSave: () => void
  reportId: string
}

export function ReportReviewComponent({ onSave, reportId }: ReportReviewProps) {
  const [loading, setLoading] = useState(true)
  const [isRegenerateLoading, setRegenerateLoading] = useState(false)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [question, setQuestion] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [chartImage, setChartImage] = useState<string | null>(null)
  const [isQuestionSectionVisible, setIsQuestionSectionVisible] = useState(true)
  const [canGenerate, setCanGenerate] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<any | null>(null)
  const [pendingObjective, setPendingObjective] = useState<string>("")

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const outlineMapping: Record<string, string> = {
    aim: "Aim",
    introduction: "Introduction",
    principle: "Principle",
    material: "Materials Needed",
    preparation: "Preparation",
    procedure: "Procedure",
    setup: "Setup and Layout",
    dataAnalysis: "Data Analysis",
    results: "Results",
    discussion: "Discussion",
    conclusion: "Conclusion",
    nextSteps: "Next Steps"
  }

  const defaultOutlineOrder = [
    "aim",
    "introduction",
    "principle",
    "material",
    "preparation",
    "procedure",
    "setup",
    "dataAnalysis",
    "charts",
    "results",
    "discussion",
    "conclusion",
    "nextSteps"
  ]

  useEffect(() => {
    const loadReportData = async () => {
      setLoading(true)
      try {
        await fetchReportFiles()
      } catch (error) {
        console.error("Error loading report files:", error)
      }
    }

    loadReportData()
  }, [reportId])

  const fetchReportFiles = async () => {
    if (!reportId) return

    try {
      const [groupedFiles, report] = await Promise.all([
        getReportFilesByReportId(reportId),
        getReportWithDetails(reportId)
      ])

      // If saved content exists, load it
      const savedOutline = (report as any).report_outline as string[] | null
      const savedDraft = (report as any).report_draft as Record<
        string,
        string
      > | null
      const savedChartImage = (report as any).chart_image as string | null

      // Case 1: we have explicit saved outline + draft
      if (savedOutline && savedOutline.length && savedDraft) {
        setGeneratedOutline(savedOutline)
        setSectionContents(savedDraft)
        setChartImage(savedChartImage || savedDraft["charts"] || null)
        setLoading(false)
        return
      }

      // Case 2: outline missing but draft exists – derive outline from draft keys
      if (savedDraft && Object.keys(savedDraft).length > 0) {
        const derived = Object.keys(savedDraft)
        // Order derived keys by our default ordering
        const ordered = derived.sort(
          (a, b) =>
            defaultOutlineOrder.indexOf(a) - defaultOutlineOrder.indexOf(b)
        )
        setGeneratedOutline(ordered)
        setSectionContents(savedDraft)
        setChartImage(savedChartImage || savedDraft["charts"] || null)

        // Persist outline so future loads are straightforward
        updateReport(reportId, { report_outline: ordered } as any).catch(
          () => {}
        )

        setLoading(false)
        return
      }

      // Else do not auto-generate; allow manual generation if files are linked
      if (Object.values(groupedFiles).some(files => files.length > 0)) {
        setPendingFiles(groupedFiles)
        setPendingObjective(report.description)
        setCanGenerate(true)
      }

      setLoading(false)
    } catch (error) {
      console.error("Error fetching report files:", error)
    }
  }

  const generateDraft = async (files: any, reportObjective: string) => {
    setLoading(true)
    try {
      const response = await fetch("/api/report/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentObjective: reportObjective,
          protocol: files.protocol.map((file: any) => file.id),
          papers: files.papers.map((file: any) => file.id),
          dataFiles: files.dataFiles.map((file: any) => file.id)
        })
      })
      const data = await response.json()
      if (data.reportOutline && data.reportDraft) {
        console.log("report draft: " + data.reportDraft)
        setGeneratedOutline(data.reportOutline)
        setSectionContents(data.reportDraft)
        setChartImage(data.chartImage)

        // Persist to DB
        try {
          await updateReport(reportId, {
            report_outline: data.reportOutline,
            report_draft: data.reportDraft,
            chart_image: data.chartImage
          } as any)
        } catch (e) {
          console.error("Failed to save generated report content:", e)
        }
      } else {
        throw new Error("No outline or draft data received")
      }
    } catch (error) {
      console.error("Error generating draft:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Loading />
  }

  const handleSave = () => {
    // Simulate saving data
    console.log("Saving draft:", sectionContents)
    onSave()
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(sectionContents[generatedOutline[activeSection]] || "")
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent("")
  }

  const handleSaveEdit = () => {
    setSectionContents(prev => ({
      ...prev,
      [generatedOutline[activeSection]]: editedContent
    }))
    setIsEditing(false)
    setEditedContent("")

    // Persist to DB
    const updated = {
      ...sectionContents,
      [generatedOutline[activeSection]]: editedContent
    }
    updateReport(reportId, {
      report_draft: updated
    } as any).catch(err => console.error("Failed to save edited section:", err))
  }

  const handleRegenerateSection = async () => {
    try {
      setRegenerateLoading(true)
      const currentSectionName = generatedOutline[activeSection]
      const currentContent = sectionContents[currentSectionName]

      if (!currentSectionName || !currentContent || !question) {
        console.error("Missing required fields:", {
          currentSectionName,
          currentContent,
          question
        })
        throw new Error("Missing required fields for regeneration")
      }

      const response = await fetch("/api/report/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sectionName: currentSectionName,
          currentContent: currentContent,
          userFeedback: question
        })
      })

      const result = await response.json()
      if (result.success) {
        setSectionContents(prev => ({
          ...prev,
          [generatedOutline[activeSection]]: result.regeneratedContent
        }))

        // Persist regenerated section to DB
        const updated = {
          ...sectionContents,
          [generatedOutline[activeSection]]: result.regeneratedContent
        }
        updateReport(reportId, {
          report_draft: updated
        } as any).catch(err =>
          console.error("Failed to save regenerated section:", err)
        )
      } else {
        throw new Error("Failed to regenerate content")
      }
    } catch (error) {
      console.error("Error regenerating content:", error)
      // You might want to add error handling UI here
    } finally {
      setQuestion("")
      setRegenerateLoading(false)
    }
  }

  const handleDownload = () => {
    setLoading(true)
    let pptx = new PptxGenJS()
    getIntroSlide(pptx, "Report")
    // playtestSelected
    // Iterate through all sections and create content slides
    generatedOutline.forEach((section, index) => {
      const content = sectionContents[section] || ""
      const title = outlineMapping[section] || section

      // Assuming getContentSlide is a function similar to getIntroSlide
      getContentSlide(pptx, title, content)
    })

    pptx.writeFile({ fileName: "Report Draft.pptx" }).then(() => {
      setLoading(false)
    })
    setQuestion("")
  }

  const toggleQuestionSection = () => {
    setIsQuestionSectionVisible(!isQuestionSectionVisible)
  }

  return (
    <div className="bg-foreground flex size-full max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg shadow-lg">
      {loading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <>
          <div className="bg-secondary flex w-1/4 flex-col pt-4">
            <div className="px-4 py-2 text-sm text-gray-500"></div>
            <ScrollArea className="grow">
              <div className="space-y-2 p-4">
                {generatedOutline.map((item, index) => (
                  <button
                    key={index}
                    className={`flex w-full items-center space-x-2 rounded-md px-4 py-2 text-left transition-colors ${
                      activeSection === index
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/10"
                    }`}
                    onClick={() => {
                      setActiveSection(index)
                      sectionRefs.current[item]?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                      })
                    }}
                  >
                    <span>{outlineMapping[item] || item}</span>
                    {activeSection === index && (
                      <ChevronRight className="ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <Separator orientation="vertical" className="bg-white" />
          <div
            style={{ maxWidth: "100%" }}
            className="bg-secondary flex w-3/4 min-w-0 flex-col"
          >
            <div
              className={`transition-all duration-300 ease-in-out ${isQuestionSectionVisible ? "max-h-40" : "max-h-0 overflow-hidden"}`}
            >
              <div className="p-6">
                <h3 className="mb-2 text-lg font-semibold">
                  Would you like to change anything?
                </h3>
                <div className="mt-4 flex w-full items-center">
                  <Input
                    type="text"
                    placeholder="Type your prompt here..."
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    className="mr-4 h-12 grow"
                  />
                  <Button
                    onClick={handleRegenerateSection}
                    className="bg-foreground text-background"
                  >
                    Go <Sparkles className="ml-2 size-4" />
                  </Button>
                  {canGenerate && (
                    <Button
                      onClick={() => {
                        if (pendingFiles) {
                          generateDraft(pendingFiles, pendingObjective)
                          setCanGenerate(false)
                        }
                      }}
                      className="text-background ml-4 bg-green-600"
                    >
                      Generate Draft
                    </Button>
                  )}
                  <Button
                    onClick={handleDownload}
                    className="text-background ml-4 bg-blue-500"
                  >
                    Download Report <DownloadIcon className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
              <Separator className="bg-foreground my-4" />
            </div>
            <div className="mt-6 flex items-center justify-end px-6">
              {/* <h2 className="text-primary text-3xl font-bold">
                {outlineMapping[generatedOutline[activeSection]]}
              </h2> */}
              <div className="flex items-center space-x-2">
                {!isEditing && (
                  <>
                    <Button variant="outline" size="icon" onClick={handleEdit}>
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      title="Copy to clipboard"
                      variant="outline"
                      size="icon"
                      onClick={handleEdit}
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleQuestionSection}
                      title={
                        isQuestionSectionVisible
                          ? "Hide question section"
                          : "Show question section"
                      }
                    >
                      {isQuestionSectionVisible ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <ScrollArea className="mt-6 grow px-6">
              <div className="space-y-10">
                {generatedOutline.map((section, index) => (
                  <div
                    key={section}
                    ref={el => {
                      sectionRefs.current[section] = el
                    }}
                    className="pb-4"
                  >
                    <h2
                      className={`mb-3 text-2xl font-bold ${
                        activeSection === index ? "text-primary" : ""
                      }`}
                    >
                      {outlineMapping[section] || section}
                    </h2>

                    {section === "charts" ? (
                      <div className="prose dark:prose-invert max-w-none overflow-x-auto break-words pb-4 [&>*:first-child]:mt-0 [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
                        {chartImage && (
                          <img
                            src={chartImage}
                            alt="Data visualization chart"
                            className="h-auto max-w-full rounded-lg shadow-lg"
                          />
                        )}
                      </div>
                    ) : isEditing && activeSection === index ? (
                      <textarea
                        className="h-[calc(100vh-20rem)] w-full rounded border p-2"
                        value={editedContent}
                        onChange={e => setEditedContent(e.target.value)}
                      />
                    ) : isRegenerateLoading && activeSection === index ? (
                      <Loader text="Regenerating content" />
                    ) : (
                      <div className="prose dark:prose-invert max-w-none overflow-x-auto break-words pb-4 [&>*:first-child]:mt-0 [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
                        <ReactMarkdown className="whitespace-pre-wrap break-words">
                          {(sectionContents[section] || "")
                            .trim()
                            .replace(/\n{3,}/g, "\n\n")}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            {isEditing && (
              <div className="bg-secondary mt-auto flex justify-center space-x-4 p-4">
                <Button
                  className="bg-foreground h-10 w-28 opacity-70"
                  onClick={handleCancel}
                >
                  <X className="mr-2 size-4" />
                  Cancel
                </Button>
                <Button className="h-10 w-28" onClick={handleSaveEdit}>
                  <Check className="mr-2 size-4" />
                  Save
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ReportReviewComponent
