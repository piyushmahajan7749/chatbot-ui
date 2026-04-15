"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getReportById } from "@/db/reports-firestore"
import { useToast } from "@/app/hooks/use-toast"
import { ChatbotUIContext } from "@/context/context"
import { ELNExportModal } from "@/components/eln/eln-export-modal"
import { ELNConnectModal } from "@/components/eln/eln-connect-modal"
import { ELNConnection } from "@/types/eln"
import { getELNConnections } from "@/db/eln-connections"
import {
  IconArrowLeft,
  IconClock,
  IconDownload,
  IconReport
} from "@tabler/icons-react"
import { FlaskConical, Download } from "lucide-react"

export default function ReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useContext(ChatbotUIContext)
  const reportId = params.reportId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // ELN Integration state
  const [elnConnections, setElnConnections] = useState<ELNConnection[]>([])
  const [showELNExportModal, setShowELNExportModal] = useState(false)
  const [showELNConnectModal, setShowELNConnectModal] = useState(false)
  const [loadingConnections, setLoadingConnections] = useState(false)

  useEffect(() => {
    if (reportId) {
      fetchReport()
    }
  }, [reportId])

  // Load ELN connections
  useEffect(() => {
    const loadELNConnections = async () => {
      if (!profile?.user_id) return
      setLoadingConnections(true)
      try {
        const connections = await getELNConnections(profile.user_id)
        setElnConnections(connections)
      } catch (error) {
        console.error("Failed to load ELN connections:", error)
      } finally {
        setLoadingConnections(false)
      }
    }
    loadELNConnections()
  }, [profile?.user_id])

  const handleELNExport = () => {
    if (elnConnections.length === 0) {
      setShowELNConnectModal(true)
    } else {
      setShowELNExportModal(true)
    }
  }

  const handleConnectionCreated = (connection: ELNConnection) => {
    setElnConnections(prev => [...prev, connection])
    setShowELNExportModal(true)
  }

  const handleDownload = () => {
    if (!report) return
    const content =
      renderContent(report.report_draft) || renderContent(report.report_outline)
    if (!content) return
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${report.name || "report"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fetchReport = async () => {
    try {
      setLoading(true)
      const data = await getReportById(reportId)
      if (!data) {
        toast({
          title: "Not found",
          description: "Report not found.",
          variant: "destructive"
        })
        router.push(`/${locale}/${workspaceId}/reports`)
        return
      }
      setReport(data)
    } catch (error) {
      console.error("Error fetching report:", error)
      toast({
        title: "Error",
        description: "Failed to load report.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const getTimeAgo = (date: string): string => {
    if (!date) return ""
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="size-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
      </div>
    )
  }

  // Helper to render content that could be a string or object
  const renderContent = (content: any): string => {
    if (!content) return ""
    if (typeof content === "string") return content
    if (typeof content === "object") {
      // Handle structured report data (e.g. {aim, introduction, results, ...})
      return Object.entries(content)
        .filter(([key, value]) => value && key !== "_chartData")
        .map(([key, value]) => {
          const title = key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, s => s.toUpperCase())
          const text =
            typeof value === "string" ? value : JSON.stringify(value, null, 2)
          return `## ${title}\n\n${text}`
        })
        .join("\n\n")
    }
    return String(content)
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <p className="text-slate-500">Report not found</p>
      </div>
    )
  }

  const outlineText = renderContent(report.report_outline)
  const draftText = renderContent(report.report_draft)

  return (
    <div className="h-full overflow-auto bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${locale}/${workspaceId}/reports`)}
              className="gap-1 text-slate-600"
            >
              <IconArrowLeft size={16} />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {report.name}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <IconClock size={14} />
                  Created {getTimeAgo(report.created_at)}
                </span>
                {report.updated_at !== report.created_at && (
                  <span>Updated {getTimeAgo(report.updated_at)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(draftText || outlineText) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownload}
                >
                  <Download className="size-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(draftText || outlineText)
                    toast({
                      title: "Copied",
                      description: "Report copied to clipboard."
                    })
                  }}
                >
                  <IconDownload size={16} />
                  Copy
                </Button>
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleELNExport}
                  disabled={loadingConnections}
                >
                  <FlaskConical className="size-4" />
                  Export to ELN
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl p-6">
        {report.description && (
          <p className="mb-6 text-slate-600">{report.description}</p>
        )}

        {/* Report Draft (show first if available — it's the full report) */}
        {draftText && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Full Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {draftText}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report Outline (show if no draft, or as secondary) */}
        {outlineText && !draftText && (
          <Card className="mb-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconReport size={20} className="text-purple-600" />
                Report Outline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none whitespace-pre-wrap text-sm text-slate-700">
                {outlineText}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chart Image */}
        {report.chart_image && (
          <Card className="mt-6 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={report.chart_image}
                alt="Report chart"
                className="max-w-full rounded-lg"
              />
            </CardContent>
          </Card>
        )}

        {/* No content message */}
        {!outlineText && !draftText && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-amber-50 p-4">
              <IconReport size={32} className="text-amber-400" />
            </div>
            <p className="font-medium text-slate-600">Report in progress</p>
            <p className="mt-1 text-sm text-slate-400">
              This report hasn&apos;t been generated yet.
            </p>
          </div>
        )}
      </div>

      {/* ELN Export Modal */}
      <ELNExportModal
        isOpen={showELNExportModal}
        onOpenChange={setShowELNExportModal}
        connections={elnConnections}
        reportContent={draftText || outlineText}
        reportTitle={report?.name || "Shadow AI Report"}
        onExportSuccess={(result: any) => {
          if (result.success) {
            toast({
              title: "Success",
              description: "Report exported to ELN successfully!"
            })
          }
        }}
      />

      {/* ELN Connect Modal */}
      <ELNConnectModal
        isOpen={showELNConnectModal}
        onOpenChange={setShowELNConnectModal}
        userId={profile?.user_id || ""}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  )
}
