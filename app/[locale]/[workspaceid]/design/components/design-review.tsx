"use client"

import { Button } from "@/components/ui/button"
import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"
import { getDesigns } from "@/db/designs"
import { Tables } from "@/supabase/types"
import { FC, useContext, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Edit, Sparkles, ChevronUp, X, Check } from "lucide-react"
import Loading from "@/app/[locale]/loading"
import ReactMarkdown from "react-markdown"

// Add this type at the top of the file, after imports
type DesignWithProblem = Tables<"designs"> & { problem?: string }

interface DesignReviewProps {
  designId: string
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
  const [isQuestionSectionVisible, setIsQuestionSectionVisible] =
    useState(false)
  const [isRegenerateLoading, setRegenerateLoading] = useState(false)
  const [localDesign, setLocalDesign] = useState<DesignWithProblem | null>(null)

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
    if (!selectedDesign) return

    setIsEditing(true)
    setEditedContent(selectedDesign.description || "")
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent("")
  }

  const handleSave = () => {
    // TODO: Implement save functionality
    setSelectedDesign((prev: Tables<"designs"> | null) =>
      prev
        ? {
            ...prev,
            description: editedContent
          }
        : null
    )
    setIsEditing(false)
    setEditedContent("")
  }

  const handleRegenerateSection = async () => {
    if (!selectedDesign) return

    try {
      setRegenerateLoading(true)
      // TODO: Implement regenerate API call
      const response = await fetch("/api/design/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          currentContent: selectedDesign.description,
          userFeedback: question
        })
      })

      const result = await response.json()
      if (result.success) {
        setSelectedDesign((prev: Tables<"designs"> | null) =>
          prev
            ? {
                ...prev,
                description: result.regeneratedContent
              }
            : null
        )
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

  // Add a useEffect to force a re-render when activeSection changes
  useEffect(() => {
    console.log("Active section changed to:", activeSection)
    // This is just to force a re-render
  }, [activeSection])

  if (loading) {
    return <Loading />
  }

  // Show loading indicator when content is being loaded
  if (contentLoading) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="border-primary size-8 animate-spin rounded-full border-y-2"></div>
          <p className="text-lg font-medium">Generating design content...</p>
          <p className="text-muted-foreground text-sm">
            This may take a minute or two
          </p>
        </div>
      </div>
    )
  }

  // Only render content when both design and content are loaded
  const designToUse = selectedDesign || localDesign
  if (!designToUse) {
    console.log("No selected design available")
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-lg font-medium">No design available</p>
      </div>
    )
  }

  // Debug current state
  console.log("Current state:", {
    selectedDesign: designToUse,
    generatedOutline,
    sectionContentsKeys: Object.keys(sectionContents),
    activeSection,
    currentSectionContent: generatedOutline[activeSection]
      ? sectionContents[generatedOutline[activeSection]]
      : null
  })

  // Check if we have content to display
  if (
    generatedOutline.length === 0 ||
    Object.keys(sectionContents).length === 0
  ) {
    console.log("No content available")
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-lg font-medium">No design content available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className={`transition-all duration-300 ease-in-out ${
          isQuestionSectionVisible ? "max-h-40" : "max-h-0 overflow-hidden"
        }`}
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
              disabled={isRegenerateLoading}
            >
              {isRegenerateLoading ? "Regenerating..." : "Go"}
              <Sparkles className="ml-2 size-4" />
            </Button>
          </div>
        </div>
        <Separator className="bg-foreground my-4" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {designToUse
              ? (designToUse as DesignWithProblem).problem || designToUse.name
              : "Loading..."}
          </h1>
          {isEditing ? (
            <textarea
              className="mt-2 h-32 w-full rounded border p-2"
              value={editedContent}
              onChange={e => setEditedContent(e.target.value)}
            />
          ) : (
            designToUse &&
            designToUse.description && (
              <p className="text-muted-foreground">{designToUse.description}</p>
            )
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isEditing ? (
            <>
              <Button variant="outline" size="icon" onClick={handleEdit}>
                <Edit className="size-4" />
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
          ) : (
            <>
              <Button onClick={handleCancel} variant="outline">
                <X className="mr-2 size-4" />
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Check className="mr-2 size-4" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Section Navigation */}
      {generatedOutline.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {generatedOutline.map((section, index) => (
            <Button
              key={section}
              variant={activeSection === index ? "default" : "outline"}
              onClick={() => setActiveSection(index)}
              className="capitalize"
            >
              {section.replace(/([A-Z])/g, " $1").trim()}
            </Button>
          ))}
        </div>
      )}

      <div className="mt-6 grow px-6">
        {isRegenerateLoading ? (
          <div className="flex size-full items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="border-primary size-8 animate-spin rounded-full border-y-2"></div>
              <p className="text-lg font-medium">Regenerating content...</p>
            </div>
          </div>
        ) : isEditing ? (
          <textarea
            className="h-[calc(100vh-20rem)] w-full rounded border p-2"
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
          />
        ) : (
          <div className="prose dark:prose-invert max-w-none overflow-x-hidden break-words pb-4 [&>*:first-child]:mt-0 [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
            {generatedOutline.length > 0 &&
            activeSection < generatedOutline.length &&
            sectionContents[generatedOutline[activeSection]] ? (
              <ReactMarkdown className="whitespace-pre-wrap break-words">
                {sectionContents[generatedOutline[activeSection]]
                  .trim()
                  .replace(/\n{3,}/g, "\n\n")}
              </ReactMarkdown>
            ) : (
              <div className="flex flex-col space-y-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
