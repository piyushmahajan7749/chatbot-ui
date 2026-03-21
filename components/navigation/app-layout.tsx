"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "./app-sidebar";
import { GlobalSearch } from "@/components/search/global-search";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Load sidebar state from localStorage and check for mobile
  useEffect(() => {
    const collapsed = localStorage.getItem("sidebarCollapsed") === "true";
    setIsCollapsed(collapsed);
    
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setMobileSidebarOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen(!mobileSidebarOpen);
    } else {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);
      localStorage.setItem("sidebarCollapsed", String(newCollapsed));
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Mobile Menu Button */}
      {isMobile && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleSidebar}
          className="fixed top-4 left-4 z-50 md:hidden bg-white shadow-sm border border-zinc-200"
        >
          {mobileSidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </Button>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Dark Sidebar */}
      <div className={cn(
        "transition-transform duration-300 z-40",
        isMobile 
          ? cn(
              "fixed inset-y-0 left-0",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )
          : "relative"
      )}>
        <AppSidebar 
          isCollapsed={!isMobile && isCollapsed} 
          onToggle={handleToggleSidebar}
        />
      </div>

      {/* Main Content Area */}
      <main 
        className={cn(
          "flex-1 overflow-hidden bg-zinc-50 transition-all duration-300",
          isMobile && mobileSidebarOpen && "pointer-events-none"
        )}
      >
        {children}
      </main>

      {/* Global Search Modal */}
      <GlobalSearch />
    </div>
  );
};