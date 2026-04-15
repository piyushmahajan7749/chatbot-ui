import { ContentType } from "@/types"
import { IconFolder, IconMessages } from "@tabler/icons-react"
import { FC } from "react"
import { TabsList } from "../ui/tabs"
import { WithTooltip } from "../ui/with-tooltip"
import { ProfileSettings } from "../utility/profile-settings"
import { SidebarSwitchItem } from "./sidebar-switch-item"

export const SIDEBAR_ICON_SIZE = 28

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: ContentType) => void
}

/**
 * v2 sidebar: two entries only — Projects and Chat History.
 * Everything Project-local lives inside the Project canvas; reusable workspace
 * items (files, assistants, prompts, etc.) are no longer surfaced in primary
 * nav. Profile stays at the bottom.
 */
export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange
}) => {
  return (
    <div className="flex flex-col justify-between border-r-2 pb-5">
      <TabsList className="bg-background grid w-[180px] auto-rows-auto">
        <SidebarSwitchItem
          icon={<IconFolder size={SIDEBAR_ICON_SIZE} />}
          contentType="projects"
          onContentTypeChange={onContentTypeChange}
        />
        <SidebarSwitchItem
          icon={<IconMessages size={SIDEBAR_ICON_SIZE} />}
          contentType="chat-history"
          onContentTypeChange={onContentTypeChange}
        />
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
