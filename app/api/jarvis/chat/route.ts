/**
 * Streaming chat endpoint for the dashboard Jarvis-style assistant.
 *
 * Flow per request:
 *   1. Auth + load profile.
 *   2. Pull memory: top-3 recent episodes + top-3 semantic matches
 *      against the user's latest message. Best-effort - vault errors
 *      degrade to "no memory" rather than 500ing.
 *   3. Stitch a workspace-context snapshot (counts of designs / reports
 *      / chats, recent design names) so the assistant has live
 *      project state, not just compressed memory.
 *   4. Build the system prompt, stream the reply token-by-token.
 *
 * Tool calls are intentionally NOT wired here yet - the chips on the
 * hero just pre-fill the input. When we're ready to let the agent
 * invoke the DOE / Report agents, we add OpenAI tool-use blocks +
 * route the tool ids back into the existing /api/design/draft and
 * /api/report/outline endpoints.
 */

import { cookies } from "next/headers"
import { NextRequest } from "next/server"

import {
  getAzureOpenAIForDesign,
  getDesignDeployment
} from "@/lib/azure-openai"
import { jarvisVault } from "@/lib/jarvis/vault"
import type { Episode } from "@/lib/jarvis/types"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

interface ChatRequestBody {
  message: string
  /** Prior turns held in-memory by the client. */
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
  workspaceId?: string | null
  workspaceName?: string | null
  projectId?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = createClient(cookies())
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) {
    return new Response("unauthorized", { status: 401 })
  }

  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return new Response("invalid json", { status: 400 })
  }

  const userMessage = (body.message ?? "").trim()
  if (!userMessage) {
    return new Response("empty message", { status: 400 })
  }
  const chatHistory = (body.chatHistory ?? []).filter(
    m => m && typeof m.content === "string" && m.content.trim()
  )

  // ── Memory retrieval ─────────────────────────────────────────────
  // Pull both layers in parallel. Cap to 5 unique episodes so the
  // system prompt stays under ~3K tokens even with chatty episodes.
  let memoryEpisodes: Episode[] = []
  try {
    const [recent, relevant] = await Promise.all([
      jarvisVault.listRecentEpisodes(session.user.id, 3),
      jarvisVault.searchEpisodes(session.user.id, userMessage, 3)
    ])
    const seen = new Set<string>()
    for (const ep of [...recent, ...relevant]) {
      if (seen.has(ep.slug)) continue
      seen.add(ep.slug)
      memoryEpisodes.push(ep)
      if (memoryEpisodes.length >= 5) break
    }
  } catch (e: any) {
    console.warn("[jarvis-chat] memory retrieval failed:", e?.message ?? e)
  }

  // ── Live workspace snapshot ──────────────────────────────────────
  // Compressed memory is great for arcs from previous sessions, but
  // the assistant also needs to know what the user is sitting on
  // RIGHT NOW. Pull a quick cross-workspace snapshot of designs +
  // reports + chats so the chips ("Design an experiment", "What's
  // blocking me?") have grounded numbers to talk about.
  const snapshot = await loadWorkspaceSnapshot(
    supabase,
    session.user.id,
    body.workspaceId
  )

  const turnNum = Math.floor(chatHistory.length / 2) + 1
  const systemPrompt = buildSystemPrompt({
    memoryEpisodes,
    snapshot,
    turnNum,
    workspaceName: body.workspaceName ?? null
  })

  // Don't log message bodies (#12 / #13). Slug counts + memory counts
  // are enough to debug.
  console.log(
    `[jarvis-chat] uid=${session.user.id} memory_episodes=${memoryEpisodes.length} turn=${turnNum}`
  )

  const openai = getAzureOpenAIForDesign()
  const completion = await openai.chat.completions.create({
    model: getDesignDeployment(),
    temperature: 0.6,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: userMessage }
    ]
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? ""
          if (delta) controller.enqueue(encoder.encode(delta))
        }
      } catch (e: any) {
        console.warn("[jarvis-chat] stream aborted:", e?.message ?? e)
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  })
}

// ────────────────────────────────────────────────────────────────────

interface WorkspaceSnapshot {
  designsCount: number
  reportsCount: number
  chatsCount: number
  workspaceId: string | null
  workspaceName: string | null
}

