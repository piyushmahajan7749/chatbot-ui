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
import { DisplayHeading, Eyebrow } from "@/components/ui/typography"

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
    <div className="bg-paper h-full space-y-6 overflow-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <DisplayHeading as="h1" className="mt-1 text-[34px]">
            Reports
          </DisplayHeading>
          <p className="text-ink-3 mt-1 text-[13px]">
            Generate and manage research reports
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
        >
          <IconPlus size={14} stroke={2.4} />
          New Report
        </Button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="border-line border-t-rust size-8 animate-spin rounded-full border-2" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <div className="bg-rust-soft mb-4 rounded-full p-4">
            <IconReport size={32} className="text-rust" />
          </div>
          <p className="text-ink mb-2 text-[14px] font-semibold">
            No reports yet
          </p>
          <p className="text-ink-3 mb-6 max-w-sm text-[13px] leading-relaxed">
            Create detailed reports from your conversations and data to track
            your research progress.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/${locale}/${workspaceId}/reports/new`)}
          >
            <IconPlus size={12} />
            Create your first report
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {reports.map(report => (
            <Card
              key={report.id}
              className="hover:border-line-strong hover:bg-paper group cursor-pointer transition-colors"
              onClick={() =>
                router.push(`/${locale}/${workspaceId}/reports/${report.id}`)
              }
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-rust-soft flex size-10 items-center justify-center rounded-md">
                      <IconReport size={20} className="text-rust" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-ink mb-1 text-[14px] font-semibold">
                        {report.name}
                      </h3>
                      {report.description && (
                        <p className="text-ink-3 mb-2 line-clamp-2 text-[12.5px]">
                          {report.description}
                        </p>
                      )}
                      <div className="text-ink-3 flex items-center gap-3 text-[11.5px]">
                        <span className="flex items-center gap-1 font-mono">
                          <IconClock size={12} />
                          {getTimeAgo(report.updated_at || report.created_at)}
                        </span>
                        {report.report_draft && (
                          <span className="rounded-full bg-[#DDE9DF] px-2 py-0.5 text-[#1F4A2C]">
                            Completed
                          </span>
                        )}
                        {!report.report_draft && report.report_outline && (
                          <span className="bg-rust-soft text-rust-ink rounded-full px-2 py-0.5">
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
                          className="hover:bg-paper-2 rounded p-1.5"
                        >
                          <IconTrash size={14} className="text-destructive" />
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
                            className="bg-destructive hover:bg-destructive/90"
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
