import assert from "node:assert/strict";
import test from "node:test";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { createDefaultScenario } from "../src/scenario.ts";

test("agents construct a financed harvest without a built-in loan primitive", () => {
  const { engine } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const initial = engine.inspect();
  const agreement = [...initial.agreements.values()][0];
  assert.ok(agreement);
  assert.equal(agreement.status, "active");
  assert.equal(engine.balance("farmer", "seed"), 1);
  assert.deepEqual(
    agreement.obligations.map(({ from, to, asset, amount, dueAt }) => ({
      from,
      to,
      asset,
      amount,
      dueAt,
    })),
    [
      { from: "merchant", to: "farmer", asset: "seed", amount: 1, dueAt: 0 },
      { from: "farmer", to: "merchant", asset: "grain", amount: 12, dueAt: 6 },
    ],
  );

  engine.advanceTo(6);

  assert.equal(engine.balance("farmer", "grain"), 8);
  assert.equal(engine.balance("merchant", "grain"), 12);
  assert.equal(engine.inspect().agreements.get(agreement.id)?.status, "completed");
  assert.equal(engine.reputation("farmer").score, 1);
  assert.equal(engine.events().some((event) => event.type.toLowerCase().includes("loan")), false);
});

test("the same invented arrangement can fail after a bad harvest", () => {
  const { engine } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.95]),
  });
  const agreement = [...engine.inspect().agreements.values()][0];
  assert.ok(agreement);

  engine.advanceTo(6);

  assert.equal(engine.balance("farmer", "grain"), 4);
  assert.equal(engine.balance("merchant", "grain"), 0);
  assert.equal(engine.inspect().agreements.get(agreement.id)?.status, "defaulted");
  assert.equal(engine.reputation("farmer").score, 0);
});

