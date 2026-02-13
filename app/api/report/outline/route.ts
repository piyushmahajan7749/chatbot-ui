import { StateGraph, END, START } from "@langchain/langgraph"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import * as d3 from "d3"
import { createCanvas } from "@napi-rs/canvas"

import { tool } from "@langchain/core/tools"
import { NextResponse } from "next/server"
import {
  backfillFileItemsLocal,
  resolveSupabaseFilesToText
} from "@/lib/report/file-content"
import { getServerProfile } from "@/lib/server/server-chat-helpers"

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

type ReportTheoryType = z.infer<typeof ReportTheorySchema>

const ReportTheorySchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string()
  })
  .required()

const VisualizationSchema = z.object({
  chartTitle: z
    .string()
    .describe(
      "A descriptive title for the chart, e.g. 'Mean Viscosity by Formulation'"
    ),
  yAxisLabel: z
    .string()
    .describe("Label for the Y axis including units, e.g. 'Viscosity (mPa·s)'"),
  data: z.array(
    z.object({
      label: z.string().describe("Short category/group name for X axis"),
      value: z.number().describe("Numeric value to plot")
    })
  )
})

type VisualizationType = z.infer<typeof VisualizationSchema>
type ReportExecutorType = z.infer<typeof ReportExecutorSchema>

const ReportExecutorSchema = z
  .object({
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string()
  })
  .required()

type DataAnalysisType = z.infer<typeof DataAnalysisSchema>

const DataAnalysisSchema = z
  .object({
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()

type ReportOutputType = z.infer<typeof ReportOutputSchema>

const ReportOutputSchema = z
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

// Define interfaces
interface ReportState {
  protocol: string
  paperSummary?: string
  dataFileSummary?: string
  experimentObjective?: string
  finalOutput: ReportOutputType
  chartImage?: string
  chartData: VisualizationType
  aim: string
  introduction: string
  principle: string
  material: string
  preparation: string
  procedure: string
  setup: string
  dataAnalysis: string
  results: string
  discussion: string
  conclusion: string
  nextSteps: string
}

async function callDataVisualizationAgent(
  state: ReportState
): Promise<VisualizationType> {
  const systemPrompt = `You are a data visualization expert for biopharma research. Your job is to extract the MOST MEANINGFUL numeric comparison from experimental data and format it for a bar chart.

RULES:
1. Pick ONE primary numeric metric from the data (e.g. mean viscosity, % recovery, absorbance, yield, concentration). Do NOT mix different metrics or units in the same chart.
2. Use SHORT labels (max 15 characters) for the X-axis categories. Abbreviate names (e.g. "C0 Control", "E1", "F2 Glycine").
3. All values MUST be in the same unit. If the data has multiple metrics, choose the most scientifically relevant one.
4. Provide a clear chartTitle (e.g. "Mean Viscosity by Formulation") and yAxisLabel WITH units (e.g. "Viscosity (mPa·s)").
5. Return only POSITIVE values when possible. If comparing % changes, use absolute values or the raw measurement instead.
6. IMPORTANT: Include ALL data points / conditions / formulations from the dataset. Do NOT skip or drop any rows. Every row in the data must appear as a bar in the chart.`

  const userPrompt = `Extract data for a bar chart from this experiment.

Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data files: ${state.dataFileSummary}

Return a JSON object with:
- chartTitle: descriptive title for the chart
- yAxisLabel: Y-axis label with units in parentheses
- data: array of {label, value} pairs with short labels and consistent numeric values`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        VisualizationSchema,
        "visualizationSchema"
      )
    })
    const parsed = completion.choices[0].message.parsed!

    return parsed
  } catch (error) {
    console.error("Error in callDataVisualizationAgent:", error)
    throw error
  }
}

async function finalValidatorAgent(
  state: ReportState
): Promise<ReportOutputType> {
  const systemPrompt = `You are an expert at structured data extraction. You will be given unstructured text from a research report and should convert it into the given structure`

  const prompt = `
Report Draft: {reportDraft}
Data Analysis Draft: {dataAnalysisDraft}
  `

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(ReportOutputSchema, "reportOutput")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in finalValidatorAgent:", error)
    throw error
  }
}

