import { createContext, useState, useContext } from "react"

interface ReportContextType {
  selectedData: any
  setSelectedData: React.Dispatch<React.SetStateAction<any>>
  reportOutline: string
  setReportOutline: React.Dispatch<React.SetStateAction<string>>
}

const ReportContext = createContext<ReportContextType | undefined>(undefined)

export const ReportProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [selectedData, setSelectedData] = useState({})
  const [reportOutline, setReportOutline] = useState("")

  return (
    <ReportContext.Provider
      value={{ selectedData, setSelectedData, reportOutline, setReportOutline }}
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
