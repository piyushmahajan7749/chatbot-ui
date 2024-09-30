import { StateGraph, END, START } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import OpenAI from "openai"
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { NextResponse } from "next/server"
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages"

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
  reportOutline: z.string(),
  reportDraft: z.string()
})

// Define interfaces
interface ReportState {
  protocol: string
  papers: string[]
  dataFiles: string[]
  reportDraft: string
  reportOutline: string
  finalOutput: ReportOutputType
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

depending on the protocol, you may need to add or remove sections.

Protocol: {protocol}
`
)
const reportWriterAgent = ChatPromptTemplate.fromTemplate(
  `You are an experienced scientific report writer. Given the table of contents for the report, add detailed content for each section.

  To generate the content for each section, use the following -
  - Papers: {papers}
  - Data Files: {dataFiles}
  - Report Outline: {reportOutline}

  The report should be written in a way that is easy to understand and follow.
`
)

async function callAgent(
  state: ReportState,
  agent: ChatPromptTemplate,
  input: Record<string, any>
) {
  const formattedMessages = await agent.formatMessages(input)
  const messages = formattedMessages.map((msg: BaseMessage) => {
    if (msg instanceof HumanMessage) {
      return { role: "human", content: msg.content }
    } else if (msg instanceof AIMessage) {
      return { role: "ai", content: msg.content }
    } else {
      return { role: "system", content: msg.content }
    }
  })
  const response = await llm.invoke(messages.toString())
  return response.content
}

async function finalValidatorAgent(
  state: ReportState
): Promise<ReportOutputType> {
  const prompt = `Review and validate the following report:
  ${state.reportDraft}

  For the following protocol -
  ${state.protocol}


  verify that:
  1. All report sections are filled and flow logically from one to the next.
  2. The entire report is well-represented across all phases
  3. The report is engaging and easy to follow.

  If any section doesn't meet these criteria, provide a final, polished version of each section, maintaining the existing structure.`

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: prompt }],
      response_format: zodResponseFormat(ReportOutput, "scenario_output")
    })

    const reportOutput = completion.choices[0].message.parsed
    if (reportOutput === null) {
      throw new Error("Failed to parse the scenario output")
    }

    return reportOutput
  } catch (error) {
    console.error("Error in finalValidatorAgent:", error)
    throw error
  }
}

// Define the workflow
const workflow = new StateGraph<ReportState>({
  channels: {
    reportOutline: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    reportDraft: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    protocol: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    papers: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    dataFiles: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    finalOutput: {
      value: (left?: ReportOutputType, right?: ReportOutputType) =>
        right ?? left ?? ({} as ReportOutputType),
      default: () => ({}) as ReportOutputType
    }
  }
})
  .addNode("reportOutlineAgent", async (state: ReportState) => {
    const content = await callAgent(state, reportOutlineAgent, {
      protocol: state.protocol
    })
    return { ...state, reportOutline: content }
  })
  .addNode("reportWriterAgent", async (state: ReportState) => {
    const content = await callAgent(state, reportWriterAgent, {
      papers: state.papers.join("\n"),
      dataFiles: state.dataFiles.join("\n"),
      reportOutline: state.reportOutline
    })

    return { ...state, reportDraft: content }
  })
  .addNode("validateReport", async (state: ReportState) => {
    const result = await finalValidatorAgent(state)
    return { ...state, finalOutput: result }
  })
  .addEdge(START, "reportOutlineAgent")
  .addEdge("reportOutlineAgent", "reportWriterAgent")
  .addEdge("reportWriterAgent", "validateReport")
  .addEdge("validateReport", END)

// Compile the graph
const app = workflow.compile()

export async function POST(req: Request) {
  try {
    const { protocol, papers, dataFiles } = await req.json()
    console.log("Received request:", {
      protocol,
      papers,
      dataFiles
    })

    // if (!elevatorPitch || !habitStories || !jobStories) {
    //   return new NextResponse("Missing required fields", { status: 400 })
    // }

    const initialState: ReportState = {
      reportOutline: "",
      reportDraft: "",
      protocol: "",
      papers: [],
      dataFiles: [],
      finalOutput: {} as ReportOutputType
    }

    let finalState: ReportState | undefined

    for await (const event of await app.stream(initialState)) {
      for (const [key, value] of Object.entries(event)) {
        finalState = value as ReportState
        console.log(`Updated state for ${key}:`, finalState)
      }
    }

    if (finalState) {
      console.log("Final state:", finalState)
      return NextResponse.json(finalState.finalOutput)
    }

    return new NextResponse("Failed to generate report", { status: 500 })
  } catch (error) {
    console.error("[REPORT_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
