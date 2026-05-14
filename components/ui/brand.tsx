"use client"

import { FC } from "react"

import { ShadowAISVG } from "@/components/icons/chatbotui-svg"
import { cn } from "@/lib/utils"

interface BrandProps {
  theme?: "dark" | "light"
  size?: number
  collapsed?: boolean
  className?: string
}

export const Brand: FC<BrandProps> = ({
  size = 22,
  collapsed = false,
  className
}) => {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <ShadowAISVG scale={size / 64} />
      {!collapsed && (
        <span className="pt-0.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          <span className="text-primary">Shadow</span>{" "}
          <span className="bg-[linear-gradient(90deg,#3AA8FF_0%,#C98BFF_100%)] bg-clip-text text-transparent">
            AI
          </span>
        </span>
      )}
    </div>
  )
}
