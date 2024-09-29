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
import { encode, decode } from "gpt-tokenizer"
import { retrieveRelevantContent } from "./retrieval"
import { createClient } from "@supabase/supabase-js"

export const runtime: ServerRuntime = "edge"

// Initialize language model
const model = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})

// Function to summarize long texts
async function summarizeText(
  text: string,
  maxTokens: number = 1000
): Promise<string> {
  const encodedText = encode(text)
  if (encodedText.length <= maxTokens) {
    return text
  }

  const summaryPrompt = ChatPromptTemplate.fromMessages([
    ["system", "You are an assistant that summarizes texts concisely."],
    [
      "human",
      "Please summarize the following text in about {maxTokens} tokens:\n\n{text}"
    ]
  ])

  // const summaryResponse = await model
  //   .invoke
  //   // await summaryPrompt.formatMessages({
  //   //   text: decode(encodedText.slice(0, maxTokens * 2)), // Truncate to double the maxTokens
  //   //   maxTokens
  //   // })
  //   ()

  // return summaryResponse.content.toString().trim()
  return text
}

function truncateInput(input: string, maxTokens: number): string {
  const tokens = encode(input)
  if (tokens.length <= maxTokens) {
    return input
  }
  const truncatedTokens = tokens.slice(0, maxTokens)
  return decode(truncatedTokens)
}

// Function to summarize file content (assuming you have a way to read file content)
async function summarizeFile(
  fileName: string,
  maxTokens: number = 1000
): Promise<string> {
  // Here you would implement logic to read the file content
  // For now, we'll just return the file name as a placeholder
  return `Summary of ${fileName} (implement file reading and summarization)`
}

// Update StateAnnotation
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

// Update prompts for each agent

const processAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a research supervisor overseeing the entire research process. Create a report outline based on the provided protocol excerpts and user prompt."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Protocol Excerpts:\n{protocol}\n\nUser Prompt:\n{userPrompt}\n\nCreate a report outline based on this information."
  ]
])

const visualizationAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a data visualization expert. Use the provided data file excerpts to create insightful charts and graphs."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Data File Excerpts:\n{dataFiles}\n\nCreate visualizations based on these data files."
  ]
])
const searcherAgentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a literature search expert. Use the provided paper excerpts and the current report outline to enhance the report."
  ],
  new MessagesPlaceholder("messages"),
  [
    "human",
    "Paper Excerpts:\n{papers}\n\nCurrent Report Outline:\n{reportOutline}\n\nIncorporate relevant information from the papers into the report."
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

async function summarizeOrTruncateInput(
  inputText: string,
  maxTokens: number
): Promise<string> {
  const encodedText = encode(inputText)
  if (encodedText.length <= maxTokens) {
    return inputText
  } else if (maxTokens <= 0) {
    return ""
  } else {
    // Summarize the text
    return await summarizeText(inputText, maxTokens)
  }
}

// Update the function that calls the model for each agent
async function callModel(state: typeof StateAnnotation.State) {
  let prompt: ChatPromptTemplate
  let input: Record<string, any> = {}
  let newState: Partial<typeof StateAnnotation.State> = {}
  const MAX_TOTAL_TOKENS = 128000 // Adjust based on model's limit and desired buffer

  const totalTokens =
    encode(input.protocol || "").length +
    encode(input.userPrompt || "").length +
    encode(JSON.stringify(state.messages || "")).length +
    encode(JSON.stringify(input.dataFiles || "")).length +
    encode(JSON.stringify(input.visualizationAgentInput || "")).length +
    encode(JSON.stringify(input.papers || "")).length +
    encode(JSON.stringify(input.searcherAgentInput || "")).length +
    encode(input.visualizationState || "").length +
    encode(input.searcherState || "").length +
    encode(input.codeState || "").length

  if (totalTokens > MAX_TOTAL_TOKENS) {
    console.warn("Total tokens exceed limit, truncating inputs...")
    interface Inputs {
      [key: string]: string
    }

    const inputs: Inputs = {
      protocol: input.protocol || "",
      userPrompt: input.userPrompt || "",
      dataFiles: (input.dataFiles || []).join(" "),
      visualizationAgentInput: (input.visualizationAgentInput || []).join(" "),
      papers: (input.papers || []).join(" "),
      searcherAgentInput: JSON.stringify(input.searcherAgentInput || ""),
      visualizationState: input.visualizationState || "",
      searcherState: input.searcherState || "",
      codeState: input.codeState || ""
    }

    // Recalculate total tokens
    let totalTokens = 0
    const tokenCounts: { [key: string]: number } = {}
    for (const key of Object.keys(inputs)) {
      tokenCounts[key] = encode(inputs[key]).length
      totalTokens += tokenCounts[key]
    }

    // Calculate proportional max tokens for each input
    const tokensRatio = MAX_TOTAL_TOKENS / totalTokens
    const maxTokensPerInput: { [key: string]: number } = {}
    for (const key of Object.keys(inputs)) {
      maxTokensPerInput[key] = Math.floor(tokenCounts[key] * tokensRatio)
    }

    // Summarize or truncate inputs
    for (const key of Object.keys(inputs)) {
      inputs[key] = await summarizeOrTruncateInput(
        inputs[key],
        maxTokensPerInput[key]
      )
    }
    input.protocol = inputs.protocol
    input.userPrompt = inputs.userPrompt
    input.dataFiles = inputs.dataFiles ? [inputs.dataFiles] : []
    input.visualizationAgentInput = inputs.visualizationAgentInput
      ? [inputs.visualizationAgentInput]
      : []
    input.papers = inputs.papers ? [inputs.papers] : []
    input.searcherAgentInput = inputs.searcherAgentInput
      ? JSON.parse(inputs.searcherAgentInput)
      : {}
    input.visualizationState = inputs.visualizationState
    input.searcherState = inputs.searcherState
    input.codeState = inputs.codeState
  }

  switch (state.current_agent) {
    case "process_agent":
      prompt = processAgentPrompt
      input = {
        protocol: state.protocol,
        userPrompt: state.userPrompt
      }
      break
    case "visualization_agent":
      prompt = visualizationAgentPrompt
      input = {
        dataFiles: state.visualizationAgentInput.join("\n")
      }
      break
    case "searcher_agent":
      prompt = searcherAgentPrompt
      input = {
        papers: state.searcherAgentInput.papers.join("\n"),
        reportOutline: state.searcherAgentInput.reportOutline
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

  // const response = await model.invoke(
  //   await prompt.formatMessages({
  //     messages: state.messages,
  //     ...input
  //   })
  // )

  newState.messages = (state.messages || []).concat([])
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

  const stringContent = getStringContent("")

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

// Update the POST function
export async function POST(request: Request) {
  try {
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")

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

    // Retrieve relevant content
    const protocolChunks = await retrieveRelevantContent(
      userPrompt,
      [protocol],
      "openai",
      3
    )
    const papersChunks = await retrieveRelevantContent(
      userPrompt,
      papers,
      "openai",
      3
    )
    const dataFilesChunks = await retrieveRelevantContent(
      userPrompt,
      dataFiles,
      "openai",
      3
    )

    console.log("Retrieved chunks:", {
      protocolChunks: protocolChunks.length,
      papersChunks: papersChunks.length,
      dataFilesChunks: dataFilesChunks.length
    })

    // Concatenate and summarize the content
    const protocolContent = protocolChunks
      .map(chunk => chunk.content)
      .join("\n")
    const papersContent = papersChunks.map(chunk => chunk.content).join("\n")
    const dataFilesContent = dataFilesChunks
      .map(chunk => chunk.content)
      .join("\n")

    // Summarize the contents
    const summarizedProtocol = await summarizeText(protocolContent, 1000)
    const summarizedPapers = await summarizeText(papersContent, 1000)
    const summarizedDataFiles = await summarizeText(dataFilesContent, 1000)

    const initialState: typeof StateAnnotation.State = {
      messages: [],
      userPrompt,
      protocol: summarizedProtocol,
      papers: [summarizedPapers],
      dataFiles: [summarizedDataFiles],
      processAgentInput: "",
      visualizationAgentInput: [summarizedDataFiles],
      searcherAgentInput: {
        papers: [summarizedPapers],
        reportOutline: ""
      },
      codeAgentInput: "",
      reportAgentInput: "",
      qualityReviewAgentInput: "",
      reportOutline: "",
      qualityReview: "",
      needsRevision: false,
      sender: "",
      current_agent: "process_agent",
      processDecision: "",
      visualizationState: "",
      searcherState: "",
      codeState: ""
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
