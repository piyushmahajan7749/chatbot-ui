"use client"

import { useState, useContext } from "react"
import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"
import { ArrowLeftIcon, ArrowRightIcon, Plus } from "lucide-react"
import { ChatbotUIContext } from "@/context/context"
import { FilePicker } from "@/components/chat/file-picker"

interface AddDataProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function AddDataComponent({ onCancel, onSave, colorId }: AddDataProps) {
  const { files, collections } = useContext(ChatbotUIContext)
  const [isLoading, setLoading] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [selectedFileType, setSelectedFileType] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])

  const handleSave = async () => {
    setLoading(true)
    try {
      // Here you would typically save the selected files and collections
      console.log("Selected files:", selectedFiles)
      console.log("Selected collections:", selectedCollections)
      onSave()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (file: any) => {
    setSelectedFiles(prev => [...prev, file.id])
    setShowFilePicker(false)
  }

  const handleCollectionSelect = (collection: any) => {
    setSelectedCollections(prev => [...prev, collection.id])
    setShowFilePicker(false)
  }

  const cardData = [
    { title: "Protocol" },
    { title: "Papers" },
    { title: "Experiment Data" },
    { title: "Other files" }
  ]

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {isLoading ? (
        <div className="my-48">
          <Loader text="Generating content" />
        </div>
      ) : (
        <>
          <div
            className={`mb-4 flex w-full flex-row items-center justify-center rounded-t-lg bg-zinc-700 py-3`}
          >
            <Label className="pl-4 text-lg font-bold">Add data</Label>
          </div>
          <div className="my-4 grid w-full max-w-3xl grid-cols-2 gap-8">
            {cardData.map((card, index) => (
              <Button
                key={index}
                variant="outline"
                className="flex h-36 flex-col items-center justify-center text-lg font-semibold transition-all duration-200 hover:bg-zinc-100 hover:shadow-md dark:hover:bg-zinc-800"
                onClick={() => {
                  setSelectedFileType(card.title)
                  setShowFilePicker(true)
                }}
              >
                <Plus
                  strokeWidth={0.8}
                  className="mb-4 size-16 text-zinc-600 dark:text-zinc-400"
                />
                <span className="text-center">{card.title}</span>
              </Button>
            ))}
          </div>
          {showFilePicker && (
            <FilePicker
              isOpen={showFilePicker}
              onOpenChange={setShowFilePicker}
              onSelectFile={handleFileSelect}
              onSelectCollection={handleCollectionSelect}
              selectedFileIds={selectedFiles}
              selectedCollectionIds={selectedCollections}
              searchQuery=""
              isFocused={true}
            />
          )}
          <div className="flex w-full flex-row justify-center">
            <Button
              onClick={handleSave}
              className="my-8 w-1/6"
              style={{ backgroundColor: "link" }}
            >
              Next
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default AddDataComponent
