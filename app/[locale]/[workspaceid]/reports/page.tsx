"use client"

import { FC, useState, useEffect } from "react"
import { Edit } from "lucide-react"
import { ReportDraftComponent } from "./components/reportdraft"
import AddDataComponent from "./components/adddata"
import { ReportProvider } from "@/context/reportcontext"
import { InfoComponent } from "./components/infocomponent"

interface ReportViewProps {
  defaultTab: string
}

const ReportView: FC<ReportViewProps> = ({ defaultTab }) => {
  const [selectedTab, setSelectedTab] = useState("aimList")
  const [isTransitioning, setTransitioning] = useState(false)

  const setTransitionEffect = () => {
    setTransitioning(true)
    setTimeout(() => {
      setTransitioning(false)
    }, 500)
  }

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
      component: (
        <InfoComponent
          title="Data"
          component={
            <AddDataComponent
              onCancel={() => setTransitionEffect()}
              onSave={handleSave}
              colorId="report"
            />
          }
        />
      )
    },
    {
      title: "Review & Download",
      dataId: "conclusionList",
      imageId: "conclusionImage",
      icon: <Edit className="size-5" />,
      component: (
        <InfoComponent
          title="Review & Download"
          component={
            <ReportDraftComponent
              onCancel={() => setTransitionEffect()}
              onSave={handleSave}
              colorId="report"
            />
          }
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
      setTransitioning(true)
      setTimeout(() => {
        setCurrentComponent(getComponent())
        setTransitioning(false)
      }, 500)
    }
  }, [selectedTab])

  return (
    <ReportProvider>
      <div className="flex h-full flex-col">
        <div
          className={`w-7/8 m-24 transition-all duration-500 ease-in-out ${
            isTransitioning ? "scale-95 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          {currentComponent}
        </div>
      </div>
    </ReportProvider>
  )
}

export default function ReportsPage() {
  return <ReportView defaultTab="aim" />
}
