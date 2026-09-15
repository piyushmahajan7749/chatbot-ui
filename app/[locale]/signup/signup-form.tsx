"use client"

import { FC, useEffect, useState } from "react"

import { PasswordInput, scorePassword } from "@/components/auth/password-input"
import { GoogleButton } from "@/components/auth/google-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { track } from "@/lib/analytics"

interface SignupFormProps {
  /** Server action bound by the parent page. */
  action: (formData: FormData) => Promise<void> | void
  defaultEmail?: string
  error: string | null
  message: string | null
}

/**
 * Client wrapper around the signup `<form>` so we can score the
 * password in real time and disable the submit button until it's at
 * least "Fair" (3/4 segments). Keeps the server action a plain
 * progressive-enhancement target.
 */
export const SignupForm: FC<SignupFormProps> = ({
  action,
  defaultEmail = "",
  error,
  message
}) => {
  const [password, setPassword] = useState("")
  const [agreed, setAgreed] = useState(true)
  const strength = scorePassword(password)

  // Gate on exactly what the server enforces (8 characters) and nothing more.
  // The old gate also required strength >= 2, which silently greyed out the
  // button for anyone who typed 8-11 lowercase characters - i.e. anyone who
  // did what the placeholder told them to. Nothing explained why, and because
  // a disabled button never fires onSubmit, it was invisible in analytics.
  // Weak passwords now get a visible nudge instead of a dead end.
  const tooShort = password.length > 0 && password.length < 8
  const isWeak = password.length >= 8 && strength < 2
  const submitDisabled = !agreed || password.length < 8

  // Track signup errors surfaced from the server action via searchParams.
  useEffect(() => {
    if (error) track("signup_error", { reason: error.slice(0, 80) })
  }, [error])

  // Fires once, on first keystroke in any field. Without this we can only see
  // completed submissions, so a visitor who engaged with the form and gave up
  // is indistinguishable from one who never touched it - which is exactly the
  // gap in the funnel we are trying to close.
  const [started, setStarted] = useState(false)
  const onFirstInput = () => {
    if (!started) {
      setStarted(true)
      track("signup_form_started")
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <GoogleButton next="/" />
      <div className="flex items-center gap-3">
        <span className="bg-line h-px flex-1" />
        <span className="text-ink-3 text-[11.5px] uppercase tracking-wide">
          or sign up with email
        </span>
        <span className="bg-line h-px flex-1" />
      </div>
      <form
        className="flex w-full flex-col gap-4"
        action={action}
        onInput={onFirstInput}
        onSubmit={() => track("signup_submitted")}
      >
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="full_name"
            className="text-ink text-[12.5px] font-medium"
          >
            Full name <span className="text-ink-3 font-normal">(optional)</span>
          </Label>
          {/* Not `required`: the server action already falls back to the email
              local-part when this is blank, so marking it required was pure
              friction on the highest-traffic page in the app. */}
          <Input
            id="full_name"
            name="full_name"
            placeholder="Ada Lovelace"
            autoComplete="name"
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {/* "Work email" read as an institutional-address requirement to
              academics on gmail; the server imposes no such restriction unless
              EMAIL_DOMAIN_WHITELIST is set. */}
          <Label htmlFor="email" className="text-ink text-[12.5px] font-medium">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@lab.edu"
            autoComplete="email"
            defaultValue={defaultEmail}
            required
          />
        </div>

        <PasswordInput
          name="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          showStrength
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          required
        />

        {(tooShort || isWeak) && (
          <p className="text-ink-3 -mt-2 text-[12px] leading-snug">
            {tooShort
              ? `${8 - password.length} more character${8 - password.length === 1 ? "" : "s"} to go.`
              : "That will work - a longer password, or one with a capital or a number, would be stronger."}
          </p>
        )}

        <label className="text-ink-3 mt-1 flex items-start gap-2 text-[12px] leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 cursor-pointer accent-[var(--rust)]"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
          />
          <span>
            I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-ink-2 underline-offset-2 hover:underline"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-ink-2 underline-offset-2 hover:underline"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        <SubmitButton
          disabled={submitDisabled}
          className="bg-rust text-paper border-rust mt-2 inline-flex h-10 items-center justify-center rounded-md border px-4 text-[14px] font-medium transition-colors hover:bg-[color:var(--rust-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Create account
        </SubmitButton>

        <p className="text-ink-3 text-center text-[12px] leading-snug">
          3 experiment designs a month, free. No credit card.
        </p>

        {(error || message) && (
          <p
            className={`mt-1 rounded-md border p-3 text-center text-[12.5px] ${
              error
                ? "bg-rust-soft text-rust-ink border-rust-soft"
                : "bg-paper-2 text-ink-2 border-line"
            }`}
          >
            {error || message}
          </p>
        )}
      </form>
    </div>
  )
}
