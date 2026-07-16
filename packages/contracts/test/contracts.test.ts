import assert from "node:assert/strict";
import test from "node:test";
import {
  compileContract,
  projectCashFlows,
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
    { id: "wait", type: "wait", months: 24 },
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
    dueMonth: 24,
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
    "Lend $1,000 to Mina's Workshop now. Wait 24 months. Collect $1,200 from Mina's Workshop. Close the contract.",
  );
  assert.deepEqual(projectCashFlows(winningProgram), {
    entries: [
      {
        month: 0,
        amount: -100_000,
        currency: "USD",
        label: "Fund mina",
        blockId: "lend",
      },
      {
        month: 24,
        amount: 120_000,
        currency: "USD",
        label: "Collect from mina",
        blockId: "collect",
      },
    ],
    totalOutflow: 100_000,
    totalInflow: 120_000,
    netChange: 20_000,
    finalMonth: 24,
  });
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