const chartTool = tool(
  async ({ data, chartTitle, yAxisLabel }) => {
    const width = 800
    const height = 500
    const margin = {
      top: 50,
      right: 50,
      bottom: 80,
      left: yAxisLabel ? 80 : 60
    }

    // Create a canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")

    // Fill the background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    const x = d3
      .scaleBand()
      .domain(data.map(d => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.3)

    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(data, (d: any) => d.value) || 0) * 1.15])
      .nice()
      .range([height - margin.bottom, margin.top])

    const colorPalette = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
      "#84cc16",
      "#f97316",
      "#6366f1"
    ]

    // Draw chart title
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.fillStyle = "#111827"
    ctx.fillText(chartTitle || "Data Visualization", width / 2, 28)

    // Draw bars with rounded top effect
    data.forEach((d, idx) => {
      ctx.fillStyle = colorPalette[idx % colorPalette.length]

      const barX = x(d.label) ?? 0
      const barY = y(d.value)
      const barW = x.bandwidth()
      const barH = height - margin.bottom - barY

      // Draw bar with slight rounded top corners
      const radius = Math.min(4, barW / 4)
      ctx.beginPath()
      ctx.moveTo(barX, barY + radius)
      ctx.quadraticCurveTo(barX, barY, barX + radius, barY)
      ctx.lineTo(barX + barW - radius, barY)
      ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + radius)
      ctx.lineTo(barX + barW, barY + barH)
      ctx.lineTo(barX, barY + barH)
      ctx.closePath()
      ctx.fill()

      // Add value label on top of each bar
      ctx.fillStyle = "#1f2937"
      ctx.font = "bold 11px Arial"
      ctx.textAlign = "center"
      ctx.fillText(d.value.toString(), barX + barW / 2, barY - 6)
    })

    // Draw x-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#d1d5db"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, height - margin.bottom)
    ctx.lineTo(width - margin.right, height - margin.bottom)
    ctx.stroke()

    // Draw x-axis labels (horizontal, centered under each bar)
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = "11px Arial"
    ctx.fillStyle = "#374151"

    x.domain().forEach((d: any) => {
      const xCoord = (x(d) ?? 0) + x.bandwidth() / 2
      // Word-wrap long labels
      const maxWidth = x.bandwidth() + 10
      const words = d.split(/\s+/)
      let line = ""
      let lineY = height - margin.bottom + 8
      for (const word of words) {
        const testLine = line ? line + " " + word : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && line) {
          ctx.fillText(line, xCoord, lineY)
          line = word
          lineY += 14
        } else {
          line = testLine
        }
      }
      if (line) ctx.fillText(line, xCoord, lineY)
    })

    // Draw y-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#d1d5db"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, margin.top)
    ctx.lineTo(margin.left, height - margin.bottom)
    ctx.stroke()

    // Draw y-axis labels and grid lines
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.font = "12px Arial"
    ctx.fillStyle = "#374151"

    const ticks = y.ticks(8)
    ticks.forEach((d: any) => {
      const yCoord = y(d)

      // Draw tick
      ctx.beginPath()
      ctx.strokeStyle = "#d1d5db"
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(margin.left - 6, yCoord)
      ctx.stroke()

      // Draw label
      ctx.fillStyle = "#374151"
      ctx.fillText(d.toString(), margin.left - 10, yCoord)

      // Draw grid line
      ctx.beginPath()
      ctx.strokeStyle = "#e5e7eb"
      ctx.setLineDash([3, 3])
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(width - margin.right, yCoord)
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Draw Y-axis label (rotated)
    if (yAxisLabel) {
      ctx.save()
      ctx.font = "13px Arial"
      ctx.fillStyle = "#374151"
      ctx.textAlign = "center"
      ctx.translate(18, (margin.top + height - margin.bottom) / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(yAxisLabel, 0, 0)
      ctx.restore()
    }

    // Convert canvas to a buffer containing a PNG image
    const buffer = canvas.toBuffer("image/png") as Buffer

    // Convert buffer to base64 string
    const base64Image = buffer.toString("base64")

    // Return the base64-encoded image
    return `data:image/png;base64,${base64Image}`
  },
  {
    name: "generate_bar_chart",
    description:
      "Generates a bar chart from an array of data points using D3.js and returns it as a base64-encoded PNG image.",
    schema: z.object({
      data: z.array(
        z.object({
          label: z.string(),
          value: z.number()
        })
      ),
      chartTitle: z.string().optional().describe("Title for the chart"),
      yAxisLabel: z
        .string()
        .optional()
        .describe("Label for the Y axis with units")
    })
  }
)

async function callTheoryAgent(state: ReportState): Promise<ReportTheoryType> {
  const systemPrompt = `You are an experienced senior scientist specializing in scientific theory and context writing, tasked with creating the theoretical foundation for a comprehensive research report in biopharma. Your role is to document the experiment's Aim, Introduction, and Principle in a scientifically rigorous and clear manner, providing essential context for reproducibility.

FORMATTING: Write in well-structured paragraphs with clear, flowing prose. Use markdown formatting for emphasis where needed. Do NOT use bullet points or numbered lists — write in natural paragraph form as you would in a published scientific paper.

Your primary tasks include writing: Aim, Introduction, Principle.

Guidelines for Writing these sections:

1. Aim:
Write 1-2 concise paragraphs that clearly state what is being tested or evaluated, why it matters, and the key objectives of the experiment. Connect the aim to the user-provided context and objective.

2. Introduction:
Write 2-4 well-structured paragraphs covering the scientific background, significance of the research in biopharma, and the rationale for this experiment. Reference user-provided protocols where applicable. The introduction should read as a cohesive narrative that sets the stage for the experiment.

3. Principle:
Write 2-3 paragraphs explaining the underlying scientific theory, the core methodology or equations involved, and how the technique works mechanistically. Include key parameters and their roles. Use markdown for any equations if needed.

Constraints:
- Focus solely on theory-based sections; do not include procedural details, materials, or data analysis.
- Maintain a scientific, objective tone throughout.
- Write in flowing paragraph form — no bullet points or numbered lists.
- Ensure content is accurate and aligned with the provided objective.
`

  const userPrompt = `Generate aim, introduction, and principle using the following:

Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data files: ${state.dataFileSummary}`

  console.log("userPrompt: " + userPrompt)

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(ReportTheorySchema, "reportTheory")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in reportTheoryAgent:", error)
    throw error
  }
}

