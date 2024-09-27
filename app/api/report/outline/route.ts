import { StateGraph, END } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import { BaseMessage, MessageContent } from "@langchain/core/messages"
import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts"
import { MemorySaver, Annotation } from "@langchain/langgraph"
import { ServerRuntime } from "next"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { decode, encode } from "gpt-tokenizer"

export const runtime: ServerRuntime = "edge"

// Update StateAnnotation to include new fields
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y)
  }),
  userPrompt: Annotation<string>(),
  protocol: Annotation<string>(),
  papers: Annotation<string[]>(),
  dataFiles: Annotation<string[]>(),
  processAgentInput: Annotation<string>(),
  visualizationAgentInput: Annotation<string[]>(),
  searcherAgentInput: Annotation<{ papers: string[]; reportOutline: string }>(),
  codeAgentInput: Annotation<string>(),
  reportAgentInput: Annotation<string>(),
  qualityReviewAgentInput: Annotation<string>(),
  reportOutline: Annotation<string>(),
  qualityReview: Annotation<string>(),
  needsRevision: Annotation<boolean>(),
  sender: Annotation<string>(),
  current_agent: Annotation<string>(),
  processDecision: Annotation<string>(),
  visualizationState: Annotation<string>(),
  searcherState: Annotation<string>(),
  codeState: Annotation<string>()
})

// Initialize language model
const model = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})

// Update prompts for each agent

const processAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a research supervisor overseeing the entire research process. Create a report outline based on the provided protocol and user prompt."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Protocol: {protocol}\n\nUser Prompt: {userPrompt}\n\nCreate a report outline based on this information."
  ]
])

const visualizationAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a data visualization expert. Create insightful charts and graphs based on the data files provided."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Data Files: {visualizationAgentInput}\n\nCreate visualizations based on these data files."
  ]
])

const searcherAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a literature search expert. Conduct a literature search based on the provided papers (if any) and the current report outline."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Papers: {papers}\n\nCurrent Report Outline: {reportOutline}\n\nConduct a literature search and provide relevant information. If no papers are provided, focus on the report outline and suggest relevant areas for literature search."
  ]
])

const codeAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a skilled coder. Write data analysis code to process the data files and assist in generating results for the lab experiments."
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

const reportAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are an experienced report writer. Write the research report, including a table of contents and detailed content for each section."
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

const qualityReviewAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a quality reviewer. Perform a quality review of the report and provide feedback."
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

const noteAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a note-taker who records the research process. Summarize the key points and decisions made so far."
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

// Update the function that determines which agent to call next
function shouldContinue(state: typeof StateAnnotation.State) {
  switch (state.current_agent) {
    case "process_agent":
      return state.processDecision || "quality_review_agent"
    case "visualization_agent":
    case "searcher_agent":
    case "code_agent":
    case "report_agent":
      return "quality_review_agent"
    case "quality_review_agent":
      return state.needsRevision ? state.sender : "note_agent"
    case "note_agent":
      return "process_agent"
    default:
      return END
  }
}

// Update the function that calls the model for each agent
async function callModel(state: typeof StateAnnotation.State) {
  let prompt: ChatPromptTemplate
  let input: Record<string, any> = {}
  let newState: Partial<typeof StateAnnotation.State> = {}

  switch (state.current_agent) {
    case "process_agent":
      prompt = processAgentPrompt
      input = { protocol: state.protocol, userPrompt: state.userPrompt }
      break
    case "visualization_agent":
      prompt = visualizationAgentPrompt
      input = { dataFiles: state.dataFiles }
      break
    case "searcher_agent":
      prompt = searcherAgentPrompt
      input = {
        papers: state.searcherAgentInput?.papers || "No papers provided",
        reportOutline:
          state.searcherAgentInput?.reportOutline || "No outline available"
      }
      break
    case "code_agent":
      prompt = codeAgentPrompt
      input = { input: state.codeAgentInput }
      break
    case "report_agent":
      prompt = reportAgentPrompt
      input = { input: state.reportAgentInput }
      break
    case "quality_review_agent":
      prompt = qualityReviewAgentPrompt
      input = { input: state.qualityReviewAgentInput }
      break
    default:
      throw new Error("Invalid agent")
  }

  // Truncate input if necessary
  const maxTokens = 120000 // Leave some room for the model's response
  for (const key in input) {
    if (typeof input[key] === "string") {
      input[key] = truncateInput(input[key], maxTokens)
    } else if (Array.isArray(input[key])) {
      input[key] = input[key].map((item: string) =>
        truncateInput(item, maxTokens / input[key].length)
      )
    }
  }

  const response = await model.invoke(
    await prompt.formatMessages({
      messages: state.messages,
      ...input
    })
  )

  newState.messages = (state.messages || []).concat([response])
  newState.sender = state.current_agent

  // Helper function to safely extract string content
  const getStringContent = (content: MessageContent): string => {
    if (typeof content === "string") {
      return content
    } else if (Array.isArray(content)) {
      return content
        .map(item => (typeof item === "string" ? item : JSON.stringify(item)))
        .join(" ")
    }
    return JSON.stringify(content)
  }

  const stringContent = getStringContent(response.content)

  switch (state.current_agent) {
    case "process_agent":
      newState.reportOutline = stringContent
      newState.processDecision = extractProcessDecision(stringContent)
      newState.current_agent = newState.processDecision
      break
    case "visualization_agent":
      newState.visualizationState = stringContent
      newState.current_agent = "quality_review_agent"
      break
    case "searcher_agent":
      newState.searcherState = stringContent
      newState.current_agent = "quality_review_agent"
      break
    case "code_agent":
      newState.codeState = stringContent
      newState.current_agent = "quality_review_agent"
      break
    case "report_agent":
      newState.reportOutline = stringContent
      newState.current_agent = "quality_review_agent"
      break
    case "quality_review_agent":
      newState.qualityReview = stringContent
      newState.needsRevision = stringContent.toLowerCase().includes("revision")
      newState.current_agent = newState.needsRevision
        ? state.sender
        : "process_agent"
      break
    default:
      newState.current_agent = END
      break
  }

  return newState
}

