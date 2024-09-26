import { StateGraph, END } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages"
import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts"
import { MemorySaver, Annotation } from "@langchain/langgraph"
import { ServerRuntime } from "next"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"

export const runtime: ServerRuntime = "edge"

// Define the graph state
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y)
  }),
  selectedData: Annotation<string>(),
  dataSummary: Annotation<string>(),
  reportOutline: Annotation<string>(),
  validatedOutline: Annotation<string>(),
  current_agent: Annotation<string>()
})

// Initialize language model
const model = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})

// Create prompts for each agent
const dataAnalyzerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are an expert data analyst. Analyze the following data and provide a concise summary:"
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

const outlineWriterPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are an expert report writer. Based on the following data summary, create a detailed report outline:"
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

const validatorPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a report validator. Review the following report outline and ensure it's comprehensive and well-structured:"
  ],
  new MessagesPlaceholder("messages"),
  ["human", "{input}"]
])

// Define the function that determines which agent to call next
function shouldContinue(state: typeof StateAnnotation.State) {
  switch (state.current_agent) {
    case "data_analyzer":
      return "outline_writer"
    case "outline_writer":
      return "validator"
    case "validator":
      return END
    default:
      return END
  }
}

// Define the function that calls the model for each agent
async function callModel(state: typeof StateAnnotation.State) {
  let prompt: ChatPromptTemplate
  let input: string

  switch (state.current_agent) {
    case "data_analyzer":
      prompt = dataAnalyzerPrompt
      input = state.selectedData
      break
    case "outline_writer":
      prompt = outlineWriterPrompt
      input = state.dataSummary
      break
    case "validator":
      prompt = validatorPrompt
      input = state.reportOutline
      break
    default:
      throw new Error("Invalid agent")
  }

  const response = await model.invoke(
    await prompt.formatMessages({
      messages: state.messages,
      input
    })
  )

  const newState: Partial<typeof StateAnnotation.State> = {
    messages: [response]
  }

  switch (state.current_agent) {
    case "data_analyzer":
      newState.dataSummary = response.content as string
      newState.current_agent = "outline_writer"
      break
    case "outline_writer":
      newState.reportOutline = response.content as string
      newState.current_agent = "validator"
      break
    case "validator":
      newState.validatedOutline = response.content as string
      newState.current_agent = "human"
      break
  }

  return newState
}

// Create the graph
const workflow = new StateGraph(StateAnnotation)
  .addNode("agent", callModel)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue)

// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver()

// Compile the graph
const app = workflow.compile({ checkpointer })

export async function POST(request: Request) {
  try {
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")

    const { selectedData } = await request.json()

    const initialState: typeof StateAnnotation.State = {
      messages: [],
      selectedData,
      dataSummary: "",
      reportOutline: "",
      validatedOutline: "",
      current_agent: "data_analyzer"
    }

    // Generate a unique thread_id for this request
    const thread_id = `report_outline_${Date.now()}`

    const finalState = await app.invoke(initialState, {
      configurable: { thread_id }
    })

    if (finalState.validatedOutline) {
      return new Response(
        JSON.stringify({ outline: finalState.validatedOutline }),
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
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
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