async function callDataAnalystAgent(
  state: ReportState
): Promise<DataAnalysisType> {
  const systemPrompt = `You are an expert data analyst and senior scientist tasked with documenting data-driven sections for a comprehensive biopharma research report. Your role is to interpret the data files based on the defined objective and present the Data Analysis, Results, Discussion, Conclusions, and Next Steps based on the experiment findings, offering clear insights and actionable recommendations.

Your primary tasks include writing (as per individual instructions):
Data analysis, Results, Discussion, Conclusion, Next steps

1. Data Analysis:
Write in paragraph form as a scientific narrative. Describe the analytical approach and methodology, the parameters and controls used, any software or tools applied, and a summary of key data trends. You may include a markdown table for numerical results (each row = one sample/condition with measured values and units), but all explanatory text should be in well-structured paragraphs, not bullet points.

2. Results:
FORMATTING: Use bullet points and numbered lists for this section.
Present as bullet points with key numeric findings:
- Each major finding as a standalone bullet point with specific values and units
- Reference figures/tables by number
- No interpretation (save for Discussion)

3. Discussion:
FORMATTING: Use bullet points organized under subheadings for this section.
#### Interpretation
- Key interpretations of the findings
#### Implications
- Practical significance and potential impact
#### Limitations
- Specific limitations of the current study

4. Conclusion:
FORMATTING: Use bullet points for this section.
Present as 3-5 concise bullet points summarizing the key takeaways from the study.

5. Next Steps:
FORMATTING: Use a numbered list for this section.
Present as a numbered list of 3-7 recommended follow-up actions, each as a single clear statement.

Constraints:
- Focus solely on data analysis, interpretation and conclusion; do not add theory or procedural details.
- Maintain scientific rigor, ensuring that findings are presented clearly, concisely, and without bias.
- Ensure each section directly addresses the experiment's objectives and supports actionable insights.
- Data Analysis section must be in paragraph form; Results, Discussion, Conclusion, and Next Steps must use bullet points or numbered lists.
`

  const userPrompt = `To generate the content, refer to the following:
Objective: ${state.experimentObjective}
Data Files: ${state.dataFileSummary}
Protocol: ${state.protocol}`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(DataAnalysisSchema, "dataAnalysis")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in DataAnalysisAgent:", error)
    throw error
  }
}

