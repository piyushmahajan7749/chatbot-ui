import { DesignReviewComponent } from "../components/design-review"

export default function DesignIDPage({
  params
}: {
  params: { designid: string }
}) {
  return (
    <div className="relative flex size-full flex-col items-center justify-center">
      Design
      <div className="w-full max-w-6xl px-4">
        <DesignReviewComponent designId={params.designid as string} />
      </div>
    </div>
  )
}
