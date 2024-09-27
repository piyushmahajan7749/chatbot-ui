import React, { createContext, useState, useContext, ReactNode } from "react"

interface ReportContextType {
  selectedData: {
    userPrompt: string
    protocol: string
    papers: string[]
    dataFiles: string[]
  }
  setSelectedData: React.Dispatch<
    React.SetStateAction<{
      userPrompt: string
      protocol: string
      papers: string[]
      dataFiles: string[]
    }>
  >
  reportOutline: string
  setReportOutline: React.Dispatch<React.SetStateAction<string>>
  reportDraft: string
  setReportDraft: React.Dispatch<React.SetStateAction<string>>
}

const ReportContext = createContext<ReportContextType | undefined>(undefined)

interface ReportProviderProps {
  children: ReactNode
}

export const ReportProvider: React.FC<ReportProviderProps> = ({ children }) => {
  const [selectedData, setSelectedData] = useState<SelectedData>({
    userPrompt: "",
    protocol: "",
    papers: [],
    dataFiles: []
  })
  const [reportOutline, setReportOutline] = useState("")
  const [reportDraft, setReportDraft] = useState("")

  return (
    <ReportContext.Provider
      value={{
        selectedData,
        setSelectedData,
        reportOutline,
        setReportOutline,
        reportDraft,
        setReportDraft
      }}
    >
      {children}
    </ReportContext.Provider>
  )
}

interface SelectedData {
  userPrompt: string
  protocol: string
  papers: string[]
  dataFiles: string[]
}

export const useReportContext = () => {
  const context = useContext(ReportContext)
  if (context === undefined) {
    throw new Error("useReportContext must be used within a ReportProvider")
  }
  return context
}
