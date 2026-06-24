/**
 * Client-safe pieces of the Refine flow — constants, the checkpoint type, and
 * the pure answer→text flattener. Kept FREE of the Azure/OpenAI SDK so client
 * components (the design page, ClarifyStep) can import them without dragging
 * server-only deps (node:async_hooks) into the browser bundle. The server-only
 * question generator lives in ./clarify.
 */
import type { ClarifyAnswer } from "@/lib/design-agent"

export type ClarifyCheckpoint = "problem" | "design"

/** Hard caps so the adaptive question loop is bounded. */
export const CLARIFY_MAX_ROUNDS = 2
export const CLARIFY_MAX_TOTAL = 6

/**
 * Flatten answered questions into the directive block injected into the
 * literature / hypotheses / design prompts (carried via additionalDetails /
 * designSpec so the existing phases need no change).
 */
export function clarifyAnswersToText(answers: ClarifyAnswer[]): string {
  const lines = answers
    .filter(a => !a.skipped)
    .map(a => {
      const val =
        [a.selected.join(", "), a.other].filter(Boolean).join(" — ") || ""
      return val ? `- ${a.prompt}: ${val}` : ""
    })
    .filter(Boolean)
  return lines.join("\n")
}
