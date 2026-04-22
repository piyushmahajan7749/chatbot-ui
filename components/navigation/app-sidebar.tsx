"use client"

import {
  IconBook,
  IconChevronDown,
  IconChevronsLeft,
  IconDotsVertical,
  IconFlask,
  IconFolder,
  IconLayoutGrid,
  IconMessage,
  IconPlus,
  IconPoint,
  IconSearch,
  IconSettings
} from "@tabler/icons-react"
import { usePathname, useRouter } from "next/navigation"
import { useContext, useEffect, useState } from "react"

import { Brand } from "@/components/ui/brand"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { Kbd } from "@/components/ui/kbd"
import { ChatbotUIContext } from "@/context/context"
import { getProjectsByWorkspaceId } from "@/db/projects"
import { cn } from "@/lib/utils"

interface AppSidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

interface NavItemProps {
  icon?: React.ReactNode
  label: string
  active?: boolean
  badge?: React.ReactNode
  onClick?: () => void
  collapsed?: boolean
  indent?: number
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
  collapsed,
  indent = 0
}: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "relative mx-2 my-px flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13px] transition-colors",
        active
          ? "bg-paper-3 text-ink font-medium"
          : "text-ink-2 hover:bg-paper-3"
      )}
      style={indent ? { paddingLeft: 10 + indent } : undefined}
    >
      {active && (
        <span className="bg-rust absolute inset-y-2 left-[-8px] w-0.5 rounded" />
      )}
      {icon && (
        <span className={active ? "text-ink" : "text-ink-3"}>{icon}</span>
      )}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="bg-paper-3 text-ink-3 rounded-md px-1.5 py-px font-mono text-[10.5px]">
          {badge}
        </span>
      )}
    </button>
  )
}

interface NavSectionProps {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
  collapsed?: boolean
}

