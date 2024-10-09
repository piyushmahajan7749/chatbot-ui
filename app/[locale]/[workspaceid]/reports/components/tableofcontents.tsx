"use client"

import { useState } from "react"
import { ChevronRight, Edit, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

const tableOfContents = [
  { id: "overview", title: "Overview", icon: "📊" },
  { id: "research-questions", title: "Research Questions", icon: "🔍" },
  { id: "founders", title: "Founders", icon: "👥" },
  {
    id: "competing-companies",
    title: "Competing/Related Companies",
    icon: "🏢"
  },
  { id: "funding-data", title: "Funding Data", icon: "💰" },
  { id: "glassdoor-reviews", title: "Glassdoor Reviews", icon: "⭐" },
  { id: "decision-makers", title: "Decision Makers", icon: "👔" },
  { id: "news-articles", title: "News Articles", icon: "📰" },
  { id: "funding-stages", title: "Funding Stages", icon: "📈" },
  { id: "web-traffic", title: "Web Traffic", icon: "🌐" },
  { id: "twitter-follower-count", title: "Twitter Follower Count", icon: "🐦" },
  { id: "team-growth", title: "Team Growth", icon: "🚀" },
  {
    id: "organic-ppc-spend",
    title: "Organic and PPC Spend, Traffic, and Keywords",
    icon: "💻"
  },
  { id: "organic-keywords", title: "Organic Keywords", icon: "🔑" },
  { id: "tech-products", title: "Tech Products", icon: "🛠️" }
]

const initialContentSections = {
  overview:
    "Agent.ai is a cutting-edge platform that provides AI-powered tools and services...",
  "research-questions":
    "• What is the lowest price they offer and for which product?\nThe lowest price offered by OpenAI is $0.15 per 1M tokens for the GPT-4a mini model. This model is their most cost-efficient small model with vision capabilities and an October 2023 knowledge cutoff.\n\n• What is the highest priced they offer and for which product?\nThe highest priced product offered by OpenAI is GPT-4a, with a price of $25.00 per 1M tokens for fine-tuning over the daily complimentary limit.\n\n• Do they sell a subscription product?\nYes, OpenAI sells a subscription product called ChatGPT Plus, which is priced at a flat rate of $20/month.\n\n• Where are their offices located?\nOpenAI is headquartered in San Francisco, California.",
  founders: "Detailed information about the visionary founders of Agent.ai",
  "competing-companies":
    "Comprehensive list of companies competing with or related to Agent.ai in the AI industry",
  "funding-data":
    "In-depth details about Agent.ai's funding rounds, investors, and financial growth",
  "glassdoor-reviews":
    "Summarized employee reviews from Glassdoor, providing insights into the company culture",
  "decision-makers":
    "Profiles of key decision-makers and executives steering Agent.ai's direction",
  "news-articles":
    "Curated list of recent news articles and press releases about Agent.ai",
  "funding-stages":
    "Detailed breakdown of different funding stages Agent.ai has gone through",
  "web-traffic":
    "Comprehensive web traffic statistics and analysis for Agent.ai's online presence",
  "twitter-follower-count":
    "Twitter follower count trends and social media impact analysis",
  "team-growth":
    "Data visualization and analysis of Agent.ai's team growth over time",
  "organic-ppc-spend":
    "Detailed information on organic and PPC spend, traffic metrics, and keyword strategies",
  "organic-keywords":
    "List and analysis of top organic keywords driving traffic to Agent.ai",
  "tech-products":
    "Comprehensive overview of innovative tech products offered by Agent.ai"
}

export default function TableOfContents() {
  const [selectedSection, setSelectedSection] = useState("overview")
  const [isEditing, setIsEditing] = useState(false)
  const [contentSections, setContentSections] = useState(initialContentSections)
  const [editedContent, setEditedContent] = useState("")
  const [question, setQuestion] = useState("")

  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(
      contentSections[selectedSection as keyof typeof contentSections]
    )
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent("")
  }

  const handleSave = () => {
    setContentSections(prev => ({
      ...prev,
      [selectedSection]: editedContent
    }))
    setIsEditing(false)
    setEditedContent("")
  }

  const handleAskQuestion = () => {
    // Simulate asking a question
    console.log("Asking question:", question)
    // Here you would typically make an API call to get the answer
    // For now, we'll just clear the input
    setQuestion("")
  }

  return (
    <div className="bg-background flex h-full overflow-hidden rounded-lg shadow-lg">
      <div className="bg-secondary w-1/3">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-4">
            {tableOfContents.map(item => (
              <button
                key={item.id}
                className={`flex w-full items-center space-x-2 rounded-md px-4 py-2 text-left transition-colors ${
                  selectedSection === item.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-primary/10"
                }`}
                onClick={() => setSelectedSection(item.id)}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.title}</span>
                {selectedSection === item.id && (
                  <ChevronRight className="ml-auto" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
      <Separator orientation="vertical" />
      <div className="bg-background flex w-2/3 flex-col">
        <div className="flex items-center justify-between p-6">
          <h2 className="text-primary text-3xl font-bold">
            {tableOfContents.find(item => item.id === selectedSection)?.title}
          </h2>
          {!isEditing && (
            <Button variant="outline" size="icon" onClick={handleEdit}>
              <Edit className="size-4" />
            </Button>
          )}
        </div>
        <div className="mb-4 px-6">
          <h3 className="mb-2 text-lg font-semibold">Ask a question</h3>
          <div className="flex items-center">
            <Input
              type="text"
              placeholder="Type your question here..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="mr-2 grow"
            />
            <Button onClick={handleAskQuestion}>Go</Button>
          </div>
        </div>
        <ScrollArea className="grow">
          <div className="p-6 pt-0">
            <div className="prose dark:prose-invert max-w-none">
              {isEditing ? (
                <textarea
                  className="h-[calc(100vh-24rem)] w-full rounded border p-2"
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                />
              ) : (
                <div className="whitespace-pre-wrap">
                  {
                    contentSections[
                      selectedSection as keyof typeof contentSections
                    ]
                  }
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        {isEditing && (
          <div className="bg-secondary mt-auto flex justify-end space-x-2 p-4">
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-2 size-4" />
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Check className="mr-2 size-4" />
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
