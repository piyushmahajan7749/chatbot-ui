import { StateGraph, END, START } from "@langchain/langgraph"
import { NextResponse } from "next/server"
import { ExperimentDesignState } from "./types"
import {
  callLiteratureScoutAgent,
  callHypothesisBuilderAgent,
  callExperimentDesignerAgent,
  callStatCheckAgent,
  callReportWriterAgent
} from "./agents"

// Set up environment variables for external APIs
process.env.GOOGLE_SCHOLAR_API_KEY = process.env.SERPAPI_API_KEY

// Define the new workflow
const workflow = new StateGraph<ExperimentDesignState>({
  channels: {
    problem: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    objectives: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    variables: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    specialConsiderations: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    literatureScoutOutput: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    },
    hypothesisBuilderOutput: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    },
    experimentDesignerOutput: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    },
    statCheckOutput: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    },
    reportWriterOutput: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    },
    searchResults: {
      value: (left?: any, right?: any) => right ?? left,
      default: () => undefined
    }
  }
})
  .addNode("designPlannerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running designPlannerAgent node")
      // Design Planner is the orchestrator - it just passes through the initial state
      console.log("✅ [WORKFLOW] designPlannerAgent node completed")
      return state
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in designPlannerAgent node:", error)
      throw error
    }
  })
  .addNode("literatureScoutAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running literatureScoutAgent node")
      const result = await callLiteratureScoutAgent(state)
      console.log("✅ [WORKFLOW] literatureScoutAgent node completed")
      return {
        ...state,
        literatureScoutOutput: result,
        searchResults: state.searchResults
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in literatureScoutAgent node:", error)
      throw error
    }
  })
  .addNode("hypothesisBuilderAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running hypothesisBuilderAgent node")
      const result = await callHypothesisBuilderAgent(state)
      console.log("✅ [WORKFLOW] hypothesisBuilderAgent node completed")
      return {
        ...state,
        hypothesisBuilderOutput: result
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error(
        "❌ [WORKFLOW] Error in hypothesisBuilderAgent node:",
        error
      )
      throw error
    }
  })
  .addNode("experimentDesignerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running experimentDesignerAgent node")
      const result = await callExperimentDesignerAgent(state)
      console.log("✅ [WORKFLOW] experimentDesignerAgent node completed")
      return {
        ...state,
        experimentDesignerOutput: result
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error(
        "❌ [WORKFLOW] Error in experimentDesignerAgent node:",
        error
      )
      throw error
    }
  })
  .addNode("statCheckAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running statCheckAgent node")
      const result = await callStatCheckAgent(state)
      console.log("✅ [WORKFLOW] statCheckAgent node completed")
      return {
        ...state,
        statCheckOutput: result
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in statCheckAgent node:", error)
      throw error
    }
  })
  .addNode("reportWriterAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running reportWriterAgent node")
      const result = await callReportWriterAgent(state)
      console.log("✅ [WORKFLOW] reportWriterAgent node completed")
      return {
        ...state,
        reportWriterOutput: result
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in reportWriterAgent node:", error)
      throw error
    }
  })
  .addEdge(START, "designPlannerAgent")
  .addEdge("designPlannerAgent", "literatureScoutAgent")
  .addEdge("literatureScoutAgent", "hypothesisBuilderAgent")
  .addEdge("hypothesisBuilderAgent", "experimentDesignerAgent")
  .addEdge("experimentDesignerAgent", "statCheckAgent")
  .addEdge("statCheckAgent", "reportWriterAgent")
  .addEdge("reportWriterAgent", END)

