"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { FC } from "react"

type Role = "researcher" | "scientist" | "student" | "pm" | "other"

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "researcher", label: "Researcher" },
  { value: "scientist", label: "Scientist" },
  { value: "student", label: "Grad student" },
  { value: "pm", label: "PM" },
  { value: "other", label: "Other" }
]

const FIELD_SUGGESTIONS = [
  "Biology",
  "Chemistry",
  "Neuroscience",
  "Physics",
  "CS / ML",
  "Social sciences",
  "Clinical"
]

interface RoleStepProps {
  displayName: string
  role: Role | null
  researchField: string
  onDisplayNameChange: (value: string) => void
  onRoleChange: (value: Role) => void
  onResearchFieldChange: (value: string) => void
}

export const RoleStep: FC<RoleStepProps> = ({
  displayName,
  role,
  researchField,
  onDisplayNameChange,
  onRoleChange,
  onResearchFieldChange
}) => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="display_name"
          className="text-ink text-[12.5px] font-medium"
        >
          What should we call you?
        </Label>
        <Input
          id="display_name"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
          placeholder="Your name"
          autoComplete="given-name"
          maxLength={80}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-ink text-[12.5px] font-medium">Your role</Label>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map(opt => {
            const selected = role === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onRoleChange(opt.value)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors",
                  selected
                    ? "border-rust bg-rust text-paper"
                    : "border-line bg-surface text-ink-2 hover:bg-paper-2 hover:text-ink"
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label
            htmlFor="research_field"
            className="text-ink text-[12.5px] font-medium"
          >
            Research field
          </Label>
          <span className="text-ink-3 text-[11.5px]">Optional</span>
        </div>
        <Input
          id="research_field"
          value={researchField}
          onChange={e => onResearchFieldChange(e.target.value)}
          placeholder="e.g. Neuroscience"
          maxLength={100}
        />
        <div className="mt-1 flex flex-wrap gap-1.5">
          {FIELD_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onResearchFieldChange(suggestion)}
              className={cn(
                "border-line text-ink-3 hover:bg-paper-2 hover:text-ink inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] transition-colors",
                researchField === suggestion &&
                  "border-rust bg-rust-soft text-rust-ink"
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
