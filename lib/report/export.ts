import jsPDF from "jspdf"
import pptxgen from "pptxgenjs"

type Draft = Record<string, any>

export type ExportSection = {
  key: string
  title: string
  group: string
}

const stripMarkdown = (md: string): string => {
  if (!md) return ""
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, m => m)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\|/g, "  ")
    .replace(/^-{3,}\s*$/gm, "")
    .trim()
}

const contentOf = (draft: Draft | null, key: string): string => {
  const raw = draft?.[key]
  if (typeof raw === "string") return raw
  return raw ? JSON.stringify(raw, null, 2) : ""
}

const loadChartImage = async (
  src: string
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  if (!src) return null
  try {
    if (src.startsWith("data:")) {
      return await new Promise(resolve => {
        const img = new Image()
        img.onload = () =>
          resolve({
            dataUrl: src,
            width: img.naturalWidth,
            height: img.naturalHeight
          })
        img.onerror = () => resolve(null)
        img.src = src
      })
    }
    const res = await fetch(src)
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    return await new Promise(resolve => {
      const img = new Image()
      img.onload = () =>
        resolve({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight
        })
      img.onerror = () => resolve(null)
      img.src = dataUrl
    })
  } catch {
    return null
  }
}

export const exportReportToPDF = async ({
  title,
  draft,
  sections,
  chartImage
}: {
  title: string
  draft: Draft | null
  sections: ExportSection[]
  chartImage: string | null
}) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const writeTitle = (text: string, size: number, bold = true) => {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    ensureSpace(lines.length * size * 1.2)
    lines.forEach(line => {
      doc.text(line, margin, y)
      y += size * 1.2
    })
    y += 6
  }

  const writeParagraph = (text: string) => {
    if (!text) return
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    const clean = stripMarkdown(text)
    const paragraphs = clean.split(/\n{2,}/)
    paragraphs.forEach(p => {
      const lines = doc.splitTextToSize(p, contentWidth) as string[]
      lines.forEach(line => {
        ensureSpace(16)
        doc.text(line, margin, y)
        y += 15
      })
      y += 8
    })
  }

  // Title page header
  writeTitle(title || "Report", 22)
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 18

  // Group sections
  const grouped = sections.reduce<Record<string, ExportSection[]>>((acc, s) => {
    acc[s.group] = acc[s.group] || []
    acc[s.group].push(s)
    return acc
  }, {})

  for (const group of Object.keys(grouped)) {
    writeTitle(group, 16)
    for (const section of grouped[group]) {
      const content = contentOf(draft, section.key)
      if (!content && section.key !== "dataAnalysis") continue
      writeTitle(section.title, 13)
      writeParagraph(content)

      // Embed chart within Data Analysis
      if (section.key === "dataAnalysis" && chartImage) {
        const img = await loadChartImage(chartImage)
        if (img) {
          const maxW = contentWidth
          const ratio = img.height / img.width
          const w = maxW
          const h = w * ratio
          ensureSpace(h + 10)
          doc.addImage(img.dataUrl, "PNG", margin, y, w, h)
          y += h + 10
        }
      }
    }
  }

  doc.save(`${title || "report"}.pdf`)
}

export const exportReportToPPTX = async ({
  title,
  draft,
  sections,
  chartImage
}: {
  title: string
  draft: Draft | null
  sections: ExportSection[]
  chartImage: string | null
}) => {
  const pptx = new pptxgen()
  pptx.layout = "LAYOUT_WIDE"

  // Title slide
  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: "FFFFFF" }
  titleSlide.addText(title || "Report", {
    x: 0.5,
    y: 2.5,
    w: 12,
    h: 1.5,
    fontSize: 40,
    bold: true,
    color: "1F2937",
    align: "center"
  })
  titleSlide.addText("Generated Report", {
    x: 0.5,
    y: 4.0,
    w: 12,
    h: 0.6,
    fontSize: 18,
    color: "6B7280",
    align: "center"
  })

  for (const section of sections) {
    const content = contentOf(draft, section.key)
    if (!content && section.key !== "dataAnalysis") continue

    const slide = pptx.addSlide()
    slide.background = { color: "FFFFFF" }

    slide.addText(section.group.toUpperCase(), {
      x: 0.5,
      y: 0.3,
      w: 12,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: "6B7280"
    })
    slide.addText(section.title, {
      x: 0.5,
      y: 0.55,
      w: 12,
      h: 0.6,
      fontSize: 26,
      bold: true,
      color: "111827"
    })

    const cleanContent = stripMarkdown(content || "")

    if (section.key === "dataAnalysis" && chartImage) {
      slide.addText(cleanContent.slice(0, 900), {
        x: 0.5,
        y: 1.3,
        w: 6,
        h: 5.8,
        fontSize: 12,
        color: "1F2937",
        valign: "top"
      })
      slide.addImage({
        data: chartImage,
        x: 7,
        y: 1.3,
        w: 5.8,
        h: 5.0
      })
    } else {
      slide.addText(cleanContent, {
        x: 0.5,
        y: 1.3,
        w: 12,
        h: 5.8,
        fontSize: 13,
        color: "1F2937",
        valign: "top"
      })
    }
  }

  await pptx.writeFile({ fileName: `${title || "report"}.pptx` })
}
