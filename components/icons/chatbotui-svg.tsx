import { FC } from "react"

interface ShadowAISVGProps {
  theme?: "dark" | "light"
  scale?: number
}

export const ShadowAISVG: FC<ShadowAISVGProps> = ({ scale = 1 }) => {
  const size = 24 * scale

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="shadowai-helix-gradient" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12E3F0" />
          <stop offset="0.55" stopColor="#3AA8FF" />
          <stop offset="1" stopColor="#C98BFF" />
        </linearGradient>
        <linearGradient id="shadowai-node-gradient" x1="20" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A4F5FF" />
          <stop offset="1" stopColor="#DDB5FF" />
        </linearGradient>
      </defs>

      <path
        d="M22 9C31 9 42 15 42 25C42 31.5 35.5 36 29 40.5C22.8 44.8 17 49 17 55"
        stroke="url(#shadowai-helix-gradient)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M42 9C33 9 22 15 22 25C22 31.5 28.5 36 35 40.5C41.2 44.8 47 49 47 55"
        stroke="url(#shadowai-helix-gradient)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      <path d="M24 14H40" stroke="#6FD7FF" strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
      <path d="M21 24H43" stroke="#56C0FF" strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
      <path d="M22 34H42" stroke="#49B2FF" strokeWidth="2.2" strokeLinecap="round" opacity="0.92" />
      <path d="M25 44H39" stroke="#7BBAFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      <path d="M28 52H36" stroke="#B89CFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.88" />

      <circle cx="24" cy="14" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="40" cy="14" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="21" cy="24" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="43" cy="24" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="22" cy="34" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="42" cy="34" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="25" cy="44" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="39" cy="44" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="28" cy="52" r="2.7" fill="url(#shadowai-node-gradient)" />
      <circle cx="36" cy="52" r="2.7" fill="url(#shadowai-node-gradient)" />
    </svg>
  )
}
