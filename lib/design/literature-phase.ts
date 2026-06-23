/**
 * Literature-scout phase, extracted from the inline `case "literature"` of
 * app/api/design/[designid]/generate/route.ts so it can run in the Inngest
 * worker (processDesignPhase) instead of a 300s-capped serverless request. The
 * multi-round search + relevance + summarization can run minutes on large pools.
 *
 * Pure: inputs in, content patch out. Progress is surfaced via the onProgress
 * callback (the worker writes each event into the design doc's designJob).
 */
import {
  callLiteratureScoutAgent,
  type LiteratureScoutProgressEvent
} from "@/app/api/design/draft/agents"
import type { ExperimentDesignState } from "@/app/api/design/draft/types"
import type {
  DesignContentV2,
  Paper,
  ProblemContext,
  StoredLiteratureContext
} from "@/lib/design-agent"

function toAgentState(ctx: ProblemContext): ExperimentDesignState {
  // Fold the researcher's operating parameters into the search context so the
  // scout targets papers matching their specific system (concentrations,
  // buffers, temperatures) rather than generic background.
  const considerations = [
    ...((ctx as { constraints?: string[] }).constraints ?? [])
  ]
  if (ctx.additionalDetails?.trim()) {
    // Loose context only — bias the search toward the researcher's system but
    // do NOT require papers to match these exact values (they mainly drive the
    // hypotheses + design). Finding methodologically strong primary research in
    // the same area matters more than matching every parameter.
    considerations.push(
      `Background context (use to bias relevance, do NOT over-filter to these exact values): ${ctx.additionalDetails.trim()}`
    )
  }
  return {
    problem:
      [ctx.title, ctx.problemStatement].filter(Boolean).join(" - ") ||
      "Untitled",
    objectives: ctx.goal ? [ctx.goal] : [],
    variables: {
      known: (ctx as { variables?: string[] }).variables ?? [],
      unknown: []
    },
    constraints: { material: "", time: "", equipment: "" },
    specialConsiderations: considerations
  }
}

