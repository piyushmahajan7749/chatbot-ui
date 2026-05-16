/**
 * Tool definitions for the Jarvis assistant.
 *
 * These map onto OpenAI function-calling. The chat route receives any
 * tool calls from the model, executes them server-side (or surfaces a
 * client-handled stub), and streams the tool result back into the
 * model so it can keep responding with grounded data.
 *
 * Convention: every tool returns a {ok, message, action?} envelope.
 *  - `message` is what the model sees as the tool's response.
 *  - `action` is a structured payload the client can act on - e.g.
 *    "open this URL" or "create this design". The chat client renders
 *    actions as clickable chips in the chat thread.
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions"

import type { CrossWorkspaceSnapshot } from "./snapshot"
import { jarvisVault } from "./vault"

export type JarvisToolName =
  | "design.start"
  | "report.start"
  | "literature.search"
  | "data.analyse"
  | "vault.recall"
  | "vault.list_recent"

export interface JarvisToolAction {
  type: "navigate" | "open_design_modal" | "open_report_modal"
  /** Relative app URL when type === navigate. */
  href?: string
  /** Pre-fill payload the modal should hydrate with. */
  payload?: Record<string, unknown>
  /** Human-readable label rendered on the action chip. */
  label: string
}

export interface JarvisToolResult {
  ok: boolean
  message: string
  action?: JarvisToolAction
}

/**
 * The OpenAI tool schema bundle. Wired into the chat route's
 * `chat.completions.create({ tools, tool_choice })` call.
 */
export const JARVIS_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "design.start",
      description:
        "Launch the DOE / experiment-design pipeline. Use this when the user clearly wants to start a new experiment design or hypothesis-driven workflow. Captures their research question + optional starting hypothesis so the design page opens pre-filled.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: [
              "from-scratch",
              "from-hypothesis",
              "from-plan",
              "check-stats",
              "make-plan"
            ],
            description:
              "Which entry mode to open. from-scratch = full 5-stage flow starting from a research question; from-hypothesis = skip to experiment design with a stated hypothesis; from-plan = paste an existing procedure; check-stats = statistical review of an existing design; make-plan = generate a dated execution plan for an existing design."
          },
          researchQuestion: {
            type: "string",
            description:
              "The user's stated research question or problem (for from-scratch / from-hypothesis modes). Plain text, 1-2 sentences."
          },
          workspaceId: {
            type: "string",
            description:
              "ID of the workspace to create the design under. Defaults to the user's active workspace - only set when the user explicitly names a different one."
          }
        },
        required: ["mode"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "report.start",
      description:
        "Open the new-report modal so the user can begin drafting a report. Pass a working title and optional project so the modal lands pre-filled.",
      parameters: {
        type: "object",
        properties: {
          workingTitle: {
            type: "string",
            description: "Short title for the report, ≤ 80 chars."
          },
          projectId: {
            type: "string",
            description:
              "Optional ID of the project to file this report under. Leave blank for workspace-level."
          },
          workspaceId: {
            type: "string",
            description:
              "ID of the workspace. Defaults to the user's active workspace."
          }
        },
        required: ["workingTitle"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "literature.search",
      description:
        "Pre-fill the workspace chat input with a literature-search prompt scoped to the user's current designs + reports. The user can hit send to run an actual semantic search across the RAG corpus.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for - one short sentence."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "data.analyse",
      description:
        "Hint that the user wants help analysing data. Routes them to the data-collection / report drafting flow with the data file context. Not a direct compute action - just navigation + intent.",
      parameters: {
        type: "object",
        properties: {
          dataCollectionId: {
            type: "string",
            description:
              "Optional ID of a data collection to open. Leave blank to drop the user on the data-collection index."
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vault.recall",
      description:
        "Retrieve more memory episodes from the user's vault when the existing system-prompt memory doesn't have enough context. Returns up to 5 relevant episodes by semantic similarity to the query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Short topic / phrase to search the vault for - e.g. 'mAb-227 lyo cycle blockers'."
          },
          k: {
            type: "integer",
            description: "Max number of episodes to return (1-10). Default 5.",
            minimum: 1,
            maximum: 10
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vault.list_recent",
      description:
        "List the user's most recently compressed memory episodes - useful when the user asks 'what have we been working on'.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of episodes to return (1-10). Default 5.",
            minimum: 1,
            maximum: 10
          }
        },
        additionalProperties: false
      }
    }
  }
]

interface ToolDispatchContext {
  userId: string
  locale: string
  workspaceId: string | null
  workspaceName: string | null
  snapshot: CrossWorkspaceSnapshot
}

/**
 * Execute a tool call. Most of these are navigation-shaped - they
 * compute a target URL and return it as an action chip. Vault ops
 * actually hit storage and inject the result back into the model.
 */
