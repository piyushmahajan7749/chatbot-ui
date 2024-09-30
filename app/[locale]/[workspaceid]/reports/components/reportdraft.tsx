"use client"

import { useState, useEffect } from "react"
import { useReportContext } from "@/context/reportcontext"

import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"

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
  const [isLoading, setLoading] = useState(false)
  const { selectedData } = useReportContext()
  const [generatedDraft, setGeneratedDraft] = useState<string>("")
  const [generatedOutline, setGeneratedOutline] = useState<string>("")

  useEffect(() => {
    const generateDraft = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/report/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selectedData)
        })
        const data = await response.json()
        console.log("Received data from API:", data)
        if (data.reportOutline && data.reportDraft) {
          setGeneratedDraft(data.reportDraft)
          setGeneratedOutline(data.reportOutline)
        } else {
          throw new Error("No outline or draft data received")
        }
      } catch (error) {
        console.error("Error generating draft:", error)
      } finally {
        setLoading(false)
      }
    }

    if (
      selectedData.userPrompt &&
      (selectedData.protocol || selectedData.papers || selectedData.dataFiles)
    ) {
      generateDraft()
    }
  }, [selectedData])

  const handleSave = async () => {
    // Here you can implement logic to save the generated draft
    onSave()
  }

  return (
    <div className="flex w-full flex-col items-start justify-start">
      {isLoading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <div className="flex w-full">
          <div className="w-1/4 bg-gray-100 p-4">
            <h2 className="mb-4 text-lg font-bold">Table of Contents</h2>
            <ol className="list-decimal pl-4">
              {generatedOutline.split("\n").map((item, index) => (
                <li key={index} className="mb-2 text-blue-600">
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div className="w-3/4 p-4">
            <h2 className="mb-4 text-xl font-bold">Research Questions</h2>
            {generatedDraft.split("\n").map((item, index) => {
              const [question, answer] = item.split("\n")
              return (
                <div key={index} className="mb-4">
                  <h3 className="font-bold">{question}</h3>
                  <p className="mt-1 text-gray-700">{answer}</p>
                </div>
              )
            })}
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
