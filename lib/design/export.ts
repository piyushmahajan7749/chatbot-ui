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

function renderList(items: any): string {
  if (!Array.isArray(items) || items.length === 0) return ""
  return items
    .map(item => `- ${typeof item === "string" ? item : JSON.stringify(item)}`)
    .join("\n")
}

function renderHypothesis(hyp: any): string {
  if (!hyp) return ""
  const lines: string[] = []
  if (hyp.content) lines.push(`**Hypothesis:** ${hyp.content}`)
  if (hyp.rationale) lines.push(`\n**Rationale:** ${hyp.rationale}`)
  if (hyp.scores) {
    lines.push(
      `\n**Scores:** rigor ${hyp.scores.rigor ?? "-"}, feasibility ${hyp.scores.feasibility ?? "-"}, novelty ${hyp.scores.novelty ?? "-"}`
    )
  }
  return lines.join("\n")
}

function renderLiterature(lit: any): string {
  if (!lit) return ""
  const lines: string[] = []
  if (lit.summary) lines.push(lit.summary)
  const citations = lit.citationsDetailed || lit.citations || []
  if (Array.isArray(citations) && citations.length > 0) {
    lines.push("\n### Citations")
    citations.forEach((c: any, i: number) => {
      const idx = c.index ?? i + 1
      const title = c.title ?? "Untitled"
      const url = c.url ? ` — ${c.url}` : ""
      const year = c.year ? ` (${c.year})` : ""
      lines.push(`${idx}. ${title}${year}${url}`)
    })
  }
  return lines.join("\n")
}

function renderDesign(d: any): string {
  if (!d) return ""
  const sections: string[] = []
  if (d.overview) sections.push(`### Overview\n\n${d.overview}`)
  if (d.objective) sections.push(`### Objective\n\n${d.objective}`)
  if (d.procedure && Array.isArray(d.procedure)) {
    sections.push(
      "### Procedure\n\n" +
        d.procedure
          .map(
            (step: any, i: number) =>
              `${i + 1}. ${step.title ?? step.name ?? "Step"}${step.description ? `\n   ${step.description}` : ""}`
          )
          .join("\n")
    )
  }
  if (d.materials) {
    const mat = Array.isArray(d.materials)
      ? renderList(d.materials)
      : String(d.materials)
    sections.push(`### Materials\n\n${mat}`)
  }
  if (d.controls) {
    const ctrl = Array.isArray(d.controls)
      ? renderList(d.controls)
      : String(d.controls)
    sections.push(`### Controls\n\n${ctrl}`)
  }
  if (d.statisticalReview || d.statistics) {
    const sr = d.statisticalReview || d.statistics
    sections.push(
      `### Statistical Review\n\n${typeof sr === "string" ? sr : JSON.stringify(sr, null, 2)}`
    )
  }
  return sections.join("\n\n")
}

export function designToMarkdown(design: ExportableDesign): string {
  const content = parsedContent(design)
  const title = design.name || "Untitled design"
  const lines: string[] = [`# ${title}`]
  if (design.description) lines.push("", design.description)

  if (!content) return lines.join("\n")

  const selected = content.selectedHypothesis
  if (selected) {
    lines.push("", "## Selected hypothesis", "", renderHypothesis(selected))
  }

  const lit = content.generatedLiteratureSummary
  if (lit) {
    lines.push("", "## Literature review", "", renderLiterature(lit))
  }

  const dsg = content.generatedDesign
  if (dsg) {
    lines.push("", "## Experimental design", "", renderDesign(dsg))
  }

  const stats = content.generatedStatReview
  if (stats) {
    lines.push(
      "",
      "## Statistical review",
      "",
      typeof stats === "string" ? stats : JSON.stringify(stats, null, 2)
    )
  }

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
 * Generates a PDF from the given DOM element (typically the rendered
 * DesignReview) using html2canvas + jspdf. Returns a promise that resolves
 * once the download is triggered.
 */
export async function downloadPdfFromElement(
  element: HTMLElement,
  design: ExportableDesign
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf")
  ])

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff"
  })

  const imgData = canvas.toDataURL("image/png")
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4"
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }

  pdf.save(safeFilename(design.name, "pdf"))
}
