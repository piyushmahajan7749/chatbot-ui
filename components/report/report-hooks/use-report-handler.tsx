import { useReportContext } from "@/context/reportcontext"
import { useRouter } from "next/navigation"
import { useRef } from "react"

export const useReportHandler = () => {
  const router = useRouter()
  const reportInputRef = useRef<HTMLTextAreaElement>(null)

  const {
    selectedWorkspace,
    setSelectedReport,
    setReportDraft,
    setSelectedData
  } = useReportContext()

  const handleNewReport = async () => {
    if (!selectedWorkspace) return

    setSelectedReport(null)
    setReportDraft("")
    setSelectedData({
      userPrompt: "",
      protocol: "",
      papers: [],
      dataFiles: []
    })

    return router.push(`/${selectedWorkspace.id}/report`)
  }

  const handleFocusReportInput = () => {
    reportInputRef.current?.focus()
  }

  return {
    reportInputRef,
    handleNewReport,
    handleFocusReportInput
  }
}
