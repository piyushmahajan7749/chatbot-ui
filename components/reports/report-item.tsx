import { IconFileAnalytics } from "@tabler/icons-react"
import { FC } from "react"
import { SidebarItem } from "../sidebar/items/all/sidebar-display-item"
import { Tables } from "../../supabase/types"
import { Label } from "../ui/label"
import { CollectionFile } from "@/types/collection-file"

interface ReportItemProps {
  report: Tables<"reports">
}

export const ReportItem: FC<ReportItemProps> = ({ report }) => {
  return (
    <SidebarItem
      item={report}
      isTyping={false}
      contentType="reports"
      icon={<IconFileAnalytics size={30} />}
      updateState={{
        name: report.name,
        description: report.description
      }}
      renderInputs={(renderState: {
        startingReports: Tables<"reports">[]
        setStartingReports: React.Dispatch<
          React.SetStateAction<Tables<"reports">[]>
        >
        selectedReports: Tables<"reports">[]
        setSelectedReports: React.Dispatch<
          React.SetStateAction<Tables<"reports">[]>
        >
      }) => {
        return (
          <div className="space-y-1">
            <Label>Reports</Label>
          </div>
        )
      }}
    />
  )
}
