"use client"

import { ChatHelp } from "@/components/chat/chat-help"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatUI } from "@/components/chat/chat-ui"
import { QuickSettings } from "@/components/chat/quick-settings"
import { Brand } from "@/components/ui/brand"
import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { cn } from "@/lib/utils"
import { FileText, FlaskConical, Lightbulb, MessageSquare } from "lucide-react"
import { useContext } from "react"

type UseCase = "design" | "validate" | "explore" | "browse"

const SUGGESTION_CARDS = [
  {
    id: "analyze",
    icon: FlaskConical,
    title: "Analyze data",
    description: "Upload a dataset and get insights",
    color: "text-blue-600 bg-blue-50 border-blue-100"
  },
  {
    id: "summarize",
    icon: FileText,
    title: "Summarize a paper",
    description: "Get key findings from research",
    color: "text-emerald-600 bg-emerald-50 border-emerald-100"
  },
  {
    id: "brainstorm",
    icon: MessageSquare,
    title: "Brainstorm ideas",
    description: "Explore new research directions",
    color: "text-purple-600 bg-purple-50 border-purple-100"
  },
  {
    id: "explain",
    icon: Lightbulb,
    title: "Explain a concept",
    description: "Break down complex topics",
    color: "text-orange-600 bg-orange-50 border-orange-100"
  }
] as const

const USE_CASE_LEAD_CARD: Record<
  UseCase,
  (typeof SUGGESTION_CARDS)[number]["id"]
> = {
  design: "brainstorm",
  validate: "explain",
  explore: "summarize",
  browse: "analyze"
}

const USE_CASE_GREETING: Record<UseCase, string> = {
  design: "Ready to design your next experiment?",
  validate: "Let's pressure-test a hypothesis.",
  explore: "What should we dig into?",
  browse: "What can I help with today?"
}

function sortCardsByUseCase(useCase: UseCase | null) {
  if (!useCase) return SUGGESTION_CARDS
  const leadId = USE_CASE_LEAD_CARD[useCase]
  const lead = SUGGESTION_CARDS.find(c => c.id === leadId)
  if (!lead) return SUGGESTION_CARDS
  return [lead, ...SUGGESTION_CARDS.filter(c => c.id !== leadId)]
}

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const { chatMessages, setUserInput, profile } = useContext(ChatbotUIContext)

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const useCase = (profile?.use_case as UseCase | null) ?? null
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? ""
  const greeting = useCase
    ? USE_CASE_GREETING[useCase]
    : "What can I help with today?"
  const cards = sortCardsByUseCase(useCase)
  const leadId = useCase ? USE_CASE_LEAD_CARD[useCase] : null

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

            <div className="mt-6 text-center">
              {firstName && (
                <p className="text-ink-3 text-[13px]">Hi {firstName},</p>
              )}
              <p className="text-ink mt-0.5 text-[15px] font-medium sm:text-[16px]">
                {greeting}
              </p>
            </div>

            {/* Suggestion cards */}
            <div className="mt-6 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {cards.map(card => {
                const Icon = card.icon
                const isLead = card.id === leadId
                return (
                  <button
                    key={card.title}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                      card.color,
                      isLead && "ring-rust/40 shadow-sm ring-2"
                    )}
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
