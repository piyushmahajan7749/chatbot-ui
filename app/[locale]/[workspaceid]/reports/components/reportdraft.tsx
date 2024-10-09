"use client"

import { useState, useEffect } from "react"
import { useReportContext } from "@/context/reportcontext"

import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"
import ReactQuill from "react-quill"
import "react-quill/dist/quill.snow.css"
import { InfoComponent } from "./infocomponent"
import { InfoBox } from "./infobox"
import { IconList } from "@tabler/icons-react"

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
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number | null>(0)
  const [sectionContents, setSectionContents] = useState<
    Record<string, string>
  >({})
  const [chartImage, setChartImage] = useState<string | null>(null)

  // Add this new function to get the section content
  const getActiveSectionContent = () => {
    if (
      activeSection !== null &&
      activeSection >= 0 &&
      activeSection < generatedOutline.length
    ) {
      const sectionTitle = generatedOutline[activeSection]
      return sectionContents[sectionTitle] || ""
    }
    return ""
  }

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
          setGeneratedOutline(data.reportOutline)
          setSectionContents(data.reportDraft)
          setChartImage(data.chartImage)
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
      selectedData.protocol ||
      selectedData.papers ||
      selectedData.dataFiles
    ) {
      generateDraft()
    }
  }, [selectedData])

  const handleSave = async () => {
    try {
      const response = await fetch("/api/report/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: sectionContents,
          outline: generatedOutline
          // Include any other necessary data
        })
      })
      if (!response.ok) {
        throw new Error("Failed to save draft")
      }
      onSave()
    } catch (error) {
      console.error("Error saving draft:", error)
    }
  }

  const handleSectionClick = (index: number) => {
    setActiveSection(index)
  }

  return (
    <div className="flex w-full flex-col items-start justify-start">
      {isLoading ? (
        <div className="my-48 w-full text-center">
          <Loader text="Generating report draft" />
        </div>
      ) : (
        <div className="flex w-full">
          <div className="mb-12  h-[calc(100vh-140px)] w-1/4 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                  className="cursor-pointer text-blue-600 hover:underline"
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
            <div>
              <h3 className="mb-4 text-lg font-bold text-zinc-800">
                {generatedOutline[activeSection ?? 0]}
              </h3>
              <InfoBox
                key="infoBox"
                onEdit={(value: any) => {
                  setSectionContents(prev => ({
                    ...prev,
                    [generatedOutline[activeSection ?? 0]]: value
                  }))
                }}
                title={generatedOutline[activeSection ?? 0]}
                description={getActiveSectionContent()}
                colorId="habit"
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
