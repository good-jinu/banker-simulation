import assert from "node:assert/strict";
import test from "node:test";
import {
  StageEngine,
  type FundableContractTerms,
  type StageSimulationDefinition,
} from "../src/index.ts";

const definition: StageSimulationDefinition = {
  schemaVersion: 1,
  stageId: "first-yield",
  seed: 42,
  currency: "USD",
  startingPlayerCash: 100_000,
  borrower: {
    id: "mina",
    name: "Mina's Workshop",
    needAmount: 100_000,
    minimumFunding: 100_000,
    fundsAvailableAt: 24,
    expectedRevenue: 120_000,
    maximumAcceptedRepayment: 125_000,
  },
  objective: { targetCash: 120_000, deadline: 24 },
  rewardId: "contract-stamp",
};

function terms(repayment = 120_000): FundableContractTerms {
  return {
    id: "contract-1",
    name: "Mina growth advance",
    borrowerId: "mina",
    principal: 100_000,
    repayment,
    dueMonth: 24,
    sourceBlocks: {
      lend: "lend",
      wait: "wait",
      collect: "collect",
      close: "close",
    },
  };
}

test("a funded contract settles and wins at the deadline", () => {
  const engine = new StageEngine(definition);
  assert.deepEqual(engine.publishAndFund(terms()), {
    accepted: true,
    reasons: [],
  });
  engine.advanceToNextEvent();

  const state = engine.inspect();
  assert.equal(state.status, "won");
  assert.equal(state.balances.player, 120_000);
  assert.equal(state.contract?.status, "settled");
  assert.equal(state.rewardEarned, "contract-stamp");
});

test("unaffordable terms are rejected with a visible reason and no cash movement", () => {
  const engine = new StageEngine(definition);
  const result = engine.publishAndFund(terms(130_000));

  assert.equal(result.accepted, false);
  assert.match(result.reasons[0] ?? "", /published limit/);
  assert.equal(engine.inspect().balances.player, 100_000);
  assert.equal(engine.inspect().contract?.status, "rejected");
});

test("an aggressive accepted contract defaults against the known revenue", () => {
  const engine = new StageEngine(definition);
  assert.equal(engine.publishAndFund(terms(125_000)).accepted, true);
  engine.advanceToNextEvent();

  const state = engine.inspect();
  assert.equal(state.status, "lost");
  assert.equal(state.contract?.status, "defaulted");
  assert.equal(state.balances.mina, 120_000);
  assert.equal(state.balances.player, 0);
});

test("saved events replay to an identical run", () => {
  const first = new StageEngine(definition);
  first.publishAndFund(terms());
  first.advanceOneMonth();

  const restored = new StageEngine(definition, first.events());
  assert.deepEqual(restored.inspect(), first.inspect());
  restored.advanceToNextEvent();
  assert.equal(restored.inspect().status, "won");
});

test("saved events cannot be replayed under a different seed", () => {
  const engine = new StageEngine(definition);
  assert.throws(
    () =>
      new StageEngine(
        { ...definition, seed: definition.seed + 1 },
        engine.events(),
      ),
    /different deterministic seed/,
  );
});

test("all cash is conserved across funding, revenue, and repayment", () => {
  const engine = new StageEngine(definition);
  const totalBefore = Object.values(engine.inspect().balances).reduce(
    (sum, value) => sum + value,
    0,
  );
  engine.publishAndFund(terms());
  engine.advanceToNextEvent();
  const totalAfter = Object.values(engine.inspect().balances).reduce(
    (sum, value) => sum + value,
    0,
  );

  assert.equal(totalAfter, totalBefore);
});

test("a default branch liquidates only the pledged value and traces its cause", () => {
  const securedDefinition: StageSimulationDefinition = {
    ...definition,
    stageId: "secured",
    partialPaymentOnDefault: true,
    borrower: {
      ...definition.borrower,
      expectedRevenue: 110_000,
      realizedRevenue: 85_000,
      maximumSecuredRepayment: 120_000,
      riskRating: "medium",
      revenueCertainty: "variable",
      collateral: {
        assetId: "cutting-rig",
        label: "Cutting rig",
        appraisedValue: 45_000,
        liquidationValue: 45_000,
      },
    },
  };
  const engine = new StageEngine(securedDefinition);
  const securedTerms: FundableContractTerms = {
    ...terms(120_000),
    collateral: {
      borrowerId: "mina",
      amount: 35_000,
      sourceBlockId: "require",
    },
    execution: [
      {
        type: "if",
        sourceBlockId: "if-default",
        condition: { fact: "payment-outcome", equals: "defaulted" },
        thenActions: [
          { type: "liquidate-collateral", sourceBlockId: "liquidate" },
          { type: "close", sourceBlockId: "close-default" },
        ],
        elseActions: [
          { type: "release-collateral", sourceBlockId: "release" },
          { type: "close", sourceBlockId: "close-paid" },
        ],
      },
    ],
  };

  assert.equal(engine.publishAndFund(securedTerms).accepted, true);
  engine.advanceToNextEvent();
  const state = engine.inspect();
  assert.equal(state.status, "won");
  assert.equal(state.contract?.status, "recovered");
  assert.equal(state.collateral?.status, "liquidated");
  assert.equal(state.collateral?.recoveredAmount, 35_000);
  assert.equal(state.balances.player, 120_000);

  const condition = engine
    .events()
    .find((event) => event.type === "ConditionEvaluated");
  const branch = engine
    .events()
    .find((event) => event.type === "BranchExecuted");
  assert.deepEqual(condition?.data, {
    contractId: "contract-1",
    fact: "payment-outcome",
    expected: "defaulted",
    observed: "defaulted",
    matched: true,
    sourceBlockId: "if-default",
  });
  assert.equal(branch?.data.branch, "then");
  assert.equal(branch?.data.sourceBlockId, "if-default");
});

test("collateral requirements above the public appraisal are rejected", () => {
  const securedDefinition: StageSimulationDefinition = {
    ...definition,
    borrower: {
      ...definition.borrower,
      collateral: {
        assetId: "small-tool",
        label: "Small tool",
        appraisedValue: 20_000,
        liquidationValue: 15_000,
      },
    },
  };
  const engine = new StageEngine(securedDefinition);
  const result = engine.publishAndFund({
    ...terms(),
    collateral: {
      borrowerId: "mina",
      amount: 30_000,
      sourceBlockId: "require",
    },
  });
  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(" "), /appraised below/);
  assert.equal(engine.inspect().collateral, null);
  assert.equal(engine.inspect().balances.player, 100_000);
});
