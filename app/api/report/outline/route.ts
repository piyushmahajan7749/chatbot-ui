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
1. Pick ONE primary numeric metric from the data (e.g. mean viscosity, % recovery, absorbance, concentration). Do NOT mix different metrics or units in the same chart.
2. Use SHORT labels (max 15 characters) for the X-axis categories. Abbreviate formulation names (e.g. "F1 Control", "F2 Glycine", "F3 Sucrose").
3. All values MUST be in the same unit. If the data has multiple metrics, choose the most scientifically relevant one.
4. Provide a clear chartTitle (e.g. "Mean Viscosity by Formulation") and yAxisLabel WITH units (e.g. "Viscosity (mPa·s)").
5. Return only POSITIVE values when possible. If comparing % changes, use absolute values or the raw measurement instead.
6. Include 3-10 data points maximum. If there are more, pick the most important ones.`

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
  async ({ data }) => {
    const width = 800 // Increased width for better spacing
    const height = 500
    const margin = { top: 30, right: 50, bottom: 120, left: 60 } // Increased bottom margin for rotated labels

    // Create a canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")

    // Fill the background
    ctx.fillStyle = "#f8f9fa"
    ctx.fillRect(0, 0, width, height)

    const x = d3
      .scaleBand()
      .domain(data.map(d => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.3) // Increased padding between bars

    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(data, (d: any) => d.value) || 0) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top])

    const colorPalette = [
      "#e6194B",
      "#3cb44b",
      "#ffe119",
      "#4363d8",
      "#f58231",
      "#911eb4",
      "#42d4f4",
      "#f032e6",
      "#bfef45",
      "#fabebe"
    ]

    // Draw title
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.fillStyle = "#333"
    ctx.fillText("Data Visualization", width / 2, margin.top / 2)

    // Draw bars with slight shadow for depth
    data.forEach((d, idx) => {
      ctx.fillStyle = colorPalette[idx % colorPalette.length]

      // Add shadow effect
      ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
      ctx.shadowBlur = 5
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      ctx.fillRect(
        x(d.label) ?? 0,
        y(d.value),
        x.bandwidth(),
        height - margin.bottom - y(d.value)
      )

      // Reset shadow
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0

      // Add value label on top of each bar
      ctx.fillStyle = "#333"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.fillText(
        d.value.toString(),
        (x(d.label) ?? 0) + x.bandwidth() / 2,
        y(d.value) - 5
      )
    })

    // Draw x-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, height - margin.bottom)
    ctx.lineTo(width - margin.right, height - margin.bottom)
    ctx.stroke()

    // Draw x-axis labels (rotated to prevent overlap)
    ctx.save()
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.font = "12px Arial"
    ctx.fillStyle = "#333"

    x.domain().forEach((d: any) => {
      const xCoord = (x(d) ?? 0) + x.bandwidth() / 2
      ctx.save()
      ctx.translate(xCoord, height - margin.bottom + 10)
      ctx.rotate(Math.PI / 4) // Rotate text 45 degrees
      ctx.fillText(d, 0, 0)
      ctx.restore()
    })

    ctx.restore()

    // Draw y-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, margin.top)
    ctx.lineTo(margin.left, height - margin.bottom)
    ctx.stroke()

    // Draw y-axis labels and grid lines
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.font = "12px Arial"
    ctx.fillStyle = "#333"

    const ticks = y.ticks(10) // More ticks for better readability
    ticks.forEach((d: any) => {
      const yCoord = y(d)

      // Draw tick
      ctx.beginPath()
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(margin.left - 6, yCoord)
      ctx.stroke()

      // Draw label
      ctx.fillText(d.toString(), margin.left - 10, yCoord)

      // Draw grid line
      ctx.beginPath()
      ctx.strokeStyle = "#e0e0e0"
      ctx.setLineDash([2, 2])
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(width - margin.right, yCoord)
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Add a light border around the chart
    ctx.strokeStyle = "#ddd"
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)

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
      )
    })
  }
)

async function callTheoryAgent(state: ReportState): Promise<ReportTheoryType> {
  const systemPrompt = `You are an experienced senior scientist specializing in scientific theory and context writing, tasked with creating the theoretical foundation for a comprehensive research report in biopharma. Your role is to document the experiment's Aim, Introduction, and Principle in a scientifically rigorous and clear manner, providing essential context for reproducibility.

CRITICAL FORMATTING REQUIREMENT: Structure ALL output using bullet points, numbered lists, and short declarative statements. Do NOT write in paragraph form. Use markdown formatting (-, *, 1., 2. etc.). Each point should be a single, clear statement. Group related points under subheadings using ### or #### markdown headers.

Your primary tasks include writing: Aim, Introduction, Principle.

Guidelines for Writing these sections:
###
1. Aim:
Present as 3-5 bullet points covering:
- What is being tested/evaluated
- Why it matters (significance)
- Key objectives of the experiment
- Link to the user-provided context/objective