async function callExecutorAgent(
  state: ReportState
): Promise<ReportExecutorType> {
  const systemPrompt = `You are a seasoned scientist with expertise in experimental design and execution, tasked with documenting the practical aspects of an experiment in a comprehensive research report. Your focus is on Materials Needed, Preparation, Procedure, Experiment Setup and Layout for a biopharma experiment, ensuring clarity, detailed description of every step and reproducibility for hands-on execution. Write the sections in past tense, as how things were done to run the experiment.

FORMATTING: Write in well-structured paragraphs and prose. You may use tables for listing materials, but all other content should be in paragraph form. Do NOT use bullet points or numbered lists for the main content. Write as you would in a formal lab report or scientific paper.

Your primary tasks include writing: Material needed, Preparation, Procedure, Setup and layout.

Guidelines for Writing these sections:

1. Material needed:
Write a paragraph or use a markdown table listing all materials, equipment, reagents, buffers, and standards used. Include specifications such as concentrations, volumes, catalog numbers, and instrument models. Organize by category (consumables, equipment, reagents) using subheadings if needed. Find this information from the protocol material section and preparation files uploaded by the user.

2. Preparation:
Write in paragraph form describing all preparation steps in chronological order. Include instrument setup, buffer preparation, and reagent preparation with exact quantities (e.g., "8 g of NaCl was dissolved in 800 mL deionized water"). Use subheadings to separate major preparation phases. Use preparation files given by the user for specific amounts and methods.

3. Procedure:
Write as a detailed narrative describing the experimental procedure step by step in past tense. Cover all phases: instrument preparation, sample processing, measurement/data collection, and cleanup. Include specific volumes, temperatures, timing, and instrument settings. Organize into clearly labeled phases using subheadings. Refer to the protocol procedure section and other uploaded documents.

4. Setup:
Write 1-2 paragraphs describing the experimental layout, including sample arrangement, vial positioning, labeling conventions (sample IDs, condition codes), and specific configurations required for accurate data collection. Reference any diagrams from uploaded files.

Constraints:
- Focus exclusively on practical, preparation, and procedural details; do not provide theoretical context or interpret data.
- Write in flowing paragraph form — avoid bullet points and numbered lists.
- Ensure clear, detailed descriptions that support reproducibility.
- Organize the information logically and with attention to accuracy.
`

  const userPrompt = `Generate material, preparation, procedure, and setup using the following:
Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data Files: ${state.dataFileSummary}
`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(ReportExecutorSchema, "reportTheory")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in reportTheoryAgent:", error)
    throw error
  }
}

