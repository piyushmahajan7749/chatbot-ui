"use client"

import React, { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FileIcon,
  PaperclipIcon,
  BeakerIcon,
  FolderIcon,
  X,
  UploadIcon
} from "lucide-react"
import { useToast } from "@/app/hooks/use-toast"
import { useReportContext } from "@/context/reportcontext"
import { Tables } from "@/supabase/types"
import { Badge } from "@/components/ui/badge"
import { FilePicker } from "@/components/chat/file-picker"

type FileType = "Protocol" | "Papers" | "Experiment Data" | "Other files"

interface AddDataProps {
  onSave: () => void
}

interface SelectedItem {
  id: string
  name: string
  type: "file" | "collection"
}

export function AddDataComponent({ onSave }: AddDataProps) {
  const [activeTab, setActiveTab] = useState<FileType>("Protocol")
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

  const { toast } = useToast()

  const handleSave = async () => {
    try {
      const formattedData = {
        userPrompt,
        protocol: selectedItems.Protocol[0]?.id || "",
        papers: selectedItems.Papers.map(item => item.id), //
        dataFiles: [
          ...selectedItems["Experiment Data"].map(item => item.id),
          ...selectedItems["Other files"].map(item => item.id)
        ]
      }
      setSelectedData(formattedData)
      onSave()
    } catch (error) {
      console.error(error)
    }
  }

  const handleFileSelect = (file: Tables<"files">) => {
    console.log("File selected:", file)
    try {
      if (
        selectedFileType === "Protocol" &&
        selectedItems.Protocol.length > 0
      ) {
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
    } catch (error) {
      console.error(error)
    }
    setTimeout(() => {
      setShowFilePicker(false)
      console.log("File picker should be closed now")
    }, 0)
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

  const cardData = [
    { title: "Protocol" },
    { title: "Papers" },
    { title: "Experiment Data" },
    { title: "Other files" }
  ]

  const handleRemoveItem = (category: string, itemId: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== itemId)
    }))
  }

  const fileTypeIcons = {
    Protocol: <FileIcon className="size-6 text-blue-500" />,
    Papers: <PaperclipIcon className="size-6 text-green-500" />,
    "Experiment Data": <BeakerIcon className="size-6 text-purple-500" />,
    "Other files": <FolderIcon className="size-6 text-yellow-500" />
  }

  const Chip = ({
    label,
    onRemove
  }: {
    label: string
    onRemove: () => void
  }) => (
    <Badge
      variant="secondary"
      className="my-2 flex h-8 max-w-full items-center gap-1 px-4"
    >
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
      <Card className="bg-background mx-auto size-full max-w-6xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Report Generator</CardTitle>
          <CardDescription>
            Add data to generate report. You can add protocol, papers,
            experiment data, and other files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as FileType)}
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="Protocol">
                {fileTypeIcons.Protocol}
                <span className="ml-2">Protocol</span>
              </TabsTrigger>
              <TabsTrigger value="Papers">
                {fileTypeIcons.Papers}
                <span className="ml-2">Papers</span>
              </TabsTrigger>
              <TabsTrigger value="Experiment Data">
                {fileTypeIcons["Experiment Data"]}
                <span className="ml-2">Experiment Data</span>
              </TabsTrigger>
              <TabsTrigger value="Other files">
                {fileTypeIcons["Other files"]}
                <span className="ml-2">Other Files</span>
              </TabsTrigger>
            </TabsList>
            {Object.keys(fileTypeIcons).map(type => (
              <TabsContent key={type} value={type}>
                <Card
                  onClick={() => {
                    setSelectedFileType(activeTab)
                    setShowFilePicker(true)
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Upload {type.charAt(0).toUpperCase() + type.slice(1)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex w-full items-center justify-center">
                      <div className="dark:hover:bg-bray-800 flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-600">
                        <div className="flex flex-col items-center justify-center pb-6 pt-5">
                          <UploadIcon className="mb-3 size-10 text-gray-400" />
                          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">Click to add</span>{" "}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            files or collections
                          </p>
                        </div>
                        {showFilePicker && (
                          <div className="bg-secodnary flex size-full items-end justify-center bg-opacity-50">
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
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
          <div className="mt-6">
            <h3 className="mb-2 text-lg font-semibold">Uploaded Files</h3>
            <div className="bg-secondary flex h-[200px] flex-row rounded-md border p-4">
              {cardData.map((card, index) => (
                <div
                  key={index}
                  className="bg-secondary m-2 w-1/4 overflow-y-auto rounded-lg border border-gray-200 p-2"
                >
                  {selectedItems[card.title].length > 0 ? (
                    selectedItems[card.title].map(item => (
                      <Chip
                        key={item.id}
                        label={item.name}
                        onRemove={() => handleRemoveItem(card.title, item.id)}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center text-center text-gray-400">
                      No {card.title.toLowerCase()} added
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            className="bg-foreground text-background flex h-[36px] w-1/6"
            onClick={handleSave}
          >
            Generate Report
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default AddDataComponent
