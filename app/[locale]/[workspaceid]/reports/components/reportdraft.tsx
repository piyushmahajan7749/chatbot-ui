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
  const { selectedData, reportOutline } = useReportContext()
  const [generatedDraft, setGeneratedDraft] = useState("")

  useEffect(() => {
    const generateDraft = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/report/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedData,
            generatedOutline: reportOutline
          })
        })
        const data = await response.json()
        setGeneratedDraft(data.reportDraft)
      } catch (error) {
        console.error("Error generating draft:", error)
      } finally {
        setLoading(false)
      }
    }
    debugger
    if (reportOutline) {
      generateDraft()
    }
  }, [reportOutline, selectedData])

  const handleSave = async () => {
    // Here you can implement logic to save the generated draft
    onSave()
  }

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {isLoading ? (
        <div className="my-48">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <>
          <div className="flex w-full flex-col">
            <div
              className={`mb-4 flex w-full flex-row items-center justify-center rounded-t-lg bg-zinc-700 py-3`}
            >
              <Label className="pl-4 text-lg font-bold">
                Review your report
              </Label>
            </div>
          </div>
          <div className="flex w-full flex-col justify-center p-4 pl-8 text-gray-300">
            <pre className="whitespace-pre-wrap">{generatedDraft}</pre>
          </div>
          <Button onClick={handleSave}>Save Draft</Button>
        </>
      )}
    </div>
  )
}

export default ReportDraftComponent
