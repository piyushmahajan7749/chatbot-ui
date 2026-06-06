/**
 * Build the system-prompt context for tier-3 (single-design) chat.
 *
 * Tier-3 strategy is "long-context dump" (locked decision in
 * /Users/piyush/.claude/plans/rosy-rolling-flute.md): the whole design goes
 * into the system prompt so the model has the full document and doesn't have to
 * play retrieval games on its own document.
 *
 * Hard cap at TIER3_MAX_CHARS to leave room for chat history + the user's
 * question + the model's response. If the design exceeds the cap we truncate.
 *
 * Extracted from the design page so it can be unit-tested (it's the seam that
 * guarantees the design chat actually has the experiment's context).
 */
import type { GeneratedDesign, Hypothesis, Paper } from "@/lib/design-agent"

export const TIER3_MAX_CHARS = 300_000

export interface DesignChatContextInput {
  title: string
  problemStatement: string
  objective: string
  domain: string
  phase: string
  selectedHypotheses: Hypothesis[]
  hypotheses?: Hypothesis[]
  papers?: Paper[]
  generatedDesigns?: GeneratedDesign[]
  activeDesign: GeneratedDesign | undefined
}

export function buildDesignChatContext(input: DesignChatContextInput): string {
  const lines: string[] = []
  lines.push(
    "You are Shadow AI, the scientific design assistant for this experiment. The full experiment is provided below - refer to it directly without asking the user to re-supply which design they mean. Use numeric values from the design's procedure and materials when calculations are requested."
  )

  const problemLines: string[] = []
  if (input.title) problemLines.push(`Title: ${input.title}`)
  if (input.problemStatement)
    problemLines.push(`Problem: ${input.problemStatement}`)
  if (input.objective) problemLines.push(`Objective: ${input.objective}`)
  if (input.domain) problemLines.push(`Domain: ${input.domain}`)
  if (input.phase) problemLines.push(`Phase: ${input.phase}`)
  if (problemLines.length) {
    lines.push("", "## Problem", ...problemLines)
  }

  // All hypotheses (selected first, then the rest) - full reasoning, no
  // truncation. The model needs to know what was rejected to answer
  // "why didn't we test X" questions.
  const allHyp = [
    ...input.selectedHypotheses,
    ...(input.hypotheses ?? []).filter(
      h => !input.selectedHypotheses.find(s => s.id === h.id)
    )
  ]
  if (allHyp.length) {
    lines.push("", "## Hypotheses")
    allHyp.forEach((h, i) => {
      const tag = input.selectedHypotheses.find(s => s.id === h.id)
        ? "[selected]"
        : "[not selected]"
      lines.push(`${i + 1}. ${tag} ${h.text}`)
      if (h.reasoning) lines.push(`   Reasoning: ${h.reasoning}`)
    })
  }

  if (input.papers?.length) {
    lines.push("", "## Cited literature")
    input.papers.forEach((p, i) => {
      const meta = [
        p.authors?.length ? p.authors.join(", ") : "",
        (p as any).year ?? "",
        (p as any).journal ?? ""
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(
        `${i + 1}. ${p.title}${meta ? ` - ${meta}` : ""}${
          p.sourceUrl ? ` (${p.sourceUrl})` : ""
        }`
      )
      if (p.summary) lines.push(`   ${p.summary}`)
    })
  }

  // All generated designs - the active one first, full body. Other designs
  // included as alternates so the model can compare/contrast.
  const ordered = input.activeDesign
    ? [
        input.activeDesign,
        ...(input.generatedDesigns ?? []).filter(
          d => d.id !== input.activeDesign!.id
        )
      ]
    : (input.generatedDesigns ?? [])
  ordered.forEach((d, idx) => {
    const heading =
      idx === 0
        ? `## Active design: ${d.title}`
        : `## Alternate design: ${d.title}`
    lines.push("", heading)
    d.sections.forEach(sec => {
      lines.push("", `### ${sec.heading}`)
      lines.push(sec.body.trim())
    })
  })

  let context = lines.join("\n")

  if (context.length > TIER3_MAX_CHARS) {
    console.warn(
      `[design-chat-context] design content ${context.length} chars exceeds tier-3 cap ${TIER3_MAX_CHARS}; truncating. Consider RAG fallback.`
    )
    context = context.slice(0, TIER3_MAX_CHARS) + "\n\n…[truncated]"
  }

  return context
}
