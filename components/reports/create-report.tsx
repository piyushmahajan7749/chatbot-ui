"use client"

import { ChatbotUIContext } from "@/context/context"
import { createReport } from "@/db/reports-firestore"
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
  const { profile, selectedWorkspace, setReports } =
    useContext(ChatbotUIContext)

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
      const created = await createReport(
        {
          user_id: profile.user_id,
          name: trimmed,
          description: "",
          sharing: "private",
          project_id: projectId ?? null
        },
        selectedWorkspace.id,
        { protocol: [], papers: [], dataFiles: [] },
        []
      )

      setReports(prev => [created, ...prev])

      const locale = (params.locale as string) ?? "en"
      const wsId = params.workspaceid as string
      router.push(`/${locale}/${wsId}/reports/${created.id}`)
    } catch (error: any) {
      console.error("Failed to create report:", error)
      toast.error(
        `Failed to create report: ${error?.message || "Unknown error"}`
      )
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
          <DialogTitle>New Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">Name</Label>
            <Input
              id="report-name"
              ref={nameRef}
              placeholder="e.g. pH effect on enzyme activity"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <p className="text-muted-foreground text-xs">
              You can add the objective, protocol, papers, and data files in the
              next view before generating the report.
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
