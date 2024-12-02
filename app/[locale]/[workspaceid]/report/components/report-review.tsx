"use client"

import { useState, useEffect } from "react"
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

interface ReportReviewProps {
  onSave: () => void
  reportId: string
}

export function ReportReviewComponent({ onSave, reportId }: ReportReviewProps) {
  const [loading, setLoading] = useState(true)
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
      const groupedFiles = await getReportFilesByReportId(reportId)
      if (Object.values(groupedFiles).some(files => files.length > 0)) {
        generateDraft(groupedFiles)
      }
    } catch (error) {
      console.error("Error fetching report files:", error)
    }
  }

  const generateDraft = async (files: any) => {
    setLoading(true)
    try {
      const response = await fetch("/api/report/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentObjective: "",
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

  const handleSectionClick = (index: number) => {
    setActiveSection(index)
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
  }

  const handleAskQuestion = () => {
    // Simulate asking a question
    console.log("Asking question:", question)
    // Here you would typically make an API call to get the answer
    // For now, we'll just clear the input
    setQuestion("")
  }

  const handleDownload = () => {
    // Simulate asking a question
    console.log("Asking question:", question)
    // Here you would typically make an API call to get the answer
    // For now, we'll just clear the input
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
                    onClick={() => setActiveSection(index)}
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
                    onClick={handleAskQuestion}
                    className="bg-foreground text-background"
                  >
                    Go <Sparkles className="ml-2 size-4" />
                  </Button>
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
            <div className="mt-6 flex items-center justify-between px-6">
              <h2 className="text-primary text-3xl font-bold">
                {outlineMapping[generatedOutline[activeSection]]}
              </h2>
              <div className="flex items-center space-x-2">
                {!isEditing && (
                  <>
                    <Button variant="outline" size="icon" onClick={handleEdit}>
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      title="Regenerate"
                      variant="outline"
                      size="icon"
                      onClick={handleEdit}
                    >
                      <RefreshCcw className="size-4" />
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
              <div className="prose dark:prose-invert max-w-none overflow-x-hidden break-words pb-4">
                {isEditing ? (
                  <textarea
                    className="h-[calc(100vh-20rem)] w-full rounded border p-2"
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                  />
                ) : (
                  <div className="h-[calc(100vh-20rem)] whitespace-pre-wrap break-words">
                    {sectionContents[generatedOutline[activeSection]] || ""}
                  </div>
                )}
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
                <Button className="h-10 w-28" onClick={handleSave}>
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
