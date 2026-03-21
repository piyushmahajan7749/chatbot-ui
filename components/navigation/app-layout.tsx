"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "./app-sidebar";
import { GlobalSearch } from "@/components/search/global-search";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load sidebar state from localStorage
  useEffect(() => {
    const collapsed = localStorage.getItem("sidebarCollapsed") === "true";
    setIsCollapsed(collapsed);
  }, []);

  const handleToggleSidebar = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", String(newCollapsed));
  };

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Dark Sidebar */}
      <AppSidebar 
        isCollapsed={isCollapsed} 
        onToggle={handleToggleSidebar}
      />

      {/* Main Content Area */}
      <main 
        className={cn(
          "flex-1 overflow-hidden bg-zinc-50 transition-all duration-300"
        )}
      >
        {children}
      </main>

      {/* Global Search Modal */}
      <GlobalSearch />
    </div>
  );
};