import { StateGraph, END, START } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import OpenAI from "openai"
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import { ChatAnthropic } from "@langchain/anthropic"
import * as d3 from "d3"
import { createCanvas, Canvas } from "canvas"

import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts"
import { StructuredTool, tool } from "@langchain/core/tools"
import { convertToOpenAITool } from "@langchain/core/utils/function_calling"
import { Runnable } from "@langchain/core/runnables"
import { NextResponse } from "next/server"
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages"
import { retrieveFileContent, retrieveRelevantContent } from "./retrieval"
import { ToolNode } from "@langchain/langgraph/prebuilt"

// 2. use o1 to generate the report in one shot and use another agent to create the visuation charts and tables.
// 2.1. Use gpt-4o to generate the visulization charts and tables.
// 2.2. Use o1-mini to extract the outline from the report.
// 2.3. Use o1-mini to extract the report draft sections and exapnd them into full fledged sections.
// 2.4. Use o1-mini to extract the final output in the desired format.
// Can we finetune a model like gpt4o with the reports input and output to improve the quality and shorten the prompts?

// Initialize language models
const minillm = new ChatOpenAI({
  modelName: "gpt-4o-mini-2024-07-18",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})
const llm = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  temperature: 0.7,
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
  reportDraft: string
  reportOutline: string
  finalOutput: ReportOutputType
  chartImage?: string // Added field to store chart image
}

// Define agents
const reportOutlineAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced scientific report writer. Write a table of contents for the research report based on the provided protocol.

  The key sections in a report are these -
  1. Aim
  2. Introduction
  3. Principle
  4. Calculations
  3. Material needed
  4. Preparation
  5. Setup
  6. Procedure
  7. Data Analysis
  8. Results
  9. Discussion
  10. Conclusion
  11. Next Steps
  12. References

depending on the protocol, you may need to add or remove sections. Only add the titles of the sections, no need for content.
Return the list of sections as a list. Do not add any special characters.

Protocol: {protocol}
`
)
const reportWriterAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced scientific writer tasked with drafting comprehensive research reports. Your primary duties include:

    1. Clearly stating the research hypothesis and objectives in the introduction.
    2. Detailing the methodology used, including data collection and analysis techniques.
    3. Structuring the report into coherent sections (e.g. Aim, Introduction, Principle, Calculations, Material Needed, Preparation, Setup, Procedure, Data Analysis, Results, Discussion, Conclusion).
    4. Synthesizing information from various sources into a unified narrative.
    5. Integrating relevant data visualizations and ensuring they are appropriately referenced and explained.

    Constraints:
    - Focus solely on report writing; do not perform data analysis or create visualizations.
    - Maintain an objective, academic tone throughout the report.
    - Cite all sources using APA style and ensure that all findings are supported by evidence.

  To generate the report, use the following -
  - Data Files: {dataFiles}
  - Papers: {papers}
  - Report Outline: {reportOutline}
`
)

async function finalValidatorAgent(
  state: ReportState
): Promise<ReportOutputType> {
  const prompt = `You are an expert AI report refiner tasked with optimizing and enhancing research reports. Your responsibilities include:

    1. Thoroughly reviewing the entire research report, focusing on content, structure, and readability.
    2. Identifying and emphasizing key findings, insights, and conclusions.
    3. Restructuring the report to improve clarity, coherence, and logical flow.
    4. Ensuring that all sections are well-integrated and support the primary research hypothesis.
    5. Condensing redundant or repetitive content while preserving essential details.
    6. Enhancing the overall readability, ensuring the report is engaging and impactful.

    Refinement Guidelines:
    - Maintain the scientific accuracy and integrity of the original content.
    - Ensure all critical points from the original report are preserved and clearly articulated.
    - Improve the logical progression of ideas and arguments.
    - Highlight the most significant results and their implications for the research hypothesis.
    - Ensure that the refined report aligns with the initial research objectives and hypothesis.

    Here is the report to refine: 
    ${state.reportDraft}

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

const tools = [chartTool]
const toolNode = new ToolNode(tools)

const model = new ChatAnthropic({
  model: "claude-3-5-sonnet-20240620",
  temperature: 0,
  apiKey: process.env.ANTHROPIC_KEY
}).bindTools(tools)

const visualizationAgent = ChatPromptTemplate.fromTemplate(
  `You are a data visualization expert tasked with creating insightful visual representations of data. Your primary responsibilities include:
  
  1. Designing appropriate visualizations that clearly communicate data trends and patterns.
  2. Selecting the most suitable chart types (e.g., bar charts, scatter plots, heatmaps) for different data types and analytical purposes.
  3. Providing executable Python code (using libraries such as matplotlib, seaborn, or plotly) that generates these visualizations.
  4. Including well-defined titles, axis labels, legends, and saving the visualizations as files.
  5. Offering brief but clear interpretations of the visual findings.

  **File Saving Guidelines:**
  - Save all visualizations as files with descriptive and meaningful filenames.
  - Ensure filenames are structured to easily identify the content (e.g., 'sales_trends_2024.png' for a sales trend chart).
  - Confirm that the saved files are organized in the working directory, making them easy for other agents to locate and use.

  **Constraints:**
  - Focus solely on visualization tasks; do not perform data analysis or preprocessing.
  - Ensure all visual elements are suitable for the target audience, with attention to color schemes and design principles.
  - Avoid over-complicating visualizations; aim for clarity and simplicity.
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
        protocol: state.protocol
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
        papers: state.paperSummary || "",
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
    const { protocol, papers, dataFiles, prompt } = await req.json()
    // console.log("Received request:", {
    //   protocol,
    //   papers,
    //   dataFiles
    // })

    // if (!elevatorPitch || !habitStories || !jobStories) {
    //   return new NextResponse("Missing required fields", { status: 400 })
    // }
    const protocolContent = await retrieveFileContent([protocol])
    const paperContent = await retrieveFileContent([papers])
    const dataFileContent = await retrieveFileContent([dataFiles])

    // console.log("Paper content:", paperContent)
    // console.log("Data file content:", dataFileContent)
    // console.log("Protocol content:", protocolContent)

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
