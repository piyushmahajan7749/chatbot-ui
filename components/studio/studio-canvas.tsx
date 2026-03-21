"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton, StatsCardSkeleton, ChatItemSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary, AsyncErrorFallback } from "@/components/ui/error-boundary"
import { EmptyChats, EmptyReports } from "@/components/ui/empty-state"
import { getProjectById, updateProject, deleteProject } from "@/db/projects"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { getReportsByProject } from "@/db/reports"
import { getMessagesByChatId } from "@/db/messages"
import { Project } from "@/types/project"
import { ProjectSettingsModal } from "./project-settings-modal"
import { 
  IconPlus,
  IconMessage,
  IconFile,
  IconClock,
  IconTag,
  IconCalendar,
  IconSettings,
  IconChart,
  IconReport,
  IconUpload,
  IconTrash,
  IconEdit,
  IconUsers,
  IconBrain
} from "@tabler/icons-react"
import { useToast } from "@/app/hooks/use-toast"
import { useContext } from "react"
import { ChatbotUIContext } from "@/context/context"

interface StudioCanvasProps {
  children?: React.ReactNode
  projectId?: string
  workspaceId?: string
  onOpenChat?: () => void
}

interface Chat {
  id: string
  name: string
  created_at: string
  updated_at: string
  project_id?: string
}

