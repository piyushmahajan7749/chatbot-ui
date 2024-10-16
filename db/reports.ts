import { supabase } from "../lib/supabase/browser-client"
import { Tables, TablesInsert, TablesUpdate } from "../supabase/types"

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

export const createReport = async (
  report: TablesInsert<"reports">,
  workspace_id: string
) => {
  const { data: createdReport, error } = await supabase
    .from("reports")
    .insert([report])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  await createReportWorkspace({
    user_id: createdReport.user_id,
    report_id: createdReport.id,
    workspace_id
  })

  return createdReport
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

export const getReportWorkspacesByWorkspaceId = async (workspaceId: string) => {
  const { data: reportWorkspaces, error } = await supabase
    .from("report_workspaces")
    .select("reports(*)")
    .eq("workspace_id", workspaceId)

  if (error) {
    throw new Error(error.message)
  }
  const reports = reportWorkspaces
    .map(item => item.reports)
    .sort(
      (a, b) =>
        new Date(b!.created_at).getTime() - new Date(a!.created_at).getTime()
    )

  return { reports: reports as Tables<"reports">[] }
}

export const getReportsByWorkspaceId = async (workspaceId: string) => {
  const { data: reports, error } = await supabase
    .from("report_workspaces")
    .select("reports(*)")
    .eq("workspace_id", workspaceId)
    .order("reports.created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return reports.map(item => item.reports) as unknown as Tables<"reports">[]
}

export const getReportWorkspacesByReportId = async (reportId: string) => {
  const { data: report, error } = await supabase
    .from("reports")
    .select(
      `
      id, 
      name, 
      workspaces (*)
    `
    )
    .eq("id", reportId)
    .single()

  if (!report) {
    throw new Error(error.message)
  }

  return report
}

export const createReportWorkspace = async (item: {
  user_id: string
  report_id: string
  workspace_id: string
}) => {
  const { data: createdReportWorkspace, error } = await supabase
    .from("report_workspaces")
    .insert([item])
    .select("*")
    .single()

  if (error) {
    console.error("Error creating report workspace:", error)
    throw new Error(error.message)
  }

  return createdReportWorkspace
}

export const createReportWorkspaces = async (
  items: { user_id: string; report_id: string; workspace_id: string }[]
) => {
  const { data: createdReportWorkspaces, error } = await supabase
    .from("report_workspaces")
    .insert(items)
    .select("*")

  if (error) throw new Error(error.message)

  return createdReportWorkspaces
}

export const deleteReportWorkspace = async (
  reportId: string,
  workspaceId: string
) => {
  const { error } = await supabase
    .from("report_workspaces")
    .delete()
    .eq("report_id", reportId)
    .eq("workspace_id", workspaceId)

  if (error) throw new Error(error.message)

  return true
}

// Functions for report files and collections (as in the previous response)
// ... (addFileToReport, removeFileFromReport, getReportFiles, etc.)

export const getReportWithDetails = async (reportId: string) => {
  const { data, error } = await supabase
    .from("reports")
    .select(
      `
      *,
      report_files(files(*)),
      report_collections(collections(*)),
      workspaces(*)
    `
    )
    .eq("id", reportId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return {
    ...data,
    files: data.report_files.map(rf => rf.files),
    collections: data.report_collections.map(rc => rc.collections),
    workspaces: data.workspaces
  }
}
