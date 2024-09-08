import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "../../context/context"
import { FC, useContext, useState } from "react"

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

  if (!profile || !selectedWorkspace) return null

  return (
    <SidebarCreateItem
      contentType="reports"
      createState={{
        user_id: profile.user_id,
        name,
        description,
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
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              placeholder="Report description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </>
      )}
      isTyping={false}
    />
  )
}