async function loadWorkspaceSnapshot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  hintedWorkspaceId?: string | null
): Promise<WorkspaceSnapshot> {
  // Workspace + project + chat counts via supabase. Reports / designs
  // live in Firestore today so we leave them empty here and let the
  // memory layer pick up the slack; the hero's "Total designs" stat
  // card is the live source of truth in the UI.
  try {
    const { data: workspace } = hintedWorkspaceId
      ? await supabase
          .from("workspaces")
          .select("id, name")
          .eq("id", hintedWorkspaceId)
          .maybeSingle()
      : await supabase
          .from("workspaces")
          .select("id, name")
          .eq("user_id", userId)
          .eq("is_home", true)
          .maybeSingle()

    const wsId = workspace?.id ?? null
    if (!wsId) {
      return {
        designsCount: 0,
        reportsCount: 0,
        chatsCount: 0,
        workspaceId: null,
        workspaceName: null
      }
    }

    const { count: chatsCount } = await supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)

    return {
      designsCount: 0, // sourced from Firestore via the UI snapshot - not joinable from here.
      reportsCount: 0,
      chatsCount: chatsCount ?? 0,
      workspaceId: wsId,
      workspaceName: workspace?.name ?? null
    }
  } catch (e: any) {
    console.warn("[jarvis-chat] loadWorkspaceSnapshot failed:", e?.message ?? e)
    return {
      designsCount: 0,
      reportsCount: 0,
      chatsCount: 0,
      workspaceId: null,
      workspaceName: null
    }
  }
}

function buildSystemPrompt(opts: {
  memoryEpisodes: Episode[]
  snapshot: WorkspaceSnapshot
  turnNum: number
  workspaceName: string | null
}): string {
  const { memoryEpisodes, snapshot, turnNum, workspaceName } = opts

  const persona = [
    "You are ShadowAI's home assistant - the user's research co-pilot on the workspace dashboard.",
    "Tone: warm, direct, scientist-to-scientist. Match the user's domain vocabulary. No marketing language, no emoji.",
    'You can call other agents on the user\'s behalf - the DOE / experiment design pipeline, the report drafter, the literature search, the data analysis pipeline. When the user asks for one, tell them what you\'d do and the surface to launch it from (e.g. "/designs/new" or the "Design an experiment" chip), but DON\'T fabricate results.',
    "Your answers are short by default - one or two paragraphs. Expand when the user asks. Use bullet lists only when listing 3+ items.",
    "If you don't know something or it isn't in your memory, say so. Never fabricate a paper, design, or finding."
  ].join("\n\n")

  const liveBlock = workspaceName
    ? `\n\nLIVE WORKSPACE CONTEXT:\n- Active workspace: ${workspaceName}${snapshot.workspaceId ? ` (id=${snapshot.workspaceId})` : ""}\n- Chats so far in this workspace: ${snapshot.chatsCount}`
    : ""

  const memoryBlock =
    memoryEpisodes.length === 0
      ? ""
      : `\n\nMEMORY - what you remember about this user from past sessions:\n${memoryEpisodes
          .map(ep => {
            const fm = ep.frontmatter
            const when = ep.createdAt.toISOString().slice(0, 10)
            const topics = fm.topics.join(", ") || "—"
            const excerpt = ep.body.slice(0, 500).replace(/\n+/g, " ").trim()
            let block =
              `\n— ${when} · ${fm.title} ` +
              `(intent: ${fm.intent} · topics: ${topics} · priority: ${fm.priority})\n` +
              `  ${excerpt}`
            if (fm.breakthrough_quote) {
              block += `\n  They said: "${fm.breakthrough_quote}"`
            }
            if (fm.references.length) {
              block += `\n  Referenced: ${fm.references
                .map(r => `${r.kind}:${r.title}`)
                .slice(0, 5)
                .join("; ")}`
            }
            return block
          })
          .join(
            ""
          )}\n\nUse this memory naturally - never quote it back at them or list facts. Let it shape what you notice and what you skip.`

  const turnBlock =
    turnNum === 1
      ? "\n\nThis is the FIRST turn of the session. A short greeting is fine; lead with what they asked about, not pleasantries."
      : `\n\nConversation position: turn ${turnNum} of this session. Do NOT open with a greeting - you already greeted them.`

  return persona + liveBlock + memoryBlock + turnBlock
}
