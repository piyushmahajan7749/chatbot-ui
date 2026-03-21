import { supabase } from "@/lib/supabase/browser-client"
import { Project } from "@/types/project"

export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const { data: project, error } = await (supabase
    .from("projects" as any)
    .select("*")
    .eq("id", projectId)
    .maybeSingle() as any)

  if (error) {
    throw new Error(error.message)
  }

  return project as Project | null
}

export const getProjectsByWorkspaceId = async (workspaceId: string): Promise<Project[]> => {
  const { data: projects, error } = await (supabase
    .from("projects" as any)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false }) as any)

  if (error) {
    throw new Error(error.message)
  }

  return (projects as Project[]) || []
}

export const createProject = async (project: Partial<Project>): Promise<Project> => {
  const { data: createdProject, error } = await (supabase
    .from("projects" as any)
    .insert([project])
    .select("*")
    .single() as any)

  if (error) {
    throw new Error(error.message)
  }

  return createdProject as Project
}

export const updateProject = async (
  projectId: string,
  project: Partial<Project>
): Promise<Project> => {
  const { data: updatedProject, error } = await (supabase
    .from("projects" as any)
    .update({
      ...project,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId)
    .select("*")
    .single() as any)

  if (error) {
    throw new Error(error.message)
  }

  return updatedProject as Project
}

export const deleteProject = async (projectId: string) => {
  const { error } = await (supabase
    .from("projects" as any)
    .delete()
    .eq("id", projectId) as any)

  if (error) {
    throw new Error(error.message)
  }

  return true
}