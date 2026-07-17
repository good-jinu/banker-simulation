import assert from "node:assert/strict";
import test from "node:test";
import {
  compileContract,
  projectCashFlows,
  projectOutcomeCashFlows,
  summarizeProgram,
  validateProgram,
  type ContractProgram,
} from "../src/index.ts";

const winningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "winning-contract",
  name: "Mina growth advance",
  steps: [
    {
      id: "lend",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    { id: "wait", type: "wait", days: 24 },
    {
      id: "collect",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 120_000,
    },
    { id: "close", type: "close" },
  ],
};

test("the foundational contract validates and compiles to immutable terms", () => {
  assert.deepEqual(validateProgram(winningProgram), []);
  const compiled = compileContract(winningProgram);

  assert.deepEqual(compiled.terms, {
    id: "winning-contract",
    name: "Mina growth advance",
    borrowerId: "mina",
    principal: 100_000,
    repayment: 120_000,
    dueDay: 24,
    sourceBlocks: {
      lend: "lend",
      wait: "wait",
      collect: "collect",
      close: "close",
    },
  });
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(Object.isFrozen(compiled.terms), true);
});

test("plain-language and cash-flow previews preserve block meaning", () => {
  assert.equal(
    summarizeProgram(winningProgram, { mina: "Mina's Workshop" }),
    "Lend $1,000 to Mina's Workshop now. Wait 24 days. Collect $1,200 from Mina's Workshop. Close the contract.",
  );
  assert.deepEqual(projectCashFlows(winningProgram), {
    entries: [
      {
        day: 0,
        amount: -100_000,
        currency: "USD",
        label: "Fund mina",
        blockId: "lend",
      },
      {
        day: 24,
        amount: 120_000,
        currency: "USD",
        label: "Collect from mina",
        blockId: "collect",
      },
    ],
    totalOutflow: 100_000,
    totalInflow: 120_000,
    netChange: 20_000,
    finalDay: 24,
  });
});

test("a bounded schedule compiles to explicit dated installment payments", () => {
  const program: ContractProgram = {
    schemaVersion: 1,
    id: "installments",
    name: "Four installments",
    steps: [
      { ...winningProgram.steps[0]!, id: "lend-s" },
      { id: "wait-s", type: "wait", days: 3 },
      {
        id: "schedule-s",
        type: "schedule",
        intervalDays: 1,
        occurrences: 4,
        steps: [
          {
            id: "collect-s",
            type: "collect",
            fromId: "mina",
            currency: "USD",
            amount: 30_000,
          },
        ],
      },
      { id: "close-s", type: "close" },
    ],
  };
  assert.deepEqual(validateProgram(program), []);
  assert.deepEqual(compileContract(program).terms.payments, [
    {
      id: "schedule-s-payment-1",
      dueDay: 3,
      amount: 30_000,
      sourceBlockId: "collect-s",
    },
    {
      id: "schedule-s-payment-2",
      dueDay: 4,
      amount: 30_000,
      sourceBlockId: "collect-s",
    },
    {
      id: "schedule-s-payment-3",
      dueDay: 5,
      amount: 30_000,
      sourceBlockId: "collect-s",
    },
    {
      id: "schedule-s-payment-4",
      dueDay: 6,
      amount: 30_000,
      sourceBlockId: "collect-s",
    },
  ]);
  assert.equal(projectCashFlows(program).totalInflow, 120_000);
});

test("missing, misplaced, and unreachable blocks are rejected", () => {
  const invalid: ContractProgram = {
    schemaVersion: 1,
    id: "bad",
    name: "Bad program",
    steps: [winningProgram.steps[3]!, winningProgram.steps[0]!],
  };
  const codes = validateProgram(invalid).map((issue) => issue.code);
  assert.ok(codes.includes("missing-wait"));
  assert.ok(codes.includes("missing-collect"));
  assert.ok(codes.includes("unreachable"));
});

test("a contract that returns less than it lends is valid but warns the player", () => {
  const conservative = structuredClone(winningProgram);
  const collect = conservative.steps.find((step) => step.type === "collect");
  assert.ok(collect?.type === "collect");
  collect.amount = 90_000;

  const issues = validateProgram(conservative);
  assert.deepEqual(
    issues.map((issue) => issue.severity),
    ["warning"],
  );
  assert.doesNotThrow(() => compileContract(conservative));
});

const securedProgram: ContractProgram = {
  schemaVersion: 1,
  id: "secured-contract",
  name: "Secured bridge",
  steps: [
    {
      id: "lend-secured",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    {
      id: "require",
      type: "collateral",
      action: "require",
      borrowerId: "mina",
      currency: "USD",
      amount: 35_000,
    },
    { id: "wait-secured", type: "wait", days: 24 },
    {
      id: "collect-secured",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 120_000,
    },
    {
      id: "if-default",
      type: "if",
      condition: { fact: "payment-outcome", equals: "defaulted" },
      thenSteps: [
        { id: "liquidate", type: "collateral", action: "liquidate" },
        { id: "close-default", type: "close" },
      ],
      elseSteps: [
        { id: "release", type: "collateral", action: "release" },
        { id: "close-paid", type: "close" },
      ],
    },
  ],
};

test("collateral and If / Else compile into bounded executable branches", () => {
  assert.deepEqual(validateProgram(securedProgram), []);
  const compiled = compileContract(securedProgram);
  assert.deepEqual(compiled.terms.collateral, {
    borrowerId: "mina",
    amount: 35_000,
    sourceBlockId: "require",
  });
  assert.deepEqual(compiled.terms.execution, [
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
  ]);
  assert.equal(Object.isFrozen(compiled.terms.execution), true);
});

test("three-case projection exposes branch choice and capped collateral recovery", () => {
  const projection = projectOutcomeCashFlows(securedProgram, {
    startingCash: 100_000,
    borrowerId: "mina",
    borrowerRiskRating: "medium",
    revenueCertainty: "variable",
    bestRevenue: 130_000,
    expectedRevenue: 110_000,
    adverseRevenue: 85_000,
    collateralLiquidationValue: 45_000,
    partialPaymentOnDefault: true,
  });

  assert.equal(projection.best.paymentOutcome, "settled");
  assert.equal(projection.best.branch, "else");
  assert.equal(projection.best.endingCash, 120_000);
  assert.equal(projection.expected.paymentOutcome, "defaulted");
  assert.equal(projection.expected.collateralRecovery, 10_000);
  assert.equal(projection.expected.endingCash, 120_000);
  assert.equal(projection.adverse.collateralRecovery, 35_000);
  assert.equal(projection.adverse.endingCash, 120_000);
});

test("unsafe, unreachable, and value-creating collateral branches are rejected", () => {
  const invalid = structuredClone(securedProgram);
  const branch = invalid.steps.find((step) => step.type === "if");
  assert.ok(branch?.type === "if");
  branch.thenSteps = [
    { id: "release-on-default", type: "collateral", action: "release" },
    { id: "close-bad", type: "close" },
    {
      id: "collect-after-close",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 999_999,
    },
  ];
  const codes = validateProgram(invalid).map((candidate) => candidate.code);
  assert.ok(codes.includes("unreachable"));
  assert.ok(codes.includes("nested-value-flow"));
  assert.ok(codes.includes("missing-liquidation"));
  assert.ok(codes.includes("release-on-default"));
  assert.throws(() => compileContract(invalid));
});
