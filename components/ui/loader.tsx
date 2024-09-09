import Image from "next/image"

interface LoaderProps {
  text: String // Optional callback for New Project button click
}

export const Loader: React.FC<LoaderProps> = ({ text }) => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-y-4">
      <div className="relative size-8 animate-spin">
        <Image alt="Logo" src="/LIGHT_BRAND_LOGO.png" fill />
      </div>
      <p className="text-muted-foreground text-sm font-semibold">{text}</p>
    </div>
  )
}
