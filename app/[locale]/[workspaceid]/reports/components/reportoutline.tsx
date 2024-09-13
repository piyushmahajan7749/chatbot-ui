"use client"

import { useState, useEffect } from "react"
import { useReportContext } from "@/context/ReportContext"

import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

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

  useEffect(() => {
    const generateOutline = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/generate-outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedData })
        })
        const data = await response.json()
        setGeneratedOutline(data.outline)
        setReportOutline(data.outline)
      } catch (error) {
        console.error("Error generating outline:", error)
      } finally {
        setLoading(false)
      }
    }

    if (Object.keys(selectedData).length > 0) {
      generateOutline()
    }
  }, [selectedData])

  // Render the generated outline
  return (
    <div className="flex w-full flex-col items-center justify-center">
      {isLoading ? (
        <div className="my-48">
          <Loader text="Generating outline" />
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
          <div className=" flex w-full flex-col justify-center text-gray-300">
            <pre>{generatedOutline}</pre>
          </div>
          <Button onClick={onSave}>Save Outline</Button>
        </>
      )}
    </div>
  )
}

export default ReportOutlineComponent
