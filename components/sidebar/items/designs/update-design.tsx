import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"
import { updateDesign } from "@/db/designs"
import { Tables } from "@/supabase/types"
import { FC, useContext, useEffect, useState } from "react"
import { toast } from "sonner"
import { Pencil } from "lucide-react"

interface UpdateDesignProps {
  design: Tables<"designs">
}

export const UpdateDesign: FC<UpdateDesignProps> = ({ design }) => {
  const { selectedWorkspace, designs, setDesigns } =
    useContext(ChatbotUIContext)
  const { setSelectedDesign } = useDesignContext()

  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [problem, setProblem] = useState(design.problem)
  const [description, setDescription] = useState(design.description || "")

  useEffect(() => {
    if (showUpdateDialog) {
      setProblem(design.problem)
      setDescription(design.description || "")
    }
  }, [showUpdateDialog, design])

  const handleUpdate = async () => {
    if (!selectedWorkspace) return
    if (!problem) return

    try {
      setUpdating(true)

      const updatedDesign = await updateDesign(design.id, {
        problem,
        description,
        user_id: design.user_id
      })

      setDesigns(designs.map(r => (r.id === design.id ? updatedDesign : r)))
      setSelectedDesign(updatedDesign)

      toast.success("Design updated!")
      setShowUpdateDialog(false)
    } catch (error) {
      toast.error("Error updating design.")
    } finally {
      setUpdating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleUpdate()
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowUpdateDialog(true)}
      >
        <Pencil className="size-4" />
      </Button>

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle>Update Design</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Problem</Label>
              <Input
                placeholder="Research Problem..."
                value={problem}
                onChange={e => setProblem(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Design description..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowUpdateDialog(false)}
              disabled={updating}
            >
              Cancel
            </Button>

            <Button onClick={handleUpdate} disabled={updating || !problem}>
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
