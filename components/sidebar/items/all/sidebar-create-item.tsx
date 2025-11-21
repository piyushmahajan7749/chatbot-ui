import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet"
import { ChatbotUIContext } from "@/context/context"
import { useReportContext } from "@/context/reportcontext"
import { createAssistantCollections } from "@/db/assistant-collections"
import { createAssistantFiles } from "@/db/assistant-files"
import { createAssistantTools } from "@/db/assistant-tools"
import { createAssistant, updateAssistant } from "@/db/assistants"
import { createChat } from "@/db/chats"
import { createCollectionFiles } from "@/db/collection-files"
import { createCollection } from "@/db/collections"
import { createDesign } from "@/db/designs"
import { createFileBasedOnExtension } from "@/db/files"
import { createModel } from "@/db/models"
import { createPreset } from "@/db/presets"
import { createPrompt } from "@/db/prompts"
import { createReportCollections } from "@/db/report-collections"
import { createReport } from "@/db/reports"
import {
  getAssistantImageFromStorage,
  uploadAssistantImage
} from "@/db/storage/assistant-images"
import { createTool } from "@/db/tools"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import { Tables, TablesInsert } from "@/supabase/types"
import { ContentType } from "@/types"
import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// Flag to switch between mock and real API for testing
const USE_MOCK_API = false // Set to false to use real API

interface SidebarCreateItemProps {
  isOpen: boolean
  isTyping: boolean
  onOpenChange: (isOpen: boolean) => void
  contentType: ContentType
  renderInputs: () => JSX.Element
  createState: any
}

