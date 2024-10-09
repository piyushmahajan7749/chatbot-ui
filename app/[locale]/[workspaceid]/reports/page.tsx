"use client"

import { FC, useState, useEffect } from "react"
import { Edit } from "lucide-react"
import { ReportProvider } from "@/context/reportcontext"
import { ReportReviewComponent } from "./components/report-review"
import AddDataComponent from "./components/adddata"

interface ReportViewProps {
  defaultTab: string
}

const ReportView: FC<ReportViewProps> = ({ defaultTab }) => {
  const [selectedTab, setSelectedTab] = useState("aimList")

  const handleSave = () => {
    const currentIndex = sections.findIndex(s => s.dataId === selectedTab)
    if (currentIndex < sections.length - 1) {
      setSelectedTab(sections[currentIndex + 1].dataId)
    }
  }

  const sections = [
    {
      title: "Data",
      dataId: "aimList",
      imageId: "aimImage",
      icon: <Edit className="size-5" />,
      component: <AddDataComponent onSave={handleSave} />
    },
    {
      title: "Review & Download",
      dataId: "conclusionList",
      imageId: "conclusionImage",
      icon: <Edit className="size-5" />,
      component: (
        <ReportReviewComponent
          onCancel={() => {}}
          onSave={handleSave}
          colorId="report"
        />
      )
    }
  ]

  const getComponent = () => {
    const index = sections.findIndex(d => d.dataId === selectedTab)
    return sections[index].component
  }

  const [currentComponent, setCurrentComponent] = useState(() => getComponent())

  useEffect(() => {
    if (selectedTab) {
      setCurrentComponent(getComponent())
    }
  }, [selectedTab])

  return (
    <ReportProvider>
      <div className="container mx-auto flex h-full flex-col p-4">
        <h1 className="text-primary mb-6 text-center text-3xl font-bold">
          Report Generator
        </h1>
        <div className="grow">{currentComponent}</div>
      </div>
    </ReportProvider>
  )
}

export default function ReportsPage() {
  return <ReportView defaultTab="aim" />
}
