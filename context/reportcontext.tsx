import React, { createContext, useState, useContext, ReactNode } from "react"

interface ReportContextType {
  selectedData: any
  setSelectedData: React.Dispatch<React.SetStateAction<any>>
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
  const [selectedData, setSelectedData] = useState({})
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

export const useReportContext = () => {
  const context = useContext(ReportContext)
  if (context === undefined) {
    throw new Error("useReportContext must be used within a ReportProvider")
  }
  return context
}