export const SidebarCreateItem: FC<SidebarCreateItemProps> = ({
  isOpen,
  onOpenChange,
  contentType,
  renderInputs,
  createState,
  isTyping
}) => {
  const {
    selectedWorkspace,
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setAssistantImages,
    setTools,
    setModels,
    setReports,
    setDesigns
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  const createFunctions = {
    chats: createChat,
    presets: createPreset,
    prompts: createPrompt,

    files: async (
      createState: { file: File } & TablesInsert<"files">,
      workspaceId: string
    ) => {
      if (!selectedWorkspace) return
      const { file, ...rest } = createState
      const createdFile = await createFileBasedOnExtension(
        file,
        rest,
        workspaceId,
        selectedWorkspace.embeddings_provider as "openai" | "local"
      )
      return createdFile
    },
    collections: async (
      createState: {
        image: File
        collectionFiles: TablesInsert<"collection_files">[]
      } & Tables<"collections">,
      workspaceId: string
    ) => {
      const { collectionFiles, ...rest } = createState

      const createdCollection = await createCollection(rest, workspaceId)

      const finalCollectionFiles = collectionFiles.map(collectionFile => ({
        ...collectionFile,
        collection_id: createdCollection.id
      }))

      await createCollectionFiles(finalCollectionFiles)

      return createdCollection
    },
    assistants: async (
      createState: {
        image: File
        files: Tables<"files">[]
        collections: Tables<"collections">[]
        tools: Tables<"tools">[]
      } & Tables<"assistants">,
      workspaceId: string
    ) => {
      const { image, files, collections, tools, ...rest } = createState

      const createdAssistant = await createAssistant(rest, workspaceId)

      let updatedAssistant = createdAssistant

      if (image) {
        const filePath = await uploadAssistantImage(createdAssistant, image)

        updatedAssistant = await updateAssistant(createdAssistant.id, {
          image_path: filePath
        })

        const url = (await getAssistantImageFromStorage(filePath)) || ""

        if (url) {
          const response = await fetch(url)
          const blob = await response.blob()
          const base64 = await convertBlobToBase64(blob)

          setAssistantImages(prev => [
            ...prev,
            {
              assistantId: updatedAssistant.id,
              path: filePath,
              base64,
              url
            }
          ])
        }
      }

      const assistantFiles = files.map(file => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        file_id: file.id
      }))

      const assistantCollections = collections.map(collection => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        collection_id: collection.id
      }))

      const assistantTools = tools.map(tool => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        tool_id: tool.id
      }))

      await createAssistantFiles(assistantFiles)
      await createAssistantCollections(assistantCollections)
      await createAssistantTools(assistantTools)

      return updatedAssistant
    },
    reports: async (
      createState: {
        files: {
          protocol: Tables<"files">[]
          papers: Tables<"files">[]
          dataFiles: Tables<"files">[]
        }
        collections: Tables<"collections">[]
      } & Omit<Tables<"reports">, "workspace_id">,
      workspaceId: string
    ) => {
      const { files, collections, ...reportData } = createState

      const createdReport = await createReport(reportData, workspaceId, {
        protocol: files.protocol || [],
        papers: files.papers || [],
        dataFiles: files.dataFiles || []
      })

      if (collections?.length) {
        const reportCollections = collections.map(collection => ({
          user_id: reportData.user_id,
          report_id: createdReport.id,
          collection_id: collection.id
        }))
        await createReportCollections(reportCollections)
      }

      return createdReport
    },
    designs: async (
      createState: {} & Omit<Tables<"designs">, "workspace_id">,
      workspaceId: string
    ) => {
      const { ...designData } = createState

      const createdDesign = await createDesign(designData, workspaceId)

      return createdDesign
    },
    tools: createTool,
    models: createModel
  }

  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    tools: setTools,
    models: setModels,
    reports: setReports,
    designs: setDesigns
  }

  const handleCreate = async () => {
    try {
      if (!selectedWorkspace) return
      if (isTyping) return // Prevent creation while typing

      setCreating(true)

      // Special handling for designs to call the AI model first
      if (contentType === "designs") {
        console.log(
          "🎯 [SIDEBAR_CREATE] Creating design with state:",
          createState
        )

        // Create a valid design state for API
        const designState = {
          problem: createState.problem || createState.name,
          description: createState.description,
          objectives: createState.objectives || [],
          variables: createState.variables || [],
          specialConsiderations: createState.specialConsiderations || []
        }

        console.log("📤 [SIDEBAR_CREATE] API request payload:", designState)

        try {
          // First create the design in the database
          const newDesign = await createDesign(
            createState,
            selectedWorkspace.id
          )

          console.log("✅ [SIDEBAR_CREATE] Design created:", newDesign)
          console.log("🆔 [SIDEBAR_CREATE] Design ID:", newDesign.id)
          console.log("📝 [SIDEBAR_CREATE] Design name:", newDesign.name)

          if (!newDesign.id) {
            throw new Error("Design was created but has no ID")
          }

          // Update the designs list
          setDesigns((prevItems: any) => [...prevItems, newDesign])

          // Generate a design URL to navigate to after creation
          const designURL = `/${selectedWorkspace.id}/design/${newDesign.id}`
          console.log("🔗 [SIDEBAR_CREATE] Design URL:", designURL)

          // Set localStorage flag to indicate this design is being generated
          localStorage.setItem(`design_generating_${newDesign.id}`, "true")

          // Close the modal first
          onOpenChange(false)

          // Navigate to the design page immediately to show progress
          router.push(designURL)

          // Show a toast that design is being generated
          toast.success(
            USE_MOCK_API
              ? "Design created! Generating content (Mock Mode)..."
              : "Design created! Generating content..."
          )

          // Then call the AI model endpoint to generate the design content in the background
          const planPayload = {
            planId: newDesign.id,
            title: designState.problem || newDesign.name,
            description: designState.description || "",
            constraints: {
              objectives: designState.objectives || [],
              variables: designState.variables || [],
              specialConsiderations: designState.specialConsiderations || []
            },
            preferences: {
              max_hypotheses: 5
            }
          }

          console.log("\n" + "=".repeat(80))
          console.log("🚀 [CREATE_DESIGN_FE] Starting Design Generation")
          console.log("=".repeat(80))
          console.log("📤 [CREATE_DESIGN_REQUEST] API Request:")
          console.log(
            "  🎯 Endpoint:",
            USE_MOCK_API ? "/api/design/mock" : "/api/design/draft"
          )
          console.log(
            "  📋 Request Payload:",
            JSON.stringify(planPayload, null, 2)
          )

          const planKey = `design_plan_${newDesign.id}`
          const statusKey = `design_plan_status_${newDesign.id}`

          try {
            const startTime = Date.now()
            const response = await fetch(
              USE_MOCK_API ? "/api/design/mock" : "/api/design/draft",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(planPayload)
              }
            )

            if (!response.ok) {
              throw new Error(
                `Error generating design draft: ${response.status}`
              )
            }

            const data = await response.json()
            const responseTime = Date.now() - startTime

            console.log(
              `📥 [CREATE_DESIGN_RESPONSE] API Response received in ${responseTime}ms:`
            )
            console.log("  ✅ Success:", data.success)
            console.log(
              "  🔑 Response keys:",
              data ? Object.keys(data).join(", ") : "none"
            )

            if (!data?.success || !data.planId || !data.statusUrl) {
              throw new Error("Unexpected response from design draft API")
            }

            const metadata = {
              planId: data.planId,
              statusUrl: data.statusUrl,
              createdAt: new Date().toISOString(),
              request: planPayload
            }

            localStorage.setItem(planKey, JSON.stringify(metadata))
            localStorage.removeItem(statusKey)
            localStorage.setItem(`design_generating_${newDesign.id}`, "true")
            toast.info("Design draft queued. Tracking progress…")
          } catch (error: any) {
            console.error("Error in design generation:", error)
            toast.error(
              `Error generating design content: ${
                error?.message || "Unknown error"
              }`
            )
            localStorage.removeItem(`design_generating_${newDesign.id}`)
            localStorage.removeItem(planKey)
            localStorage.removeItem(statusKey)
          } finally {
            setCreating(false)
          }

          return
        } catch (error) {
          console.error("Error in design creation:", error)
          toast.error(`Error creating design: ${error}`)
          setCreating(false)
          onOpenChange(false)
          return
        }
      }

      const createFunction = createFunctions[contentType]
      const setStateFunction = stateUpdateFunctions[contentType]

      if (!createFunction || !setStateFunction) return

      const newItem = await createFunction(createState, selectedWorkspace.id)

      setStateFunction((prevItems: any) => [...prevItems, newItem])

      onOpenChange(false)
      setCreating(false)
    } catch (error) {
      toast.error(`Error creating ${contentType.slice(0, -1)}. ${error}.`)
      setCreating(false)
    }
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTyping && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      buttonRef.current?.click()
    }
  }
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex min-w-[450px] flex-col justify-between overflow-auto"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-bold">
              Create{" "}
              {contentType.charAt(0).toUpperCase() + contentType.slice(1, -1)}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">{renderInputs()}</div>
        </div>
        <SheetFooter className="mt-2 flex justify-between">
          <div className="flex grow justify-end space-x-2">
            <Button
              disabled={creating}
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={creating} ref={buttonRef} onClick={handleCreate}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
