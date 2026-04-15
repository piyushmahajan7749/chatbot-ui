"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChatbotUIContext } from "@/context/context"
import { getReportsByWorkspaceId, deleteReport } from "@/db/reports-firestore"
import { IconPlus, IconReport, IconClock, IconTrash } from "@tabler/icons-react"
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

interface Report {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  report_draft?: string
  report_outline?: string
}

export default function ReportsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [workspaceId])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const data = await getReportsByWorkspaceId(workspaceId)
      setReports(data)
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId)
      setReports(prev => prev.filter(r => r.id !== reportId))
      toast({
        title: "Report deleted",
        description: "The report has been deleted successfully."
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete report.",
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

  return (
    <div className="h-full space-y-6 overflow-auto bg-zinc-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate and manage research reports
          </p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <IconPlus size={16} />
          New Report
        </Button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-purple-50 p-4">
            <IconReport size={32} className="text-purple-400" />
          </div>
          <p className="mb-2 font-medium text-slate-600">No reports yet</p>
          <p className="mb-6 max-w-sm text-sm text-slate-400">
            Create detailed reports from your conversations and data to track
            your research progress.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
          >
            <IconPlus size={16} />
            Create your first report
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map(report => (
            <Card
              key={report.id}
              className="group cursor-pointer rounded-2xl bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              onClick={() =>
                router.push(`/${locale}/${workspaceId}/reports/${report.id}`)
              }
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-purple-100">
                      <IconReport size={20} className="text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 font-semibold text-slate-800">
                        {report.name}
                      </h3>
                      {report.description && (
                        <p className="mb-2 line-clamp-2 text-sm text-slate-500">
                          {report.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <IconClock size={12} />
                          {getTimeAgo(report.updated_at || report.created_at)}
                        </span>
                        {report.report_draft && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">
                            Completed
                          </span>
                        )}
                        {!report.report_draft && report.report_outline && (
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
                          <AlertDialogTitle>Delete Report</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this report? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteReport(report.id)}
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
          ))}
        </div>
      )}
    </div>
  )
}
