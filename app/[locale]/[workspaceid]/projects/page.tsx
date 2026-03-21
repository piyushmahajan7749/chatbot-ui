"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getProjectsByWorkspaceId, createProject, deleteProject, updateProject } from "@/db/projects"
import { getFilteredProjects } from "@/db/search"
import { Project } from "@/types/project"
import { ProjectFiltersComponent, ProjectFilters } from "@/components/projects/project-filters"
import { 
  IconPlus, 
  IconSearch, 
  IconEdit, 
  IconTrash,
  IconClock,
  IconMessage,
  IconFile,
  IconFolder
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/browser-client"
import { useToast } from "@/app/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export default function ProjectsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const workspaceId = params.workspaceid as string

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [filters, setFilters] = useState<ProjectFilters>({
    searchTerm: "",
    tags: [],
    dateRange: undefined,
    sortBy: "updated_at",
    sortOrder: "desc"
  })
  const [availableTags, setAvailableTags] = useState<string[]>([])
  
  // New project form state
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const [newProjectTags, setNewProjectTags] = useState("")

  useEffect(() => {
    fetchProjects()
  }, [workspaceId, filters])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const data = await getFilteredProjects(workspaceId, {
        searchTerm: filters.searchTerm,
        tags: filters.tags,
        dateRange: filters.dateRange,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      })
      setProjects(data)
      
      // Extract available tags
      const allTags = data.reduce((tags: string[], project) => {
        if (project.tags) {
          return [...tags, ...project.tags]
        }
        return tags
      }, [])
      const uniqueTags = Array.from(new Set(allTags))
      setAvailableTags(uniqueTags)
    } catch (error) {
      console.error("Error fetching projects:", error)
      toast({
        title: "Error",
        description: "Failed to load projects.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const project = await createProject({
        user_id: user.id,
        workspace_id: workspaceId,
        name: newProjectName || "Untitled Project",
        description: newProjectDescription,
        tags: newProjectTags ? newProjectTags.split(",").map(tag => tag.trim()) : []
      })

      setProjects(prev => [project, ...prev])
      setIsCreateModalOpen(false)
      setNewProjectName("")
      setNewProjectDescription("")
      setNewProjectTags("")
      
      toast({
        title: "Success",
        description: "Project created successfully.",
      })
    } catch (error) {
      console.error("Error creating project:", error)
      toast({
        title: "Error",
        description: "Failed to create project.",
        variant: "destructive",
      })
    }
  }

  const handleUpdateProject = async () => {
    if (!editingProject) return

    try {
      const updatedProject = await updateProject(editingProject.id, {
        name: newProjectName,
        description: newProjectDescription,
        tags: newProjectTags ? newProjectTags.split(",").map(tag => tag.trim()) : []
      })

      setProjects(prev => 
        prev.map(p => p.id === updatedProject.id ? updatedProject : p)
      )
      
      setEditingProject(null)
      setNewProjectName("")
      setNewProjectDescription("")
      setNewProjectTags("")
      
      toast({
        title: "Success",
        description: "Project updated successfully.",
      })
    } catch (error) {
      console.error("Error updating project:", error)
      toast({
        title: "Error",
        description: "Failed to update project.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      toast({
        title: "Success",
        description: "Project deleted successfully.",
      })
    } catch (error) {
      console.error("Error deleting project:", error)
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
      })
    }
  }

  const openEditModal = (project: Project) => {
    setEditingProject(project)
    setNewProjectName(project.name)
    setNewProjectDescription(project.description)
    setNewProjectTags(project.tags.join(", "))
  }

  const closeEditModal = () => {
    setEditingProject(null)
    setNewProjectName("")
    setNewProjectDescription("")
    setNewProjectTags("")
  }

  // Projects are already filtered and sorted by the database query

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
    <div className="h-full p-6 space-y-6 bg-zinc-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-800">Projects</h1>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <IconPlus size={16} />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter project description..."
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="molecular biology, cell culture, microscopy..."
                  value={newProjectTags}
                  onChange={(e) => setNewProjectTags(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleCreateProject} className="flex-1">
                  Create Project
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <ProjectFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        availableTags={availableTags}
        className="bg-white rounded-lg border border-zinc-200 p-4"
      />

      {/* Project Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <IconFolder size={48} className="text-zinc-300 mb-4" />
          <p className="text-zinc-400 mb-4">
            {filters.searchTerm || filters.tags.length > 0 ? "No projects found" : "No projects yet"}
          </p>
          {!filters.searchTerm && filters.tags.length === 0 && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <IconPlus size={16} />
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer transition-all hover:shadow-md hover:border-blue-300 active:scale-[0.98]"
              onClick={() => router.push(`/${params.locale}/${workspaceId}/projects/${project.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold text-zinc-800 truncate">
                    {project.name}
                  </CardTitle>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(project)
                      }}
                      className="p-1 rounded hover:bg-zinc-100"
                    >
                      <IconEdit size={14} className="text-zinc-500" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-red-50"
                        >
                          <IconTrash size={14} className="text-red-500" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Project</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{project.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteProject(project.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-zinc-600 mb-4 line-clamp-3">
                  {project.description || "No description"}
                </p>
                
                {/* Tags */}
                {project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {project.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md"
                      >
                        {tag}
                      </span>
                    ))}
                    {project.tags.length > 3 && (
                      <span className="px-2 py-1 text-xs bg-zinc-50 text-zinc-500 rounded-md">
                        +{project.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats and timestamp */}
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1">
                      <IconMessage size={12} />
                      <span>0</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconFile size={12} />
                      <span>0</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconClock size={12} />
                    <span>{getTimeAgo(project.updated_at)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Project Modal */}
      <Dialog open={editingProject !== null} onOpenChange={(open) => !open && closeEditModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Project Name</Label>
              <Input
                id="edit-name"
                placeholder="Enter project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Enter project description..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
              <Input
                id="edit-tags"
                placeholder="molecular biology, cell culture, microscopy..."
                value={newProjectTags}
                onChange={(e) => setNewProjectTags(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleUpdateProject} className="flex-1">
                Update Project
              </Button>
              <Button variant="outline" onClick={closeEditModal} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}