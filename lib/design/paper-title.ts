/**
 * Shared, dependency-free paper-title cleanup. Lives in its own module so
 * both the server (at fetch time) and the design page (at render time, for
 * papers stored before the cleanup existed) can use it.
 */
/**
 * Web-arm (Tavily) hits carry the PAGE title, not the article title, so they
 * arrive with publisher furniture appended:
 *   "Real article title | Biophysical Reviews | Springer Nature Link"
 *   "Real article title - PubMed"
 * The article title is the first pipe-segment. We only trim when that segment
 * still reads like a title (>= 25 chars) so we never truncate a genuine title
 * that happens to contain a separator.
 */
export function cleanPaperTitle(raw: string): string {
  let title = (raw || "").replace(/\s+/g, " ").trim()
  if (!title) return ""
  if (title.includes("|")) {
    const first = title.split("|")[0].trim()
    if (first.length >= 25) title = first
  }
  // Trailing " - <Site>" furniture from the common bibliographic hosts.
  title = title.replace(
    /\s*[-–—]\s*(PubMed(\s+Central)?|PMC|Europe\s*PMC|ScienceDirect|SpringerLink|Springer\s*Nature\s*Link|Wiley\s*Online\s*Library|Taylor\s*&\s*Francis|ResearchGate|arXiv(\.org)?|Nature|Frontiers|MDPI|bioRxiv|medRxiv|SSRN|ACS\s*Publications|Oxford\s*Academic|Cell\s*Press|PLOS(\s+ONE)?)\s*$/i,
    ""
  )
  return title.trim()
}
