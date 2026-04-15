"use client"

import { useContext, useEffect, useState } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { usePathname, useRouter } from "next/navigation"
import { ChatbotUIContext } from "@/context/context"
import { getProjectsByWorkspaceId } from "@/db/projects"
import { cn } from "@/lib/utils"
import {
  Settings,
  FolderOpen,
  MessageSquare,
  File,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  FlaskConical,
  Brain,
  Bot,
  Library,
  Plus
} from "lucide-react"
import { WorkspaceSwitcher } from "@/components/utility/workspace-switcher"
import { WorkspaceSettings } from "@/components/workspace/workspace-settings"
import { Button } from "@/components/ui/button"
import { ProfileSettings } from "@/components/utility/profile-settings"

interface AppSidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const { selectedWorkspace, profile } = useContext(ChatbotUIContext)
  const [projects, setProjects] = useState<any[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const isKnowledgeActive =
    pathname.includes("/chat") ||
    pathname.includes("tab=assistants") ||
    pathname.includes("tab=files") ||
    pathname.includes("tab=collections")
  const [knowledgeOpen, setKnowledgeOpen] = useState(isKnowledgeActive)

  useEffect(() => {
    if (selectedWorkspace?.id) {
      fetchProjects()
    }
  }, [selectedWorkspace?.id])

  // Auto-expand Knowledge when navigating to a knowledge route
  useEffect(() => {
    if (isKnowledgeActive) {
      setKnowledgeOpen(true)
    }
  }, [isKnowledgeActive])

  const fetchProjects = async () => {
    if (selectedWorkspace?.id) {
      try {
        const projectsData = await getProjectsByWorkspaceId(
          selectedWorkspace.id
        )
        setProjects(projectsData)
      } catch (error) {
        console.error("Error fetching projects:", error)
      }
    }
  }

  const currentProjectId = pathname.split("/projects/")[1]?.split("/")[0]
  const wsId = selectedWorkspace?.id

  // Modules section (Designs / Reports / Data Collection) is intentionally
  // removed in v2 — those artifacts now live inside a Project. Keeping the
  // array empty (rather than rendering the section) keeps the file diff small
  // while the section block below short-circuits on empty.
  const mainNavItems: {
    title: string
    icon: typeof FlaskConical
    href: string
    active: boolean
  }[] = []

  const knowledgeItems = [
    {
      title: "All Chats",
      icon: MessageSquare,
      href: `/${wsId}/chat-history`,
      active: pathname.includes("/chat-history")
    },
    {
      title: "Assistants",
      icon: Bot,
      href: `/${wsId}?tab=assistants`,
      active: pathname.includes("tab=assistants")
    },
    {
      title: "Files",
      icon: File,
      href: `/${wsId}?tab=files`,
      active: pathname.includes("tab=files")
    },
    {
      title: "Collections",
      icon: Library,
      href: `/${wsId}?tab=collections`,
      active: pathname.includes("tab=collections")
    }
  ]

  return (
    <ErrorBoundary>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-zinc-800 bg-zinc-900 text-white transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo/Brand Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <span className="text-sm font-bold text-white">S</span>
              </div>
              <span className="text-lg font-bold text-white">Shadow AI</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="ml-auto text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>

        {/* Workspace Switcher */}
        {!isCollapsed && (
          <div className="border-b border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <WorkspaceSwitcher />
              <WorkspaceSettings />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {/* Main Modules — removed in v2; Designs/Reports/Data Collection
              now live inside a Project. Block kept for fast reinstatement. */}
          {mainNavItems.length > 0 && (
            <div>
              {!isCollapsed && (
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Modules
                </h3>
              )}
              <div className="space-y-0.5">
                {mainNavItems.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.title}
                      onClick={() => router.push(item.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                        item.active
                          ? "bg-zinc-800 font-medium text-white"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                      )}
                      title={isCollapsed ? item.title : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Projects Section */}
          <div>
            {!isCollapsed && (
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Projects
                </h3>
                <button
                  onClick={() => router.push(`/${wsId}/projects`)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  title="View all projects"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            )}
            <div className="space-y-0.5">
              <button
                onClick={() => router.push(`/${wsId}/projects`)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                  pathname.includes("/projects") && !currentProjectId
                    ? "bg-zinc-800 font-medium text-white"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                )}
                title={isCollapsed ? "All Projects" : undefined}
              >
                <FolderOpen className="size-4 shrink-0" />
                {!isCollapsed && <span>All Projects</span>}
              </button>
              {!isCollapsed &&
                projects.slice(0, 5).map(project => (
                  <button
                    key={project.id}
                    onClick={() =>
                      router.push(`/${wsId}/projects/${project.id}`)
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                      currentProjectId === project.id
                        ? "bg-zinc-800 font-medium text-white"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )}
                  >
                    <FolderOpen className="ml-1 size-3.5 shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              {!isCollapsed && projects.length > 5 && (
                <button
                  onClick={() => router.push(`/${wsId}/projects`)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  <span className="ml-5">+{projects.length - 5} more</span>
                </button>
              )}
            </div>
          </div>

          {/* Knowledge Section (collapsible) */}
          <div>
            {!isCollapsed ? (
              <button
                onClick={() => setKnowledgeOpen(!knowledgeOpen)}
                className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-400"
              >
                <span>Knowledge</span>
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform",
                    knowledgeOpen ? "" : "-rotate-90"
                  )}
                />
              </button>
            ) : (
              <div className="mb-2 flex justify-center">
                <Brain className="size-4 text-zinc-500" />
              </div>
            )}
            {(knowledgeOpen || isCollapsed) && (
              <div className="space-y-0.5">
                {knowledgeItems.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.title}
                      onClick={() => router.push(item.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                        item.active
                          ? "bg-zinc-800 font-medium text-white"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                      )}
                      title={isCollapsed ? item.title : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="space-y-2 border-t border-zinc-800 p-3">
          <button
            onClick={() => router.push(`/${wsId}/settings`)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
            title={isCollapsed ? "Settings" : undefined}
          >
            <Settings className="size-4" />
            {!isCollapsed && <span>Settings</span>}
          </button>

          {!isCollapsed && (
            <div className="flex items-center gap-3 px-3 py-1">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                <User className="size-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-white">
                  {profile?.display_name || profile?.username || "User"}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {selectedWorkspace?.name}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </ErrorBoundary>
  )
}
