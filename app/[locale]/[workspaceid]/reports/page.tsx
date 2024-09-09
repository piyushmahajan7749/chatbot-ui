import { FC, useState, useEffect } from "react"
import { Edit } from "lucide-react"
import { Label } from "@radix-ui/react-label"
import { cn } from "@/lib/utils"
import { InfoListBox } from "./components/infobox"
import { AimComponent } from "./components/aimcomponent"
import ApproachComponent, {
  AnalysisComponent
} from "./components/analysiscomponent"
import ConclusionComponent from "./components/conclusisoncomponent"
import { Card } from "@/components/ui/card"

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
      title: "Aim",
      dataId: "aimList",
      imageId: "aimImage",
      icon: <Edit className="size-5" />,
      component: (
        <AimComponent
          onCancel={() => setTransitionEffect(false)}
          onSave={handleSave}
          colorId="report"
        />
      )
    },
    {
      title: "Approach",
      dataId: "approachList",
      imageId: "approachImage",
      icon: <Edit className="size-5" />,
      component: (
        <ApproachComponent
          onCancel={() => setTransitionEffect(false)}
          onSave={handleSave}
          colorId="report"
        />
      )
    },
    {
      title: "Analysis",
      dataId: "analysisList",
      imageId: "analysisImage",
      icon: <Edit className="size-5" />,
      component: (
        <AnalysisComponent
          onCancel={() => setTransitionEffect(false)}
          onSave={handleSave}
          colorId="report"
        />
      )
    },
    {
      title: "Conclusion",
      dataId: "conclusionList",
      imageId: "conclusionImage",
      icon: <Edit className="size-5" />,
      component: (
        <ConclusionComponent
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
    return isEditing ? (
      <div
        style={{ minHeight: 240 }}
        className="relative flex size-full flex-col rounded-lg border border-gray-200 bg-white shadow-md"
      >
        <div>{currentComponent}</div>
      </div>
    ) : (
      <InfoListBox
        key={selectedTab}
        onEdit={() => {
          setTransitionEffect(true)
          setTimeout(() => {
            setEditing(true)
            setTransitioning(false)
          }, 500)
        }}
        title={getSelectedSection()?.title!}
        description={[]} // You'll need to populate this with actual data
        colorId="report"
      />
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

  const getSelectedSection = () => sections.find(d => d.dataId === selectedTab)

  return (
    <div className="flex h-full flex-col">
      <div className={cn("bg-main mb-4 grid grid-cols-4 p-4")}>
        {sections.map((section, index) => (
          <div
            className="align-center flex flex-col justify-center"
            key={index}
          >
            <Label
              className={`mb-1 truncate text-center text-xs font-semibold 
                ${section.dataId === selectedTab ? "text-reportborder" : ""}`}
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
              className={`mx-8 justify-center border-solid bg-white ${
                section.dataId === selectedTab
                  ? "border-reportborder shadow-2xl"
                  : "shadow-sm"
              } cursor-pointer`}
              style={{
                minWidth: "100px",
                width: "auto",
                height: "100px",
                borderWidth: section.dataId === selectedTab ? "3px" : "1px"
              }}
            >
              <div className="flex justify-center">
                <div
                  className="size-5 cursor-pointer"
                  style={{ marginTop: "26px" }}
                >
                  {section.icon}
                </div>
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
        <div className="flex w-full justify-between">
          <div className="w-2/3">{getRegComponent()}</div>
          {/* You can add an image here if needed */}
        </div>
      </div>
    </div>
  )
}
