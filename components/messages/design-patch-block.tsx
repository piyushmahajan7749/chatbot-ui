"use client"

/**
 * Inline "proposed edit" card rendered by the chat when the assistant
 * suggests a change to a design. The block lives in the assistant's reply as:
 *
 *   <design-patch>
 *   { "sectionHeading": "Materials", "find": "5 mM phosphate buffer",
 *     "replace": "20 mM phosphate buffer", "designIndex": 0 }
 *   </design-patch>
 *
 * Approve dispatches a `design:apply-patch` CustomEvent on `window` carrying
 * the parsed patch payload — the design detail page listens for it and
 * applies the change to its generatedDesigns state + persists. Using a window
 * event instead of prop drilling keeps MessageMarkdown / ChatUI / the rail
 * agnostic of design-specific state.
 */

import { useState } from "react"

import { IconCheck, IconEdit, IconX } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export interface DesignPatch {
  sectionHeading: string
  find?: string
  replace?: string
  /** Optional: replace the whole section body. */
  newBody?: string
  /** Which generated design to apply to (default: the active one). */
  designIndex?: number
}

interface DesignPatchBlockProps {
  patch: DesignPatch
}

export function DesignPatchBlock({ patch }: DesignPatchBlockProps) {
  const [state, setState] = useState<"pending" | "applied" | "rejected">(
    "pending"
  )

  const handleApprove = () => {
    if (state !== "pending") return
    window.dispatchEvent(
      new CustomEvent<DesignPatch>("design:apply-patch", { detail: patch })
    )
    setState("applied")
  }
  const handleReject = () => {
    if (state !== "pending") return
    setState("rejected")
  }

  const isWholeReplace = !!patch.newBody && !patch.find

  return (
    <div
      className={cn(
        "border-orange-product/40 bg-orange-product-tint/40 my-3 rounded-xl border p-3",
        state === "applied" && "border-emerald-300 bg-emerald-50",
        state === "rejected" && "opacity-50 grayscale"
      )}
    >
      <div className="text-orange-product mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]">
        <IconEdit size={12} />
        Proposed edit
        <span className="text-ink-3 ml-auto font-mono font-normal normal-case tracking-normal">
          Section: <b className="text-ink">{patch.sectionHeading}</b>
        </span>
      </div>

      <div className="space-y-2 text-[12.5px]">
        {isWholeReplace ? (
          <div>
            <div className="text-ink-3 mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider">
              New body
            </div>
            <pre className="bg-paper-2 text-ink whitespace-pre-wrap break-words rounded-md p-2 font-mono text-[11.5px]">
              {patch.newBody}
            </pre>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-ink-3 mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider">
                Find
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 p-2 font-mono text-[11.5px] text-red-900">
                {patch.find}
              </pre>
            </div>
            <div>
              <div className="text-ink-3 mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider">
                Replace with
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-emerald-200 bg-emerald-50 p-2 font-mono text-[11.5px] text-emerald-900">
                {patch.replace}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {state === "applied" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <IconCheck size={12} /> Applied
          </span>
        ) : state === "rejected" ? (
          <span className="text-ink-3 bg-paper-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
            Rejected
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={handleReject}
              className="text-ink-3 hover:bg-paper-2 hover:text-ink inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11.5px] font-medium"
            >
              <IconX size={12} />
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11.5px] font-semibold text-white hover:bg-emerald-700"
            >
              <IconCheck size={12} />
              Approve &amp; apply
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Pull patch blocks out of a raw assistant message. Returns an ordered list
 * of segments — each is either a plain-text chunk (to be rendered via the
 * normal markdown pipeline) or a parsed patch (to be rendered as a
 * DesignPatchBlock). Malformed JSON inside a `<design-patch>` tag falls
 * through to a text segment so the user still sees what the assistant said.
 */
export function extractDesignPatches(
  content: string
): Array<
  { kind: "text"; value: string } | { kind: "patch"; patch: DesignPatch }
> {
  const regex = /<design-patch>([\s\S]*?)<\/design-patch>/g
  const out: Array<
    { kind: "text"; value: string } | { kind: "patch"; patch: DesignPatch }
  > = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: "text", value: content.slice(lastIndex, m.index) })
    }
    const raw = m[1].trim()
    try {
      const parsed = JSON.parse(raw) as DesignPatch
      if (
        parsed &&
        typeof parsed.sectionHeading === "string" &&
        (parsed.find !== undefined || parsed.newBody !== undefined)
      ) {
        out.push({ kind: "patch", patch: parsed })
      } else {
        out.push({ kind: "text", value: m[0] })
      }
    } catch {
      out.push({ kind: "text", value: m[0] })
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < content.length) {
    out.push({ kind: "text", value: content.slice(lastIndex) })
  }
  return out
}
