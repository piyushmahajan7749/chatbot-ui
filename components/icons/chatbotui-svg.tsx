import { FC } from "react"

interface ShadowAISVGProps {
  /** Retained for API compatibility; the editorial monogram is theme-agnostic
   *  and uses ink + rust tokens from CSS. */
  theme?: "dark" | "light"
  scale?: number
}

/**
 * Editorial monogram: a solid ink disc with a rust half-crescent on the
 * right half — a "shadow" cast across the moon. Theme-agnostic.
 */
export const ShadowAISVG: FC<ShadowAISVGProps> = ({ scale = 1 }) => {
  const size = 24 * scale
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" fill="hsl(var(--ink-hsl))" />
      <path d="M12 2a10 10 0 0 0 0 20V2z" fill="hsl(var(--rust-hsl))" />
    </svg>
  )
}
