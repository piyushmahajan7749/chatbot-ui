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

interface DesignReviewProps {
  designId: string
}

export const DesignReviewComponent: FC<DesignReviewProps> = ({ designId }) => {
  const { profile } = useContext(ChatbotUIContext)
  const { selectedDesign, setSelectedDesign } = useDesignContext()

  const [isLoading, setLoading] = useState(true)
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

  useEffect(() => {
    const fetchDesign = async () => {
      try {
        debugger
        const designs = await getDesigns(profile?.user_id || "")
        const design = designs.find(d => d.id === designId)
        if (design) {
          setSelectedDesign(design)
          generateDraft(design.problem, design.description)
        }
      } catch (error) {
        console.error("Error fetching design:", error)
      }
    }

    if (profile?.user_id) {
      fetchDesign()
    }

    setLoading(false)
  }, [designId, profile?.user_id, setSelectedDesign])

  const generateDraft = async (problem: string, description: string) => {
    setLoading(true)
    try {
      const response = await fetch("/api/design/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          description
        })
      })
      const data = await response.json()
      if (data.designOutline && data.designDraft) {
        setGeneratedOutline(data.designOutline)
        setSectionContents(data.designDraft)
      } else {
        throw new Error("No outline or draft data received")
      }
    } catch (error) {
      console.error("Error generating draft:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(selectedDesign!.description || "")
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
    try {
      setRegenerateLoading(true)
      // TODO: Implement regenerate API call
      const response = await fetch("/api/design/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          currentContent: selectedDesign!.description,
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

  if (isLoading) {
    return <Loading />
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
          <h1 className="text-2xl font-bold">{selectedDesign!.problem}</h1>
          {isEditing ? (
            <textarea
              className="mt-2 h-32 w-full rounded border p-2"
              value={editedContent}
              onChange={e => setEditedContent(e.target.value)}
            />
          ) : (
            selectedDesign!.description && (
              <p className="text-muted-foreground">
                {selectedDesign!.description}
              </p>
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
    </div>
  )
}