// Define the workflow
const workflow = new StateGraph<ReportState>({
  channels: {
    aim: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    introduction: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    principle: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    material: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    preparation: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    procedure: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    setup: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    dataAnalysis: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    results: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    discussion: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    conclusion: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    nextSteps: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    protocol: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    paperSummary: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    dataFileSummary: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    finalOutput: {
      value: (left?: ReportOutputType, right?: ReportOutputType) =>
        right ?? left ?? ({} as ReportOutputType),
      default: () => ({}) as ReportOutputType
    },
    chartData: {
      value: (left?: VisualizationType, right?: VisualizationType) =>
        right ??
        left ??
        ({ chartTitle: "", yAxisLabel: "", data: [] } as VisualizationType),
      default: () =>
        ({ chartTitle: "", yAxisLabel: "", data: [] }) as VisualizationType
    },
    chartImage: {
      // Added chartImage channel
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    }
  }
})

  .addNode("reportWriterTheoryAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callTheoryAgent(state)
      return {
        ...state,
        aim: finalOutput.aim,
        principle: finalOutput.principle,
        introduction: finalOutput.introduction
      }
    } catch (error) {
      console.error("Error in finalValidatorAgent:", error)
      throw error
    }
  })
  .addNode("reportWriterExecutorAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callExecutorAgent(state)
      return {
        ...state,
        material: finalOutput.material,
        preparation: finalOutput.preparation,
        procedure: finalOutput.procedure,
        setup: finalOutput.setup
      }
    } catch (error) {
      console.error("Error in reportWriterExecutorAgent:", error)
      throw error
    }
  })
  .addNode("dataVisualizationAgent", async (state: ReportState) => {
    try {
      const content = await callDataVisualizationAgent(state)

      return { ...state, chartData: content }
    } catch (error) {
      console.error("Error in dataVisualizationAgent:", error)
      throw error
    }
  })

  .addNode("dataAnalystAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callDataAnalystAgent(state)
      return {
        ...state,
        dataAnalysis: finalOutput.dataAnalysis,
        results: finalOutput.results,
        discussion: finalOutput.discussion,
        conclusion: finalOutput.conclusion,
        nextSteps: finalOutput.nextSteps
      }
    } catch (error) {
      console.error("Error in reportWriterExecutorAgent:", error)
      throw error
    }
  })
  .addNode("generateChart", async (state: ReportState) => {
    try {
      // Parse data from chartData and pass title/label for the D3 image
      const parsedData = state.chartData?.data || []
      const chartImage = await chartTool.func({
        data: parsedData,
        chartTitle: state.chartData?.chartTitle || "Data Visualization",
        yAxisLabel: state.chartData?.yAxisLabel || ""
      })
      return { ...state, chartImage }
    } catch (error) {
      console.error("Error in generateChart:", error)
      throw error
    }
  })
  // .addNode("finalValidatorAgent", async (state: ReportState) => {
  //   try {
  //     const finalOutput = await finalValidatorAgent(state)
  //     return { ...state, finalOutput }
  //   } catch (error) {
  //     console.error("Error in finalValidatorAgent:", error)
  //     throw error
  //   }
  // })
  .addEdge(START, "reportWriterTheoryAgent")
  .addEdge("reportWriterTheoryAgent", "reportWriterExecutorAgent")
  .addEdge("reportWriterExecutorAgent", "dataVisualizationAgent") // Add this edge
  .addEdge("dataVisualizationAgent", "dataAnalystAgent") // Add this edge
  .addEdge("dataAnalystAgent", "generateChart")
  .addEdge("generateChart", END)

// Helper function to parse data
function parseDataFromSummary(
  summary: string
): { label: string; value: number }[] {
  // Implement your logic to parse data from summary
  // For demonstration, returning dummy data
  return [
    { label: "Parsed Category 1", value: 25 },
    { label: "Parsed Category 2", value: 35 },
    { label: "Parsed Category 3", value: 45 }
  ]
}

// Compile the graph

