import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, Tables } from "@/supabase/types"
import { createDesignWorkspace } from "./design-workspaces"

export const getDesigns = async (userId: string) => {
  const { data, error } = await supabase
    .from("designs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (!data) {
    throw new Error(error.message)
  }

  return data as Tables<"designs">[]
}

export const createDesign = async (
  design: Omit<TablesInsert<"designs">, "workspace_id"> & { problem?: string },
  workspaceId: string
) => {
  // First create the design without workspace_id
  const { data: createdDesign, error } = await supabase
    .from("designs")
    .insert({
      user_id: design.user_id,
      name: design.problem || design.name || "",
      description: design.description,
      sharing: design.sharing || "private",
      folder_id: design.folder_id || null
    })
    .select("*")
    .single()

  if (!createdDesign) {
    throw new Error(error.message)
  }

  // Create design workspace association
  await createDesignWorkspace({
    user_id: design.user_id,
    design_id: createdDesign.id,
    workspace_id: workspaceId
  })

  return createdDesign
}

export const updateDesign = async (
  designId: string,
  design: TablesInsert<"designs"> & { problem?: string }
) => {
  // Create a copy of the design without the problem field
  const designToUpdate = { ...design }

  // If problem exists, use it for name
  if (designToUpdate.problem) {
    designToUpdate.name = designToUpdate.problem
    delete designToUpdate.problem // Remove problem as it's not in the schema
  }

  const { data: updatedDesign, error } = await supabase
    .from("designs")
    .update(designToUpdate)
    .eq("id", designId)
    .select("*")
    .single()

  if (!updatedDesign) {
    throw new Error(error.message)
  }

  return updatedDesign
}

export const deleteDesign = async (designId: string) => {
  const { error } = await supabase.from("designs").delete().eq("id", designId)

  if (error) {
    throw new Error(error.message)
  }
}

export const getDesignWorkspacesByWorkspaceId = async (workspaceId: string) => {
  const { data: designWorkspaces, error: designWorkspacesError } =
    await supabase
      .from("design_workspaces")
      .select("design_id")
      .eq("workspace_id", workspaceId)

  if (!designWorkspaces) {
    throw new Error(designWorkspacesError.message)
  }

  const designIds = designWorkspaces.map(
    designWorkspace => designWorkspace.design_id
  )

  if (designIds.length === 0) {
    return { designs: [] }
  }

  const { data: designs, error: designsError } = await supabase
    .from("designs")
    .select("*")
    .in("id", designIds)
    .order("created_at", { ascending: false })

  if (!designs) {
    throw new Error(designsError.message)
  }

  return { designs }
}
