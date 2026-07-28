import { describe, expect, it } from "vitest";
import {
  activeCoachmarkFor,
  completeCoachmark,
  inferredCompletedCoachmarks,
  initialMarketUiState,
  introduceCoachmark,
} from "./market-ui-state.ts";

describe("initialMarketUiState", () => {
  it("shows the map drag tutorial for a new run", () => {
    expect(initialMarketUiState()).toEqual({
      hasDraggedMap: false,
      seenStageIntro: false,
      introducedCoachmarks: [],
      completedCoachmarks: [],
    });
  });

  it("records introduction separately from successful completion", () => {
    const introduced = introduceCoachmark(
      initialMarketUiState(),
      "first-customer",
    );
    expect(introduced.introducedCoachmarks).toEqual(["first-customer"]);
    expect(introduced.completedCoachmarks).toEqual([]);

    const completed = completeCoachmark(introduced, "first-customer");
    expect(completed.completedCoachmarks).toEqual(["first-customer"]);
  });

  it("selects only the first unfinished coachmark for the current step", () => {
    const state = completeCoachmark(initialMarketUiState(), "first-customer");
    expect(activeCoachmarkFor("first-customer", state)).toBeNull();
    expect(
      activeCoachmarkFor("first-customer", state, ["purpose", "income"]),
    ).toBe("approve-first-loan");
    expect(activeCoachmarkFor("first-repayment", state)).toBe(
      "play-first-repayment",
    );
  });

  it("infers past coachmarks for a returning guided run", () => {
    expect(inferredCompletedCoachmarks("products", [], false)).toEqual([
      "first-customer",
      "approve-first-loan",
      "play-first-repayment",
      "second-customer",
      "launch-deposit-product",
    ]);
  });
});
