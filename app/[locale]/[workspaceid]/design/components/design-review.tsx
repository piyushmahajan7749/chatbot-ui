"use client"

import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"
import { getDesigns } from "@/db/designs"
import { Tables } from "@/supabase/types"
import { FC, useContext, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Edit,
  Sparkles,
  ChevronUp,
  X,
  Check,
  ChevronRight,
  CopyIcon,
  DownloadIcon
} from "lucide-react"
import Loading from "@/app/[locale]/loading"
import ReactMarkdown from "react-markdown"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader } from "@/components/ui/loader"
import PptxGenJS from "pptxgenjs"

// Add this type at the top of the file, after imports
type DesignWithProblem = Tables<"designs"> & { problem?: string }

interface DesignReviewProps {
  designId: string
}

// Helper functions for PPT generation
function getIntroSlide(pptx: PptxGenJS, title: string) {
  let slide = pptx.addSlide()
  slide.background = { color: "0070C0" }
  // Add a title
  slide.addText(title, {
    x: 0, // Center horizontally
    y: 2.16667, // Center vertically
    w: "100%", // Width of the text box to span the entire slide width
    h: 1,
    fontSize: 72,
    color: "ffffff",
    fontFace: "Calibri",
    align: "center",
    valign: "middle"
  })
}

function getContentSlide(pptx: PptxGenJS, title: string, content: string) {
  let slide = pptx.addSlide()
  slide.background = { color: "f0d3dc" }
  slide.addText(title, {
    x: 0.2,
    y: 0.2,
    h: 1,
    w: "100%",
    fontSize: 24,
    color: "000000",
    fontFace: "Calibri",
    align: pptx.AlignH.left,
    valign: pptx.AlignV.top
  })

  slide.addText(content, {
    x: 0.2,
    y: 0.8,
    h: 1,
    w: "90%",
    fontSize: 16,
    color: "000000",
    fontFace: "Calibri",
    align: pptx.AlignH.left,
    valign: pptx.AlignV.top
  })
}