interface ChatWithLastMessage extends Chat {
  lastMessage?: string
  lastMessageAt?: string
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
  workspaceId,
  onOpenChat
}: StudioCanvasProps) {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useContext(ChatbotUIContext)
  
  const [project, setProject] = useState<Project | null>(null)
  const [chats, setChats] = useState<ChatWithLastMessage[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

      // Fetch chats for this workspace and project
      const allChats = await getChatsByWorkspaceId(actualWorkspaceId)
      const projectChats = allChats.filter(chat => chat.project_id === actualProjectId)
      
      // Fetch last message for each chat
      const chatsWithMessages = await Promise.all(
        projectChats.slice(0, 10).map(async (chat) => {
          try {
            const messages = await getMessagesByChatId(chat.id)
            const lastMessage = messages[0] // Messages are ordered by created_at desc
            return {
              ...chat,
              lastMessage: lastMessage?.content?.slice(0, 100) + (lastMessage?.content?.length > 100 ? "..." : "") || "No messages yet",
              lastMessageAt: lastMessage?.created_at || chat.created_at
            } as ChatWithLastMessage
          } catch (error) {
            return {
              ...chat,
              lastMessage: "No messages yet",
              lastMessageAt: chat.created_at
            } as ChatWithLastMessage
          }
        })
      )
      setChats(chatsWithMessages)

      // Fetch files for this workspace (filter by project_id on frontend for now) 
      const fileData = await getFileWorkspacesByWorkspaceId(actualWorkspaceId)
      const projectFiles = fileData.files.filter((file: ProjectFile) => file.project_id === actualProjectId)
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
    router.push(`/${locale}/${actualWorkspaceId}/chat?projectId=${actualProjectId}`)
  }

  const handleNewReport = () => {
    router.push(`/${locale}/${actualWorkspaceId}/reports/new?projectId=${actualProjectId}`)
  }

  const handleUploadFile = () => {
    // Navigate to files page with project context
    router.push(`/${locale}/${actualWorkspaceId}/files?projectId=${actualProjectId}`)
  }

  const handleProjectUpdate = async (updates: Partial<Project>) => {
    if (!project) return
    
    try {
      const updatedProject = await updateProject(project.id, updates)
      setProject(updatedProject)
      toast({
        title: "Project updated",
        description: "Your project has been updated successfully.",
      })
      setSettingsOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update project.",
        variant: "destructive",
      })
    }
  }

  const handleProjectDelete = async () => {
    if (!project) return
    
    try {
      await deleteProject(project.id)
      toast({
        title: "Project deleted",
        description: "Your project has been deleted successfully.",
      })
      router.push(`/${locale}/${actualWorkspaceId}/projects`)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getTotalActivity = (): number => {
    const now = Date.now()
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000)
    
    const recentChats = chats.filter(chat => new Date(chat.updated_at).getTime() > weekAgo).length
    const recentFiles = files.filter(file => new Date(file.updated_at).getTime() > weekAgo).length
    const recentReports = reports.filter(report => new Date(report.updated_at).getTime() > weekAgo).length
    
    return recentChats + recentFiles + recentReports
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
      <div className="h-full bg-slate-50 flex flex-col">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-slate-300 px-6 py-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
              <Skeleton className="h-5 w-96 mb-3" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="mb-6">
            <Skeleton className="h-10 w-96" />
          </div>
          
          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <StatsCardSkeleton key={i} />
            ))}
          </div>

          {/* Content Grid Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              {[...Array(3)].map((_, i) => (
                <ChatItemSkeleton key={i} />
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
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
    <ErrorBoundary>
      <div className="h-full bg-slate-50 flex flex-col">
        {/* Enhanced Header with improved layout */}
      <div className="bg-white border-b border-slate-300 px-6 py-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-800 truncate">{project.name}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="text-slate-500 hover:text-slate-700"
              >
                <IconEdit size={16} />
              </Button>
            </div>
            <p className="text-slate-600 mb-3 line-clamp-2">{project.description || "No description provided"}</p>
            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 ml-0 sm:ml-6 mt-4 sm:mt-0">
            {onOpenChat && (
              <Button onClick={onOpenChat} variant="outline" className="w-full sm:hidden gap-2 order-first">
                <IconMessage size={16} />
                Open Chat
              </Button>
            )}
            <Button onClick={handleNewChat} className="w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700">
              <IconPlus size={16} />
              <span className="hidden sm:inline">New Chat</span>
              <span className="sm:hidden">Chat</span>
            </Button>
            <Button onClick={handleUploadFile} variant="outline" className="w-full sm:w-auto gap-2">
              <IconUpload size={16} />
              <span className="hidden sm:inline">Upload File</span>
              <span className="sm:hidden">Upload</span>
            </Button>
            <Button onClick={handleNewReport} variant="outline" className="w-full sm:w-auto gap-2">
              <IconReport size={16} />
              <span className="hidden sm:inline">New Report</span>
              <span className="sm:hidden">Report</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="overview" className="h-full">
          <TabsList className="w-full mb-6 bg-white">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <IconChart size={16} />
              Overview
            </TabsTrigger>
            <TabsTrigger value="chats" className="flex items-center gap-2">
              <IconMessage size={16} />
              Recent Chats
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <IconReport size={16} />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            {/* Stats Cards - Inspired by JourneyMaker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card className="bg-blue-50 border-blue-100 hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-600 text-sm font-medium">Conversations</p>
                      <p className="text-3xl font-bold text-blue-700">{chats.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <IconMessage size={20} className="text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-emerald-50 border-emerald-100 hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-600 text-sm font-medium">Documents</p>
                      <p className="text-3xl font-bold text-emerald-700">{files.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <IconFile size={20} className="text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-50 border-orange-100 hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-600 text-sm font-medium">Reports</p>
                      <p className="text-3xl font-bold text-orange-700">{reports.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                      <IconReport size={20} className="text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-100 hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-600 text-sm font-medium">Weekly Activity</p>
                      <p className="text-3xl font-bold text-purple-700">{getTotalActivity()}</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <IconChart size={20} className="text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-white">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-lg font-semibold text-slate-800">Recent Conversations</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {chats.length === 0 ? (
                    <div className="p-6">
                      <EmptyChats onNewChat={handleNewChat} />
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-auto">
                      {chats.slice(0, 5).map((chat) => (
                        <div
                          key={chat.id}
                          className="p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/${locale}/${actualWorkspaceId}/chat/${chat.id}`)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mt-0.5">
                              <IconBrain size={16} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-slate-800 truncate">{chat.name}</h4>
                              <p className="text-sm text-slate-500 line-clamp-2 mt-1">{chat.lastMessage}</p>
                              <p className="text-xs text-slate-400 mt-2">{getTimeAgo(chat.lastMessageAt || chat.updated_at)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-lg font-semibold text-slate-800">Project Information</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <IconCalendar size={16} className="text-slate-400" />
                    <span>Created {getTimeAgo(project.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <IconClock size={16} className="text-slate-400" />
                    <span>Updated {getTimeAgo(project.updated_at)}</span>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{chats.length + files.length + reports.length}</p>
                        <p className="text-xs text-slate-500">Total Items</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{getTotalActivity()}</p>
                        <p className="text-xs text-slate-500">This Week</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{files.reduce((acc, file) => acc + file.size, 0) > 0 ? Math.round(files.reduce((acc, file) => acc + file.size, 0) / 1024 / 1024) : 0}</p>
                        <p className="text-xs text-slate-500">MB Used</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="chats" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Recent Conversations</h3>
                <p className="text-sm text-slate-500">
                  All conversations for {project.name}
                </p>
              </div>
              <Button onClick={handleNewChat} className="gap-2">
                <IconPlus size={16} />
                New Chat
              </Button>
            </div>

            {chats.length === 0 ? (
              <EmptyChats onNewChat={handleNewChat} />
            ) : (
              <div className="grid gap-4">
                {chats.map((chat) => (
                  <Card key={chat.id} className="bg-white hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => router.push(`/${locale}/${actualWorkspaceId}/chat/${chat.id}`)}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                          <IconBrain size={20} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-slate-800 mb-2 truncate">
                            {chat.name}
                          </h4>
                          <p className="text-sm text-slate-600 line-clamp-3 mb-3">
                            {chat.lastMessage}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>Last active {getTimeAgo(chat.lastMessageAt || chat.updated_at)}</span>
                            <span>Created {getTimeAgo(chat.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
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
              <EmptyReports onCreateReport={handleNewReport} />
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

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        project={project}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdate={handleProjectUpdate}
        onDelete={handleProjectDelete}
      />
      </div>
    </ErrorBoundary>
  )
}