import assert from "node:assert/strict";
import test from "node:test";
import { compileContract } from "@banker-simulation/contracts";
import { StageEngine } from "@banker-simulation/core";
import {
  firstYieldStage,
  firstYieldWinningProgram,
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
    timeUsed: 24,
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
