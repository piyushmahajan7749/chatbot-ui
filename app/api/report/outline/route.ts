import { StateGraph, END, START } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import OpenAI from "openai"
import { z } from "zod"
import * as d3 from "d3"
import { createCanvas, Canvas } from "canvas"

import { ChatPromptTemplate } from "@langchain/core/prompts"
import { tool } from "@langchain/core/tools"
import { NextResponse } from "next/server"
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages"
import { retrieveFileContent, retrieveRelevantContent } from "./retrieval"

// Initialize language models
const llm = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  apiKey: process.env.OPENAI_KEY
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
})

type ReportOutputType = z.infer<typeof ReportOutput>

const ReportOutput = z.object({
  reportOutline: z.array(z.string()),
  reportDraft: z.record(z.string(), z.string())
})

// Define interfaces
interface ReportState {
  protocol: string
  paperSummary?: string
  dataFileSummary?: string
  experimentObjective?: string
  reportDraft: string
  reportOutline: string
  finalOutput: ReportOutputType
  chartImage?: string // Added field to store chart image
}

// Define agents
const reportOutlineAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced senior scientist with expertise in designing research reports, tasked with preparing a comprehensive report outline for a biopharma experiment. Your primary duties include:
Reviewing the research protocol, data files, and other relevant documents uploaded by the user.
Identifying key sections necessary for a scientific report (e.g., Aim, Introduction, Principle, Material Needed, Preparation, Calculations, Setup, Procedure, Data Analysis, Results, Discussion, Conclusion).
Structuring the report outline logically, ensuring all sections are relevant to the files provided by the user.
Ensuring that the outline covers all aspects necessary for reproducibility of the experiment.

Constraints:
Focus solely on preparing the outline; do not write content for the report or interpret data.
Maintain a logical and comprehensive structure to guide further report development.
Include placeholder sub-sections where additional details might be necessary (e.g., "Additional sections based on experiment type”).

To generate the report outline, use the following:

Experiment Objective: {experimentObjective}
Protocol: {protocol}
Data Files: {dataFiles}
`
)

const reportWriterAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced senior scientist with expertise in scientific report writing, tasked with writing a comprehensive research report documenting the lab work performed. Your primary duties include:
Clearly stating the research Aim and Objectives in the Introduction, based on the user defined objective and uploaded files.
Detailing the experimental methodology used, including preparation, setup, data collection, and analysis techniques, ensuring sufficient detail for replication.
Structuring the report into coherent sections such as Aim, Introduction, Principle, Material Needed, Preparation, Calculations, Setup, Procedure, Data Analysis, Results, Discussion, Conclusion, next steps if needed and any other relevant sections based on the provided outline and files.
Synthesizing information from the uploaded files into a unified, scientifically rigorous narrative.
Integrating any provided data visualizations, ensuring they are appropriately referenced and explained in relation to the findings.
Constraints:
Focus solely on writing the report; do not perform data analysis or create new visualizations.
Maintain an objective, scientific tone throughout the report, ensuring clarity and precision.
Ensure all procedures and sections are detailed enough for other researchers to replicate the experiment.
Cite all relevant sources using APA style where applicable.


To generate the report, use the following:
Data Files: {dataFiles}
Protocol: {protocol}
Report Outline: {reportOutline}
`
)

