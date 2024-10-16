import { IconFileAnalytics } from "@tabler/icons-react"
import { FC, useContext, useState } from "react"
import { SidebarItem } from "../all/sidebar-display-item"
import { Tables } from "../../../../supabase/types"
import { Label } from "../../../ui/label"
import { Input } from "../../../ui/input"
import { ChatbotUIContext } from "@/context/context"
import { REPORT_DESCRIPTION_MAX, REPORT_NAME_MAX } from "@/db/limits"

interface ReportItemProps {
  report: Tables<"reports">
}

export const ReportItem: FC<ReportItemProps> = ({ report }) => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  const [name, setName] = useState(report.name)
  const [isTyping, setIsTyping] = useState(false)
  const [description, setDescription] = useState(report.description)

  const handleFileSelect = (
    file: Tables<"files">,
    setSelectedReportFiles: React.Dispatch<
      React.SetStateAction<Tables<"files">[]>
    >
  ) => {
    setSelectedReportFiles(prevState => {
      const isFileAlreadySelected = prevState.find(
        selectedFile => selectedFile.id === file.id
      )

      if (isFileAlreadySelected) {
        return prevState.filter(selectedFile => selectedFile.id !== file.id)
      } else {
        return [...prevState, file]
      }
    })
  }

  const handleCollectionSelect = (
    collection: Tables<"collections">,
    setSelectedReportCollections: React.Dispatch<
      React.SetStateAction<Tables<"collections">[]>
    >
  ) => {
    setSelectedReportCollections(prevState => {
      const isCollectionAlreadySelected = prevState.find(
        selectedCollection => selectedCollection.id === collection.id
      )

      if (isCollectionAlreadySelected) {
        return prevState.filter(
          selectedCollection => selectedCollection.id !== collection.id
        )
      } else {
        return [...prevState, collection]
      }
    })
  }

  if (!selectedWorkspace) return null

  return (
    <SidebarItem
      item={report}
      contentType="reports"
      isTyping={isTyping}
      icon={<IconFileAnalytics size={30} />}
      updateState={{
        user_id: report.user_id,
        name,
        description,
        folder_id: report.folder_id,
        sharing: report.sharing
      }}
      renderInputs={(renderState: {
        startingReportFiles: Tables<"files">[]
        setStartingReportFiles: React.Dispatch<
          React.SetStateAction<Tables<"files">[]>
        >
        selectedReportFiles: Tables<"files">[]
        setSelectedReportFiles: React.Dispatch<
          React.SetStateAction<Tables<"files">[]>
        >
        startingReportCollections: Tables<"collections">[]
        setStartingReportCollections: React.Dispatch<
          React.SetStateAction<Tables<"collections">[]>
        >
        selectedReportCollections: Tables<"collections">[]
        setSelectedReportCollections: React.Dispatch<
          React.SetStateAction<Tables<"collections">[]>
        >
      }) => (
        <>
          <div className="space-y-1">
            <Label>Name</Label>

            <Input
              placeholder="Report name..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={REPORT_NAME_MAX}
            />
          </div>

          <div className="space-y-1 pt-2">
            <Label>Description</Label>

            <Input
              placeholder="Report description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={REPORT_DESCRIPTION_MAX}
            />
          </div>

          {/* Add more report-specific inputs here */}

          {/* Example: File and Collection selection */}
          <div className="space-y-1 pt-2">
            <Label>Files & Collections</Label>
            {/* You would need to implement a ReportRetrievalSelect component similar to AssistantRetrievalSelect */}
            {/* 
            <ReportRetrievalSelect
              selectedReportRetrievalItems={
                [
                  ...renderState.selectedReportFiles,
                  ...renderState.selectedReportCollections
                ]
              }
              onReportRetrievalItemsSelect={item =>
                "type" in item
                  ? handleFileSelect(
                      item,
                      renderState.setSelectedReportFiles
                    )
                  : handleCollectionSelect(
                      item,
                      renderState.setSelectedReportCollections
                    )
              }
            />
            */}
          </div>
        </>
      )}
    />
  )
}