2. Introduction:
Present as bullet points organized under subheadings:
#### Background
- Key context points about the scientific area
#### Significance
- Why this research matters in biopharma
#### Rationale
- Scientific reasoning for this experiment
- Reference to user-provided protocols where applicable

3. Principle:
Present as bullet points under subheadings:
#### Underlying Theory
- Core scientific principles involved
#### Key Equation/Method
- Relevant equations or methodological basis (use markdown for equations)
#### How It Works
- Step-by-step mechanism of the technique
- Key parameters and their roles

###
Constraints:
- Focus solely on theory-based sections; do not include procedural details, materials, or data analysis.
- Maintain a scientific, objective tone throughout.
- Every point must be a concise, standalone statement — no multi-sentence paragraphs.
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

CRITICAL FORMATTING REQUIREMENT: Structure ALL output using bullet points, numbered lists, and short declarative statements. Do NOT write in paragraph form. Use markdown formatting (-, *, 1., 2. etc.). Each point should be a single, clear statement. Group related points under subheadings using ### or #### markdown headers. Use markdown tables (| col1 | col2 |) for numerical data.

Your primary tasks include writing (as per individual instructions):
Data analysis, Results, Discussion, Conclusion, Next steps

1. Data Analysis:
Present as bullet points organized under subheadings:
#### Analytical Approach
- Bullet points describing the analysis methodology, parameters, and statistical tests
#### Parameters & Controls
- Bullet list of each parameter and control with specific values
#### Software & Tools
- Bullet list of software/tools used with version numbers
#### Key Data Summary
- Use a markdown table for numerical results
- Each row = one sample/condition with measured values and units
#### Data Interpretation
- Bullet points summarizing trends and patterns observed

2. Results:
Present as bullet points with key numeric findings:
- Each major finding as a standalone bullet point with specific values and units
- Reference figures/tables by number
- No interpretation (save for Discussion)

3. Discussion:
Present as bullet points under subheadings:
#### Interpretation
- Key interpretations of the findings
#### Implications
- Practical significance and potential impact
#### Limitations
- Specific limitations of the current study

4. Conclusion:
Present as 3-5 concise bullet points summarizing the key takeaways from the study.

5. Next Steps:
Present as a numbered list of 3-7 recommended follow-up actions, each as a single clear statement.

Constraints:
- Focus solely on data analysis, interpretation and conclusion; do not add theory or procedural details.
- Maintain scientific rigor, ensuring that findings are presented clearly, concisely, and without bias.
- Ensure each section directly addresses the experiment's objectives and supports actionable insights.
- Every point must be a concise, standalone statement — no multi-sentence paragraphs.
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

CRITICAL FORMATTING REQUIREMENT: Structure ALL output using bullet points, numbered lists, and short declarative statements. Do NOT write in paragraph form. Use markdown formatting (-, *, 1., 2. etc.). Each point should be a single, clear statement. Group related points under subheadings using ### or #### markdown headers.

Your primary tasks include writing: Material needed, Preparation, Procedure, Setup and layout.

Guidelines for Writing these sections:

1. Material needed:
Present as a categorized bulleted list. Each item on its own bullet with specifications.
#### Consumables
- Item name: specification (size, quantity, catalog number if known)
#### Equipment
- Instrument name: model/specification
#### Reagents, Buffers & Standards
- Reagent name: concentration, volume, purpose

Find this information from the protocol material section and preparation files uploaded by the user.

2. Preparation:
Present as numbered steps under clear subheadings. Each step on its own line with exact quantities and conditions.
#### Instrument Setup
1. Step with specific action, parameters, and conditions
#### Buffer Preparation
1. Step with exact quantities (e.g., "Dissolve 8 g of NaCl in 800 mL deionized water")
#### Reagent Preparation
1. Step with calculations and volumes

Use preparation files given by the user for specific amounts and methods.

3. Procedure:
Present as sequentially numbered steps. Each step must be a single action — no multi-sentence steps.
1. First action with specific volumes, temperatures, timing, and settings
2. Next action...
Organize into clearly labeled phases:
#### Phase 1: Instrument Preparation
#### Phase 2: Sample Processing
#### Phase 3: Measurement / Data Collection
#### Phase 4: Cleanup & Disposal

Refer to the protocol procedure section and other uploaded documents.

4. Setup:
Present as a bulleted list of layout details:
- Sample arrangement and vial positioning
- Labeling conventions (sample IDs, condition codes)
- Specific configurations for accurate data collection
- Diagram reference if available in uploaded files

Constraints:
- Focus exclusively on practical, preparation, and procedural details; do not provide theoretical context or interpret data.
Ensure clear, detailed instructions that support reproducibility.
Organize the information logically and with attention to accuracy.
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
      // Parse data from chartData
      const parsedData = state.chartData?.data || []
      const chartImage = await chartTool.func({ data: parsedData })
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