export async function runLiteraturePhase(
  args: {
    ctx: ProblemContext
    existing: DesignContentV2
    mode?: "append" | "replace"
  },
  onProgress: (ev: LiteratureScoutProgressEvent) => void
): Promise<Partial<DesignContentV2>> {
  const { ctx, existing } = args
  const appendMode = args.mode === "append"
  const existingPapers = existing.papers ?? []

  const agentState = toAgentState(ctx)
  // Initial run targets 10 unique papers (#13). "Generate more" (append)
  // targets 5 NEW papers on top of what's already there (#19) and excludes
  // current urls/titles so rounds aren't blocked re-finding the same ones.
  const result = await callLiteratureScoutAgent(
    agentState,
    undefined,
    (ev: LiteratureScoutProgressEvent) => onProgress(ev),
    appendMode
      ? {
          bypassCache: true,
          shuffleQueries: true,
          minPapers: 5,
          excludeUrls: existingPapers
            .map(p => p.sourceUrl || "")
            .filter(Boolean),
          excludeTitles: existingPapers.map(p => p.title)
        }
      : { minPapers: 10 }
  )
  const litOutput = result.output

  const timestamp = Date.now()
  const rawDetailed = (litOutput.citationsDetailed ?? []) as any[]
  const rawScores = rawDetailed
    .map(c => Number(c.relevanceScore ?? c.score ?? 0))
    .filter(n => Number.isFinite(n) && n > 0)
  const maxScore = rawScores.length ? Math.max(...rawScores) : 0

  const newPapers: Paper[] = rawDetailed.map((c, i) => {
    const rawSummary =
      (typeof c.abstract === "string" && c.abstract.trim()) ||
      (typeof c.summary === "string" && c.summary.trim()) ||
      (typeof c.tldr === "string" && c.tldr.trim()) ||
      (typeof c.snippet === "string" && c.snippet.trim()) ||
      (typeof c.description === "string" && c.description.trim()) ||
      ""
    const summaryIsRealAbstract =
      rawSummary &&
      rawSummary !== "Abstract not available." &&
      rawSummary !== "No abstract"
    const citationBlurb = [
      Array.isArray(c.authors) && c.authors.length
        ? `${c.authors.slice(0, 3).join(", ")}${c.authors.length > 3 ? " et al." : ""}`
        : null,
      c.journal,
      c.year ? String(c.year) : null
    ]
      .filter(Boolean)
      .join(" · ")
    const summary = summaryIsRealAbstract
      ? rawSummary
      : citationBlurb || rawSummary || "Abstract not available."

    let sourceUrl: string | undefined =
      (typeof c.url === "string" && c.url.trim()) || undefined
    if (!sourceUrl && typeof c.doi === "string" && c.doi.trim()) {
      sourceUrl = `https://doi.org/${c.doi.trim().replace(/^doi:/i, "")}`
    }
    if (!sourceUrl && typeof c.title === "string" && c.title.trim()) {
      sourceUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(c.title.trim())}`
    }
    let title = (c.title || "").trim()
    if (!title && rawSummary) {
      const firstSentence = rawSummary.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160)
      title = firstSentence || `Paper ${i + 1}`
    }
    if (!title) title = `Paper ${i + 1}`

    const raw = Number(c.relevanceScore ?? c.score ?? 0)
    const normalized =
      maxScore > 0 && Number.isFinite(raw) && raw > 0
        ? Math.max(0, Math.min(1, raw / maxScore))
        : undefined

    return {
      id: `lit-${i}-${timestamp}`,
      title,
      summary,
      sourceUrl,
      userAdded: false,
      selected: false,
      authors: c.authors?.length ? c.authors : undefined,
      year: c.year ? String(c.year) : undefined,
      journal: c.journal || undefined,
      source: c.source || undefined,
      relevanceScore: normalized
    }
  })

  if (newPapers.length === 0 && litOutput.citations.length > 0) {
    litOutput.citations.forEach((cite: string, i: number) => {
      newPapers.push({
        id: `lit-${i}-${timestamp}`,
        title: cite,
        summary: "Citation from literature search",
        userAdded: false,
        selected: false
      })
    })
  }

  // Drop metadata-less junk hits — the "Abstract not available / Authors
  // Unknown / Source Web" rows the scientist flagged. A paper is junk when it
  // has no usable title AND no authors AND no real abstract; we keep anything
  // with at least real authors or a real summary so we don't over-prune.
  const JUNK_TEXT = new Set([
    "abstract not available.",
    "abstract not available",
    "no abstract",
    "unknown",
    "untitled",
    "citation from literature search",
    ""
  ])
  const isJunk = (p: Paper): boolean => {
    const title = (p.title || "").trim().toLowerCase()
    const summary = (p.summary || "").trim().toLowerCase()
    const hasAuthors = (p.authors?.length ?? 0) > 0
    const hasRealSummary = summary.length > 0 && !JUNK_TEXT.has(summary)
    const hasRealTitle =
      title.length > 0 && !JUNK_TEXT.has(title) && !title.startsWith("paper ")
    if (!hasRealTitle && !hasAuthors && !hasRealSummary) return true
    // No title at all, or a placeholder title, with nothing else to show.
    if (!hasRealTitle && !hasRealSummary) return true
    return false
  }
  const qualityPapers = newPapers.filter(p => p.userAdded || !isJunk(p))

  let papers: Paper[]
  const sourceNewPapers = qualityPapers
  if (appendMode) {
    const seenUrls = new Set(
      existingPapers.map(p => (p.sourceUrl || "").toLowerCase()).filter(Boolean)
    )
    const seenTitles = new Set(existingPapers.map(p => p.title.toLowerCase()))
    const appended = sourceNewPapers.filter(p => {
      const url = (p.sourceUrl || "").toLowerCase()
      const title = p.title.toLowerCase()
      if (url && seenUrls.has(url)) return false
      if (seenTitles.has(title)) return false
      seenUrls.add(url)
      seenTitles.add(title)
      return true
    })
    papers = [...existingPapers, ...appended]
  } else {
    papers = sourceNewPapers
  }

  const literatureContext: StoredLiteratureContext = {
    whatOthersHaveDone: litOutput.whatOthersHaveDone,
    goodMethodsAndTools: litOutput.goodMethodsAndTools,
    potentialPitfalls: litOutput.potentialPitfalls,
    citations: litOutput.citations
  }

  // Downstream clearing (replace mode wipes hypotheses/designs built on the old
  // paper set) is applied by the worker's finalize step — `undefined` values
  // don't survive Inngest step-result JSON serialization, so we return positive
  // data only and let finalize delete keys by phase+mode.
  return {
    problem: ctx,
    papers,
    literatureContext
  }
}