async function finalValidatorAgent(
  state: ReportState
): Promise<ReportOutputType> {
  const prompt = `You are an experienced senior scientist with expertise in scientific report writing review, tasked with reviewing and refining a comprehensive research report for biopharma experiments. Your primary duties include:
Reviewing the entire report for scientific accuracy, clarity, and logical flow across all sections (e.g., Aim, Introduction, Methodology, Data Analysis, Results, Discussion, Conclusion).
Ensuring that all sections are comprehensive, well-organized, and follow a logical progression that would allow another scientist to replicate the experiment.
Checking for consistency between the narrative, data presented, and the visualizations, ensuring that all findings are supported by evidence.
Identifying any missing information or areas that require further elaboration and suggesting appropriate revisions.
Ensuring the report maintains an objective, scientific tone and is free from grammatical errors, typos, or formatting issues.
Verifying that all sources are cited appropriately using APA style and that any visualizations are correctly referenced and explained in the report.

Constraints:
Focus solely on reviewing and refining the report; do not generate new content or perform any data analysis.
Maintain a neutral, scientific tone throughout the feedback and ensure that revisions are focused on enhancing clarity and reproducibility.
Ensure that the report is polished, professional, and ready for submission.
To review and refine the report, use the following:
Report Draft: {reportDraft}
Data Files: {dataFiles} (for cross-referencing if needed)

  Please return the refined report in the following JSON format:
    {
      "reportOutline": ["Section 1", "Section 2", ...],
      "reportDraft": {
        "Section 1": "Content for section 1",
        "Section 2": "Content for section 2",
        ...
      }
    }
  `

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
    const rawOutput = completion.choices[0].message.content
    if (!rawOutput) {
      throw new Error("No content in the response")
    }

    const parsedOutput = JSON.parse(rawOutput)
    const reportOutput = ReportOutput.parse(parsedOutput)

    return reportOutput
  } catch (error) {
    console.error("Error in finalValidatorAgent:", error)
    throw error
  }
}

const chartTool = tool(
  async ({ data }) => {
    const width = 500
    const height = 500
    const margin = { top: 20, right: 30, bottom: 30, left: 40 }

    // Create a canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")

    const x = d3
      .scaleBand()
      .domain(data.map(d => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.1)

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d: any) => d.value) ?? 0])
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

    data.forEach((d, idx) => {
      ctx.fillStyle = colorPalette[idx % colorPalette.length]
      ctx.fillRect(
        x(d.label) ?? 0,
        y(d.value),
        x.bandwidth(),
        height - margin.bottom - y(d.value)
      )
    })

    ctx.beginPath()
    ctx.strokeStyle = "black"
    ctx.moveTo(margin.left, height - margin.bottom)
    ctx.lineTo(width - margin.right, height - margin.bottom)
    ctx.stroke()

    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    x.domain().forEach((d: any) => {
      const xCoord = (x(d) ?? 0) + x.bandwidth() / 2
      ctx.fillText(d, xCoord, height - margin.bottom + 6)
    })

    ctx.beginPath()
    ctx.moveTo(margin.left, height - margin.top)
    ctx.lineTo(margin.left, height - margin.bottom)
    ctx.stroke()

    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    const ticks = y.ticks()
    ticks.forEach((d: any) => {
      const yCoord = y(d) // height - margin.bottom - y(d);
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(margin.left - 6, yCoord)
      ctx.stroke()
      ctx.fillText(d.toString(), margin.left - 8, yCoord)
    })

    // Convert canvas to a buffer containing a PNG image
    const buffer = canvas.toBuffer("image/png")

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

const visualizationAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced data visualization specialist in the field of biopharma research, tasked with analyzing experimental data and generating visualizations for a comprehensive research report. Your primary duties include:
Reviewing the data files and identifying key trends, patterns, and results relevant to the research objective.
Creating visualizations (e.g., graphs, charts, plots) that clearly present the experimental results and any statistical analysis where applicable.
Ensuring that each visualization directly supports the narrative of the report and aligns with the experiment’s objectives.
Labeling each visualization appropriately, including descriptive titles, axis labels, units of measurement, and any necessary legends or notes to ensure clarity.
Providing captions for each visualization, explaining its significance and how it relates to the findings in the report.
Constraints:
Focus solely on generating and describing visualizations; do not write the report or perform in-depth statistical analysis unless required for visualizations.
Ensure that the visualizations are clear, accurate, and easy to interpret by scientists.
Ensure all data visualizations are designed with scientific rigor, avoiding over-complication.

