import { FC } from "react"
import { ReportsList } from "@/components/reports/reports-list"

interface ReportViewProps {}

export const ReportView: FC<ReportViewProps> = ({}) => {
  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-4 text-2xl font-bold">Reports</h1>
      <ReportsList />
    </div>
  )
}
