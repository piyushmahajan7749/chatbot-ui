import { supabase } from "@/lib/supabase/browser-client";
import { SearchResult } from "@/components/search/global-search";
import { Project } from "@/types/project";

/**
 * Sanitize a string for use in PostgREST filter expressions.
 * Escapes characters that have special meaning in `.or()` and `.ilike()` calls:
 * backslash, dot, comma, parentheses, and asterisk/wildcard.
 */
const sanitizePostgrestValue = (value: string): string => {
  return value.replace(/[\\.,()*]/g, (ch) => `\\${ch}`);
};

/**
 * Performs global search across projects, chats, files, and reports
 */
export const searchGlobalContent = async (
  workspaceId: string, 
  userId: string, 
  query: string
): Promise<SearchResult[]> => {
  const searchTerm = sanitizePostgrestValue(query.trim().toLowerCase());
  if (!searchTerm) return [];

  const results: SearchResult[] = [];

  try {
    // Search Projects
    const { data: projects } = await (supabase
      .from("projects" as any)
      .select(`
        id, 
        name, 
        description, 
        tags, 
        created_at, 
        updated_at
      `)
      .eq("workspace_id", workspaceId)
      .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order("updated_at", { ascending: false })
      .limit(10) as any);

    if (projects) {
      projects.forEach(project => {
        results.push({
          id: project.id,
          type: "project",
          title: project.name,
          description: project.description || undefined,
          url: `/projects/${project.id}`,
          metadata: {
            date: project.updated_at,
            tags: project.tags || []
          }
        });
      });
    }

    // Search Chats
    const { data: chats } = await (supabase
      .from("chats")
      .select(`
        id, 
        name, 
        model, 
        created_at, 
        updated_at
      `)
      .eq("workspace_id", workspaceId)
      .ilike("name", `%${searchTerm}%`)
      .order("updated_at", { ascending: false })
      .limit(10) as any);

    if (chats) {
      chats.forEach((chat: any) => {
        results.push({
          id: chat.id,
          type: "chat",
          title: chat.name,
          url: `/chat/${chat.id}`,
          metadata: {
            model: chat.model,
            date: chat.updated_at
          }
        });
      });
    }

    // Search Files
    const { data: files } = await (supabase
      .from("files")
      .select(`
        id, 
        name, 
        type, 
        size, 
        created_at
      `)
      .eq("workspace_id", workspaceId)
      .or(`name.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false })
      .limit(10) as any);

    if (files) {
      files.forEach((file: any) => {
        results.push({
          id: file.id,
          type: "file",
          title: file.name,
          description: file.type,
          url: `/files/${file.id}`,
          metadata: {
            size: formatFileSize(file.size),
            date: file.created_at
          }
        });
      });
    }

    // Search Reports
    const { data: reports } = await (supabase
      .from("reports")
      .select(`
        id, 
        name, 
        summary,
        created_at
      `)
      .eq("user_id", userId)
      .or(`name.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false })
      .limit(10) as any);

    if (reports) {
      reports.forEach((report: any) => {
        results.push({
          id: report.id,
          type: "report",
          title: report.name,
          description: report.summary || undefined,
          url: `/reports/${report.id}`,
          metadata: {
            date: report.created_at
          }
        });
      });
    }

    // Sort results by relevance (exact matches first, then by date)
    return results.sort((a, b) => {
      const aExact = a.title.toLowerCase().includes(searchTerm);
      const bExact = b.title.toLowerCase().includes(searchTerm);
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // If both exact or both partial, sort by date (newest first)
      const aDate = a.metadata?.date ? new Date(a.metadata.date) : new Date(0);
      const bDate = b.metadata?.date ? new Date(b.metadata.date) : new Date(0);
      return bDate.getTime() - aDate.getTime();
    });

  } catch (error) {
    console.error("Global search error:", error);
    return [];
  }
};

/**
 * Get filtered projects with advanced filtering options
 */
export const getFilteredProjects = async (
  workspaceId: string,
  filters: {
    tags?: string[];
    dateRange?: { start: Date; end: Date };
    sortBy?: "name" | "created_at" | "updated_at" | "activity";
    sortOrder?: "asc" | "desc";
    searchTerm?: string;
  }
) => {
  let query = (supabase
    .from("projects" as any)
    .select("*")
    .eq("workspace_id", workspaceId) as any);

  // Apply search filter
  if (filters.searchTerm) {
    const sanitized = sanitizePostgrestValue(filters.searchTerm);
    query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
  }

  // Apply tag filter
  if (filters.tags && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }

  // Apply date range filter
  if (filters.dateRange) {
    query = query
      .gte("created_at", filters.dateRange.start.toISOString())
      .lte("created_at", filters.dateRange.end.toISOString());
  }

  // Apply sorting — map "activity" to the actual column name
  const sortByRaw = filters.sortBy || "updated_at";
  const sortBy = sortByRaw === "activity" ? "updated_at" : sortByRaw;
  const sortOrder = filters.sortOrder || "desc";
  const ascending = sortOrder === "asc";

  query = query.order(sortBy, { ascending });

  const { data: projects, error } = await query as { data: Project[] | null; error: any };

  if (error) {
    throw new Error(error.message);
  }

  return (projects as Project[]) || [];
};

/**
 * Get filtered chats with advanced filtering options
 */
export const getFilteredChats = async (
  workspaceId: string,
  filters: {
    projectId?: string;
    model?: string;
    dateRange?: { start: Date; end: Date };
    sortBy?: "name" | "created_at" | "updated_at";
    sortOrder?: "asc" | "desc";
    searchTerm?: string;
  }
) => {
  let query = supabase
    .from("chats")
    .select(`
      *,
      projects!left(name)
    `)
    .eq("workspace_id", workspaceId);

  // Apply search filter
  if (filters.searchTerm) {
    const sanitized = sanitizePostgrestValue(filters.searchTerm);
    query = query.ilike("name", `%${sanitized}%`);
  }

  // Apply project filter
  if (filters.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  // Apply model filter
  if (filters.model) {
    query = query.eq("model", filters.model);
  }

  // Apply date range filter
  if (filters.dateRange) {
    query = query
      .gte("created_at", filters.dateRange.start.toISOString())
      .lte("created_at", filters.dateRange.end.toISOString());
  }

  // Apply sorting
  const sortBy = filters.sortBy || "updated_at";
  const sortOrder = filters.sortOrder || "desc";
  const ascending = sortOrder === "asc";

  query = query.order(sortBy, { ascending });

  const { data: chats, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return chats || [];
};

/**
 * Helper function to format file size
 */
const formatFileSize = (bytes: number): string => {
  if (!bytes) return "0 B";
  
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};