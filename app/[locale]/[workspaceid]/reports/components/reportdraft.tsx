"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader } from "@/components/ui/loader"
import { IconList } from "@tabler/icons-react"
import { InfoBox } from "./infobox"

// Mock data
const mockData = {
  reportOutline: [
    "Overview",
    "Research Questions",
    "Founders",
    "Competing/Related Companies",
    "Funding Data",
    "Glassdoor Reviews",
    "Decision Makers",
    "News Articles",
    "Funding Stages",
    "Web Traffic",
    "Twitter Follower Count",
    "Team Growth",
    "Organic and PPC Spend, Traffic, and Keywords",
    "Organic Keywords",
    "Tech Products"
  ],
  reportDraft: {
    Overview:
      "Agent.ai is a cutting-edge platform that provides AI-powered tools and services...",
    "Research Questions":
      "• What is the lowest price they offer and for which product?\nThe lowest price offered by OpenAI is $0.15 per 1M tokens for the GPT-4a mini model. This model is their most cost-efficient small model with vision capabilities and an October 2023 knowledge cutoff.\n\n• What is the highest priced they offer and for which product?\nThe highest priced product offered by OpenAI is GPT-4a, with a price of $25.00 per 1M tokens for fine-tuning over the daily complimentary limit.\n\n• Do they sell a subscription product?\nYes, OpenAI sells a subscription product called ChatGPT Plus, which is priced at a flat rate of $20/month.\n\n• Where are their offices located?\nOpenAI is headquartered in San Francisco, California."
    // ... (other sections)
  }
}

interface ReportDraftProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function ReportDraftComponent({
  onCancel,
  onSave,
  colorId
}: ReportDraftProps) {
  const [isLoading, setLoading] = useState(true)
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [question, setQuestion] = useState("")

  useEffect(() => {
    // Simulate API call with setTimeout
    const timer = setTimeout(() => {
      setGeneratedOutline(mockData.reportOutline)
      setSectionContents(mockData.reportDraft)
      setLoading(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  const handleSave = () => {
    // Simulate saving data
    console.log("Saving draft:", sectionContents)
    onSave()
  }

  const handleSectionClick = (index: number) => {
    setActiveSection(index)
  }

  const handleEdit = (value: string) => {
    setSectionContents(prev => ({
      ...prev,
      [generatedOutline[activeSection]]: value
    }))
  }

  const handleAskQuestion = () => {
    // Simulate asking a question
    console.log("Asking question:", question)
    // Here you would typically make an API call to get the answer
    // For now, we'll just clear the input
    setQuestion("")
  }

  return (
    <div className="flex w-full flex-col items-start justify-start">
      {isLoading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <div className="flex w-full">
          <div className="mb-12 h-[calc(100vh-140px)] w-1/4 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-8 flex items-center">
              <IconList className="mr-2 size-5 text-zinc-800" />
              <h2 className="text-lg font-semibold text-zinc-800">
                Table of Contents
              </h2>
            </div>
            <ul className="space-y-2">
              {generatedOutline.map((item, index) => (
                <li
                  key={index}
                  className={`cursor-pointer ${
                    activeSection === index
                      ? "font-bold text-blue-600"
                      : "text-blue-600 hover:underline"
                  }`}
                  onClick={() => handleSectionClick(index)}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="ml-8 h-[calc(100vh-140px)] w-3/4 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-md">
            <h2 className="my-4 text-center text-2xl font-bold text-zinc-800">
              Report Draft
            </h2>
            <div className="mb-6">
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
            <div>
              <h3 className="mb-4 text-lg font-bold text-zinc-800">
                {generatedOutline[activeSection]}
              </h3>
              <InfoBox
                key={`infoBox-${activeSection}`}
                onEdit={handleEdit}
                title={generatedOutline[activeSection]}
                description={
                  sectionContents[generatedOutline[activeSection]] || ""
                }
                colorId={colorId}
              />
            </div>
            <Button onClick={handleSave} className="mt-4">
              Save Draft
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportDraftComponent
