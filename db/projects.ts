import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, TablesUpdate } from "@/supabase/types"

export const getProjectById = async (projectId: string) => {
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle()

  return project
}

export const getProjectsByWorkspaceId = async (workspaceId: string) => {
  const { data: projects, error } = await supabase
    .from("projects")
    .select(`
      *,
      chats!projects_chats_fkey(count),
      files!projects_files_fkey(count)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return projects || []
}

export const createProject = async (project: TablesInsert<"projects">) => {
  const { data: createdProject, error } = await supabase
    .from("projects")
    .insert([project])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return createdProject
}

export const updateProject = async (
  projectId: string,
  project: TablesUpdate<"projects">
) => {
  const { data: updatedProject, error } = await supabase
    .from("projects")
    .update({
      ...project,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return updatedProject
}

export const deleteProject = async (projectId: string) => {
  const { error } = await supabase.from("projects").delete().eq("id", projectId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}