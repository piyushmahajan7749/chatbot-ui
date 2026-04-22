"use client"

import { ChatHelp } from "@/components/chat/chat-help"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatUI } from "@/components/chat/chat-ui"
import { QuickSettings } from "@/components/chat/quick-settings"
import { Brand } from "@/components/ui/brand"
import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { useTheme } from "next-themes"
import { useContext } from "react"
import { MessageSquare, FileText, FlaskConical, Lightbulb } from "lucide-react"

const SUGGESTION_CARDS = [
  {
    icon: FlaskConical,
    title: "Analyze data",
    description: "Upload a dataset and get insights",
    color: "text-blue-600 bg-blue-50 border-blue-100"
  },
  {
    icon: FileText,
    title: "Summarize a paper",
    description: "Get key findings from research",
    color: "text-emerald-600 bg-emerald-50 border-emerald-100"
  },
  {
    icon: MessageSquare,
    title: "Brainstorm ideas",
    description: "Explore new research directions",
    color: "text-purple-600 bg-purple-50 border-purple-100"
  },
  {
    icon: Lightbulb,
    title: "Explain a concept",
    description: "Break down complex topics",
    color: "text-orange-600 bg-orange-50 border-orange-100"
  }
]

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const { chatMessages, setUserInput } = useContext(ChatbotUIContext)

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const { theme } = useTheme()

  return (
    <>
      {chatMessages.length === 0 ? (
        <div className="flex h-full flex-col bg-slate-50">
          {/* Top bar with model selector */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
            <QuickSettings />
            <ChatHelp />
          </div>

          {/* Centered welcome content */}
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <Brand />

            {/* Suggestion cards */}
            <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {SUGGESTION_CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.title}
                    className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.color}`}
                    onClick={() => {
                      setUserInput(card.title + ": ")
                      handleFocusChatInput()
                    }}
                  >
                    <Icon className="size-5" />
                    <div>
                      <p className="text-sm font-semibold">{card.title}</p>
                      <p className="mt-0.5 text-xs opacity-70">
                        {card.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Chat input */}
          <div className="w-full max-w-3xl self-center px-4 pb-6 pt-2">
            <ChatInput />
          </div>
        </div>
      ) : (
        <ChatUI />
      )}
    </>
  )
}
