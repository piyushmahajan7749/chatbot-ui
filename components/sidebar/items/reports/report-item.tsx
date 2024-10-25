import { FC, useContext, useRef, useState } from "react"
import { Tables } from "../../../../supabase/types"
import { ChatbotUIContext } from "@/context/context"
import { useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { UpdateReport } from "./update-report"
import { DeleteReport } from "./delete-report"

interface ReportItemProps {
  report: Tables<"reports">
}

export const ReportItem: FC<ReportItemProps> = ({ report }) => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  const router = useRouter()
  const params = useParams()
  const isActive = params.reportid === report.id

  const handleClick = () => {
    if (!selectedWorkspace) return
    return router.push(`/${selectedWorkspace.id}/report/${report.id}`)
  }

  if (!selectedWorkspace) return null

  return (
    <div
      className={cn(
        "hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center rounded p-2 hover:opacity-50 focus:outline-none"
      )}
      tabIndex={0}
      onClick={handleClick}
    >
      <div className="ml-3 flex-1 truncate text-sm font-semibold">
        {report.name}
      </div>

      <div
        onClick={e => {
          e.stopPropagation()
          e.preventDefault()
        }}
        className={`ml-2 flex space-x-2 ${!isActive && "w-11 opacity-0 group-hover:opacity-100"}`}
      >
        <UpdateReport report={report} />

        <DeleteReport report={report} />
      </div>
    </div>
  )
}
