"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getProjectById } from "@/db/projects"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { getReportsByProject } from "@/db/reports"
import { Project } from "@/types/project"
import { 
  IconPlus,
  IconMessage,
  IconFile,
  IconClock,
  IconTag,
  IconCalendar,
  IconSettings,
  IconChart,
  IconReport
} from "@tabler/icons-react"
import { useToast } from "@/app/hooks/use-toast"
import { useContext } from "react"
import { ChatbotUIContext } from "@/context/chatbotui-context"

interface StudioCanvasProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
}

interface Chat {
  id: string
  name: string
  created_at: string
  updated_at: string
  project_id?: string
}

interface ProjectFile {
  id: string
  name: string
  created_at: string
  updated_at: string
  project_id?: string
  type: string
  size: number
}

interface Report {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  project_id?: string
}

export function StudioCanvas({ 
  children, 
  projectId, 
  workspaceId 
}: StudioCanvasProps) {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useContext(ChatbotUIContext)
  
  const [project, setProject] = useState<Project | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  const actualProjectId = projectId || (params.projectId as string)
  const actualWorkspaceId = workspaceId || (params.workspaceid as string)
  const locale = params.locale as string

  useEffect(() => {
    if (actualProjectId && actualWorkspaceId) {
      fetchProjectData()
    }
  }, [actualProjectId, actualWorkspaceId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      
      // Fetch project details
      const projectData = await getProjectById(actualProjectId)
      if (!projectData) {
        toast({
          title: "Error",
          description: "Project not found.",
          variant: "destructive",
        })
        return
      }
      setProject(projectData)

      // Fetch chats for this workspace (filter by project_id on frontend for now)
      const allChats = await getChatsByWorkspaceId(actualWorkspaceId)
      const projectChats = allChats.filter(chat => chat.project_id === actualProjectId)
      setChats(projectChats)

      // Fetch files for this workspace (filter by project_id on frontend for now) 
      const fileData = await getFileWorkspacesByWorkspaceId(actualWorkspaceId)
      const projectFiles = fileData.files.filter((file: any) => file.project_id === actualProjectId)
      setFiles(projectFiles)

      // Fetch reports for this project
      if (user) {
        const projectReports = await getReportsByProject(user.id, actualProjectId)
        setReports(projectReports)
      }

    } catch (error) {
      console.error("Error fetching project data:", error)
      toast({
        title: "Error",
        description: "Failed to load project data.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = () => {
    // Navigate to new chat with project context
    router.push(`/${locale}/${actualWorkspaceId}/chat?projectId=${actualProjectId}`)
  }

  const handleNewReport = () => {
    // Navigate to new report with project context
    router.push(`/${locale}/${actualWorkspaceId}/reports/new?projectId=${actualProjectId}`)
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // If children are provided, render them instead of default content
  if (children) {
    return (
      <div className="h-full bg-slate-50">
        {children}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Project not found</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-300 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">{project.name}</h1>
            <p className="text-sm text-slate-500">{project.description || "No description"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleNewChat} className="gap-2">
              <IconPlus size={16} />
              New Chat
            </Button>
            <Button onClick={handleNewReport} variant="outline" className="gap-2">
              <IconReport size={16} />
              New Report
            </Button>
            <Button variant="outline" className="gap-2">
              <IconSettings size={16} />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="overview" className="h-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <IconChart size={16} />
              Overview
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <IconReport size={16} />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            {/* Project Overview Cards */}
            <div className="grid grid-cols-4 gap-6">
              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <IconMessage size={16} />
                    Conversations
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-blue-600">{chats.length}</div>
                  <div className="text-xs text-slate-500">Active chats</div>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <IconFile size={16} />
                    Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-emerald-600">{files.length}</div>
                  <div className="text-xs text-slate-500">Uploaded files</div>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <IconReport size={16} />
                    Reports
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-orange-600">{reports.length}</div>
                  <div className="text-xs text-slate-500">Generated reports</div>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <IconChart size={16} />
                    Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.max(chats.length, files.length, reports.length)}
                  </div>
                  <div className="text-xs text-slate-500">This week</div>
                </CardContent>
              </Card>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-slate-700">Project Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <IconCalendar size={16} className="text-slate-400" />
                    <span>Created {getTimeAgo(project.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <IconClock size={16} className="text-slate-400" />
                    <span>Updated {getTimeAgo(project.updated_at)}</span>
                  </div>
                  {project.tags.length > 0 && (
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <IconTag size={16} className="text-slate-400 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {project.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-slate-700">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[...chats, ...files, ...reports]
                      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                      .slice(0, 5)
                      .map((item) => {
                        let icon = <IconMessage size={16} className="text-blue-500" />
                        if ("type" in item) {
                          icon = <IconFile size={16} className="text-emerald-500" />
                        } else if ("description" in item) {
                          icon = <IconReport size={16} className="text-orange-500" />
                        }
                        
                        return (
                          <div key={item.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50">
                            {icon}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {getTimeAgo(item.updated_at)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    {chats.length === 0 && files.length === 0 && reports.length === 0 && (
                      <p className="text-sm text-slate-400">No recent activity</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Project Reports</h3>
                <p className="text-sm text-slate-500">
                  Generated reports for {project.name}
                </p>
              </div>
              <Button onClick={handleNewReport} className="gap-2">
                <IconPlus size={16} />
                New Report
              </Button>
            </div>

            {reports.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="py-12 text-center">
                  <IconReport size={48} className="mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-800 mb-2">
                    No reports yet
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Create your first report to analyze project data and insights.
                  </p>
                  <Button onClick={handleNewReport} className="gap-2">
                    <IconPlus size={16} />
                    Create First Report
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {reports.map((report) => (
                  <Card key={report.id} className="bg-white hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800 mb-1">
                            {report.name}
                          </h4>
                          <p className="text-sm text-slate-500 mb-3">
                            {report.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>Created {getTimeAgo(report.created_at)}</span>
                            <span>Updated {getTimeAgo(report.updated_at)}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/${locale}/${actualWorkspaceId}/reports/${report.id}`)}
                        >
                          View Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}