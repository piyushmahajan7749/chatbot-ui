import { supabase } from "../lib/supabase/browser-client"
import { TablesInsert } from "../supabase/types"

export const getReportFilesByReportId = async (reportId: string) => {
  const { data: reportFiles, error } = await supabase
    .from("reports")
    .select(
      `
        id, 
        name, 
        files (*)
      `
    )
    .eq("id", reportId)
    .single()

  if (!reportFiles) {
    throw new Error(error.message)
  }

  return reportFiles
}

export const createReportFile = async (
  reportFile: TablesInsert<"report_files">
) => {
  const { data: createdReportFile, error } = await supabase
    .from("report_files")
    .insert(reportFile)
    .select("*")

  if (!createdReportFile) {
    throw new Error(error.message)
  }

  return createdReportFile
}

export const createReportFiles = async (
  reportFiles: TablesInsert<"report_files">[]
) => {
  const { data: createdReportFiles, error } = await supabase
    .from("report_files")
    .insert(reportFiles)
    .select("*")

  if (!createdReportFiles) {
    throw new Error(error.message)
  }

  return createdReportFiles
}

export const deleteReportFile = async (reportId: string, fileId: string) => {
  const { error } = await supabase
    .from("report_files")
    .delete()
    .eq("report_id", reportId)
    .eq("file_id", fileId)

  if (error) throw new Error(error.message)

  return true
}
