import type { ConsultationQuestionId } from "./market-consultation.ts";
import { onboardingAtLeast, type OnboardingStep } from "./market-onboarding.ts";

export const COACHMARK_IDS = [
  "first-customer",
  "approve-first-loan",
  "play-first-repayment",
  "second-customer",
  "launch-deposit-product",
  "create-loan-product",
  "drag-market-map",
] as const;

export type CoachmarkId = (typeof COACHMARK_IDS)[number];

export type CoachmarkCopyKey =
  | "askPurpose"
  | "firstLoanApprovalCoachmark"
  | "onboardingFirstRepayment"
  | "onboardingSecondDecision"
  | "onboardingDepositProduct"
  | "onboardingLoanProduct"
  | "dragCityHint";

export type CoachmarkDefinition = {
  step: OnboardingStep;
  copyKey: CoachmarkCopyKey;
  title: "first-step" | "new-control";
};

export const COACHMARKS: Record<CoachmarkId, CoachmarkDefinition> = {
  "first-customer": {
    step: "first-customer",
    copyKey: "askPurpose",
    title: "first-step",
  },
  "approve-first-loan": {
    step: "first-customer",
    copyKey: "firstLoanApprovalCoachmark",
    title: "new-control",
  },
  "play-first-repayment": {
    step: "first-repayment",
    copyKey: "onboardingFirstRepayment",
    title: "new-control",
  },
  "second-customer": {
    step: "second-decision",
    copyKey: "onboardingSecondDecision",
    title: "new-control",
  },
  "launch-deposit-product": {
    step: "deposits",
    copyKey: "onboardingDepositProduct",
    title: "new-control",
  },
  "create-loan-product": {
    step: "products",
    copyKey: "onboardingLoanProduct",
    title: "new-control",
  },
  "drag-market-map": {
    step: "full",
    copyKey: "dragCityHint",
    title: "new-control",
  },
};

const COACHMARKS_BY_STEP: Record<OnboardingStep, readonly CoachmarkId[]> = {
  "first-customer": ["first-customer", "approve-first-loan"],
  "first-repayment": ["play-first-repayment"],
  "second-decision": ["second-customer"],
  deposits: ["launch-deposit-product"],
  products: ["create-loan-product"],
  full: ["drag-market-map"],
};

export type MarketUiState = {
  hasDraggedMap: boolean;
  introducedCoachmarks: CoachmarkId[];
  completedCoachmarks: CoachmarkId[];
};

export function initialMarketUiState(): MarketUiState {
  return {
    hasDraggedMap: false,
    introducedCoachmarks: [],
    completedCoachmarks: [],
  };
}

export function isCoachmarkId(value: unknown): value is CoachmarkId {
  return COACHMARK_IDS.includes(value as CoachmarkId);
}

export function coachmarkTarget(id: CoachmarkId | null | undefined): {
  "data-coachmark"?: CoachmarkId;
} {
  return id ? { "data-coachmark": id } : {};
}

export function introduceCoachmark(
  state: MarketUiState,
  id: CoachmarkId,
): MarketUiState {
  return state.introducedCoachmarks.includes(id)
    ? state
    : {
        ...state,
        introducedCoachmarks: [...state.introducedCoachmarks, id],
      };
}

export function completeCoachmark(
  state: MarketUiState,
  id: CoachmarkId,
): MarketUiState {
  if (state.completedCoachmarks.includes(id)) return state;
  return {
    ...introduceCoachmark(state, id),
    completedCoachmarks: [...state.completedCoachmarks, id],
  };
}

export function activeCoachmarkFor(
  onboarding: OnboardingStep,
  state: MarketUiState,
  asked: readonly ConsultationQuestionId[] = [],
): CoachmarkId | null {
  for (const candidate of COACHMARKS_BY_STEP[onboarding]) {
    if (state.completedCoachmarks.includes(candidate)) continue;
    if (
      candidate === "approve-first-loan" &&
      (!asked.includes("purpose") || !asked.includes("income"))
    )
      return null;
    return candidate;
  }
  return null;
}

export function inferredCompletedCoachmarks(
  onboarding: OnboardingStep,
  asked: readonly ConsultationQuestionId[],
  hasDraggedMap: boolean,
): CoachmarkId[] {
  const completed = COACHMARK_IDS.filter((id) => {
    if (id === "drag-market-map") return hasDraggedMap;
    if (id === "first-customer" && onboarding === "first-customer")
      return asked.includes("purpose");
    const step = COACHMARKS[id].step;
    return onboarding !== step && onboardingAtLeast(onboarding, step);
  });
  return completed;
}
