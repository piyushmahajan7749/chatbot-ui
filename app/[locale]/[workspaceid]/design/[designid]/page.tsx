import { DesignReviewComponent } from "../components/design-review"

export default function DesignIDPage({
  params
}: {
  params: { designid: string }
}) {
  return (
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden">
      <div className="flex items-center justify-center border-b px-4 py-3">
        <h1 className="text-2xl font-bold">Design</h1>
      </div>
      <div className="relative flex-1 overflow-hidden p-1 sm:p-2">
        <DesignReviewComponent designId={params.designid as string} />
      </div>
    </div>
  )
}
