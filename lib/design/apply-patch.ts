import type { GeneratedDesign } from "@/lib/design-agent"

/**
 * Apply a chat-proposed `<design-patch>` to a design's sections. The model is
 * reliable at quoting `find` text verbatim (gpt-5.x quotes even tables / units
 * exactly), but the apply step used to require a BYTE-exact match on both the
 * section heading and the find-text - a single stray space turned a valid edit
 * into a hard failure. This pure helper keeps the exact path (unchanged when it
 * works) and adds tolerant fallbacks, so it's robust and unit-testable.
 */
export interface DesignPatchInput {
  sectionHeading: string
  find?: string
  replace?: string
  newBody?: string
  designIndex?: number
}

export interface ApplyPatchResult {
  designs?: GeneratedDesign[]
  sectionHeading?: string
  error?: string
}

const normHeading = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Replace `find` with `replace` in `body`. Exact match first; then trimmed;
 * then a whitespace-tolerant regex (LLMs occasionally re-wrap whitespace when
 * quoting). Returns null only when the text genuinely can't be located.
 */
export function applyFindReplace(
  body: string,
  find: string,
  replace: string
): string | null {
  if (find && body.includes(find)) return body.split(find).join(replace)
  const f = find.trim()
  if (f && body.includes(f)) return body.replace(f, () => replace.trim())
  if (f) {
    // Collapse runs of whitespace in the find text to `\s+` so a re-wrapped
    // quote still matches. Escape regex metacharacters first.
    const escaped = f
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+")
    try {
      const re = new RegExp(escaped)
      if (re.test(body)) return body.replace(re, () => replace.trim())
    } catch {
      // malformed regex → fall through to "not found"
    }
  }
  return null
}

export function applyDesignPatch(
  designs: GeneratedDesign[],
  activeDesignId: string | null,
  patch: DesignPatchInput
): ApplyPatchResult {
  if (!patch?.sectionHeading) return { error: "Malformed edit (no section)." }
  if (designs.length === 0) return { error: "There's no design to edit yet." }

  const idx =
    typeof patch.designIndex === "number" && patch.designIndex >= 0
      ? Math.min(patch.designIndex, designs.length - 1)
      : Math.max(
          0,
          designs.findIndex(d => d.id === activeDesignId)
        )
  const target = designs[idx]
  if (!target) return { error: "Couldn't find the design to edit." }

  // Heading: exact first, then trim / case / whitespace-tolerant.
  let sectionIdx = target.sections.findIndex(
    s => s.heading === patch.sectionHeading
  )
  if (sectionIdx === -1) {
    const wanted = normHeading(patch.sectionHeading)
    sectionIdx = target.sections.findIndex(
      s => normHeading(s.heading) === wanted
    )
  }
  if (sectionIdx === -1) {
    return {
      error: `No section called "${patch.sectionHeading}" - the assistant may have used a heading that isn't in this design.`
    }
  }

  const section = target.sections[sectionIdx]
  let nextBody: string
  if (patch.newBody !== undefined) {
    nextBody = patch.newBody
  } else if (patch.find !== undefined && patch.replace !== undefined) {
    const replaced = applyFindReplace(section.body, patch.find, patch.replace)
    if (replaced === null) {
      return {
        error:
          "Couldn't locate the text to change in that section - ask the assistant to propose the edit again."
      }
    }
    nextBody = replaced
  } else {
    return { error: "Malformed edit (need find + replace, or newBody)." }
  }

  const nextSections = [...target.sections]
  nextSections[sectionIdx] = { ...section, body: nextBody }
  const nextDesigns = [...designs]
  nextDesigns[idx] = { ...target, sections: nextSections }
  return { designs: nextDesigns, sectionHeading: section.heading }
}
