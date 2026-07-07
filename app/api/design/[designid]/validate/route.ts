import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { adminDb } from "@/lib/firebase/admin"
import { createClient } from "@/lib/supabase/server"
import { evaluateAccess, getPermissionForUser } from "@/lib/design/sharing"
import { assertBudget, recordCompletionUsage } from "@/lib/billing/account"
import {
  budgetErrorResponse,
  isBudgetExceededError
} from "@/lib/billing/errors"
import { resolveSupabaseFilesToText } from "@/lib/report/file-content"
import { parseLabData, runValidation } from "@/lib/design/validate"
import type {
  DesignContentV2,
  ExperimentIteration,
  GeneratedDesign,
  Hypothesis,
  ParsedLabData
} from "@/lib/design-agent"

/**
 * POST /api/design/:designid/validate
 *
 * Runs one round of the Validate loop: judges the hypothesis against the
 * scientist's lab data (free text + uploaded data files), in the context of
 * every prior iteration, then appends the round to content.validation and
 * refreshes the cumulative synthesis. Server-side persistence keeps the
 * iteration log atomic.
 *
 * Body: {
 *   raw?: string,                       // free-text results / observations
 *   dataFiles?: { id, name, size?, type? }[],  // uploaded data-file refs
 * }
 * Response: { iteration, validation }   // the new round + full updated state
 */
export async function POST(
  request: Request,
  { params }: { params: { designid: string } }
) {
  try {
    const designId = params.designid
    if (!designId || designId === "undefined" || designId === "null") {
      return NextResponse.json({ error: "Invalid design ID" }, { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      await assertBudget(user.id)
    } catch (e) {
      if (isBudgetExceededError(e)) return budgetErrorResponse((e as any).plan)
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: "parse" | "validate"
      raw?: string
      dataFiles?: { id?: string; name: string; size?: number; type?: string }[]
      structured?: ParsedLabData
    }
    const mode = body.mode === "parse" ? "parse" : "validate"
    const raw = (body.raw ?? "").trim()
    const dataFiles = Array.isArray(body.dataFiles) ? body.dataFiles : []

    if (!raw && dataFiles.length === 0) {
      return NextResponse.json(
        { error: "Add your lab results as text or upload a data file first." },
        { status: 400 }
      )
    }

    const docRef = adminDb.collection("designs").doc(designId)
    const doc = await docRef.get()
    if (!doc.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 })
    }
    const designData = doc.data() as any

    const permission = await getPermissionForUser(
      designId,
      user.id,
      user.email ?? null
    )
    if (
      designData.user_id &&
      !evaluateAccess(designData, user.id, permission).canEdit
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const content: DesignContentV2 =
      typeof designData.content === "string"
        ? JSON.parse(designData.content || "{}")
        : (designData.content ?? { schemaVersion: 2 })

    const designs: GeneratedDesign[] = Array.isArray(content.designs)
      ? content.designs
      : []
    if (designs.length === 0) {
      return NextResponse.json(
        { error: "Generate a design before validating it against data." },
        { status: 400 }
      )
    }

    // The hypothesis under test: the selected one(s), else the first.
    const hypotheses: Hypothesis[] = Array.isArray(content.hypotheses)
      ? content.hypotheses
      : []
    const selectedHyps = hypotheses.filter(h => (h as any).selected)
    const hypothesisText =
      (selectedHyps.length ? selectedHyps : hypotheses)
        .map(h => h.text)
        .filter(Boolean)
        .join("\n") || ""

    // The design that was run: concatenate the active/first design's sections.
    const activeDesign = designs[0]
    const designText = (activeDesign?.sections ?? [])
      .map((s: any) => `### ${s.heading}\n${s.body}`)
      .join("\n\n")

    // Resolve uploaded data files to extracted text (same path the report
    // data-check uses), and combine with the free-text results.
    let fileText = ""
    let fileWarn = ""
    if (dataFiles.length > 0) {
      const fileIds = dataFiles.map(f => f.id).filter(Boolean) as string[]
      if (fileIds.length === 0) {
        fileWarn =
          "The uploaded file finished uploading but has no id yet — re-attach it and try again."
      } else {
        try {
          const resolved = await resolveSupabaseFilesToText(fileIds, {
            maxCharsPerFile: 20_000
          })
          fileText = resolved
            .map(r => `## ${r.fileName || "data file"}\n${r.content || ""}`)
            .join("\n\n")
          if (!fileText.trim()) {
            fileWarn =
              "Couldn't read any text from the uploaded file — it may be an image-only scan. Type the key numbers in the box instead."
          }
        } catch (e: any) {
          console.error("[VALIDATE] file resolve failed", e)
          fileWarn = `Couldn't read the uploaded file (${e?.message ?? "unknown error"}). Type the key numbers in the box instead.`
        }
      }
    }
    const roundData = [raw, fileText].filter(Boolean).join("\n\n")

    if (!roundData.trim()) {
      return NextResponse.json(
        {
          error:
            fileWarn ||
            "No usable data found. Paste your results as text or attach a data file with numbers."
        },
        { status: 400 }
      )
    }

    // ── PARSE mode: extract a structured table + summary, no persistence. ────
    if (mode === "parse") {
      const {
        structured,
        completion: pc,
        model: pm
      } = await parseLabData({ hypothesisText, designText, roundData })
      await recordCompletionUsage(
        { userId: user.id, feature: "design", model: pm },
        pc
      )
      if (!structured) {
        return NextResponse.json(
          { error: "Couldn't parse the data. Try again." },
          { status: 502 }
        )
      }
      return NextResponse.json({ structured, warning: fileWarn || undefined })
    }

    const prior = content.validation?.iterations ?? []
    const cumulativeInsights = content.validation?.cumulativeInsights

    const { result, completion, model } = await runValidation({
      problem: content.problem ?? {},
      hypothesisText,
      designText,
      roundData,
      priorIterations: prior,
      cumulativeInsights,
      structured: body.structured ?? null
    })

    await recordCompletionUsage(
      { userId: user.id, feature: "design", model },
      completion
    )

    if (!result) {
      return NextResponse.json(
        { error: "The validation agent returned an empty result. Try again." },
        { status: 502 }
      )
    }

    const iteration: ExperimentIteration = {
      id: `iter-${Math.random().toString(36).slice(2, 10)}`,
      index: prior.length + 1,
      designSnapshot: designs,
      hypothesisText,
      data: {
        raw: raw || undefined,
        files: dataFiles.length ? dataFiles : undefined
      },
      structuredData: body.structured ?? undefined,
      verdict: result.verdict,
      confidence: result.confidence,
      reasoning: result.reasoning,
      insights: result.insights,
      suggestedChanges: result.suggestedChanges,
      revisedHypothesis: result.revisedHypothesis ?? undefined,
      createdAt: new Date().toISOString()
    }

    const nextValidation = {
      iterations: [...prior, iteration],
      cumulativeInsights: result.cumulativeInsights || cumulativeInsights || ""
    }
    const nextContent: DesignContentV2 = {
      ...content,
      schemaVersion: 2,
      validation: nextValidation,
      approvedPhases: Array.from(
        new Set([...(content.approvedPhases ?? []), "validate" as const])
      )
    }

    await docRef.update({
      content: JSON.stringify(nextContent),
      updated_at: new Date().toISOString()
    })

    return NextResponse.json({ iteration, validation: nextValidation })
  } catch (error: any) {
    console.error("[VALIDATE] Error:", error)
    return NextResponse.json(
      { error: error?.message ?? "Internal error" },
      { status: 500 }
    )
  }
}
