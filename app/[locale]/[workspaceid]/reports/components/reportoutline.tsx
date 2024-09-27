"use client"

import { useState, useEffect } from "react"
import { useReportContext } from "@/context/reportcontext"

import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"

interface ReportOutlineProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function ReportOutlineComponent({
  onCancel,
  onSave,
  colorId
}: ReportOutlineProps) {
  const [isLoading, setLoading] = useState(false)
  const { selectedData, setReportOutline } = useReportContext()
  const [generatedOutline, setGeneratedOutline] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const generateOutline = async () => {
      setLoading(true)
      setError(null)
      try {
        console.log("Sending data to API:", selectedData)
        const response = await fetch("/api/report/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selectedData)
        })
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${errorData.message || "Unknown error"}`
          )
        }
        const data = await response.json()
        console.log("Received data from API:", data)
        if (data.outline) {
          setGeneratedOutline(data.outline)
          setReportOutline(data.outline)
        } else {
          throw new Error("No outline data received")
        }
      } catch (error) {
        console.error("Error generating outline:", error)
        setError(error instanceof Error ? error.message : String(error))
        setGeneratedOutline("")
      } finally {
        setLoading(false)
      }
    }

    if (
      selectedData.userPrompt &&
      selectedData.protocol &&
      selectedData.papers &&
      selectedData.dataFiles
    ) {
      generateOutline()
    }
  }, [selectedData, setReportOutline])

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {isLoading ? (
        <div className="my-48">
          <Loader text="Generating outline" />
        </div>
      ) : error ? (
        <div className="text-red-500">
          <p>Error: {error}</p>
          <p>Please try again or contact support if the problem persists.</p>
        </div>
      ) : (
        <>
          <div className="flex w-full flex-col">
            <div
              className={`mb-4 flex w-full flex-row items-center justify-center rounded-t-lg bg-zinc-700 py-3`}
            >
              <Label className="pl-4 text-lg font-bold">Report Outline</Label>
            </div>
          </div>
          <div className="flex w-full flex-col justify-center p-4 pl-8 text-gray-300">
            <pre>{generatedOutline}</pre>
          </div>
          {generatedOutline && <Button onClick={onSave}>Save Outline</Button>}
        </>
      )}
    </div>
  )
}

export default ReportOutlineComponent
