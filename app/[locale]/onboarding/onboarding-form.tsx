"use client"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import { RoleStep } from "@/components/onboarding/role-step"
import { UseCaseStep } from "@/components/onboarding/use-case-step"
import { FC, useState, useTransition } from "react"
import { toast } from "sonner"
import { completeOnboarding, saveOnboardingStep1 } from "./actions"

type Role = "researcher" | "scientist" | "student" | "pm" | "other"
type UseCase = "design" | "validate" | "explore" | "browse"

interface OnboardingFormProps {
  initialStep: number
  initialDisplayName: string
  initialRole: Role | null
  initialResearchField: string
  initialUseCase: UseCase | null
}

export const OnboardingForm: FC<OnboardingFormProps> = ({
  initialStep,
  initialDisplayName,
  initialRole,
  initialResearchField,
  initialUseCase
}) => {
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState<1 | 2>(initialStep >= 1 ? 2 : 1)

  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [role, setRole] = useState<Role | null>(initialRole)
  const [researchField, setResearchField] = useState(initialResearchField)

  const [useCase, setUseCase] = useState<UseCase | null>(initialUseCase)

  const handleStep1Continue = () => {
    if (!displayName.trim()) {
      toast.error("Display name is required.")
      return
    }
    if (!role) {
      toast.error("Pick a role to continue.")
      return
    }

    startTransition(async () => {
      const result = await saveOnboardingStep1({
        display_name: displayName.trim(),
        role,
        research_field: researchField.trim() || null
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setStep(2)
    })
  }

  const handleFinish = () => {
    if (!useCase) {
      toast.error("Pick what you'd like to do first.")
      return
    }

    startTransition(async () => {
      const result = await completeOnboarding({ use_case: useCase })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Full page navigation so GlobalState remounts with the freshly-saved
      // profile (display_name, use_case) — a client-side router.replace would
      // leave stale context behind and skip the personalization payoff.
      const target = result.homeWorkspaceId
        ? `/${result.homeWorkspaceId}/chat`
        : "/"
      window.location.href = target
    })
  }

  if (step === 1) {
    return (
      <OnboardingShell
        stepNum={1}
        totalSteps={2}
        eyebrow="Step 1 of 2"
        title="Welcome to Shadow AI"
        description="A couple of quick things so we can tailor your experience."
        onContinue={handleStep1Continue}
        continueLabel="Continue"
        continueDisabled={isPending || !displayName.trim() || !role}
        isPending={isPending}
      >
        <RoleStep
          displayName={displayName}
          role={role}
          researchField={researchField}
          onDisplayNameChange={setDisplayName}
          onRoleChange={setRole}
          onResearchFieldChange={setResearchField}
        />
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell
      stepNum={2}
      totalSteps={2}
      eyebrow="Step 2 of 2"
      title="What brings you here today?"
      description="Pick what matters most right now — you can explore everything later."
      onBack={() => setStep(1)}
      onContinue={handleFinish}
      continueLabel="Open my workspace"
      continueDisabled={isPending || !useCase}
      isPending={isPending}
    >
      <UseCaseStep useCase={useCase} onUseCaseChange={setUseCase} />
    </OnboardingShell>
  )
}
