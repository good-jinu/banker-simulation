import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveFirstYieldTutorialStep,
  type FirstYieldTutorialSnapshot,
} from "../src/market/tutorial-flow.ts";

const snapshot = (
  overrides: Partial<FirstYieldTutorialSnapshot> = {},
): FirstYieldTutorialSnapshot => ({
  view: "map",
  hasPostedContract: false,
  targetRequestStatus: null,
  hasActiveTargetLoan: false,
  repaidLoans: 0,
  draftIsReady: false,
  ...overrides,
});

test("the first-yield tutorial follows the real market lifecycle", () => {
  assert.equal(deriveFirstYieldTutorialStep(snapshot()), "inspect-request");
  assert.equal(
    deriveFirstYieldTutorialStep(snapshot({ view: "demand" })),
    "open-builder",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(snapshot({ view: "builder" })),
    "build-contract",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({ view: "builder", draftIsReady: true }),
    ),
    "post-contract",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(snapshot({ hasPostedContract: true })),
    "await-request",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({ hasPostedContract: true, targetRequestStatus: "pending" }),
    ),
    "approve-request",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({
        hasPostedContract: true,
        targetRequestStatus: "accepted",
        hasActiveTargetLoan: true,
      }),
    ),
    "collect-repayment",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(snapshot({ repaidLoans: 1 })),
    "claim-reward",
  );
});

test("a completed repayment always wins over stale UI state", () => {
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({ view: "builder", repaidLoans: 1, draftIsReady: false }),
    ),
    "claim-reward",
  );
});
