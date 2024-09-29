import { StateGraph, END } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts"
import { retrieveRelevantContent } from "./retrieval"
import { MemorySaver, Annotation } from "@langchain/langgraph"

type AgentType =
  | "router"
  | "outline_agent"
  | "content_agent"
  | "review_agent"
  | "finalize_agent"

// Define the state type
const StateAnnotation = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y)
  }),
  userPrompt: Annotation<string>(),
  protocol: Annotation<string>(),
  papers: Annotation<string[]>(),
  dataFiles: Annotation<string[]>(),
  reportOutline: Annotation<string>(),
  reportContent: Annotation<string>(),
  qualityReview: Annotation<string>(),
  needsRevision: Annotation<boolean>(),
  current_agent: Annotation<AgentType>(),
  processDecision: Annotation<AgentType>()
})

// Initialize the model
const model = new ChatOpenAI({
  modelName: "gpt-4-turbo-preview",
  temperature: 0.7
})

// Define prompts for each agent
const routerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a router that decides which agent should handle the current task in the report generation process."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Based on the current state and user prompt, which agent should handle the next step? Options are: outline_agent, content_agent, review_agent, or finalize_agent."
  ]
])

const outlineAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are an outline creator. Generate a detailed outline for the report based on the protocol, papers, and data files."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Create a detailed outline for the report using the following information:\n\nProtocol: {protocol}\n\nPapers: {papers}\n\nData Files: {dataFiles}\n\nUser Prompt: {userPrompt}"
  ]
])

const contentAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a content writer. Write detailed content for each section of the report outline."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Write detailed content for the following report outline:\n\n{reportOutline}\n\nUse the following information:\n\nProtocol: {protocol}\n\nPapers: {papers}\n\nData Files: {dataFiles}"
  ]
])

const reviewAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a quality reviewer. Review the report content and provide feedback for improvements."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Review the following report content and provide feedback for improvements:\n\n{reportContent}"
  ]
])

const finalizeAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a report finalizer. Make final adjustments to the report based on the review feedback."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Finalize the report based on the following review feedback:\n\n{qualityReview}\n\nCurrent report content:\n\n{reportContent}"
  ]
])

// Function to determine which agent to call next
function routeNext(state: typeof StateAnnotation.State) {
  switch (state.current_agent) {
    case "router":
      return state.processDecision
    case "outline_agent":
    case "content_agent":
    case "review_agent":
      return "router"
    case "finalize_agent":
      return END
    default:
      return "router"
  }
}

// Function to call the appropriate agent
async function callAgent(state: typeof StateAnnotation.State) {
  let prompt: any
  let input: any = {}
  const newState = { ...state }

  switch (state.current_agent) {
    case "router":
      prompt = routerPrompt
      input = { messages: state.messages }
      break
    case "outline_agent":
      prompt = outlineAgentPrompt
      input = {
        protocol: state.protocol,
        papers: state.papers,
        dataFiles: state.dataFiles,
        userPrompt: state.userPrompt
      }
      break
    case "content_agent":
      prompt = contentAgentPrompt
      input = {
        reportOutline: state.reportOutline,
        protocol: state.protocol,
        papers: state.papers,
        dataFiles: state.dataFiles
      }
      break
    case "review_agent":
      prompt = reviewAgentPrompt
      input = { reportContent: state.reportContent }
      break
    case "finalize_agent":
      prompt = finalizeAgentPrompt
      input = {
        qualityReview: state.qualityReview,
        reportContent: state.reportContent
      }
      break
    default:
      throw new Error("Invalid agent")
  }

  const response = await model.invoke(
    await prompt.formatMessages({
      messages: state.messages,
      ...input
    })
  )

  newState.messages = [...(state.messages || []), response]

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content)

  switch (state.current_agent) {
    case "router":
      newState.processDecision = content.toLowerCase().includes("outline")
        ? "outline_agent"
        : content.toLowerCase().includes("content")
          ? "content_agent"
          : content.toLowerCase().includes("review")
            ? "review_agent"
            : "finalize_agent"
      break
    case "outline_agent":
      newState.reportOutline = content
      break
    case "content_agent":
      newState.reportContent = content
      break
    case "review_agent":
      newState.qualityReview = content
      newState.needsRevision = content
        .toLowerCase()
        .includes("revision needed") as boolean
      break
    case "finalize_agent":
      newState.reportContent = content
      break
  }

  newState.current_agent = "router"
  return newState
}

// Create the workflow
const workflow = new StateGraph(StateAnnotation)
  .addNode("router", callAgent)
  .addNode("outline_agent", callAgent)
  .addNode("content_agent", callAgent)
  .addNode("review_agent", callAgent)
  .addNode("finalize_agent", callAgent)
  .addEdge("__start__", "router")
  .addEdge("router", routeNext as any)
  .addEdge("outline_agent", routeNext as any)
  .addEdge("content_agent", routeNext as any)
  .addEdge("review_agent", routeNext as any)
  .addEdge("finalize_agent", routeNext as any)

// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver()

// Compile the graph
const app = workflow.compile({ checkpointer })

// POST function for the new route
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Received request body:", body)

    let { userPrompt, protocol, papers, dataFiles } = body as {
      userPrompt: string
      protocol: string
      papers: string[]
      dataFiles: string[]
    }

    if (!userPrompt || !protocol) {
      throw new Error("Missing required fields: userPrompt or protocol")
    }

    console.log("File IDs:", { protocol, papers, dataFiles })

    // Retrieve and summarize relevant content
    const retrieveAndSummarize = async (ids: string[], maxTokens: number) => {
      const chunks = await retrieveRelevantContent(userPrompt, ids, "openai", 3)
      const content = chunks.map(chunk => chunk.content).join("\n")
      return content
    }

    const summarizedProtocol = await retrieveAndSummarize([protocol], 1000)
    const summarizedPapers = await retrieveAndSummarize(papers, 1000)
    const summarizedDataFiles = await retrieveAndSummarize(dataFiles, 1000)

    const initialState: typeof StateAnnotation.State = {
      messages: [] as any,
      userPrompt: userPrompt as any,
      protocol: summarizedProtocol as any,
      papers: [summarizedPapers] as any,
      dataFiles: [summarizedDataFiles] as any,
      reportOutline: "" as any,
      reportContent: "" as any,
      qualityReview: "" as any,
      needsRevision: false as any,
      current_agent: "router" as any,
      processDecision: "" as any
    }

    const thread_id = `report_generate_${Date.now()}`

    console.log("Invoking app with initial state:", initialState)
    const finalState = await app.invoke(initialState, {
      configurable: { thread_id }
    })
    console.log("Final state:", finalState)

    if (finalState.reportContent) {
      return new Response(
        JSON.stringify({ report: finalState.reportContent }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    return new Response(
      JSON.stringify({ message: "Failed to generate report" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  } catch (error: any) {
    console.error("Error in POST /api/report/generate:", error)
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.includes("maximum context length")) {
      errorMessage =
        "The input is too long. Please reduce the length of the protocol, papers, or data files."
    } else if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
      headers: { "Content-Type": "application/json" }
    })
  }
}
