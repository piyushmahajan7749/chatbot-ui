import { supabase } from "@/lib/supabase/browser-client"

export interface ProjectFileMeta {
  id: string
  project_id: string
  workspace_id: string
  user_id: string
  name: string
  mime_type: string
  size: number
  storage_path: string
  created_at: string
}

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "text/csv",
  "application/vnd.ms-excel" // some browsers tag csv as this
]

const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".csv"]

const isAccepted = (file: File): boolean => {
  const lowerName = file.name.toLowerCase()
  if (ACCEPTED_MIME.includes(file.type)) return true
  return ACCEPTED_EXT.some(ext => lowerName.endsWith(ext))
}

export const getProjectFiles = async (
  projectId: string
): Promise<ProjectFileMeta[]> => {
  const res = await fetch(
    `/api/project-files?projectId=${encodeURIComponent(projectId)}`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    if (res.status === 401) return []
    throw new Error(`Failed to fetch project files (${res.status})`)
  }
  const json = await res.json()
  return (json.files ?? []) as ProjectFileMeta[]
}

export const uploadProjectFile = async (params: {
  file: File
  projectId: string
  workspaceId: string
  userId: string
}): Promise<ProjectFileMeta> => {
  const { file, projectId, workspaceId, userId } = params

  if (!isAccepted(file)) {
    throw new Error(
      `Unsupported file type. Upload PDF, JPEG, PNG, or CSV instead.`
    )
  }

  const SIZE_LIMIT = parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT || "10000000"
  )
  if (file.size > SIZE_LIMIT) {
    throw new Error(
      `File must be less than ${Math.floor(SIZE_LIMIT / 1000000)} MB`
    )
  }

  const fileId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath = `${userId}/projects/${projectId}/${fileId}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from("files")
    .upload(storagePath, file, { upsert: false })

  if (uploadError) {
    throw new Error(uploadError.message || "Failed to upload file")
  }

  const res = await fetch(`/api/project-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: fileId,
      project_id: projectId,
      workspace_id: workspaceId,
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
      storage_path: storagePath
    })
  })

  if (!res.ok) {
    // Roll back the upload on metadata failure so we don't leak orphan objects.
    await supabase.storage.from("files").remove([storagePath])
    const msg = await res.text().catch(() => "")
    throw new Error(msg || `Failed to save file metadata (${res.status})`)
  }

  return (await res.json()) as ProjectFileMeta
}

export const deleteProjectFile = async (
  fileId: string,
  storagePath: string
): Promise<void> => {
  await supabase.storage.from("files").remove([storagePath])
  const res = await fetch(`/api/project-files/${encodeURIComponent(fileId)}`, {
    method: "DELETE"
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete file (${res.status})`)
  }
}

export const getProjectFileSignedUrl = async (
  storagePath: string
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(storagePath, 60 * 60)
  if (error || !data) {
    throw new Error("Unable to create download link")
  }
  return data.signedUrl
}
