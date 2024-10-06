"use client"

import { useState, useEffect } from "react"
import { useReportContext } from "@/context/reportcontext"

import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"
import ReactQuill from "react-quill"
import "react-quill/dist/quill.snow.css"

interface ReportDraftProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

// What I need to fix or change here
// 1. The generated draft is not being saved to the database
// 2. The generated outline is not being saved to the database
// 3. The outline should be unordered list
// 4. The content in each section should be bigger
// 5. The table of contents UI is not good
// 6. The sections should be editable
// 7. Add visualization charts and tables for the report.

export function ReportDraftComponent({
  onCancel,
  onSave,
  colorId
}: ReportDraftProps) {
  const [isLoading, setLoading] = useState(false)
  const { selectedData } = useReportContext()
  const [generatedDraft, setGeneratedDraft] = useState<string>("")
  const [generatedOutline, setGeneratedOutline] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [sectionContents, setSectionContents] = useState<string[]>([])

  const [question, setQuestion] = useState("")

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
          setGeneratedOutline(data.reportOutline.split("\n"))
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
    if (generatedDraft) {
      setSectionContents(generatedDraft.split("\n"))
    }
  }, [selectedData])

  const handleSave = async () => {
    try {
      const response = await fetch("/api/report/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: sectionContents.join("\n"),
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
          <div className="sticky top-0 h-screen w-1/4 overflow-y-auto bg-gray-50 p-4">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">
              Table of Contents
            </h2>
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
          <div className="w-3/4 p-4">
            <h2 className="mb-4 text-xl font-bold">Report Draft</h2>
            {activeSection !== null ? (
              <div>
                <h3 className="font-bold">{generatedOutline[activeSection]}</h3>
                <ReactQuill
                  theme="snow"
                  value={sectionContents[activeSection]}
                  onChange={value => {
                    const newContents = [...sectionContents]
                    newContents[activeSection] = value
                    setSectionContents(newContents)
                  }}
                />
              </div>
            ) : (
              sectionContents.map((item, index) => (
                <div key={index} className="mb-4">
                  <h3 className="font-bold">{generatedOutline[index]}</h3>
                  <ReactQuill
                    theme="snow"
                    value={item}
                    onChange={value => {
                      const newContents = [...sectionContents]
                      newContents[index] = value
                      setSectionContents(newContents)
                    }}
                  />
                </div>
              ))
            )}
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
