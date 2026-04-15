"use client"

import { ChatbotUIContext } from "@/context/context"
import { useDesignContext } from "@/context/designcontext"
import { createDesign } from "@/db/designs-firestore"
import { linkDesignToProject } from "@/db/designs"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateDesignProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  projectId?: string | null
}

/**
 * Simplified Create Design modal: asks only for a name. Description and the
 * richer metadata (objectives, variables, considerations) are captured later
 * inside the Design view itself (4-tab canvas). On create we land the user
 * on /designs/[id] so they see the empty Problem tab ready to fill in.
 */
export const CreateDesign: FC<CreateDesignProps> = ({
  isOpen,
  onOpenChange,
  projectId
}) => {
  const { profile, selectedWorkspace, designs, setDesigns } =
    useContext(ChatbotUIContext)
  const { setSelectedDesign } = useDesignContext()

  const router = useRouter()
  const params = useParams()

  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName("")
      setTimeout(() => nameRef.current?.focus(), 0)
    }
  }, [isOpen])

  if (!profile || !selectedWorkspace) return null

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const created = await createDesign(
        {
          user_id: profile.user_id,
          name: trimmed,
          problem: trimmed,
          // Seed description from name so downstream draft APIs that require
          // a non-empty description don't fail out of the gate. User edits it
          // in the Problem tab.
          description: trimmed,
          sharing: "private" as const,
          objectives: [],
          variables: [],
          specialConsiderations: []
        },
        selectedWorkspace.id
      )

      if (projectId && created?.id) {
        try {
          await linkDesignToProject(created.id, projectId)
          created.project_id = projectId
        } catch (err) {
          console.warn("Failed to link new design to project:", err)
        }
      }

      setDesigns([created, ...designs])
      setSelectedDesign(created)

      const locale = (params.locale as string) ?? "en"
      const wsId = params.workspaceid as string
      // Navigate to the new Design detail view (the 4-tab canvas).
      // We intentionally do NOT call onOpenChange(false) here: callers that
      // live under /designs/new use it to route back to /projects on close,
      // which would race with this push. The source page unmounts on nav.
      router.push(`/${locale}/${wsId}/designs/${created.id}`)
    } catch (error) {
      console.error("Failed to create design:", error)
      toast.error("Failed to create design.")
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && name.trim() && !creating) {
      e.preventDefault()
      void handleCreate()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Design</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="design-name">Name</Label>
            <Input
              id="design-name"
              ref={nameRef}
              placeholder="e.g. Effect of pH on enzyme activity"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <p className="text-muted-foreground text-xs">
              You can add the problem, literature, hypotheses, and final design
              in the next view.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="bg-brick hover:bg-brick-hover"
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
