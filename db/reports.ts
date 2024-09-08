import { supabase } from "../lib/supabase/browser-client"
import { Tables } from "../supabase/types"

export const getReports = async (userId: string) => {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", userId)
  if (error) {
    throw error
  }
  return data as Tables<"reports">[]
}

export const createReport = async (report: Tables<"reports">) => {
  const { data, error } = await supabase.from("reports").insert(report).single()
  if (error) {
    throw error
  }
  return data as Tables<"reports">
}

export const updateReport = async (
  id: string,
  updates: Partial<Tables<"reports">>
) => {
  const { data, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", id)
    .single()
  if (error) {
    throw error
  }
  return data as Tables<"reports">
}

export const deleteReport = async (id: string) => {
  const { error } = await supabase.from("reports").delete().eq("id", id)
  if (error) {
    throw error
  }
}

export const getReportsByWorkspaceId = async (workspaceId: string) => {
  const { data: reports, error } = await supabase
    .from("reports")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (!reports) {
    throw new Error(error.message)
  }

  return reports
}
