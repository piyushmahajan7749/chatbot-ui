"use client"

export interface ExportableDesign {
  id?: string
  name?: string
  description?: string
  content?: any
}

function parsedContent(design: ExportableDesign): any {
  const raw = design.content
  if (!raw) return null
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw)
    } catch {
      return { raw }
    }
  }
  return raw
}

// ── New-schema (DesignContentV2) renderers ──────────────────────────────────
// Designs are stored as { problem, papers[], hypotheses[], designs[] } where
// each generated design is { title, sections: [{ heading, body }] }. The old
// exporters read a long-gone shape (generatedDesign/selectedHypothesis), which
// is why Markdown / JSON / the public share page all came back empty.

function problemLines(content: any): string[] {
  const p = content?.problem ?? {}
  const out: string[] = []
  if (p.title) out.push(`**Title:** ${p.title}`)
  if (p.problemStatement) out.push(`**Problem:** ${p.problemStatement}`)
  const objective = p.objective ?? p.goal
  if (objective) out.push(`**Objective:** ${objective}`)
  if (p.domain) out.push(`**Domain:** ${p.domain}`)
  if (p.phase) out.push(`**Phase:** ${p.phase}`)
  return out
}

function hypothesisLines(content: any): string[] {
  const hyps = Array.isArray(content?.hypotheses) ? content.hypotheses : []
  if (!hyps.length) return []
  const out: string[] = ["## Hypotheses"]
  hyps.forEach((h: any, i: number) => {
    const tag = h.selected ? " [selected]" : ""
    out.push("", `${i + 1}.${tag} ${h.text ?? ""}`)
    if (h.reasoning) out.push(`   Reasoning: ${h.reasoning}`)
  })
  return out
}

function literatureLines(content: any): string[] {
  const papers = Array.isArray(content?.papers) ? content.papers : []
  const cited = papers.filter((p: any) => p.selected)
  const use = cited.length ? cited : papers
  if (!use.length) return []
  const out: string[] = ["## Literature"]
  use.forEach((p: any, i: number) => {
    const meta = [
      Array.isArray(p.authors) ? p.authors.join(", ") : "",
      p.year ?? "",
      p.journal ?? ""
    ]
      .filter(Boolean)
      .join(" · ")
    out.push(
      "",
      `${i + 1}. ${p.title ?? "Untitled"}${meta ? ` — ${meta}` : ""}`
    )
    if (p.summary) out.push(`   ${p.summary}`)
  })
  return out
}

export function designToMarkdown(design: ExportableDesign): string {
  const content = parsedContent(design)
  const lines: string[] = [
    `# ${design.name || content?.problem?.title || "Untitled design"}`
  ]
  if (design.description) lines.push("", design.description)
  if (!content) return lines.join("\n")

  const probs = problemLines(content)
  if (probs.length) lines.push("", "## Research problem", "", ...probs)

  const hyps = hypothesisLines(content)
  if (hyps.length) lines.push("", ...hyps)

  const lit = literatureLines(content)
  if (lit.length) lines.push("", ...lit)

  const designs = Array.isArray(content.designs) ? content.designs : []
  designs.forEach((d: any) => {
    lines.push("", `## Design: ${d.title ?? "Untitled"}`)
    ;(Array.isArray(d.sections) ? d.sections : []).forEach((s: any) => {
      lines.push("", `### ${s.heading}`, "", s.body ?? "")
    })
  })

  return lines.join("\n")
}

export function designToJson(design: ExportableDesign): string {
  return JSON.stringify(
    {
      id: design.id,
      name: design.name,
      description: design.description,
      content: parsedContent(design)
    },
    null,
    2
  )
}

function safeFilename(name: string | undefined, ext: string): string {
  const base = (name ?? "design").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80)
  return `${base || "design"}.${ext}`
}

function triggerDownload(
  content: Blob | string,
  filename: string,
  mime: string
) {
  const blob =
    typeof content === "string" ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadMarkdown(design: ExportableDesign) {
  triggerDownload(
    designToMarkdown(design),
    safeFilename(design.name, "md"),
    "text/markdown;charset=utf-8"
  )
}

export function downloadJson(design: ExportableDesign) {
  triggerDownload(
    designToJson(design),
    safeFilename(design.name, "json"),
    "application/json;charset=utf-8"
  )
}

/**
 * Text-based PDF of the design (problem + each generated design's sections).
 * Uses jsPDF's text engine (real selectable text, proper margins + pagination)
 * rather than an html2canvas screenshot — neater, sharper, and it works off the
 * stored content so it needs no on-screen element/ref to capture.
 */
export async function downloadDesignPdf(design: ExportableDesign) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const margin = 48
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const writeBlock = (
    text: string,
    opts: { size: number; bold?: boolean; gap?: number }
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal")
    doc.setFontSize(opts.size)
    const lineHeight = opts.size * 1.35
    for (const line of doc.splitTextToSize(text || " ", maxWidth)) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += lineHeight
    }
    y += opts.gap ?? 6
  }

  // Light markdown → readable plain text (keep table pipes for legibility).
  const stripMd = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^[-*]\s+/gm, "• ")
      .replace(/`{1,3}/g, "")

  const content = parsedContent(design) ?? {}

  writeBlock(design.name || content?.problem?.title || "Untitled design", {
    size: 18,
    bold: true,
    gap: 14
  })

  const probs = problemLines(content).map(stripMd)
  if (probs.length) {
    writeBlock("Research problem", { size: 13, bold: true, gap: 4 })
    probs.forEach(p => writeBlock(p, { size: 10.5, gap: 2 }))
    y += 8
  }

  const designs = Array.isArray(content.designs) ? content.designs : []
  if (designs.length === 0) {
    writeBlock("No generated design yet.", { size: 10.5 })
  }
  designs.forEach((d: any, di: number) => {
    if (di > 0) {
      doc.addPage()
      y = margin
    }
    writeBlock(d.title || "Design", { size: 15, bold: true, gap: 8 })
    ;(Array.isArray(d.sections) ? d.sections : []).forEach((s: any) => {
      writeBlock(s.heading, { size: 13, bold: true, gap: 4 })
      writeBlock(stripMd(s.body || "").trim() || "—", { size: 10.5, gap: 14 })
    })
  })

  doc.save(safeFilename(design.name, "pdf"))
}
