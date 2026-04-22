import * as React from "react"

import { cn } from "@/lib/utils"

const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "border-line-strong bg-paper text-ink-3 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1.5 font-mono text-[10.5px]",
        className
      )}
      {...props}
    />
  )
)
Kbd.displayName = "Kbd"

export { Kbd }
