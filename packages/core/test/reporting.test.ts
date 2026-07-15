import assert from "node:assert/strict";
import test from "node:test";
import { EconomicEngine } from "../src/domain/engine.ts";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { MemoryEventStore } from "../src/infrastructure/memory-event-store.ts";
import { summarizeTicks } from "../src/reporting.ts";

function basicEngine(randomValues: number[]): EconomicEngine {
  const engine = new EconomicEngine(
    new MemoryEventStore(),
    new SequentialIdGenerator(),
    new SequenceRandom(randomValues),
  );
  engine.registerEntity("a", "A", "human");
  engine.registerEntity("b", "B", "rule-based");
  engine.defineAsset({ id: "coin", name: "Coin", kind: "currency", divisible: true });
  engine.defineAsset({ id: "grain", name: "Grain", kind: "resource", divisible: true });
  return engine;
}

test("headline prioritizes defaults over production over settlements", () => {
  const engine = basicEngine([0.1]);
  engine.issue("a", "coin", 5);
  const before = engine.inspect();

  engine.proposeAgreement({
    proposer: "a",
    parties: ["a", "b"],
    obligations: [{ from: "a", to: "b", asset: "coin", amount: 5, dueAt: 1 }],
  });
  engine.acceptAgreement([...engine.inspect().agreements.keys()][0]!, "b");
  engine.advanceTo(1);

  const digest = summarizeTicks(before, engine.inspect(), engine.events().slice(before.version));
  assert.equal(digest.settlements, 1);
  assert.equal(digest.headline, "1 settlement");
});

test("a missed obligation produces a default headline even alongside other activity", () => {
  const engine = basicEngine([0.1]);
  const before = engine.inspect();

  engine.registerProductionRule({
    id: "rule",
    owner: "b",
    every: 5,
    startsAt: 1,
    inputs: [],
    successChance: 1,
    successOutputs: [{ asset: "grain", amount: 4 }],
    failureOutputs: [{ asset: "grain", amount: 1 }],
  });
  engine.proposeAgreement({
    proposer: "b",
    parties: ["a", "b"],
    obligations: [{ from: "a", to: "b", asset: "coin", amount: 5, dueAt: 1 }],
  });
  engine.acceptAgreement([...engine.inspect().agreements.keys()][0]!, "a");
  engine.advanceTo(1);

  const digest = summarizeTicks(before, engine.inspect(), engine.events().slice(before.version));
  assert.equal(digest.defaults, 1);
  assert.equal(digest.productionSuccesses, 1);
  assert.equal(digest.headline, "1 repayment missed");
});

test("price moves are detected across a repost of a standing offer", () => {
  const engine = basicEngine([0.1]);
  engine.issue("a", "grain", 100);
  const offerId = engine.postOffer({
    actor: "a",
    side: "sell",
    asset: "grain",
    amount: 100,
    priceAsset: "coin",
    pricePerUnit: 1,
  });
  const before = engine.inspect();

  engine.withdrawOffer({ actor: "a", offerId });
  engine.postOffer({
    actor: "a",
    side: "sell",
    asset: "grain",
    amount: 100,
    priceAsset: "coin",
    pricePerUnit: 0.6,
  });

  const digest = summarizeTicks(before, engine.inspect(), engine.events().slice(before.version));
  assert.deepEqual(digest.priceMoves, [{ asset: "grain", side: "sell", from: 1, to: 0.6 }]);
});

test("no activity yields a generic advanced-ticks headline", () => {
  const engine = basicEngine([0.1]);
  const before = engine.inspect();
  engine.advanceTo(3);
  const digest = summarizeTicks(before, engine.inspect(), engine.events().slice(before.version));
  assert.equal(digest.ticksAdvanced, 3);
  assert.equal(digest.headline, "Advanced 3 ticks");
});
