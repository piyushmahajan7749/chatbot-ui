import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "../../context/context"
import { FC, useContext, useState } from "react"
import { Tables, TablesInsert } from "@/supabase/types"
import { ASSISTANT_DESCRIPTION_MAX } from "@/db/limits"
import { AssistantRetrievalSelect } from "../sidebar/items/assistants/assistant-retrieval-select"

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
  const [selectedReportRetrievalItems, setSelectedReportRetrievalItems] =
    useState<Tables<"files">[] | Tables<"collections">[]>([])

  if (!profile || !selectedWorkspace) return null

  const handleRetrievalItemSelect = (
    item: Tables<"files"> | Tables<"collections">
  ) => {
    setSelectedReportRetrievalItems(prevState => {
      const isItemAlreadySelected = prevState.find(
        selectedItem => selectedItem.id === item.id
      )

      if (isItemAlreadySelected) {
        return prevState.filter(selectedItem => selectedItem.id !== item.id)
      } else {
        return [...prevState, item]
      }
    })
  }

  return (
    <SidebarCreateItem
      contentType="reports"
      createState={
        {
          user_id: profile.user_id,
          name,
          description,
          files: selectedReportRetrievalItems.filter(item =>
            item.hasOwnProperty("type")
          ) as Tables<"files">[],
          collections: selectedReportRetrievalItems.filter(
            item => !item.hasOwnProperty("type")
          ) as Tables<"collections">[]
        } as unknown as TablesInsert<"reports">
      }
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
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              placeholder="Report description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={ASSISTANT_DESCRIPTION_MAX}
            />
          </div>
          <div className="space-y-1 pt-2">
            <Label>Files & Collections</Label>

            <AssistantRetrievalSelect
              selectedAssistantRetrievalItems={selectedReportRetrievalItems}
              onAssistantRetrievalItemsSelect={handleRetrievalItemSelect}
            />
          </div>
        </>
      )}
      isTyping={false}
    />
  )
}