function NavSection({ label, action, children, collapsed }: NavSectionProps) {
  return (
    <div className="mt-5">
      {!collapsed && (
        <div className="flex items-center justify-between px-5 pb-2">
          <span className="text-ink-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em]">
            {label}
          </span>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const { selectedWorkspace, profile, chats } = useContext(ChatbotUIContext)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!selectedWorkspace?.id) return
    let cancelled = false
    getProjectsByWorkspaceId(selectedWorkspace.id)
      .then(p => {
        if (!cancelled) setProjects(p)
      })
      .catch(err => {
        console.error("Error fetching projects:", err)
      })
    return () => {
      cancelled = true
    }
  }, [selectedWorkspace?.id])

  const wsId = selectedWorkspace?.id
  const currentProjectId = pathname.split("/projects/")[1]?.split("/")[0]

  const isActive = (slug: string) => {
    if (!wsId) return false
    return pathname.includes(`/${wsId}${slug}`)
  }

  const triggerGlobalSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        ctrlKey: true
      })
    )
  }

  const initials = (() => {
    const n = profile?.display_name || profile?.username || ""
    const parts = n.trim().split(/\s+/)
    if (!parts[0]) return "U"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  })()

  const recentChats = chats.slice(0, 3)

  return (
    <ErrorBoundary>
      <aside
        className={cn(
          "border-line bg-paper-2 flex h-full flex-col border-r transition-all duration-300",
          isCollapsed ? "w-16" : "w-[252px]"
        )}
      >
        {/* Brand row */}
        <div className="flex items-center justify-between px-4 pb-3.5 pt-4">
          {isCollapsed ? <Brand collapsed size={22} /> : <Brand size={22} />}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-ink-3 size-7"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconChevronsLeft
              size={14}
              className={cn(
                "transition-transform",
                isCollapsed && "rotate-180"
              )}
            />
          </Button>
        </div>

        {/* Workspace picker */}
        {!isCollapsed && (
          <div className="px-3">
            <button
              type="button"
              onClick={() => router.push(wsId ? `/${wsId}` : "/")}
              className="border-line bg-surface text-ink flex h-10 w-full items-center gap-2.5 rounded-md border px-2.5 text-left transition-colors"
            >
              <div
                className="flex size-[22px] items-center justify-center rounded-[6px] text-[11px] font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--p-problem) 0%, #1A4A4A 100%)"
                }}
              >
                {selectedWorkspace?.name?.slice(0, 2).toUpperCase() || "WS"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">
                  {selectedWorkspace?.name || "Workspace"}
                </div>
              </div>
              <IconChevronDown size={14} stroke={1.8} />
            </button>
          </div>
        )}

        {/* Search */}
        {!isCollapsed && (
          <div className="px-3 pb-1 pt-3.5">
            <button
              type="button"
              onClick={triggerGlobalSearch}
              className="border-line bg-surface text-ink-3 flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-[12.5px]"
            >
              <IconSearch size={14} />
              <span className="flex-1 text-left">Search</span>
              <Kbd>⌘K</Kbd>
            </button>
          </div>
        )}

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto pb-3">
          <NavSection label="Workspace" collapsed={isCollapsed}>
            <NavItem
              icon={<IconLayoutGrid size={15} />}
              label="Dashboard"
              active={
                wsId
                  ? pathname === `/${wsId}` || pathname.endsWith(`/${wsId}`)
                  : false
              }
              onClick={() => wsId && router.push(`/${wsId}`)}
              collapsed={isCollapsed}
            />
            <NavItem
              icon={<IconFlask size={15} />}
              label="All Designs"
              active={isActive("/designs")}
              onClick={() => wsId && router.push(`/${wsId}/designs`)}
              collapsed={isCollapsed}
            />
            <NavItem
              icon={<IconBook size={15} />}
              label="Reports"
              active={isActive("/reports")}
              onClick={() => wsId && router.push(`/${wsId}/reports`)}
              collapsed={isCollapsed}
            />
            <NavItem
              icon={<IconMessage size={15} />}
              label="Chat history"
              active={isActive("/chat-history")}
              onClick={() => wsId && router.push(`/${wsId}/chat-history`)}
              collapsed={isCollapsed}
            />
          </NavSection>

          <NavSection
            label="Projects"
            collapsed={isCollapsed}
            action={
              !isCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-ink-3 size-5"
                  onClick={() => wsId && router.push(`/${wsId}/projects`)}
                  title="View all projects"
                >
                  <IconPlus size={12} />
                </Button>
              )
            }
          >
            <NavItem
              icon={<IconFolder size={15} />}
              label="All Projects"
              active={isActive("/projects") && !currentProjectId}
              onClick={() => wsId && router.push(`/${wsId}/projects`)}
              collapsed={isCollapsed}
            />
            {!isCollapsed &&
              projects
                .slice(0, 5)
                .map(p => (
                  <NavItem
                    key={p.id}
                    icon={<IconFolder size={15} />}
                    label={p.name}
                    active={currentProjectId === p.id}
                    onClick={() =>
                      wsId && router.push(`/${wsId}/projects/${p.id}`)
                    }
                  />
                ))}
            {!isCollapsed && projects.length > 5 && (
              <button
                type="button"
                onClick={() => wsId && router.push(`/${wsId}/projects`)}
                className="text-ink-3 hover:text-ink-2 mx-2 my-px flex w-[calc(100%-1rem)] items-center px-[30px] py-1 text-[12px]"
              >
                +{projects.length - 5} more
              </button>
            )}
          </NavSection>

          {recentChats.length > 0 && !isCollapsed && (
            <NavSection label="Recent" collapsed={isCollapsed}>
              {recentChats.map(c => (
                <NavItem
                  key={c.id}
                  icon={<IconPoint size={10} />}
                  label={c.name || "Untitled chat"}
                  onClick={() => wsId && router.push(`/${wsId}/chat/${c.id}`)}
                />
              ))}
            </NavSection>
          )}
        </div>

        {/* Footer */}
        <div className="border-line flex flex-col gap-1.5 border-t p-3">
          <button
            type="button"
            onClick={() => wsId && router.push(`/${wsId}`)}
            className={cn(
              "text-ink-2 hover:bg-paper-3 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px]",
              isCollapsed && "justify-center"
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <IconSettings size={15} />
            {!isCollapsed && <span>Settings</span>}
          </button>

          {!isCollapsed && (
            <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
              <div className="bg-rust text-paper flex size-7 items-center justify-center rounded-full text-[12px] font-semibold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate text-[12.5px] font-medium">
                  {profile?.display_name || profile?.username || "User"}
                </div>
                <div className="text-ink-3 truncate text-[11px]">
                  {selectedWorkspace?.name}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-ink-3 size-6"
                title="More"
              >
                <IconDotsVertical size={14} />
              </Button>
            </div>
          )}
        </div>
      </aside>
    </ErrorBoundary>
  )
}
