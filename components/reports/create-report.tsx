import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "../../context/context"
import { FC, useContext, useState } from "react"
import { Tables, TablesInsert } from "@/supabase/types"
import { REPORT_DESCRIPTION_MAX } from "@/db/limits"
import { ReportRetrievalSelect } from "./report-retrieval-select"
import { useReportContext } from "@/context/reportcontext"

interface CreateReportProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  projectId?: string
}

export const CreateReport: FC<CreateReportProps> = ({
  isOpen,
  onOpenChange,
  projectId
}) => {
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<{
    protocol: Tables<"files">[]
    papers: Tables<"files">[]
    dataFiles: Tables<"files">[]
  }>({
    protocol: [],
    papers: [],
    dataFiles: []
  })

  const handleFileSelect = (
    fileType: "protocol" | "papers" | "dataFiles",
    item: Tables<"files">
  ) => {
    setSelectedFiles(prev => {
      // For protocol, only allow one file
      if (fileType === "protocol") {
        return {
          ...prev,
          [fileType]: [item]
        }
      }

      // For other types, allow multiple files
      const currentFiles = prev[fileType]
      const isItemSelected = currentFiles.find(file => file.id === item.id)

      return {
        ...prev,
        [fileType]: isItemSelected
          ? currentFiles.filter(file => file.id !== item.id)
          : [...currentFiles, item]
      }
    })
  }

  if (!profile || !selectedWorkspace) return null

  return (
    <SidebarCreateItem
      contentType="reports"
      isTyping={false}
      createState={{
        user_id: profile.user_id,
        name,
        description,
        sharing: "private",
        workspace_id: selectedWorkspace.id,
        project_id: projectId || null,
        files: selectedFiles
      }}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              placeholder="Report name..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Objective</Label>
            <Input
              placeholder="Experiment objective..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Protocol</Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={selectedFiles.protocol}
              onRetrievalItemSelect={item =>
                handleFileSelect("protocol", item as Tables<"files">)
              }
              fileType="protocol"
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Preparation Files</Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={selectedFiles.papers}
              onRetrievalItemSelect={item =>
                handleFileSelect("papers", item as Tables<"files">)
              }
              fileType="papers"
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Data Files</Label>
            <ReportRetrievalSelect
              selectedRetrievalItems={selectedFiles.dataFiles}
              onRetrievalItemSelect={item =>
                handleFileSelect("dataFiles", item as Tables<"files">)
              }
              fileType="dataFiles"
            />
          </div>
        </>
      )}
    />
  )
}
