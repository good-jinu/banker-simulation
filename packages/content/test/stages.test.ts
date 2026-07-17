import assert from "node:assert/strict";
import test from "node:test";
import { compileContract } from "@banker-simulation/contracts";
import { StageEngine } from "@banker-simulation/core";
import {
  affordableTermsStage,
  affordableTermsWinningProgram,
  collateralRecoveryStage,
  collateralRecoveryWinningProgram,
  firstYieldStage,
  firstYieldWinningProgram,
  fundingDeskStage,
  fundingDeskWinningProgram,
  keepTillOpenJunProgram,
  keepTillOpenMinaProgram,
  keepTillOpenStage,
  paymentRhythmStage,
  paymentRhythmWinningProgram,
  scoreRun,
} from "../src/index.ts";

test("the supplied Stage 1 contract reaches the authored objective headlessly", () => {
  const engine = new StageEngine(firstYieldStage.simulation);
  const compiled = compileContract(
    firstYieldWinningProgram,
    engine.inspect().time,
  );
  assert.equal(engine.publishAndFund(compiled.terms).accepted, true);
  engine.advanceToNextEvent();

  const state = engine.inspect();
  assert.equal(state.status, "won");
  assert.ok(
    (state.balances.player ?? 0) >= firstYieldStage.primaryObjective.amount,
  );
  assert.deepEqual(scoreRun(state, firstYieldWinningProgram.steps.length), {
    endingCash: 120_000,
    timeUsed: 720,
    minimumLiquidity: 0,
    contractComplexity: 4,
  });
});

test("a low-return contract settles but misses the stage objective", () => {
  const program = structuredClone(firstYieldWinningProgram);
  const collect = program.steps.find((step) => step.type === "collect");
  assert.ok(collect?.type === "collect");
  collect.amount = 110_000;

  const engine = new StageEngine(firstYieldStage.simulation);
  engine.publishAndFund(compileContract(program).terms);
  engine.advanceToNextEvent();

  assert.equal(engine.inspect().contract?.status, "settled");
  assert.equal(engine.inspect().status, "lost");
});

test("an over-priced contract is rejected before funds move", () => {
  const program = structuredClone(firstYieldWinningProgram);
  const collect = program.steps.find((step) => step.type === "collect");
  assert.ok(collect?.type === "collect");
  collect.amount = 130_000;

  const engine = new StageEngine(firstYieldStage.simulation);
  const result = engine.publishAndFund(compileContract(program).terms);

  assert.equal(result.accepted, false);
  assert.equal(engine.inspect().balances.player, 100_000);
});

for (const [stage, program] of [
  [affordableTermsStage, affordableTermsWinningProgram],
  [collateralRecoveryStage, collateralRecoveryWinningProgram],
  [paymentRhythmStage, paymentRhythmWinningProgram],
] as const) {
  test(`the supplied Stage ${stage.number} contract reaches its authored objective`, () => {
    const engine = new StageEngine(stage.simulation);
    const compiled = compileContract(program);
    assert.equal(engine.publishAndFund(compiled.terms).accepted, true);
    while (engine.inspect().status === "playing") engine.advanceToNextEvent();
    assert.equal(engine.inspect().status, "won");
    assert.ok(
      (engine.inspect().balances.player ?? 0) >= stage.primaryObjective.amount,
    );
  });
}

test("Stage 3's unsecured strategy defaults below the objective", () => {
  const unsecured = structuredClone(collateralRecoveryWinningProgram);
  unsecured.steps = unsecured.steps.filter(
    (step) => step.type !== "collateral" && step.type !== "if",
  );
  unsecured.steps.push({ id: "close-unsecured", type: "close" });
  const collect = unsecured.steps.find((step) => step.type === "collect");
  assert.ok(collect?.type === "collect");
  collect.amount = 110_000;

  const engine = new StageEngine(collateralRecoveryStage.simulation);
  assert.equal(
    engine.publishAndFund(compileContract(unsecured).terms).accepted,
    true,
  );
  engine.advanceToNextEvent();
  assert.equal(engine.inspect().contract?.status, "defaulted");
  assert.equal(engine.inspect().balances.player, 85_000);
  assert.equal(engine.inspect().status, "lost");
});

test("Stage 5 requires two independent funded agreements", () => {
  const engine = new StageEngine(keepTillOpenStage.simulation);
  assert.equal(
    engine.publishAndFund(compileContract(keepTillOpenMinaProgram).terms)
      .accepted,
    true,
  );
  assert.equal(
    engine.publishAndFund(compileContract(keepTillOpenJunProgram).terms)
      .accepted,
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

test("Funding Desk makes a deposit liability fund and survive the invoice bridge", () => {
  const engine = new StageEngine(fundingDeskStage.simulation);
  engine.publishDepositProduct({
    id: "ava-term-deposit",
    name: "Ava 150-day savings",
    annualRateBps: 500,
    termDays: 150,
    minimumDeposit: 70_000,
    maximumDeposit: 70_000,
  });
  engine.advanceToNextEvent();
  assert.equal(engine.inspect().balances.player, 120_000);
  assert.equal(engine.inspect().depositLiability, 70_000);

  assert.equal(
    engine.publishAndFund(
      compileContract(fundingDeskWinningProgram, engine.inspect().time).terms,
    ).accepted,
    true,
  );
  while (engine.inspect().status === "playing") engine.advanceToNextEvent();

  const state = engine.inspect();
  assert.equal(state.status, "won");
  assert.equal(state.balances.player, 68_545);
  assert.equal(state.depositLiability, 0);
  assert.equal(state.deposits[0]?.status, "withdrawn");
});
