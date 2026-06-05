import { NextResponse } from "next/server"
import type { PlanId } from "./plans"

/**
 * Thrown by the pre-flight budget check when a user has no credits left for
 * the period. Routes map this to a 402 via `budgetErrorResponse`.
 */
export class BudgetExceededError extends Error {
  readonly code = "TOKEN_LIMIT"
  readonly plan: PlanId
  constructor(
    plan: PlanId,
    message = "Token limit reached for this billing period"
  ) {
    super(message)
    this.name = "BudgetExceededError"
    this.plan = plan
  }
}

export function isBudgetExceededError(e: unknown): e is BudgetExceededError {
  return (
    e instanceof BudgetExceededError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "TOKEN_LIMIT")
  )
}

/** Standard 402 payload. The client (handle-budget-error.ts) keys off `code`. */
export function budgetErrorResponse(plan: PlanId = "free") {
  return NextResponse.json(
    {
      error:
        "You've used all your credits for this billing period. Upgrade your plan or add credits to continue.",
      code: "TOKEN_LIMIT",
      plan
    },
    { status: 402 }
  )
}
