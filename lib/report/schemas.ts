/**
 * Structured-output schemas for the report-generation pipeline
 * (app/api/report/outline). Extracted so the report's output CONTRACT - the
 * sections every generated report must contain - is unit-tested and can't
 * silently drift. The route imports these for its agents' `zodResponseFormat`.
 */
import { z } from "zod"

export const ReportTheorySchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string()
  })
  .required()
export type ReportTheoryType = z.infer<typeof ReportTheorySchema>

export const VisualizationSchema = z.object({
  chartTitle: z
    .string()
    .describe(
      "A descriptive title for the chart, e.g. 'Mean Viscosity by Formulation'"
    ),
  chartType: z
    .enum(["bar", "pie"])
    .describe(
      "Choose 'bar' for comparing a single numeric metric across conditions, 'pie' when showing proportion/share of a whole summing to ~100%."
    ),
  yAxisLabel: z
    .string()
    .describe("Label for the Y axis including units, e.g. 'Viscosity (mPa·s)'"),
  data: z.array(
    z.object({
      label: z.string().describe("Short category/group name"),
      value: z.number().describe("Numeric value to plot")
    })
  )
})
export type VisualizationType = z.infer<typeof VisualizationSchema>

export const ReportExecutorSchema = z
  .object({
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string()
  })
  .required()
export type ReportExecutorType = z.infer<typeof ReportExecutorSchema>

export const DataAnalysisSchema = z
  .object({
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()
export type DataAnalysisType = z.infer<typeof DataAnalysisSchema>

export const ReportOutputSchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string(),
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string(),
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()
export type ReportOutputType = z.infer<typeof ReportOutputSchema>
