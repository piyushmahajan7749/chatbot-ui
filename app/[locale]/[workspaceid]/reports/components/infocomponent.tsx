import { Label } from "@radix-ui/react-label"

interface InfoComponentProps {
  title: string
  component: any
}

export function InfoComponent({ title, component }: InfoComponentProps) {
  return (
    <div
      style={{ minHeight: 240 }}
      className="relative flex size-full flex-col rounded-lg border border-gray-200 bg-white shadow-md"
    >
      <Label className={`text-md mb-2 p-2 px-4 font-semibold`}>{title}</Label>
      <div className="mx-4">{component}</div>
    </div>
  )
}
