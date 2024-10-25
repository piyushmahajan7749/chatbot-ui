import { FC } from "react"
import { useReportContext } from "@/context/reportcontext"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export const ReportInput: FC = () => {
  const { selectedData, setSelectedData, isGenerating } = useReportContext()

  const handleSubmit = () => {
    // Handle report generation
  }

  return (
    <div className="flex flex-col space-y-4">
      <Textarea
        value={selectedData.userPrompt}
        onChange={e =>
          setSelectedData(prev => ({
            ...prev,
            userPrompt: e.target.value
          }))
        }
        placeholder="Enter your report requirements..."
        className="min-h-[100px]"
      />

      <Button onClick={handleSubmit} disabled={isGenerating}>
        {isGenerating ? "Generating..." : "Generate Report"}
      </Button>
    </div>
  )
}
