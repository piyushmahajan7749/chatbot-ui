"use client";

import { useContext, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { usePathname, useRouter } from "next/navigation";
import { ChatbotUIContext } from "@/context/context";
import { getProjectsByWorkspaceId } from "@/db/projects";
import { cn } from "@/lib/utils";
import { 
  Settings, 
  FolderOpen, 
  MessageSquare, 
  File, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  User
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/utility/workspace-switcher";
import { WorkspaceSettings } from "@/components/workspace/workspace-settings";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const { selectedWorkspace, profile } = useContext(ChatbotUIContext);
  const [projects, setProjects] = useState<any[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (selectedWorkspace?.id) {
      fetchProjects();
    }
  }, [selectedWorkspace?.id]);

  const fetchProjects = async () => {
    if (selectedWorkspace?.id) {
      try {
        const projectsData = await getProjectsByWorkspaceId(selectedWorkspace.id);
        setProjects(projectsData);
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
    }
  };

  const currentProjectId = pathname.split("/projects/")[1]?.split("/")[0];

  const navigationItems = [
    {
      title: "All Chats",
      icon: MessageSquare,
      href: `/${selectedWorkspace?.id}?tab=chats`,
      active: pathname.includes(`/${selectedWorkspace?.id}`) && !pathname.includes("/projects") && !pathname.includes("/reports")
    },
    {
      title: "Files",
      icon: File,
      href: `/${selectedWorkspace?.id}?tab=files`,
      active: pathname.includes(`/${selectedWorkspace?.id}`) && pathname.includes("tab=files")
    },
    {
      title: "Reports",
      icon: BarChart3,
      href: `/${selectedWorkspace?.id}/reports`,
      active: pathname.includes("/reports")
    }
  ];

  return (
    <ErrorBoundary>
      <aside 
        className={cn(
          "flex flex-col border-r border-zinc-800 bg-zinc-900 text-white transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
      {/* Logo/Brand Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-lg font-bold text-white">Shadow AI</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="text-zinc-400 hover:text-white hover:bg-zinc-800 ml-auto"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Projects Section */}
        <div>
          {!isCollapsed && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Projects
            </h3>
          )}
          <div className="space-y-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/${selectedWorkspace?.id}/projects/${project.id}`)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  currentProjectId === project.id
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                )}
                title={isCollapsed ? project.name : undefined}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <span className="truncate">{project.name}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          {!isCollapsed && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Quick Links
            </h3>
          )}
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    item.active
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>{item.title}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-4 space-y-2">
        <button
          onClick={() => router.push(`/${selectedWorkspace?.id}/settings`)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
          title={isCollapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4" />
          {!isCollapsed && <span>Settings</span>}
        </button>
        
        {!isCollapsed && (
          <div className="flex items-center gap-3 px-3 py-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">
                {profile?.display_name || profile?.username || "User"}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {selectedWorkspace?.name}
              </p>
            </div>
          </div>
        )}
      </div>
      </aside>
    </ErrorBoundary>
  );
};