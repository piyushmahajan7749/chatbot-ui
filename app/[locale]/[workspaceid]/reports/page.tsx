"use client"
import { ReportReviewComponent } from "./components/report-review"

export default function ReportsPage() {
  return (
    <div className="container mx-auto flex h-full flex-col p-4">
      <h1 className="text-primary mb-6 text-center text-3xl font-semibold">
        Report
      </h1>
      <div className="grow">
        <ReportReviewComponent
          onCancel={() => {}}
          onSave={() => {}}
          colorId="report"
        />
      </div>
    </div>
  )
}