export async function executeJarvisTool(
  name: JarvisToolName,
  args: Record<string, unknown>,
  ctx: ToolDispatchContext
): Promise<JarvisToolResult> {
  try {
    switch (name) {
      case "design.start": {
        const mode = String(args.mode ?? "from-scratch")
        const q =
          typeof args.researchQuestion === "string"
            ? args.researchQuestion.trim()
            : ""
        const wsId =
          (typeof args.workspaceId === "string" && args.workspaceId) ||
          ctx.workspaceId
        if (!wsId) {
          return {
            ok: false,
            message:
              "No active workspace. Ask the user which workspace to create the design in before calling design.start again."
          }
        }
        const params = new URLSearchParams({ mode })
        if (q) params.set("q", q)
        const href = `/${ctx.locale}/${wsId}/designs/new?${params.toString()}`
        return {
          ok: true,
          message: `Opened the new-design modal in mode=${mode}${q ? ` with question "${q}"` : ""}. The user just needs to confirm + hit Start.`,
          action: {
            type: "navigate",
            href,
            label: q ? `Start design: ${q.slice(0, 60)}` : "Open design flow"
          }
        }
      }

      case "report.start": {
        const title =
          typeof args.workingTitle === "string"
            ? args.workingTitle.trim().slice(0, 80)
            : ""
        const wsId =
          (typeof args.workspaceId === "string" && args.workspaceId) ||
          ctx.workspaceId
        if (!wsId) {
          return {
            ok: false,
            message:
              "No active workspace. Ask the user which workspace to file the report under."
          }
        }
        const params = new URLSearchParams()
        if (title) params.set("title", title)
        if (typeof args.projectId === "string" && args.projectId)
          params.set("projectId", args.projectId)
        const href = `/${ctx.locale}/${wsId}/reports/new${params.size ? `?${params.toString()}` : ""}`
        return {
          ok: true,
          message: `Opened the new-report flow${title ? ` with working title "${title}"` : ""}. The user picks the project + uploads files next.`,
          action: {
            type: "navigate",
            href,
            label: title ? `Draft report: ${title}` : "Draft a new report"
          }
        }
      }

      case "literature.search": {
        const query = typeof args.query === "string" ? args.query.trim() : ""
        const wsId = ctx.workspaceId
        if (!wsId || !query) {
          return {
            ok: false,
            message:
              "Need both an active workspace and a non-empty query to launch literature search."
          }
        }
        const href = `/${ctx.locale}/${wsId}/chat?defaultScope=workspace&seed=${encodeURIComponent(query)}`
        return {
          ok: true,
          message: `Pre-filled a workspace chat with the literature query "${query}". User can hit Send to run it.`,
          action: {
            type: "navigate",
            href,
            label: `Search literature: ${query.slice(0, 50)}`
          }
        }
      }

      case "data.analyse": {
        const wsId = ctx.workspaceId
        if (!wsId) {
          return {
            ok: false,
            message: "No active workspace to open data collection in."
          }
        }
        const dataId =
          typeof args.dataCollectionId === "string"
            ? args.dataCollectionId
            : null
        const href = dataId
          ? `/${ctx.locale}/${wsId}/data-collection/${dataId}`
          : `/${ctx.locale}/${wsId}/data-collection`
        return {
          ok: true,
          message: dataId
            ? `Opened data collection ${dataId}.`
            : "Opened the data-collection index so the user can pick a dataset to analyse.",
          action: {
            type: "navigate",
            href,
            label: dataId ? "Open data collection" : "Pick a data collection"
          }
        }
      }

      case "vault.recall": {
        const query = typeof args.query === "string" ? args.query : ""
        const k = clampInt(args.k, 1, 10, 5)
        const eps = await jarvisVault.searchEpisodes(ctx.userId, query, k)
        if (eps.length === 0) {
          return {
            ok: true,
            message: `No vault episodes matched "${query}".`
          }
        }
        const summary = eps
          .map(ep => {
            const fm = ep.frontmatter
            return `[${ep.createdAt.toISOString().slice(0, 10)}] ${fm.title} - ${fm.topics.join(", ") || "—"}`
          })
          .join("\n")
        return {
          ok: true,
          message: `Recalled ${eps.length} matching episode(s):\n${summary}`
        }
      }

      case "vault.list_recent": {
        const limit = clampInt(args.limit, 1, 10, 5)
        const eps = await jarvisVault.listRecentEpisodes(ctx.userId, limit)
        if (eps.length === 0) {
          return { ok: true, message: "No compressed episodes in vault yet." }
        }
        const summary = eps
          .map(ep => {
            const fm = ep.frontmatter
            return `[${ep.createdAt.toISOString().slice(0, 10)}] ${fm.title} - intent: ${fm.intent}`
          })
          .join("\n")
        return {
          ok: true,
          message: `Most recent ${eps.length} episode(s):\n${summary}`
        }
      }

      default:
        return {
          ok: false,
          message: `Unknown tool: ${name as string}.`
        }
    }
  } catch (e: any) {
    console.warn("[jarvis-tools] executeJarvisTool threw:", e?.message ?? e)
    return {
      ok: false,
      message: `Tool ${name} failed: ${e?.message ?? "unknown error"}`
    }
  }
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n =
    typeof v === "number" ? Math.round(v) : Number.parseInt(String(v), 10)
  if (Number.isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
