import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveFirstYieldTutorialStep,
  type FirstYieldTutorialSnapshot,
} from "../src/market/tutorial-flow.ts";
import {
  emptyDraftNodes,
  makeGuidedNode,
} from "../src/market/builder-draft.ts";
import { evaluateRecipe } from "../src/market/market-recipe.ts";
import type { MarketBuilderNode } from "../src/market/market-world.ts";

const snapshot = (
  overrides: Partial<FirstYieldTutorialSnapshot> = {},
): FirstYieldTutorialSnapshot => ({
  view: "map",
  hasPostedContract: false,
  targetRequestStatus: null,
  hasActiveTargetLoan: false,
  repaidLoans: 0,
  totalAssets: 1_000,
  assetTarget: 3_000,
  selectedDemandKind: null,
  hasDepositContract: false,
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
    "inspect-deposit",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({
        repaidLoans: 1,
        selectedDemandKind: "deposit",
        view: "demand",
      }),
    ),
    "open-deposit-builder",
  );
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({ repaidLoans: 1, totalAssets: 3_000 }),
    ),
    "claim-reward",
  );
});

test("a completed repayment always wins over stale UI state", () => {
  assert.equal(
    deriveFirstYieldTutorialStep(
      snapshot({
        view: "builder",
        repaidLoans: 1,
        totalAssets: 3_000,
        draftIsReady: false,
      }),
    ),
    "claim-reward",
  );
});

test("guided loan nodes preset a visible ten-percent first yield", () => {
  const nodes: MarketBuilderNode[] = emptyDraftNodes();
  nodes.push(makeGuidedNode("transfer", "loan", nodes));
  nodes.push(makeGuidedNode("wait", "loan", nodes));
  const repayment = makeGuidedNode("transfer", "loan", nodes);

  assert.equal(repayment.kind, "transfer");
  assert.equal(repayment.senderId, "customer");
  assert.equal(repayment.recipientId, "player");
  assert.equal(evaluateRecipe(repayment.amount, { amount: 300 }), 330);
});

test("guided deposit nodes reverse cash flow and preset six-percent payout", () => {
  const nodes: MarketBuilderNode[] = emptyDraftNodes();
  const funding = makeGuidedNode("transfer", "deposit", nodes);
  nodes.push(funding, makeGuidedNode("wait", "deposit", nodes));
  const payout = makeGuidedNode("transfer", "deposit", nodes);

  assert.equal(funding.kind, "transfer");
  assert.equal(funding.senderId, "customer");
  assert.equal(funding.recipientId, "player");
  assert.equal(payout.kind, "transfer");
  assert.equal(payout.senderId, "player");
  assert.equal(payout.recipientId, "customer");
  assert.equal(evaluateRecipe(payout.amount, { amount: 700 }), 742);
});
