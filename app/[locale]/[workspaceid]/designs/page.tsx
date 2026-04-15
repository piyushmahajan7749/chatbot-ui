"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChatbotUIContext } from "@/context/context"
import { deleteDesign } from "@/db/designs-firestore"
import { IconPlus, IconFlask, IconClock, IconTrash } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { useToast } from "@/app/hooks/use-toast"

interface Design {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  content?: string
}

export default function DesignsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [designs, setDesigns] = useState<Design[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDesigns()
  }, [workspaceId])

  const fetchDesigns = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/designs?workspaceId=${workspaceId}`)
      if (!response.ok) throw new Error("Failed to fetch designs")
      const data = await response.json()
      setDesigns(data.designs || [])
    } catch (error) {
      console.error("Error fetching designs:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDesign = async (designId: string) => {
    try {
      await deleteDesign(designId)
      setDesigns(prev => prev.filter(d => d.id !== designId))
      toast({
        title: "Design deleted",
        description: "The design has been deleted successfully."
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete design.",
        variant: "destructive"
      })
    }
  }

  const getTimeAgo = (date: string): string => {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }

  const getDesignStatus = (design: Design) => {
    if (design.content) {
      try {
        const parsed =
          typeof design.content === "string"
            ? JSON.parse(design.content)
            : design.content
        if (parsed?.generatedDesign) return "completed"
      } catch {}
    }
    return "draft"
  }

  return (
    <div className="h-full space-y-6 overflow-auto bg-zinc-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Designs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate and manage experiment designs
          </p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/${workspaceId}/designs/new`)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <IconPlus size={16} />
          New Design
        </Button>
      </div>

      {/* Designs List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
        </div>
      ) : designs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-teal-50 p-4">
            <IconFlask size={32} className="text-teal-400" />
          </div>
          <p className="mb-2 font-medium text-slate-600">No designs yet</p>
          <p className="mb-6 max-w-sm text-sm text-slate-400">
            Create experiment designs with AI-powered hypothesis generation,
            literature review, and statistical analysis.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/${locale}/${workspaceId}/designs/new`)}
          >
            <IconPlus size={16} />
            Create your first design
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {designs.map(design => {
            const status = getDesignStatus(design)
            return (
              <Card
                key={design.id}
                className="group cursor-pointer rounded-2xl bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                onClick={() =>
                  router.push(`/${locale}/${workspaceId}/designs/${design.id}`)
                }
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-teal-100">
                        <IconFlask size={20} className="text-teal-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="mb-1 font-semibold text-slate-800">
                          {design.name || "Untitled Design"}
                        </h3>
                        {design.description && (
                          <p className="mb-2 line-clamp-2 text-sm text-slate-500">
                            {design.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <IconClock size={12} />
                            {getTimeAgo(design.updated_at || design.created_at)}
                          </span>
                          {status === "completed" && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">
                              Completed
                            </span>
                          )}
                          {status === "draft" && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                              Draft
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={e => e.stopPropagation()}
                            className="rounded p-1.5 hover:bg-red-50"
                          >
                            <IconTrash size={14} className="text-red-500" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Design</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this design? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteDesign(design.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
