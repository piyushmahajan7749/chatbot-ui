import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase/admin"
import {
  generateDesignForHypothesis,
  generateHypotheses,
  runLiteratureSearch,
  runSimulation,
  type DesignContentV2,
  type GeneratedDesign,
  type Hypothesis,
  type Paper,
  type ProblemContext
} from "@/lib/design-agent"

type Phase = "literature" | "hypotheses" | "design" | "simulation"

interface Body {
  phase: Phase
  problem?: ProblemContext
  papers?: Paper[]
  hypotheses?: Hypothesis[]
  designId?: string
}

/**
 * Agentic generation endpoint. The agent itself is stubbed (see
 * lib/design-agent.ts) but this route is the real seam: it merges the
 * generated artifacts into the design's persisted `content` JSON, so
 * whatever the agent eventually produces is durable without the client
 * having to re-save.
 */
export async function POST(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const supabase = createClient(cookies())
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const designId = params.designid
    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json({ error: "Invalid design ID" }, { status: 400 })
    }

    const body = (await request.json()) as Body
    if (!body?.phase) {
      return NextResponse.json({ error: "Missing phase" }, { status: 400 })
    }

    const docRef = adminDb.collection("designs").doc(designId)
    const doc = await docRef.get()
    if (!doc.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }

    const design = doc.data() as any
    if (design?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const existing = parseContent(design.content) ?? { schemaVersion: 2 }
    const ctx: ProblemContext = body.problem ?? existing.problem ?? {}

    let patch: Partial<DesignContentV2> = {}

    switch (body.phase) {
      case "literature": {
        const papers = runLiteratureSearch(ctx)
        patch = { problem: ctx, papers }
        break
      }
      case "hypotheses": {
        const papers = body.papers ?? existing.papers ?? []
        const hypotheses = generateHypotheses(ctx, papers)
        patch = { problem: ctx, papers, hypotheses }
        break
      }
      case "design": {
        const hypotheses = body.hypotheses ?? existing.hypotheses ?? []
        const selected = hypotheses.filter(h => h.selected)
        const designs: GeneratedDesign[] = selected.map(h =>
          generateDesignForHypothesis(ctx, h)
        )
        patch = { problem: ctx, hypotheses, designs }
        break
      }
      case "simulation": {
        if (!body.designId) {
          return NextResponse.json(
            { error: "simulation phase requires designId" },
            { status: 400 }
          )
        }
        const designs = (existing.designs ?? []).map(d =>
          d.id === body.designId
            ? { ...d, simulation: runSimulation(ctx, d) }
            : d
        )
        patch = { designs }
        break
      }
      default:
        return NextResponse.json({ error: "Unknown phase" }, { status: 400 })
    }

    const next: DesignContentV2 = {
      ...existing,
      ...patch,
      schemaVersion: 2
    }

    await docRef.update({
      content: JSON.stringify(next),
      updated_at: new Date().toISOString()
    })

    return NextResponse.json({ content: next, phase: body.phase })
  } catch (error) {
    console.error("❌ [DESIGN_GENERATE] Error:", error)
    return NextResponse.json(
      { error: "Failed to run generation" },
      { status: 500 }
    )
  }
}

function parseContent(raw: unknown): DesignContentV2 | null {
  if (!raw) return null
  try {
    if (typeof raw === "string") return JSON.parse(raw)
    if (typeof raw === "object") return raw as DesignContentV2
  } catch {
    return null
  }
  return null
}
