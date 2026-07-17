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
    fundsAvailableAt: 720,
    expectedRevenue: 120_000,
    maximumAcceptedRepayment: 125_000,
  },
  objective: { targetCash: 120_000, deadline: 720 },
  rewardId: "contract-stamp",
};

function terms(repayment = 120_000): FundableContractTerms {
  return {
    id: "contract-1",
    name: "Mina growth advance",
    borrowerId: "mina",
    principal: 100_000,
    repayment,
    dueDay: 720,
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
  first.advanceOneDay();

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

test("a compiled payment calendar settles one bounded installment at each due day", () => {
  const engine = new StageEngine({
    ...definition,
    stageId: "installments",
    borrower: {
      ...definition.borrower,
      needAmount: 80_000,
      minimumFunding: 80_000,
      fundsAvailableAt: 90,
      expectedRevenue: 90_000,
      realizedRevenue: 90_000,
      maximumAcceptedRepayment: 95_000,
    },
    objective: { targetCash: 110_000, deadline: 180 },
  });
  const scheduled: FundableContractTerms = {
    ...terms(90_000),
    id: "scheduled-contract",
    principal: 80_000,
    dueDay: 180,
    payments: [
      { id: "p1", dueDay: 90, amount: 22_500, sourceBlockId: "collect" },
      { id: "p2", dueDay: 120, amount: 22_500, sourceBlockId: "collect" },
      { id: "p3", dueDay: 150, amount: 22_500, sourceBlockId: "collect" },
      { id: "p4", dueDay: 180, amount: 22_500, sourceBlockId: "collect" },
    ],
  };
  assert.equal(engine.publishAndFund(scheduled).accepted, true);
  while (engine.inspect().status === "playing") engine.advanceToNextEvent();
  assert.equal(engine.inspect().status, "won");
  assert.equal(engine.inspect().contract?.settledPaymentIds.length, 4);
  assert.deepEqual(
    engine
      .events()
      .filter((event) => event.type === "PaymentSettled")
      .map((event) => event.at),
    [90, 120, 150, 180],
  );
  assert.deepEqual(
    engine
      .events()
      .filter((event) => event.type === "ContractClosed")
      .map((event) => event.at),
    [180],
  );
});

test("two borrowers can hold independent active contracts with stable settlement", () => {
  const engine = new StageEngine({
    ...definition,
    stageId: "portfolio",
    startingPlayerCash: 180_000,
    maxActiveContracts: 2,
    borrowers: [
      {
        ...definition.borrower,
        id: "mina",
        needAmount: 80_000,
        minimumFunding: 80_000,
        fundsAvailableAt: 90,
        expectedRevenue: 100_000,
        realizedRevenue: 100_000,
      },
      {
        ...definition.borrower,
        id: "jun",
        name: "Jun",
        needAmount: 70_000,
        minimumFunding: 70_000,
        fundsAvailableAt: 120,
        expectedRevenue: 90_000,
        realizedRevenue: 90_000,
      },
    ],
    objective: { targetCash: 200_000, deadline: 120 },
  });
  assert.equal(
    engine.publishAndFund({
      ...terms(100_000),
      id: "mina-portfolio",
      principal: 80_000,
      dueDay: 90,
    }).accepted,
    true,
  );
  assert.equal(
    engine.publishAndFund({
      ...terms(90_000),
      id: "jun-portfolio",
      borrowerId: "jun",
      principal: 70_000,
      dueDay: 120,
    }).accepted,
    true,
  );
  while (engine.inspect().status === "playing") engine.advanceToNextEvent();
  assert.equal(engine.inspect().status, "won");
  assert.equal(
    engine
      .inspect()
      .contracts.filter((contract) => contract.status === "settled").length,
    2,
  );
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

test("a term deposit funds lending, accrues a visible liability, and repays on maturity", () => {
  const fundingDefinition: StageSimulationDefinition = {
    ...definition,
    stageId: "funding-desk",
    startingPlayerCash: 50_000,
    borrower: {
      ...definition.borrower,
      fundsAvailableAt: 150,
      expectedRevenue: 120_000,
      realizedRevenue: 120_000,
      maximumAcceptedRepayment: 120_000,
    },
    savers: [
      {
        id: "ava",
        name: "Ava",
        depositAmount: 70_000,
        availableAt: 30,
        requiredTermDays: 150,
        minimumAnnualRateBps: 500,
      },
    ],
    objective: { targetCash: 68_000, deadline: 180, mustReachDeadline: true },
  };
  const engine = new StageEngine(fundingDefinition);
  engine.publishDepositProduct({
    id: "ava-term-deposit",
    name: "Ava 150-day savings",
    annualRateBps: 500,
    termDays: 150,
    minimumDeposit: 70_000,
    maximumDeposit: 70_000,
  });

  engine.advanceToNextEvent();
  let state = engine.inspect();
  assert.equal(state.time, 30);
  assert.equal(state.balances.player, 120_000);
  assert.equal(state.depositLiability, 70_000);
  assert.deepEqual(state.nextDepositObligation, {
    dueDay: 180,
    amount: 70_000,
  });

  assert.equal(
    engine.publishAndFund({
      ...terms(120_000),
      id: "funding-desk-loan",
      dueDay: 150,
    }).accepted,
    true,
  );
  engine.advanceToNextEvent();
  state = engine.inspect();
  assert.equal(state.time, 150);
  assert.equal(state.status, "playing");
  assert.equal(state.depositLiability, 71_164);

  engine.advanceToNextEvent();
  state = engine.inspect();
  assert.equal(state.status, "won");
  assert.equal(state.balances.player, 68_545);
  assert.equal(state.depositLiability, 0);
  assert.equal(state.deposits[0]?.status, "withdrawn");
  assert.equal(
    engine.events().filter((event) => event.type === "DepositInterestAccrued")
      .length,
    5,
  );
  assert.equal(
    engine.events().filter((event) => event.type === "DepositWithdrawn").length,
    1,
  );
  assert.deepEqual(
    new StageEngine(fundingDefinition, engine.events()).inspect(),
    state,
  );
});

test("an unfunded deposit withdrawal ends the run as a liquidity failure", () => {
  const fundingDefinition: StageSimulationDefinition = {
    ...definition,
    stageId: "liquidity-failure",
    startingPlayerCash: 50_000,
    borrower: {
      ...definition.borrower,
      fundsAvailableAt: 210,
      expectedRevenue: 120_000,
      realizedRevenue: 120_000,
      maximumAcceptedRepayment: 120_000,
    },
    savers: [
      {
        id: "ava",
        name: "Ava",
        depositAmount: 70_000,
        availableAt: 30,
        requiredTermDays: 150,
        minimumAnnualRateBps: 500,
      },
    ],
    objective: { targetCash: 68_000, deadline: 180, mustReachDeadline: true },
  };
  const engine = new StageEngine(fundingDefinition);
  engine.publishDepositProduct({
    id: "ava-term-deposit",
    name: "Ava 150-day savings",
    annualRateBps: 500,
    termDays: 150,
    minimumDeposit: 70_000,
    maximumDeposit: 70_000,
  });
  engine.advanceToNextEvent();
  assert.equal(
    engine.publishAndFund({
      ...terms(120_000),
      id: "late-loan",
      dueDay: 210,
    }).accepted,
    true,
  );

  while (engine.inspect().status === "playing") engine.advanceToNextEvent();
  const state = engine.inspect();
  assert.equal(state.status, "lost");
  assert.equal(state.deposits[0]?.status, "failed");
  assert.match(
    engine.events().findLast((event) => event.type === "StageLost")?.data
      .reason ?? "",
    /Liquidity failure/,
  );
});

test("a saver records why an unsuitable deposit product was rejected", () => {
  const fundingDefinition: StageSimulationDefinition = {
    ...definition,
    stageId: "deposit-demand",
    savers: [
      {
        id: "ava",
        name: "Ava",
        depositAmount: 70_000,
        availableAt: 30,
        requiredTermDays: 150,
        minimumAnnualRateBps: 500,
      },
    ],
  };
  const engine = new StageEngine(fundingDefinition);
  engine.publishDepositProduct({
    id: "too-low",
    name: "Too-low savings",
    annualRateBps: 400,
    termDays: 150,
    minimumDeposit: 70_000,
    maximumDeposit: 70_000,
  });
  engine.advanceToNextEvent();

  const review = engine
    .events()
    .find((event) => event.type === "DepositProductReviewed");
  assert.equal(review?.data.accepted, false);
  assert.match(review?.data.reasons.join(" ") ?? "", /5.00%/);
  assert.equal(engine.inspect().deposits.length, 0);
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