// Function to extract process decision from process_agent's response
function extractProcessDecision(content: string): string {
  // Implement logic to extract the next agent from the content
  if (content.includes("visualization")) {
    return "visualization_agent"
  } else if (content.includes("code")) {
    return "code_agent"
  } else if (content.includes("searcher")) {
    return "searcher_agent"
  } else if (content.includes("report")) {
    return "report_agent"
  } else {
    return "quality_review_agent"
  }
}

// Function to truncate input if it's too long
function truncateInput(input: string, maxTokens: number): string {
  const tokens = encode(input)
  if (tokens.length <= maxTokens) {
    return input
  }
  return decode(tokens.slice(0, maxTokens))
}

// Update the workflow
const workflow = new StateGraph(StateAnnotation)
  .addNode("process_agent", callModel)
  .addNode("visualization_agent", callModel)
  .addNode("searcher_agent", callModel)
  .addNode("code_agent", callModel)
  .addNode("report_agent", callModel)
  .addNode("quality_review_agent", callModel)
  .addNode("note_agent", callModel)
  .addEdge("__start__", "process_agent")
  .addConditionalEdges("process_agent", shouldContinue)
  .addConditionalEdges("visualization_agent", shouldContinue)
  .addConditionalEdges("searcher_agent", shouldContinue)
  .addConditionalEdges("code_agent", shouldContinue)
  .addConditionalEdges("report_agent", shouldContinue)
  .addConditionalEdges("quality_review_agent", shouldContinue)
  .addConditionalEdges("note_agent", shouldContinue)

// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver()

// Compile the graph
const app = workflow.compile({ checkpointer })

export async function POST(request: Request) {
  try {
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")

    const body = await request.json()
    console.log("Received request body:", body)

    const { userPrompt, protocol, papers, dataFiles } = body

    if (!userPrompt || !protocol) {
      throw new Error("Missing required fields: userPrompt or protocol")
    }

    const initialState: typeof StateAnnotation.State = {
      messages: [],
      userPrompt,
      protocol,
      papers,
      dataFiles,
      visualizationAgentInput: dataFiles,
      searcherAgentInput: {
        papers: papers || [],
        reportOutline: ""
      },
      codeAgentInput: "",
      reportAgentInput: "",
      qualityReviewAgentInput: "",
      reportOutline: "",
      qualityReview: "",
      needsRevision: false,
      sender: "",
      processAgentInput: "",
      processDecision: "",
      visualizationState: "",
      searcherState: "",
      codeState: "",
      current_agent: "process_agent"
    }

    // Generate a unique thread_id for this request
    const thread_id = `report_outline_${Date.now()}`

    console.log("Invoking app with initial state:", initialState)
    const finalState = await app.invoke(initialState, {
      configurable: { thread_id }
    })
    console.log("Final state:", finalState)

    if (finalState.reportOutline) {
      return new Response(
        JSON.stringify({ outline: finalState.reportOutline }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    return new Response(
      JSON.stringify({ message: "Failed to generate report outline" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  } catch (error: any) {
    console.error("Error in POST /api/report/outline:", error)
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
