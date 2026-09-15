"use client"

import { track as vercelTrack } from "@vercel/analytics"

// ---------------------------------------------------------------------------
// Typed event catalogue
// ---------------------------------------------------------------------------

export type AnalyticsEvent =
  // Auth
  | "google_auth_clicked"
  | "signup_form_started"
  | "signup_submitted"
  | "signup_error"
  // Onboarding
  | "onboarding_step1_completed"
  | "onboarding_completed"
  // Dashboard
  | "new_design_clicked"
  | "new_report_clicked"
  | "design_opened"
  | "report_opened"
  // Design flow
  | "design_generation_started"
  | "hypothesis_generation_started"
  | "literature_search_started"
  | "design_pdf_downloaded"
  | "design_chat_message_sent"
  | "clarify_opened"
  | "clarify_completed"
  // Report flow
  | "report_generation_started"
  | "report_clarify_completed"
  // Welcome / landing
  | "landing_cta_clicked"
  | "landing_slide_changed"
  // Billing / bottom of funnel.
  // Nothing downstream of signup was instrumented, so the path from "hit a
  // limit" to "paid" was invisible: we could see people using the product but
  // not whether they ever met the paywall, let alone converted.
  | "paywall_hit"
  | "upgrade_clicked"
  | "plan_upgrade_started"
  | "billing_panel_viewed"

export type TrackProperties = Record<string, string | number | boolean | null>

export function track(event: AnalyticsEvent, props?: TrackProperties): void {
  try {
    vercelTrack(event, props ?? {})
  } catch {
    // Never throw - analytics must never break the product.
  }
}
