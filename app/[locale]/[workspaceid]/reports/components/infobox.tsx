import { Button } from "@/components/ui/button"
import { copyToClipboard } from "../../../../../lib/utils"
import { Label } from "@radix-ui/react-label"
import { Copy, Edit } from "lucide-react"

interface InfoBoxProps {
  title: string
  description: string
  onEdit?: any
  colorId: string
  key: string
}

interface InfoListBoxProps {
  title: string
  description: string[]
  onEdit?: any
  colorId: string
  key: string
}

export function InfoBox({
  title,
  description,
  onEdit = {},
  colorId,
  key
}: InfoBoxProps) {
  return (
    <div
      style={{ minHeight: 160 }}
      key={key}
      className="relative flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-md"
    >
      <div className={`bg- mb-2 flex justify-between${colorId}bg`}>
        <Label className="text-md p-2 px-4 font-semibold">{title}</Label>
        <div className="pr-2 pt-2 text-teal-600">
          <Button
            variant="ghost"
            onClick={() => copyToClipboard(description)}
            title="Copy content"
          >
            <Copy className="size-5" />
          </Button>
          <Button onClick={onEdit} variant="ghost" title="Switch to edit view">
            <Edit className="mx-6 size-5" />
          </Button>
        </div>
      </div>
      <div
        style={{ maxHeight: 240, overflowY: "scroll" }}
        className="mx-4 py-4"
      >
        <Label className="whitespace-pre-wrap text-sm font-semibold text-gray-700 ">
          {description}
        </Label>
      </div>
    </div>
  )
}

export function InfoListBox({
  title,
  description,
  onEdit = {},
  colorId,
  key
}: InfoListBoxProps) {
  return (
    <div
      style={{ minHeight: 160 }}
      className="relative flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-md"
      key={key}
    >
      <div className={`bg- mb-2 flex justify-between${colorId}bg`}>
        <Label className="text-md p-2 px-4 font-semibold">{title}</Label>
        <div className="pr-2 pt-2 text-teal-600">
          <Button onClick={onEdit} variant="ghost" title="Switch to edit view">
            <Edit className="mx-6 size-5" />
          </Button>
        </div>
      </div>
      {description && (
        <div
          style={{ maxHeight: 240, overflowY: "scroll" }}
          className="mx-4 py-4"
        >
          {description.map((obj, i) => (
            <div key={i} className="mb-2">
              <Label className="whitespace-pre-wrap text-sm font-semibold text-gray-700 ">
                {`${i + 1}. ${obj}`}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
