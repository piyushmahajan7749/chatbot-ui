"use client"

import { FC } from "react"
import { Brain } from "lucide-react"

interface BrandProps {
  theme?: "dark" | "light"
}

export const Brand: FC<BrandProps> = ({ theme = "light" }) => {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
        <Brain className="size-8 text-white" />
      </div>
      <div>
        <h1 className="text-center text-3xl font-bold tracking-tight text-slate-800">
          Shadow AI
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Your AI research assistant
        </p>
      </div>
    </div>
  )
}
