import { SidebarCreateItem } from "../sidebar/items/all/sidebar-create-item"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ChatbotUIContext } from "@/context/context"
import { FC, useContext, useRef, useState } from "react"
import { Tables } from "@/supabase/types"
import { useDesignContext } from "@/context/designcontext"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { Button } from "../ui/button"
import { Plus, X } from "lucide-react"

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
  const [objective, setObjective] = useState("")
  const [objectives, setObjectives] = useState<string[]>([])
  const [variable, setVariable] = useState("")
  const [variables, setVariables] = useState<string[]>([])
  const [consideration, setConsideration] = useState("")
  const [specialConsiderations, setSpecialConsiderations] = useState<string[]>(
    []
  )

  const problemInputRef = useRef<HTMLTextAreaElement>(null)
  const descInputRef = useRef<HTMLTextAreaElement>(null)

  const addObjective = () => {
    if (objective && !objectives.includes(objective)) {
      setObjectives([...objectives, objective])
      setObjective("")
    }
  }

  const removeObjective = (index: number) => {
    setObjectives(objectives.filter((_, i) => i !== index))
  }

  const addVariable = () => {
    if (variable && !variables.includes(variable)) {
      setVariables([...variables, variable])
      setVariable("")
    }
  }

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  const addConsideration = () => {
    if (consideration && !specialConsiderations.includes(consideration)) {
      setSpecialConsiderations([...specialConsiderations, consideration])
      setConsideration("")
    }
  }

  const removeConsideration = (index: number) => {
    setSpecialConsiderations(
      specialConsiderations.filter((_, i) => i !== index)
    )
  }

  if (!profile || !selectedWorkspace) return null

  return (
    <SidebarCreateItem
      contentType="designs"
      isTyping={false}
      createState={{
        user_id: profile.user_id,
        problem,
        name: problem,
        description,
        sharing: "private",
        objectives,
        variables,
        specialConsiderations
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

          <div className="space-y-1 pt-2">
            <Label>Objectives</Label>
            <div className="flex space-x-2">
              <Input
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="Add an objective"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addObjective()
                  }
                }}
              />
              <Button type="button" size="icon" onClick={addObjective}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              {objectives.map((obj, index) => (
                <div
                  key={index}
                  className="bg-secondary/50 flex items-center justify-between rounded-md p-2"
                >
                  <span className="text-sm">{obj}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeObjective(index)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <Label>Variables</Label>
            <div className="flex space-x-2">
              <Input
                value={variable}
                onChange={e => setVariable(e.target.value)}
                placeholder="Add a variable"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addVariable()
                  }
                }}
              />
              <Button type="button" size="icon" onClick={addVariable}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              {variables.map((v, index) => (
                <div
                  key={index}
                  className="bg-secondary/50 flex items-center justify-between rounded-md p-2"
                >
                  <span className="text-sm">{v}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeVariable(index)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <Label>Special Considerations</Label>
            <div className="flex space-x-2">
              <Input
                value={consideration}
                onChange={e => setConsideration(e.target.value)}
                placeholder="Add a consideration"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addConsideration()
                  }
                }}
              />
              <Button type="button" size="icon" onClick={addConsideration}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              {specialConsiderations.map((sc, index) => (
                <div
                  key={index}
                  className="bg-secondary/50 flex items-center justify-between rounded-md p-2"
                >
                  <span className="text-sm">{sc}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeConsideration(index)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    />
  )
}
