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
  design: Omit<TablesInsert<"designs">, "workspace_id">,
  workspaceId: string
) => {
  // First create the design without workspace_id
  const { data: createdDesign, error } = await supabase
    .from("designs")
    .insert({
      user_id: design.user_id,
      problem: design.problem,
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
  design: TablesInsert<"designs">
) => {
  const { data: updatedDesign, error } = await supabase
    .from("designs")
    .update(design)
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
