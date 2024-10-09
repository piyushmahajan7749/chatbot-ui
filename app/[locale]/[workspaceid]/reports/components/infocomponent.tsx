import { Label } from "@radix-ui/react-label"

interface InfoComponentProps {
  title: string
  component: any
}

export function InfoComponent({ title, component }: InfoComponentProps) {
  return (
    <div
      style={{ minHeight: 240 }}
      className="bg-secondary relative mb-8 flex size-full flex-col rounded-lg border border-gray-200 shadow-md"
    >
      <div className="mx-4">{component}</div>
    </div>
  )
}