export async function POST(req: Request) {
  try {
    const { protocol, papers, dataFiles, experimentObjective } =
      (await req.json()) as {
        protocol?: string[]
        papers?: string[]
        dataFiles?: string[]
        experimentObjective?: string
      }

    const protocolIds = Array.isArray(protocol) ? protocol : []
    const paperIds = Array.isArray(papers) ? papers : []
    const dataFileIds = Array.isArray(dataFiles) ? dataFiles : []

    // Hybrid resolution:
    // 1) Prefer existing `file_items` (fast path)
    // 2) Fallback to downloading/parsing the raw file from Supabase Storage (works even when `file_items` is empty)
    const resolved = await resolveSupabaseFilesToText(
      [...protocolIds, ...paperIds, ...dataFileIds],
      { maxCharsPerFile: 40_000 }
    )

    const byId = new Map(resolved.map(r => [r.fileId, r]))

    const protocolText = protocolIds
      .map(id => byId.get(id)?.content || "")
      .filter(Boolean)
      .join("\n\n")
    const paperText = paperIds
      .map(id => byId.get(id)?.content || "")
      .filter(Boolean)
      .join("\n\n")
    const dataFileText = dataFileIds
      .map(id => byId.get(id)?.content || "")
      .filter(Boolean)
      .join("\n\n")

    const fallbackUsed = resolved
      .filter(r => r.source === "raw")
      .map(r => r.fileId)
    if (fallbackUsed.length > 0) {
      console.log(
        "[REPORT_OUTLINE] Fallback used (no file_items found) for fileIds:",
        fallbackUsed
      )
      const warnings = resolved
        .filter(r => r.source === "raw" && r.warnings?.length)
        .map(r => ({ fileId: r.fileId, warnings: r.warnings }))
      if (warnings.length) {
        console.warn("[REPORT_OUTLINE] File parsing warnings:", warnings)
      }
    }

    // Optional backfill: populate `file_items` so future runs can use fast path.
    // Enabled via env var to avoid surprising compute in production/serverless.
    if (
      process.env.REPORT_BACKFILL_FILE_ITEMS === "true" &&
      fallbackUsed.length
    ) {
      try {
        const profile = await getServerProfile()
        const { backfilledFileIds, skippedFileIds } =
          await backfillFileItemsLocal(profile.user_id, resolved)
        console.log(
          "[REPORT_OUTLINE] Backfilled file_items:",
          backfilledFileIds
        )
        if (skippedFileIds.length) {
          console.warn(
            "[REPORT_OUTLINE] Backfill skipped fileIds:",
            skippedFileIds
          )
        }
      } catch (e) {
        console.warn("[REPORT_OUTLINE] Backfill failed:", e)
      }
    }

    const initialState: ReportState = {
      aim: "",
      introduction: "",
      principle: "",
      material: "",
      preparation: "",
      procedure: "",
      setup: "",
      dataAnalysis: "",
      results: "",
      discussion: "",
      conclusion: "",
      nextSteps: "",
      experimentObjective: experimentObjective || "",
      protocol: protocolText || "",
      paperSummary: paperText || "",
      dataFileSummary: dataFileText || "",
      finalOutput: {} as ReportOutputType,
      chartData: {
        chartTitle: "",
        yAxisLabel: "",
        data: []
      } as VisualizationType,
      chartImage: "" // Initialize chartImage
    }

    let finalState: ReportState | undefined

    for await (const event of await app.stream(initialState)) {
      for (const [key, value] of Object.entries(event)) {
        finalState = value as ReportState
        // console.log(`Updated state for ${key}:`, finalState)
      }
    }

    if (finalState) {
      console.log("Final state:", finalState)
      return NextResponse.json({
        reportOutline: [
          "aim",
          "introduction",
          "principle",
          "material",
          "preparation",
          "procedure",
          "setup",
          "dataAnalysis",
          "charts",
          "results",
          "discussion",
          "conclusion",
          "nextSteps"
        ],
        reportDraft: {
          aim: finalState.aim,
          introduction: finalState.introduction,
          principle: finalState.principle,
          material: finalState.material,
          preparation: finalState.preparation,
          procedure: finalState.procedure,
          setup: finalState.setup,
          dataAnalysis: finalState.dataAnalysis,
          charts: finalState.chartImage,
          results: finalState.results,
          discussion: finalState.discussion,
          conclusion: finalState.conclusion,
          nextSteps: finalState.nextSteps
        },
        chartImage: finalState.chartImage,
        chartData: finalState.chartData // Include raw chart data for client-side rendering
      })
    }

    return new NextResponse("Failed to generate report", { status: 500 })
  } catch (error) {
    console.error("[REPORT_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

const app = workflow.compile()

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
