import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "../../context/context"
import { FC, useContext, useState } from "react"
import { Tables, TablesInsert } from "@/supabase/types"
import { REPORT_DESCRIPTION_MAX } from "@/db/limits"
import { ReportRetrievalSelect } from "./report-retrieval-select"

interface CreateReportProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

export const CreateReport: FC<CreateReportProps> = ({
  isOpen,
  onOpenChange
}) => {
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<Tables<"files">[]>([])

  // Simplified handler for file selection
  const handleFileSelect = (item: Tables<"files"> | Tables<"collections">) => {
    if ("file_path" in item) {
      // Check if item is a file
      setSelectedFiles(prevState => {
        const isItemAlreadySelected = prevState.find(
          selectedItem => selectedItem.id === item.id
        )

        if (isItemAlreadySelected) {
          return prevState.filter(selectedItem => selectedItem.id !== item.id)
        }
        return [...prevState, item as Tables<"files">]
      })
    }
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
        workspace_id: selectedWorkspace.id
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
            <Label>Description</Label>
            <Input
              placeholder="Report description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={REPORT_DESCRIPTION_MAX}
            />
          </div>
        </>
      )}
    />
  )
}
