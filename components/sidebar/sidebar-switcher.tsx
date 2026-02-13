import { ContentType } from "@/types"
import {
  IconBooks,
  IconFile,
  IconMessage,
  IconRobotFace,
  IconSparkles,
  IconBrain,
  IconFlask,
  IconDatabase
} from "@tabler/icons-react"
import { FC, useContext, useState } from "react"
import { useRouter } from "next/navigation"
import { ChatbotUIContext } from "@/context/context"
import { TabsList } from "../ui/tabs"
import { WithTooltip } from "../ui/with-tooltip"
import { ProfileSettings } from "../utility/profile-settings"
import { SidebarSwitchItem } from "./sidebar-switch-item"

export const SIDEBAR_ICON_SIZE = 28

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: ContentType) => void
}

export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange
}) => {
  const router = useRouter()
  const { selectedWorkspace } = useContext(ChatbotUIContext)
  const [showKnowledgeMenu, setShowKnowledgeMenu] = useState(false)

  return (
    <div className="flex flex-col justify-between border-r-2 pb-5">
      <TabsList className="bg-background grid w-[180px] auto-rows-auto">
        <SidebarSwitchItem
          icon={<IconFlask size={SIDEBAR_ICON_SIZE} />}
          contentType="designs"
          onContentTypeChange={onContentTypeChange}
        />

        <WithTooltip
          display={<div>Data Collection</div>}
          trigger={
            <div
              className="flex cursor-pointer items-center gap-2 p-2 px-3 hover:opacity-50"
              onClick={() => {
                if (selectedWorkspace) {
                  router.push(`/${selectedWorkspace.id}/data-collection`)
                }
              }}
            >
              <IconDatabase size={SIDEBAR_ICON_SIZE} />
              <span className="text-sm font-medium">Data Collection</span>
            </div>
          }
        />

        <SidebarSwitchItem
          icon={<IconSparkles size={SIDEBAR_ICON_SIZE} />}
          contentType="reports"
          onContentTypeChange={onContentTypeChange}
        />

        <WithTooltip
          display={<div>Knowledge Management</div>}
          trigger={
            <div
              className="flex cursor-pointer items-center gap-2 p-2 px-3"
              onClick={() => setShowKnowledgeMenu(!showKnowledgeMenu)}
            >
              <IconBrain size={SIDEBAR_ICON_SIZE} />
              <span className="text-sm font-medium">Knowledge</span>
            </div>
          }
        />

        {showKnowledgeMenu && (
          <>
            <SidebarSwitchItem
              icon={<IconMessage size={SIDEBAR_ICON_SIZE - 4} />}
              contentType="chats"
              onContentTypeChange={onContentTypeChange}
            />
            <SidebarSwitchItem
              icon={<IconRobotFace size={SIDEBAR_ICON_SIZE - 4} />}
              contentType="assistants"
              onContentTypeChange={onContentTypeChange}
            />
            <SidebarSwitchItem
              icon={<IconFile size={SIDEBAR_ICON_SIZE - 4} />}
              contentType="files"
              onContentTypeChange={onContentTypeChange}
            />
            <SidebarSwitchItem
              icon={<IconBooks size={SIDEBAR_ICON_SIZE - 4} />}
              contentType="collections"
              onContentTypeChange={onContentTypeChange}
            />
          </>
        )}
      </TabsList>

      <div className="flex flex-col items-center space-y-4 px-3 py-2">
        <WithTooltip
          display={<div>Profile Settings</div>}
          trigger={<ProfileSettings />}
        />
      </div>
    </div>
  )
}
