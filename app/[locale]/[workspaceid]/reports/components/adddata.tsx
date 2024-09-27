"use client"

import { useState, useContext, useEffect } from "react"
import { Button } from "../../../../../components/ui/button"
import { ArrowRightIcon, Plus, X } from "lucide-react"
import { ChatbotUIContext } from "@/context/context"
import { FilePicker } from "@/components/chat/file-picker"
import { Tables } from "@/supabase/types"
import { Badge } from "@/components/ui/badge"
import { useReportContext } from "@/context/reportcontext"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AddDataProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

interface SelectedItem {
  id: string
  name: string
  type: "file" | "collection"
}

export function AddDataComponent({ onCancel, onSave, colorId }: AddDataProps) {
  const { files, collections } = useContext(ChatbotUIContext)
  const [isLoading, setLoading] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [selectedFileType, setSelectedFileType] = useState("")
  const [selectedItems, setSelectedItems] = useState<{
    [key: string]: SelectedItem[]
  }>({
    Protocol: [],
    Papers: [],
    "Experiment Data": [],
    "Other files": []
  })
  const [userPrompt, setUserPrompt] = useState("")

  const { setSelectedData } = useReportContext()

  useEffect(() => {
    console.log("Selected items updated:", selectedItems)
  }, [selectedItems])

  const handleSave = async () => {
    setLoading(true)
    try {
      const formattedData = {
        userPrompt,
        protocol: selectedItems.Protocol[0]?.name || "",
        papers: selectedItems.Papers.map(item => item.name),
        dataFiles: [
          ...selectedItems["Experiment Data"].map(item => item.name),
          ...selectedItems["Other files"].map(item => item.name)
        ]
      }
      setSelectedData(formattedData)
      onSave()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (file: Tables<"files">) => {
    console.log("File selected:", file)
    if (selectedFileType === "Protocol" && selectedItems.Protocol.length > 0) {
      // Replace existing protocol file
      setSelectedItems(prev => ({
        ...prev,
        Protocol: [{ id: file.id, name: file.name, type: "file" }]
      }))
    } else {
      setSelectedItems(prev => ({
        ...prev,
        [selectedFileType]: [
          ...prev[selectedFileType],
          { id: file.id, name: file.name, type: "file" }
        ]
      }))
    }
    setShowFilePicker(false)
  }

  const handleCollectionSelect = (collection: Tables<"collections">) => {
    console.log("Collection selected:", collection)
    setSelectedItems(prev => ({
      ...prev,
      [selectedFileType]: [
        ...prev[selectedFileType],
        { id: collection.id, name: collection.name, type: "collection" }
      ]
    }))
    setShowFilePicker(false)
  }

  const handleRemoveItem = (category: string, itemId: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== itemId)
    }))
  }

  const cardData = [
    { title: "Protocol" },
    { title: "Papers" },
    { title: "Experiment Data" },
    { title: "Other files" }
  ]

  const Chip = ({
    label,
    onRemove
  }: {
    label: string
    onRemove: () => void
  }) => (
    <Badge variant="secondary" className="flex max-w-full items-center gap-1">
      <span className="truncate">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="size-4 p-0"
      >
        <X className="size-3" />
      </Button>
    </Badge>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <Label htmlFor="userPrompt">User Prompt</Label>
        <Input
          id="userPrompt"
          value={userPrompt}
          onChange={e => setUserPrompt(e.target.value)}
          placeholder="Enter your research question or prompt"
        />
      </div>
      <div className="mb-8 grid w-full max-w-5xl grow grid-cols-4 gap-8">
        {cardData.map((card, index) => (
          <div key={index} className="flex h-full flex-col">
            <div className="m-4 mb-8 min-h-[280px] grow overflow-y-auto rounded-lg border border-gray-200 p-4">
              {selectedItems[card.title].length > 0 ? (
                selectedItems[card.title].map(item => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    onRemove={() => handleRemoveItem(card.title, item.id)}
                  />
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-center text-gray-400">
                  No {card.title.toLowerCase()} added
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="ml-2 w-[220px]"
              onClick={() => {
                setSelectedFileType(card.title)
                setShowFilePicker(true)
              }}
            >
              <Plus className="mr-2 size-4" />
              {card.title === "Protocol"
                ? "Upload Protocol"
                : `Add ${card.title}`}
            </Button>
          </div>
        ))}
      </div>
      {showFilePicker && (
        <FilePicker
          isOpen={showFilePicker}
          onOpenChange={setShowFilePicker}
          isFocused={true}
          onSelectFile={handleFileSelect}
          onSelectCollection={handleCollectionSelect}
          selectedFileIds={[]}
          selectedCollectionIds={[]}
          searchQuery=""
        />
      )}
      <div className="my-8 flex justify-center">
        <Button
          onClick={handleSave}
          className="w-1/6"
          style={{ backgroundColor: "link" }}
        >
          Next
          <ArrowRightIcon className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  )
}

export default AddDataComponent
