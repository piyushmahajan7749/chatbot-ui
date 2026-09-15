import { toast } from "sonner"

import { track } from "@/lib/analytics"

/**
 * Client-side helpers for the 402 "out of credits" path. Server routes return
 * `{ code: "TOKEN_LIMIT", ... }` with status 402 (see lib/billing/errors.ts).
 */

export const OPEN_BILLING_EVENT = "shadow:open-billing"

/** Opens Settings → Usage & Billing (profile-settings listens for this). */
export function openBillingSettings(source: string = "unknown") {
  track("upgrade_clicked", { source })
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
  let body: { code?: string; limit?: number } | undefined
  try {
    body = await res.clone().json()
  } catch {
    /* ignore parse errors */
  }
  const code = body?.code

  if (code === "EXPERIMENT_LIMIT") {
    const limit = body?.limit ?? 3
    track("paywall_hit", { code: "EXPERIMENT_LIMIT", limit })
    toast.error(`You’ve used your ${limit} free experiments.`, {
      description: "Upgrade to keep designing new experiments.",
      action: {
        label: "Upgrade",
        onClick: () => openBillingSettings("paywall_experiment_limit")
      },
      duration: 9000
    })
    return true
  }

  if (code !== "TOKEN_LIMIT") return false

  track("paywall_hit", { code: "TOKEN_LIMIT" })

  toast.error("You’re out of credits for this billing period.", {
    description: "Upgrade your plan or add credits to keep going.",
    action: {
      label: "Upgrade",
      onClick: () => openBillingSettings("paywall_token_limit")
    },
    duration: 8000
  })
  return true
}
