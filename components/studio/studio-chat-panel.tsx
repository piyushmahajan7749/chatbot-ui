"use client"

import { IconArrowLeft, IconBrain } from "@tabler/icons-react"
import { ChatUI } from "@/components/chat/chat-ui"

interface StudioChatPanelProps {
  width: number
  projectId?: string
  workspaceId?: string
  onBack?: () => void
}

export function StudioChatPanel({ 
  width, 
  projectId, 
  workspaceId, 
  onBack 
}: StudioChatPanelProps) {
  return (
    <div
      className="bg-slate-200 border-r border-slate-300 flex flex-col shadow-lg z-30 shrink-0 h-full relative"
      style={{ width }}
    >
      {/* Header */}
      <div
        className="px-6 py-5 flex items-center gap-3 border-b border-slate-300 bg-slate-200 cursor-pointer hover:bg-slate-300/50 transition-colors shrink-0"
        onClick={onBack}
        title="Back to Project"
      >
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm shadow-md">
          <IconBrain size={18} />
        </div>
        <h1 className="text-base font-bold text-slate-800 truncate">ShadowAI</h1>
        {onBack && (
          <IconArrowLeft 
            size={16} 
            className="ml-auto text-slate-600 hover:text-slate-800"
          />
        )}
      </div>

      {/* Chat UI - wrapped in container to handle styling */}
      <div className="flex-1 flex flex-col bg-slate-200 overflow-hidden">
        <div className="flex-1 relative studio-chat-wrapper">
          <ChatUI />
        </div>
      </div>

      {/* Studio-specific CSS overrides */}
      <style jsx global>{`
        .studio-chat-wrapper .relative.flex.h-full.flex-col.items-center {
          items-stretch !important;
        }
        .studio-chat-wrapper .relative.w-full.min-w-\[300px\].items-end {
          width: 100% !important;
          min-width: unset !important;
          max-width: unset !important;
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
        }
        .studio-chat-wrapper .absolute.bottom-2.right-2 {
          display: none !important;
        }
        .studio-chat-wrapper .absolute.left-4.top-2\.5 {
          left: 0.5rem !important;
        }
        .studio-chat-wrapper .absolute.right-4.top-1 {
          right: 0.5rem !important;
        }
      `}</style>
    </div>
  )
}