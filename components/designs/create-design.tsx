import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "@/context/context"
import { FC, useContext, useRef, useState } from "react"
import { Tables } from "@/supabase/types"
import { useDesignContext } from "@/context/designcontext"
import { TextareaAutosize } from "../ui/textarea-autosize"

interface CreateDesignProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

export const CreateDesign: FC<CreateDesignProps> = ({
  isOpen,
  onOpenChange
}) => {
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)

  const [problem, setProblem] = useState("")
  const [description, setDescription] = useState("")
  const problemInputRef = useRef<HTMLTextAreaElement>(null)
  const descInputRef = useRef<HTMLTextAreaElement>(null)

  if (!profile || !selectedWorkspace) return null

  return (
    <SidebarCreateItem
      contentType="designs"
      isTyping={false}
      createState={{
        user_id: profile.user_id,
        problem,
        description,
        sharing: "private"
      }}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>Research Problem</Label>
            <TextareaAutosize
              textareaRef={problemInputRef}
              className="text-md"
              value={problem}
              onValueChange={setProblem}
              minRows={2}
              maxRows={4}
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Description</Label>
            <TextareaAutosize
              textareaRef={descInputRef}
              className="text-md"
              value={description}
              onValueChange={setDescription}
              minRows={2}
              maxRows={4}
            />
          </div>
        </>
      )}
    />
  )
}