export async function POST(req: Request) {
  const requestStartTime = Date.now()
  console.log("\n" + "=".repeat(100))
  console.log("🚀 [DESIGN_DRAFT_API] New Request Received")
  console.log("=".repeat(100))

  try {
    const requestData = await req.json()
    console.log("📥 [DESIGN_DRAFT_REQUEST] Request Data:")
    console.log("  📋 Raw Request:", JSON.stringify(requestData, null, 2))

    const { problem, objectives, variables, specialConsiderations } =
      requestData

    // Add detailed validation logging
    console.log("\n🔍 [DESIGN_DRAFT_VALIDATION] Field Validation:")
    console.log(
      "  📋 Problem:",
      problem ? "✅ Present" : "❌ Missing",
      `(${problem?.length || 0} chars)`
    )
    console.log(
      "  🎯 Objectives:",
      Array.isArray(objectives)
        ? `✅ Array with ${objectives.length} items`
        : "❌ Not an array"
    )
    console.log(
      "  🔬 Variables:",
      Array.isArray(variables)
        ? `✅ Array with ${variables.length} items`
        : "❌ Not an array"
    )
    console.log(
      "  ⚠️  Special Considerations:",
      Array.isArray(specialConsiderations)
        ? `✅ Array with ${specialConsiderations.length} items`
        : "❌ Not an array"
    )

    if (objectives?.length > 0) {
      console.log(
        "    📝 Objectives List:",
        JSON.stringify(objectives, null, 4)
      )
    }
    if (variables?.length > 0) {
      console.log("    📝 Variables List:", JSON.stringify(variables, null, 4))
    }
    if (specialConsiderations?.length > 0) {
      console.log(
        "    📝 Special Considerations List:",
        JSON.stringify(specialConsiderations, null, 4)
      )
    }

    // Validate that required data is present
    if (!problem) {
      console.error("❌ [DESIGN_DRAFT] No problem provided")
      return NextResponse.json(
        { success: false, error: "Problem is required" },
        { status: 400 }
      )
    }

    console.log("\n🔧 [DESIGN_DRAFT_STATE] Creating Initial State")
    const initialState: ExperimentDesignState = {
      problem: problem || "",
      objectives: Array.isArray(objectives) ? objectives : [],
      variables: Array.isArray(variables) ? variables : [],
      specialConsiderations: Array.isArray(specialConsiderations)
        ? specialConsiderations
        : []
    }

    console.log("📋 [DESIGN_DRAFT_STATE] Initial State Summary:")
    console.log(
      "  📋 Problem Length:",
      initialState.problem.length,
      "characters"
    )
    console.log("  🎯 Objectives Count:", initialState.objectives?.length || 0)
    console.log("  🔬 Variables Count:", initialState.variables?.length || 0)
    console.log(
      "  ⚠️  Special Considerations Count:",
      initialState.specialConsiderations?.length || 0
    )

    const workflowStartTime = Date.now()
    console.log(
      "\n🔄 [DESIGN_DRAFT_WORKFLOW] Starting 6-Agent Sequential Workflow"
    )
    console.log("📊 [DESIGN_DRAFT_WORKFLOW] Workflow Order:")
    console.log("  1️⃣  Design Planner Agent (Orchestrator)")
    console.log("  2️⃣  Literature Scout Agent (Research & Analysis)")
    console.log("  3️⃣  Hypothesis Builder Agent (Hypothesis Generation)")
    console.log("  4️⃣  Experiment Designer Agent (Lab-Ready Design)")
    console.log("  5️⃣  Stat Check Agent (Statistical Review)")
    console.log("  6️⃣  Report Writer Agent (Final Synthesis)")

    let finalState: ExperimentDesignState | undefined
    let completedAgents = 0

    try {
      for await (const event of await app.stream(initialState)) {
        for (const [key, value] of Object.entries(event)) {
          completedAgents++
          const agentTime = Date.now() - workflowStartTime
          console.log(
            `\n✅ [DESIGN_DRAFT_WORKFLOW] Agent ${completedAgents}/6 Completed: ${key}`
          )
          console.log(
            `⏱️  [DESIGN_DRAFT_WORKFLOW] Cumulative Time: ${agentTime}ms`
          )
          finalState = value as ExperimentDesignState
        }
      }
    } catch (error) {
      const failureTime = Date.now() - workflowStartTime
      console.error(
        `❌ [DESIGN_DRAFT_WORKFLOW] Workflow failed after ${failureTime}ms at agent ${completedAgents + 1}/6:`,
        error
      )
      throw error
    }

    if (finalState) {
      const totalRequestTime = Date.now() - requestStartTime
      const workflowTime = Date.now() - workflowStartTime

      console.log(
        "\n🏁 [DESIGN_DRAFT_SUCCESS] Workflow Completed Successfully!"
      )
      console.log("📊 [DESIGN_DRAFT_METRICS] Execution Metrics:")
      console.log("  ⏱️  Total Request Time:", totalRequestTime, "ms")
      console.log("  🔄 Workflow Execution Time:", workflowTime, "ms")
      console.log("  📋 Final State Components:")
      console.log(
        "    📚 Literature Scout:",
        finalState.literatureScoutOutput ? "✅" : "❌"
      )
      console.log(
        "    💡 Hypothesis Builder:",
        finalState.hypothesisBuilderOutput ? "✅" : "❌"
      )
      console.log(
        "    🧪 Experiment Designer:",
        finalState.experimentDesignerOutput ? "✅" : "❌"
      )
      console.log(
        "    📊 Stat Check:",
        finalState.statCheckOutput ? "✅" : "❌"
      )
      console.log(
        "    📝 Report Writer:",
        finalState.reportWriterOutput ? "✅" : "❌"
      )
      console.log(
        "    🌐 Search Results:",
        finalState.searchResults ? "✅" : "❌"
      )

      const responsePayload = {
        success: true,
        reportWriterOutput: finalState.reportWriterOutput,
        // Include all agent outputs for debugging/reference
        agentOutputs: {
          literatureScoutOutput: finalState.literatureScoutOutput,
          hypothesisBuilderOutput: finalState.hypothesisBuilderOutput,
          experimentDesignerOutput: finalState.experimentDesignerOutput,
          statCheckOutput: finalState.statCheckOutput,
          reportWriterOutput: finalState.reportWriterOutput
        },
        searchResults: finalState.searchResults
      }

      console.log("\n📤 [DESIGN_DRAFT_RESPONSE] Response Summary:")
      console.log(
        "  📊 Response Size:",
        JSON.stringify(responsePayload).length,
        "characters"
      )
      console.log(
        "  🔑 Response Keys:",
        Object.keys(responsePayload).join(", ")
      )
      console.log("=".repeat(100))

      return NextResponse.json(responsePayload)
    }

    const totalRequestTime = Date.now() - requestStartTime
    console.error(
      `❌ [DESIGN_DRAFT_ERROR] No final state produced after ${totalRequestTime}ms`
    )
    console.log("=".repeat(100))
    return new NextResponse("Failed to generate experiment design", {
      status: 500
    })
  } catch (error) {
    const totalRequestTime = Date.now() - requestStartTime
    console.error(
      `❌ [DESIGN_DRAFT_ERROR] Request failed after ${totalRequestTime}ms:`,
      error
    )
    console.log("=".repeat(100))
    return new NextResponse("Internal Error", { status: 500 })
  }
}

const app = workflow.compile()

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