export const DesignReviewComponent: FC<DesignReviewProps> = ({ designId }) => {
  const { profile } = useContext(ChatbotUIContext)
  const { selectedDesign, setSelectedDesign } = useDesignContext()

  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [editedContent, setEditedContent] = useState("")
  const [question, setQuestion] = useState("")
  const [isQuestionSectionVisible, setIsQuestionSectionVisible] = useState(true)
  const [isRegenerateLoading, setRegenerateLoading] = useState(false)
  const [localDesign, setLocalDesign] = useState<DesignWithProblem | null>(null)

  // Mapping for nicer display of section names
  const outlineMapping: Record<string, string> = {
    introduction: "Introduction",
    literatureSummary: "Literature Summary",
    dataInsights: "Data Insights",
    hypothesis: "Hypothesis",
    designOfExperiments: "Design of Experiments",
    statisticalAnalysis: "Statistical Analysis",
    recommendations: "Recommendations",
    content: "Content"
  }

  useEffect(() => {
    // Call fetchDesign on component mount
    if (designId) {
      fetchDesign()
    } else {
      // If no designId, generate a new draft
      generateDraft("New Design", "Initial design description")
    }
  }, [designId])

  const fetchDesign = async () => {
    try {
      setLoading(true)
      setContentLoading(true)
      const response = await fetch(`/api/design/${designId}`)

      if (!response.ok) {
        throw new Error(`Error fetching design: ${response.status}`)
      }

      const data = await response.json()
      const designWithProblem: DesignWithProblem = {
        ...data,
        problem: data.name
      }
      setSelectedDesign(designWithProblem)

      // Check if we need to generate content
      if (
        !generatedOutline.length ||
        Object.keys(sectionContents).length === 0
      ) {
        // Fetch or generate content
        await fetchDesignContent(designWithProblem)
      } else {
        setContentLoading(false)
      }
    } catch (error) {
      console.error("Error fetching design:", error)
      // If fetch fails, fall back to generating a new draft
      generateDraft("New Design", "Initial design description")
    } finally {
      setLoading(false)
    }
  }

  // New function to fetch design content
  const fetchDesignContent = async (design: DesignWithProblem) => {
    try {
      setContentLoading(true)
      console.log("Fetching design content...")

      // Call the API to get design content
      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: design.problem || design.name,
          description: design.description,
          objectives: [],
          variables: [],
          specialConsiderations: []
        })
      })

      if (!response.ok) {
        throw new Error(`Error fetching design content: ${response.status}`)
      }

      const data = await response.json()
      console.log("Design content received:", data)

      if (data.experimentDesign && data.finalReport) {
        // Create a combined object for sections
        const designDraft: Record<string, string> = {}

        // Add all properties from finalReport
        if (data.finalReport.introduction)
          designDraft.introduction = data.finalReport.introduction
        if (data.finalReport.literatureSummary)
          designDraft.literatureSummary = data.finalReport.literatureSummary
        if (data.finalReport.dataInsights)
          designDraft.dataInsights = data.finalReport.dataInsights
        if (data.finalReport.hypothesis)
          designDraft.hypothesis = data.finalReport.hypothesis
        if (data.finalReport.designOfExperiments)
          designDraft.designOfExperiments = data.finalReport.designOfExperiments
        if (data.finalReport.statisticalAnalysis)
          designDraft.statisticalAnalysis = data.finalReport.statisticalAnalysis
        if (data.finalReport.recommendations)
          designDraft.recommendations = data.finalReport.recommendations

        // If no sections were added, add a default one
        if (Object.keys(designDraft).length === 0) {
          designDraft.content = "No content available"
        }

        console.log("Processed design sections:", designDraft)
        console.log("Section keys:", Object.keys(designDraft))

        // Set the outline and section contents
        const outlineKeys = Object.keys(designDraft)
        setGeneratedOutline(outlineKeys)
        setSectionContents(designDraft)

        // Ensure we keep the selected design
        if (!selectedDesign) {
          console.log("No selectedDesign found, creating a new one")
          // Create a basic design if none exists
          const newDesign: DesignWithProblem = {
            id: designId || Date.now().toString(),
            user_id: profile?.id || "",
            name: design.name,
            description: design.description,
            problem: design.problem || design.name,
            sharing: "private",
            created_at: new Date().toISOString(),
            updated_at: null,
            folder_id: null
          }
          setSelectedDesign(newDesign)
          setLocalDesign(newDesign)
        } else {
          console.log("Selected design exists:", selectedDesign)
          setLocalDesign(selectedDesign)
        }

        // Force a re-render by updating a state
        setActiveSection(0)
      } else {
        console.error("Invalid data structure received:", data)
        throw new Error("No design content received")
      }
    } catch (error) {
      console.error("Error fetching design content:", error)
      // Set some default sections if content fetch fails
      const defaultSections = {
        introduction: "Content is being generated...",
        methodology: "Content is being generated...",
        results: "Content is being generated...",
        conclusion: "Content is being generated..."
      }
      setGeneratedOutline(Object.keys(defaultSections))
      setSectionContents(defaultSections)
    } finally {
      setContentLoading(false)
    }
  }

  const generateDraft = async (problem: string, description: string) => {
    setLoading(true)
    setContentLoading(true)
    console.log("Generating draft with problem:", problem)

    try {
      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          description,
          // Add missing required fields that the API expects
          objectives: [],
          variables: [],
          specialConsiderations: []
        })
      })

      if (!response.ok) {
        throw new Error(`Error generating design draft: ${response.status}`)
      }

      const data = await response.json()
      console.log("Draft generation response:", data)

      if (data.experimentDesign && data.finalReport) {
        // Create a combined object for sections
        const designDraft: Record<string, string> = {}

        // Add all properties from finalReport
        if (data.finalReport.introduction)
          designDraft.introduction = data.finalReport.introduction
        if (data.finalReport.literatureSummary)
          designDraft.literatureSummary = data.finalReport.literatureSummary
        if (data.finalReport.dataInsights)
          designDraft.dataInsights = data.finalReport.dataInsights
        if (data.finalReport.hypothesis)
          designDraft.hypothesis = data.finalReport.hypothesis
        if (data.finalReport.designOfExperiments)
          designDraft.designOfExperiments = data.finalReport.designOfExperiments
        if (data.finalReport.statisticalAnalysis)
          designDraft.statisticalAnalysis = data.finalReport.statisticalAnalysis
        if (data.finalReport.recommendations)
          designDraft.recommendations = data.finalReport.recommendations

        // If no sections were added, add a default one
        if (Object.keys(designDraft).length === 0) {
          designDraft.content = "No content available"
        }

        console.log("Processed draft sections:", designDraft)
        console.log("Draft section keys:", Object.keys(designDraft))

        // Set the outline and section contents
        const outlineKeys = Object.keys(designDraft)
        setGeneratedOutline(outlineKeys)
        setSectionContents(designDraft)

        // Force a re-render by updating a state
        setActiveSection(0)

        // Create a design object with the generated data
        const designWithProblem: DesignWithProblem = {
          id: designId || Date.now().toString(),
          user_id: "",
          name: problem,
          description: description,
          sharing: "private",
          created_at: new Date().toISOString(),
          updated_at: null,
          folder_id: null,
          problem: problem
        }

        setSelectedDesign(designWithProblem)
        setLocalDesign(designWithProblem)
      } else {
        console.error("Invalid data structure received:", data)
        throw new Error("No design data received")
      }
    } catch (error) {
      console.error("Error generating draft:", error)

      // Set some default sections if generation fails
      const defaultSections = {
        introduction: "Content is being generated...",
        methodology: "Content is being generated...",
        results: "Content is being generated...",
        conclusion: "Content is being generated..."
      }
      setGeneratedOutline(Object.keys(defaultSections))
      setSectionContents(defaultSections)
    } finally {
      setLoading(false)
      setContentLoading(false)
    }
  }

  const handleEdit = () => {
    console.log("Edit button clicked, setting isEditing to true")
    console.log("Current active section:", generatedOutline[activeSection])
    console.log(
      "Current section content:",
      sectionContents[generatedOutline[activeSection]]
    )

    setIsEditing(true)
    setEditedContent(sectionContents[generatedOutline[activeSection]] || "")
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent("")
  }

  const handleSave = () => {
    console.log("Save button clicked, saving edited content")
    console.log("Section being updated:", generatedOutline[activeSection])
    console.log("New content:", editedContent)

    // console.log("Saving section:", generatedOutline[activeSection], "with content:", editedContent)
    setSectionContents(prev => ({
      ...prev,
      [generatedOutline[activeSection]]: editedContent
    }))

    console.log("Updated section contents:", sectionContents)
    setIsEditing(false)
    setEditedContent("")
  }

  const handleRegenerateSection = async () => {
    if (!selectedDesign) return

    try {
      setRegenerateLoading(true)
      const currentSectionName = generatedOutline[activeSection]
      const currentContent = sectionContents[currentSectionName]

      if (!currentSectionName || !currentContent || !question) {
        console.error("Missing required fields for regeneration")
        return
      }

      const response = await fetch("/api/design/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          sectionName: currentSectionName,
          currentContent: currentContent,
          userFeedback: question
        })
      })

      const result = await response.json()
      if (result.success) {
        setSectionContents(prev => ({
          ...prev,
          [currentSectionName]: result.regeneratedContent
        }))
      }
    } catch (error) {
      console.error("Error regenerating content:", error)
    } finally {
      setQuestion("")
      setRegenerateLoading(false)
    }
  }

  const toggleQuestionSection = () => {
    setIsQuestionSectionVisible(!isQuestionSectionVisible)
  }

  const handleDownload = () => {
    setLoading(true)
    let pptx = new PptxGenJS()

    // Create intro slide
    getIntroSlide(pptx, "Design Document")

    // Iterate through all sections and create content slides
    generatedOutline.forEach(section => {
      const content = sectionContents[section] || ""
      const title =
        outlineMapping[section] || section.replace(/([A-Z])/g, " $1").trim()

      getContentSlide(pptx, title, content)
    })

    pptx.writeFile({ fileName: "Design Document.pptx" }).then(() => {
      setLoading(false)
    })
  }

  // Add a useEffect to log and handle state changes
  useEffect(() => {
    console.log("Generated outline changed:", generatedOutline)
    console.log("Section contents changed:", sectionContents)
    console.log("Selected design state:", selectedDesign)
    console.log("Local design state:", localDesign)

    if (
      generatedOutline.length > 0 &&
      Object.keys(sectionContents).length > 0
    ) {
      console.log("Content is available, setting active section to 0")
      setActiveSection(0)

      // If we have content but no design, create a fallback design
      if (!selectedDesign && !localDesign) {
        console.log(
          "Creating fallback design because content exists but no design is selected"
        )
        const fallbackDesign: DesignWithProblem = {
          id: designId || Date.now().toString(),
          user_id: profile?.id || "",
          name: "Design Draft",
          description: "Generated design",
          problem: "Design Draft",
          sharing: "private",
          created_at: new Date().toISOString(),
          updated_at: null,
          folder_id: null
        }
        setSelectedDesign(fallbackDesign)
        setLocalDesign(fallbackDesign)
      }
    }
  }, [
    generatedOutline,
    sectionContents,
    selectedDesign,
    localDesign,
    designId,
    profile
  ])

  if (loading) {
    return <Loading />
  }

  // Only render content when both design and content are loaded
  const designToUse = selectedDesign || localDesign
  if (!designToUse) {
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-lg font-medium">No design available</p>
      </div>
    )
  }

  // Check if we have content to display
  if (
    generatedOutline.length === 0 ||
    Object.keys(sectionContents).length === 0
  ) {
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-lg font-medium">No design content available</p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex min-w-0 overflow-hidden rounded-lg shadow-lg">
      {contentLoading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating design content" />
        </div>
      ) : (
        <>
          <div className="bg-secondary flex w-[180px] shrink-0 flex-col border-r sm:w-[200px] md:w-[220px]">
            <div className="px-4 py-2">
              <h2 className="text-lg font-bold">
                {(designToUse as DesignWithProblem).problem || designToUse.name}
              </h2>
              {designToUse.description && (
                <p className="text-muted-foreground mt-1 line-clamp-2 pr-2 text-xs">
                  {designToUse.description}
                </p>
              )}
            </div>
            <ScrollArea className="grow">
              <div className="space-y-2 p-4">
                {generatedOutline.map((item, index) => (
                  <button
                    key={index}
                    className={`flex w-full items-center space-x-1 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      activeSection === index
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/10"
                    }`}
                    onClick={() => setActiveSection(index)}
                  >
                    <span className="truncate text-xs sm:text-sm">
                      {outlineMapping[item] ||
                        item.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    {activeSection === index && (
                      <ChevronRight className="ml-auto shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <Separator orientation="vertical" className="bg-white" />
          <div className="bg-secondary flex flex-1 flex-col overflow-hidden">
            <div
              className={`transition-all duration-300 ease-in-out ${isQuestionSectionVisible ? "max-h-[200px]" : "max-h-0 overflow-hidden"} bg-secondary border-b`}
            >
              <div className="p-3 lg:p-4">
                <h3 className="mb-2 text-lg font-semibold">
                  Would you like to change anything?
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      type="text"
                      placeholder="Type your prompt here..."
                      value={question}
                      onChange={e => setQuestion(e.target.value)}
                      className="h-9 w-full"
                    />
                  </div>
                  <Button
                    onClick={handleRegenerateSection}
                    disabled={isRegenerateLoading}
                    size="sm"
                    className="bg-foreground text-background h-9 shrink-0 whitespace-nowrap"
                  >
                    {isRegenerateLoading ? "Regenerating..." : "Go"}
                    <Sparkles className="ml-2 size-4" />
                  </Button>
                  <Button
                    onClick={handleDownload}
                    size="sm"
                    className="text-background h-9 shrink-0 whitespace-nowrap bg-blue-500"
                  >
                    Download <DownloadIcon className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end px-4 md:mt-4 lg:px-6">
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
                      onClick={() => {
                        const content =
                          sectionContents[generatedOutline[activeSection]] || ""
                        navigator.clipboard.writeText(content)
                        // Show a temporary toast or feedback (optional)
                        alert("Content copied to clipboard!")
                      }}
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
            <ScrollArea className="mt-2 h-full px-4 pb-16 md:mt-4 lg:px-6">
              <div className="prose dark:prose-invert w-full max-w-none overflow-x-hidden break-words pb-4 [&>*:first-child]:mt-0 [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
                {isRegenerateLoading ? (
                  <Loader text="Regenerating content" />
                ) : isEditing ? (
                  <textarea
                    className="h-[calc(100vh-16rem)] min-h-[300px] w-full rounded border p-2"
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                  />
                ) : (
                  <ReactMarkdown className="whitespace-pre-wrap break-words">
                    {(sectionContents[generatedOutline[activeSection]] || "")
                      .trim()
                      .replace(/\n{3,}/g, "\n\n")}
                  </ReactMarkdown>
                )}
              </div>
            </ScrollArea>
            {isEditing && (
              <div className="bg-secondary fixed inset-x-0 bottom-0 flex justify-center space-x-4 p-4 shadow-md">
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
