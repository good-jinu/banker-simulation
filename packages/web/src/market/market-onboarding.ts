export const ONBOARDING_STEPS = [
  "first-customer",
  "first-repayment",
  "second-decision",
  "deposits",
  "products",
  "full",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingEvent =
  | "intro-loan-approved"
  | "intro-loan-repaid"
  | "second-decision-made"
  | "deposit-product-created"
  | "loan-product-created";

export type OnboardingCapabilities = {
  openingLesson: boolean;
  awaitingFirstRepayment: boolean;
  trust: boolean;
  deposits: boolean;
  products: boolean;
  fullMarket: boolean;
};

const STEP_INDEX = new Map(
  ONBOARDING_STEPS.map((step, index) => [step, index]),
);

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return ONBOARDING_STEPS.includes(value as OnboardingStep);
}

export function onboardingAtLeast(
  step: OnboardingStep,
  minimum: OnboardingStep,
): boolean {
  return STEP_INDEX.get(step)! >= STEP_INDEX.get(minimum)!;
}

export function onboardingCapabilities(
  step: OnboardingStep,
): OnboardingCapabilities {
  const openingLesson = step === "first-customer";
  const awaitingFirstRepayment = step === "first-repayment";
  return {
    openingLesson,
    awaitingFirstRepayment,
    trust: !openingLesson && !awaitingFirstRepayment,
    deposits: onboardingAtLeast(step, "deposits"),
    products: onboardingAtLeast(step, "products"),
    fullMarket: step === "full",
  };
}

export function shouldPauseOnOnboardingEntry(step: OnboardingStep): boolean {
  return (
    step === "second-decision" || step === "deposits" || step === "products"
  );
}

export function advanceOnboarding(
  step: OnboardingStep,
  event: OnboardingEvent,
): OnboardingStep {
  if (step === "first-customer" && event === "intro-loan-approved")
    return "first-repayment";
  if (step === "first-repayment" && event === "intro-loan-repaid")
    return "second-decision";
  if (step === "second-decision" && event === "second-decision-made")
    return "deposits";
  if (step === "deposits" && event === "deposit-product-created")
    return "products";
  if (step === "products" && event === "loan-product-created") return "full";
  return step;
}