To generate the visualizations, use the following:
Data Files: {dataFiles}
Experiment Objective: {experimentObjective}
Report Outline: {reportOutline}
  `
)

const codeAgent = ChatPromptTemplate.fromTemplate(
  `You are an expert Python programmer specializing in data processing and analysis. Your main responsibilities include:

  1. Writing clean, efficient Python code for data manipulation, cleaning, and transformation.
  2. Implementing statistical methods and machine learning algorithms as needed.
  3. Debugging and optimizing existing code for performance improvements.
  4. Adhering to PEP 8 standards and ensuring code readability with meaningful variable and function names.

  Constraints:
  - Focus solely on data processing tasks; do not generate visualizations or write non-Python code.
  - Provide only valid, executable Python code, including necessary comments for complex logic.
  - Avoid unnecessary complexity; prioritize readability and efficiency.
  `
)

async function callAgent(
  state: ReportState,
  agent: ChatPromptTemplate,
  input: Record<string, any>
) {
  try {
    const formattedMessages = await agent.formatMessages(input)
    // console.log("Formatted messages:", formattedMessages)

    const messages = formattedMessages.map((msg: BaseMessage) => {
      if (msg instanceof HumanMessage) {
        return { role: "human", content: msg.content }
      } else if (msg instanceof AIMessage) {
        return { role: "ai", content: msg.content }
      } else {
        return { role: "system", content: msg.content }
      }
    })

    // console.log("Mapped messages:", messages)
    const response = await llm.invoke(
      messages.map(msg => msg.content.toString())
    )
    // console.log("LLM response:", response)

    return response.content
  } catch (error) {
    console.error("Error in callAgent:", error)
    throw error
  }
}

// Define the workflow
const workflow = new StateGraph<ReportState>({
  channels: {
    reportOutline: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    reportDraft: {
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
    chartImage: {
      // Added chartImage channel
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    }
  }
})
  .addNode("reportOutlineAgent", async (state: ReportState) => {
    try {
      const content = await callAgent(state, reportOutlineAgent, {
        protocol: state.protocol,
        dataFiles: state.dataFileSummary,
        experimentObjective: state.experimentObjective
      })
      return { ...state, reportOutline: content }
    } catch (error) {
      console.error("Error in reportOutlineAgent:", error)
      throw error
    }
  })
  .addNode("reportWriterAgent", async (state: ReportState) => {
    try {
      const content = await callAgent(state, reportWriterAgent, {
        dataFiles: state.dataFileSummary,
        protocol: state.protocol || "",
        reportOutline: state.reportOutline
      })

      return { ...state, reportDraft: content }
    } catch (error) {
      console.error("Error in reportWriterAgent:", error)
      throw error
    }
  })
  .addNode("generateChart", async (state: ReportState) => {
    try {
      // Parse data from dataFileSummary
      const parsedData = parseDataFromSummary(state.dataFileSummary || "")
      const chartImage = await chartTool.func({ data: parsedData })
      return { ...state, chartImage }
    } catch (error) {
      console.error("Error in generateChart:", error)
      throw error
    }
  })
  .addNode("finalValidatorAgent", async (state: ReportState) => {
    try {
      const finalOutput = await finalValidatorAgent(state)
      return { ...state, finalOutput }
    } catch (error) {
      console.error("Error in finalValidatorAgent:", error)
      throw error
    }
  })
  .addEdge(START, "reportOutlineAgent")
  .addEdge("reportOutlineAgent", "reportWriterAgent")
  .addEdge("reportWriterAgent", "generateChart")
  .addEdge("generateChart", "finalValidatorAgent")
  .addEdge("finalValidatorAgent", END)

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
    const { protocol, papers, dataFiles } = await req.json()
    const protocolContent = await retrieveFileContent(protocol)
    const paperContent = await retrieveFileContent(papers)
    const dataFileContent = await retrieveFileContent(dataFiles)

    const initialState: ReportState = {
      reportOutline: "",
      reportDraft: "",
      protocol: protocolContent[0].content,
      paperSummary: paperContent[0]?.content || "",
      dataFileSummary: dataFileContent[0]?.content || "",
      finalOutput: {} as ReportOutputType,
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
        reportOutline: finalState.finalOutput.reportOutline,
        reportDraft: finalState.finalOutput.reportDraft,
        chartImage: finalState.chartImage // Include chartImage in response
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
