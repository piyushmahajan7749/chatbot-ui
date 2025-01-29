import { ChatbotUIContext } from "@/context/context"
import { FC, useContext } from "react"
import { DesignItem } from "./design-item"

export const DesignsList: FC = () => {
  const { designs } = useContext(ChatbotUIContext)

  return (
    <div className="space-y-2">
      {designs.map(design => (
        <DesignItem key={design.id} design={design} />
      ))}
    </div>
  )
}
