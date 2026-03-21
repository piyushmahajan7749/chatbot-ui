"use client";

import { useState, useContext, useEffect, useRef } from "react";
import { ChatbotUIContext } from "@/context/context";
import useHotkey from "@/lib/hooks/use-hotkey";
import { Dialog, DialogContent } from "../ui/dialog";
import { Input } from "../ui/input";
import { 
  Search, 
  MessageSquare, 
  FolderOpen, 
  File, 
  BarChart3, 
  Calendar,
  User,
  Tag,
  ArrowRight
} from "lucide-react";
import { searchGlobalContent } from "@/db/search";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export interface SearchResult {
  id: string;
  type: "project" | "chat" | "file" | "report";
  title: string;
  description?: string;
  url: string;
  metadata?: {
    model?: string;
    date?: string;
    size?: string;
    author?: string;
    tags?: string[];
    projectName?: string;
  };
}

export const GlobalSearch = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { selectedWorkspace, profile } = useContext(ChatbotUIContext);
  const router = useRouter();
  const searchRequestId = useRef(0);

  // Global shortcut (Cmd+K / Ctrl+K)
  useHotkey("k", () => setIsOpen(true));

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || !selectedWorkspace?.id || !profile?.user_id) {
      setResults([]);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const requestId = ++searchRequestId.current;

      setIsLoading(true);
      searchGlobalContent(
        selectedWorkspace.id,
        profile.user_id,
        query
      )
        .then((searchResults) => {
          // Ignore stale responses
          if (requestId !== searchRequestId.current) return;
          setResults(searchResults);
          setSelectedIndex(0);
        })
        .catch((error) => {
          if (requestId !== searchRequestId.current) return;
          console.error("Search error:", error);
          setResults([]);
        })
        .finally(() => {
          if (requestId !== searchRequestId.current) return;
          setIsLoading(false);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query, selectedWorkspace?.id, profile?.user_id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(results[selectedIndex]);
      return;
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setIsOpen(false);
    router.push(result.url);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "project":
        return <FolderOpen className="w-4 h-4" />;
      case "chat":
        return <MessageSquare className="w-4 h-4" />;
      case "file":
        return <File className="w-4 h-4" />;
      case "report":
        return <BarChart3 className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "project":
        return "text-blue-600 bg-blue-50";
      case "chat":
        return "text-emerald-600 bg-emerald-50";
      case "file":
        return "text-orange-600 bg-orange-50";
      case "report":
        return "text-purple-600 bg-purple-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="max-w-2xl p-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b px-4 py-3">
            <Search className="mr-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects, chats, files, and reports..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-none p-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost" 
                size="sm"
                onClick={() => setQuery("")}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {query && results.length === 0 && !isLoading && (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="mx-auto h-8 w-8 mb-3 opacity-50" />
                <p>No results found for "{query}"</p>
                <p className="text-sm mt-1">Try different keywords or check your spelling</p>
              </div>
            )}

            {isLoading && (
              <div className="p-8 text-center">
                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-muted-foreground">Searching...</p>
              </div>
            )}

            {results.map((result, index) => (
              <div
                key={`${result.type}-${result.id}`}
                className={cn(
                  "group flex items-start gap-3 p-4 cursor-pointer border-l-2 hover:bg-muted/50 transition-colors",
                  selectedIndex === index ? "bg-muted border-l-blue-600" : "border-l-transparent"
                )}
                onClick={() => handleSelectResult(result)}
              >
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-md",
                  getTypeColor(result.type)
                )}>
                  {getResultIcon(result.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm truncate">{result.title}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide",
                      getTypeColor(result.type)
                    )}>
                      {result.type}
                    </span>
                  </div>
                  
                  {result.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {result.description}
                    </p>
                  )}
                  
                  {result.metadata && (
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {result.metadata.projectName && (
                        <span className="flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {result.metadata.projectName}
                        </span>
                      )}
                      {result.metadata.model && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {result.metadata.model}
                        </span>
                      )}
                      {result.metadata.date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {result.metadata.date}
                        </span>
                      )}
                      {result.metadata.size && (
                        <span className="flex items-center gap-1">
                          <File className="w-3 h-3" />
                          {result.metadata.size}
                        </span>
                      )}
                      {result.metadata.tags && result.metadata.tags.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {result.metadata.tags.slice(0, 2).join(", ")}
                          {result.metadata.tags.length > 2 && "..."}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>

          {/* Footer */}
          {query && results.length > 0 && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground bg-muted/30">
              <div className="flex items-center justify-between">
                <span>
                  {results.length} result{results.length !== 1 ? "s" : ""} found
                </span>
                <span>
                  Use ↑↓ arrows to navigate, Enter to select, Esc to close
                </span>
              </div>
            </div>
          )}

          {!query && (
            <div className="p-6 text-center text-muted-foreground">
              <Search className="mx-auto h-8 w-8 mb-3 opacity-50" />
              <p>Search across all your projects, chats, files, and reports</p>
              <p className="text-sm mt-1">Start typing to see results...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};