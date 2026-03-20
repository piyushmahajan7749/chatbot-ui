"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getProjectById } from "@/db/projects"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { Project } from "@/types/project"
import { 
  IconArrowLeft,
  IconPlus,
  IconMessage,
  IconFile,
  IconClock,
  IconTag,
  IconUsers,
  IconCalendar
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/app/hooks/use-toast"

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

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const projectId = params.projectId as string
  const workspaceId = params.workspaceid as string
  const locale = params.locale as string

  const [project, setProject] = useState<Project | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjectData()
  }, [projectId, workspaceId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      
      // Fetch project details
      const projectData = await getProjectById(projectId)
      if (!projectData) {
        toast({
          title: "Error",
          description: "Project not found.",
          variant: "destructive",
        })
        router.push(`/${locale}/${workspaceId}/projects`)
        return
      }
      setProject(projectData)

      // Fetch chats for this workspace (filter by project_id on frontend for now)
      const allChats = await getChatsByWorkspaceId(workspaceId)
      const projectChats = allChats.filter(chat => chat.project_id === projectId)
      setChats(projectChats)

      // Fetch files for this workspace (filter by project_id on frontend for now) 
      const fileData = await getFileWorkspacesByWorkspaceId(workspaceId)
      const projectFiles = fileData.files.filter((file: any) => file.project_id === projectId)
      setFiles(projectFiles)

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
    router.push(`/${locale}/${workspaceId}/chat?projectId=${projectId}`)
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-zinc-500">Project not found</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => router.push(`/${locale}/${workspaceId}/projects`)}
            className="gap-2"
          >
            <IconArrowLeft size={16} />
            Back to Projects
          </Button>
          <div className="h-6 w-px bg-zinc-200" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-800">{project.name}</h1>
            <p className="text-sm text-zinc-500">{project.description || "No description"}</p>
          </div>
          <Button onClick={handleNewChat} className="gap-2">
            <IconPlus size={16} />
            New Chat
          </Button>
        </div>
      </div>

      {/* Main Content - Two Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Project Info */}
        <div className="w-80 bg-white border-r border-zinc-200 flex flex-col">
          <div className="p-6 border-b border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">Project Overview</h2>
            
            {/* Project Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-3 bg-zinc-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{chats.length}</div>
                <div className="text-xs text-zinc-500">Chats</div>
              </div>
              <div className="text-center p-3 bg-zinc-50 rounded-lg">
                <div className="text-2xl font-bold text-emerald-600">{files.length}</div>
                <div className="text-xs text-zinc-500">Files</div>
              </div>
            </div>

            {/* Project Metadata */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <IconCalendar size={16} className="text-zinc-400" />
                <span>Created {getTimeAgo(project.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <IconClock size={16} className="text-zinc-400" />
                <span>Updated {getTimeAgo(project.updated_at)}</span>
              </div>
              {project.tags.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-zinc-600">
                  <IconTag size={16} className="text-zinc-400 mt-0.5" />
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
            </div>
          </div>

          {/* Recent Activity */}
          <div className="p-6">
            <h3 className="text-sm font-medium text-zinc-700 mb-3">Recent Activity</h3>
            <div className="space-y-2">
              {[...chats, ...files]
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                .slice(0, 5)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-zinc-50">
                    {"type" in item ? (
                      <IconFile size={16} className="text-emerald-500" />
                    ) : (
                      <IconMessage size={16} className="text-blue-500" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-700 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {getTimeAgo(item.updated_at)}
                      </p>
                    </div>
                  </div>
                ))}
              {chats.length === 0 && files.length === 0 && (
                <p className="text-xs text-zinc-400">No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Chats and Files */}
        <div className="flex-1 flex flex-col">
          <Tabs defaultValue="chats" className="flex-1 flex flex-col">
            <TabsList className="mx-6 mt-6 mb-0 w-fit">
              <TabsTrigger value="chats" className="gap-2">
                <IconMessage size={16} />
                Chats ({chats.length})
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-2">
                <IconFile size={16} />
                Files ({files.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chats" className="flex-1 m-6 mt-4">
              <div className="h-full">
                {chats.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <IconMessage size={48} className="text-zinc-300 mb-4" />
                    <h3 className="text-lg font-medium text-zinc-600 mb-2">No chats yet</h3>
                    <p className="text-sm text-zinc-400 mb-6">Start a new conversation to begin working on this project</p>
                    <Button onClick={handleNewChat} className="gap-2">
                      <IconPlus size={16} />
                      Start New Chat
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chats.map((chat) => (
                      <Card 
                        key={chat.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => router.push(`/${locale}/${workspaceId}/chat/${chat.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-zinc-800 truncate">
                                {chat.name}
                              </h4>
                              <p className="text-xs text-zinc-500 mt-1">
                                {getTimeAgo(chat.updated_at)}
                              </p>
                            </div>
                            <IconMessage size={16} className="text-zinc-400" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="files" className="flex-1 m-6 mt-4">
              <div className="h-full">
                {files.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <IconFile size={48} className="text-zinc-300 mb-4" />
                    <h3 className="text-lg font-medium text-zinc-600 mb-2">No files yet</h3>
                    <p className="text-sm text-zinc-400 mb-6">Upload files to organize them in this project</p>
                    <Button variant="outline" className="gap-2">
                      <IconPlus size={16} />
                      Upload Files
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {files.map((file) => (
                      <Card key={file.id} className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-zinc-800 truncate">
                                {file.name}
                              </h4>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-zinc-500">
                                  {formatFileSize(file.size)}
                                </span>
                                <span className="text-xs text-zinc-400">
                                  {getTimeAgo(file.updated_at)}
                                </span>
                              </div>
                            </div>
                            <IconFile size={16} className="text-zinc-400" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}