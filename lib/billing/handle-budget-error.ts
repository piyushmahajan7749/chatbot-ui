import { toast } from "sonner"

/**
 * Client-side helpers for the 402 "out of credits" path. Server routes return
 * `{ code: "TOKEN_LIMIT", ... }` with status 402 (see lib/billing/errors.ts).
 */

export const OPEN_BILLING_EVENT = "shadow:open-billing"

/** Opens Settings → Usage & Billing (profile-settings listens for this). */
export function openBillingSettings() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_BILLING_EVENT))
  }
}

/**
 * If `res` is a budget (402 TOKEN_LIMIT) error, show an upgrade toast and return
 * true. Otherwise return false so the caller continues its normal handling.
 * Reads a clone so the caller can still consume the body.
 */
export async function handleBudgetError(res: Response): Promise<boolean> {
  if (res.status !== 402) return false
  let code: string | undefined
  try {
    code = (await res.clone().json())?.code
  } catch {
    /* ignore parse errors */
  }
  if (code !== "TOKEN_LIMIT") return false

  toast.error("You’re out of credits for this billing period.", {
    description: "Upgrade your plan or add credits to keep going.",
    action: { label: "Upgrade", onClick: openBillingSettings },
    duration: 8000
  })
  return true
}
