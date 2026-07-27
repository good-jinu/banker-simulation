import { describe, expect, it } from "vitest";
import {
  advanceOnboarding,
  onboardingCapabilities,
  shouldPauseOnOnboardingEntry,
} from "./market-onboarding.ts";

describe("market onboarding", () => {
  it("advances only for the event expected by the current step", () => {
    expect(advanceOnboarding("first-customer", "intro-loan-approved")).toBe(
      "first-repayment",
    );
    expect(advanceOnboarding("first-customer", "loan-product-created")).toBe(
      "first-customer",
    );
    expect(advanceOnboarding("deposits", "deposit-product-created")).toBe(
      "products",
    );
  });

  it("derives progressively unlocked capabilities", () => {
    expect(onboardingCapabilities("first-repayment")).toMatchObject({
      trust: false,
      deposits: false,
      products: false,
      fullMarket: false,
    });
    expect(onboardingCapabilities("products")).toMatchObject({
      trust: true,
      deposits: true,
      products: true,
      fullMarket: false,
    });
  });

  it("identifies teaching milestones that pause the clock", () => {
    expect(shouldPauseOnOnboardingEntry("second-decision")).toBe(true);
    expect(shouldPauseOnOnboardingEntry("full")).toBe(false);
  });
});
