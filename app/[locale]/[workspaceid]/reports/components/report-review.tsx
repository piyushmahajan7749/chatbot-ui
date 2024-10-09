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
  Download,
  DownloadIcon
} from "lucide-react"

// Mock data
const mockData = {
  reportOutline: [
    "Overview",
    "Research Questions",
    "Founders",
    "Competing/Related Companies",
    "Funding Data",
    "Glassdoor Reviews",
    "Decision Makers",
    "News Articles",
    "Funding Stages",
    "Web Traffic",
    "Twitter Follower Count",
    "Team Growth",
    "Organic and PPC Spend, Traffic, and Keywords",
    "Organic Keywords",
    "Tech Products"
  ],
  reportDraft: {
    Overview:
      "Agent.ai is a cutting-edge platform that provides AI-powered tools and services...",
    "Research Questions":
      "• What is the lowest price they offer and for which product?\nThe lowest price offered by OpenAI is $0.15 per 1M tokens for the GPT-4a mini model. This model is their most cost-efficient small model with vision capabilities and an October 2023 knowledge cutoff.\n\n• What is the highest priced they offer and for which product?\nThe highest priced product offered by OpenAI is GPT-4a, with a price of $25.00 per 1M tokens for fine-tuning over the daily complimentary limit.\n\n• Do they sell a subscription product?\nYes, OpenAI sells a subscription product called ChatGPT Plus, which is priced at a flat rate of $20/month.\n\n• Where are their offices located?\nOpenAI is headquartered in San Francisco, California."
    // ... (other sections)
  }
}

interface ReportReviewProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function ReportReviewComponent({
  onCancel,
  onSave,
  colorId
}: ReportReviewProps) {
  const [isLoading, setLoading] = useState(true)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [question, setQuestion] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [isQuestionSectionVisible, setIsQuestionSectionVisible] = useState(true)

  useEffect(() => {
    // Simulate API call with setTimeout
    const timer = setTimeout(() => {
      setGeneratedOutline(mockData.reportOutline)
      setSectionContents(mockData.reportDraft)
      setLoading(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

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
    <div className="bg-foreground flex max-h-[calc(100vh-6rem)] overflow-hidden rounded-lg shadow-lg">
      {isLoading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <>
          <div className="bg-secondary flex w-1/3 flex-col pt-4">
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
                    <span>{item}</span>
                    {activeSection === index && (
                      <ChevronRight className="ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <Separator orientation="vertical" />
          <div className="bg-secondary flex w-2/3 flex-col">
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
                {generatedOutline[activeSection]}
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
              <div className="prose dark:prose-invert max-w-none">
                {isEditing ? (
                  <textarea
                    className="h-[calc(100vh-20rem)] w-full rounded border p-2"
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">
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
