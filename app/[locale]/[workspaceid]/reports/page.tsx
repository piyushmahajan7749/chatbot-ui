import { FC, useState, useEffect } from "react"
import { Edit } from "lucide-react"
import { Label } from "@radix-ui/react-label"
import { ReportDraftComponent } from "./components/reportdraft"
import { Card } from "@/components/ui/card"
import AddDataComponent from "./components/adddata"
import ReportOutlineComponent from "./components/reportoutline"
import { ReportProvider } from "@/context/reportcontext"

interface ReportViewProps {
  defaultTab: string
}

export const ReportView: FC<ReportViewProps> = ({ defaultTab }) => {
  const [isEditing, setEditing] = useState(true)
  const [selectedTab, setSelectedTab] = useState("aimList")
  const [isTransitioning, setTransitioning] = useState(false)

  const setTransitionEffect = (isEdit: boolean) => {
    setTransitioning(true)
    setTimeout(() => {
      setEditing(isEdit)
      setTransitioning(false)
    }, 500)
  }

  const handleSave = () => {
    const currentIndex = sections.findIndex(s => s.dataId === selectedTab)
    if (currentIndex < sections.length - 1) {
      setSelectedTab(sections[currentIndex + 1].dataId)
    }
    setEditing(false)
  }

  const sections = [
    {
      title: "Data",
      dataId: "aimList",
      imageId: "aimImage",
      icon: <Edit className="size-5" />,
      component: (
        <AddDataComponent
          onCancel={() => setTransitionEffect(false)}
          onSave={handleSave}
          colorId="report"
        />
      )
    },
    {
      title: "Report Outline",
      dataId: "reportOutline",
      imageId: "reportOutlineImage",
      icon: <Edit className="size-5" />,
      component: (
        <ReportOutlineComponent
          onCancel={() => setTransitionEffect(false)}
          onSave={handleSave}
          colorId="report"
        />
      )
    },
    {
      title: "Review & Download",
      dataId: "conclusionList",
      imageId: "conclusionImage",
      icon: <Edit className="size-5" />,
      component: (
        <ReportDraftComponent
          onCancel={() => setTransitionEffect(false)}
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

  const getRegComponent = () => {
    return (
      <div
        style={{ minHeight: 500 }}
        className="relative flex size-full flex-col rounded-lg bg-zinc-900 shadow-md"
      >
        <div className="text-white">{currentComponent}</div>
      </div>
    )
  }

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
        <div className="bg-main mb-4 grid grid-cols-3 p-4">
          {sections.map((section, index) => (
            <div
              className="align-center flex flex-col justify-center"
              key={index}
            >
              <Label
                className={`text-md mb-4 truncate text-center font-semibold 
                  ${section.dataId === selectedTab ? "text-white" : "text-gray-400"}`}
              >
                {section.title}
              </Label>
              <Card
                onClick={() => {
                  if (section.dataId === selectedTab) {
                    setTransitionEffect(true)
                  } else {
                    setSelectedTab(section.dataId)
                  }
                }}
                className={`bg-main mx-8 flex justify-center border-solid border-gray-400 ${
                  section.dataId === selectedTab
                    ? "border border-gray-400 shadow-2xl"
                    : "shadow-sm"
                } cursor-pointer`}
                style={{
                  minWidth: "100px",
                  width: "auto",
                  height: "80px",
                  borderWidth: section.dataId === selectedTab ? "3px" : "1px"
                }}
              >
                <div className="flex h-full flex-col items-center justify-center">
                  <Edit
                    className="size-7"
                    color={section.dataId === selectedTab ? "white" : "gray"}
                  />
                </div>
              </Card>
            </div>
          ))}
        </div>
        <div
          className={`w-7/8 mx-12 transition-all duration-500 ease-in-out ${
            isTransitioning ? "scale-95 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          <div className="my-4 w-full">{getRegComponent()}</div>
          {/* You can add an image here if needed */}
        </div>
      </div>
    </ReportProvider>
  )
}
