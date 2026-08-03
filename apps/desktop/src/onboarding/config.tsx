import { platform } from "@tauri-apps/plugin-os";

import type { SectionStatus } from "./shared";

export type OnboardingStep =
  | "permissions"
  | "login"
  | "calendar"
  | "models"
  | "folder-location"
  | "final";

// "login" is gone, not reordered: it offered to "unlock powerful AI models,
// sync across devices, and personalization" by opening meeki.ai/auth, which
// returns 404. The user came back from the browser still signed out, with no
// feedback. Promising an account there is no way to create is worse than not
// mentioning accounts at all.
const STEPS_MACOS: OnboardingStep[] = [
  "permissions",
  "calendar",
  "models",
  "final",
];
const STEPS_OTHER: OnboardingStep[] = ["calendar", "models", "final"];

function getOnboardingSteps(): OnboardingStep[] {
  return platform() === "macos" ? STEPS_MACOS : STEPS_OTHER;
}

export function getInitialStep(): OnboardingStep {
  return getOnboardingSteps()[0];
}

export function getNextStep(
  currentStep: OnboardingStep,
): OnboardingStep | null {
  const steps = getOnboardingSteps();
  const idx = steps.indexOf(currentStep);
  return idx < steps.length - 1 ? steps[idx + 1] : null;
}

export function getPrevStep(
  currentStep: OnboardingStep,
): OnboardingStep | null {
  const steps = getOnboardingSteps();
  const idx = steps.indexOf(currentStep);
  return idx > 0 ? steps[idx - 1] : null;
}

export function getStepStatus(
  step: OnboardingStep,
  currentStep: OnboardingStep,
): SectionStatus | null {
  const steps = getOnboardingSteps();
  const stepIdx = steps.indexOf(step);
  if (stepIdx === -1) return null;
  const currentIdx = steps.indexOf(currentStep);
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "active";
  return "upcoming";
}
