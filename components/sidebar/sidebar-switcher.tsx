import { ContentType } from "@/types"
import {
  IconAdjustmentsHorizontal,
  IconBolt,
  IconBooks,
  IconFile,
  IconMessage,
  IconPencil,
  IconRobotFace,
  IconSparkles,
  IconBrain,
  IconFlask
} from "@tabler/icons-react"
import { FC, useState } from "react"
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
  const [showKnowledgeMenu, setShowKnowledgeMenu] = useState(false)

  return (
    <div className="flex flex-col justify-between border-r-2 pb-5">
      <TabsList className="bg-background grid h-[440px] grid-rows-7">
        <WithTooltip
          display={<div>Knowledge Management</div>}
          trigger={
            <div
              className="cursor-pointer p-2"
              onClick={() => setShowKnowledgeMenu(!showKnowledgeMenu)}
            >
              <IconBrain size={SIDEBAR_ICON_SIZE} />
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

        <SidebarSwitchItem
          icon={<IconSparkles size={SIDEBAR_ICON_SIZE} />}
          contentType="reports"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconFlask size={SIDEBAR_ICON_SIZE} />}
          contentType="reports"
          onContentTypeChange={onContentTypeChange}
        />
      </TabsList>

      <div className="flex flex-col items-center space-y-4">
        {/* TODO */}
        {/* <WithTooltip display={<div>Import</div>} trigger={<Import />} /> */}

        {/* TODO */}
        {/* <Alerts /> */}

        <WithTooltip
          display={<div>Profile Settings</div>}
          trigger={<ProfileSettings />}
        />
      </div>
    </div>
  )
}
