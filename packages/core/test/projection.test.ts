import assert from "node:assert/strict";
import test from "node:test";
import { runAgents } from "../src/domain/agents.ts";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { projectOutcome } from "../src/domain/projection.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { createDefaultScenario } from "../src/scenario.ts";

const VALUATION = { coin: 1, seed: 10, grain: 1, land: 200 };
const SEEDS = [1, 2, 3, 4, 5];

test("projecting an outcome does not mutate the caller's event store", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });
  const eventsBefore = engine.events();

  projectOutcome({
    events: eventsBefore,
    agents,
    ticks: 6,
    seeds: SEEDS,
    perspective: "player",
    valuation: VALUATION,
  });

  assert.deepEqual(engine.events(), eventsBefore);
});

test("the same seed produces an identical sample every time", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });
  const events = engine.events();

  const first = projectOutcome({
    events,
    agents,
    ticks: 6,
    seeds: [42],
    perspective: "player",
    valuation: VALUATION,
  });
  const second = projectOutcome({
    events,
    agents,
    ticks: 6,
    seeds: [42],
    perspective: "player",
    valuation: VALUATION,
  });

  assert.deepEqual(first, second);
});

test("funding a doomed product shifts probability of default versus not funding it", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const productId = engine.publishProduct({
    creator: "player",
    name: "Seasonal Farm Advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 6,
    fixedInterestRate: 0.15,
    creatorFeeRate: 0.02,
    minimumRepaymentReputation: 0,
    collateral: { asset: "land", amount: 1 },
  });
  runAgents(engine, agents);
  const application = [...engine.inspect().applications.values()].find(
    (candidate) => candidate.productId === productId && candidate.status === "open",
  );
  assert.ok(application, "the farmer should have applied for the published product");

  const events = engine.events();

  const withoutFunding = projectOutcome({
    events,
    agents,
    ticks: 6,
    seeds: SEEDS,
    perspective: "player",
    valuation: VALUATION,
  });
  const withFunding = projectOutcome({
    events,
    agents,
    ticks: 6,
    seeds: SEEDS,
    perspective: "player",
    valuation: VALUATION,
    apply: (projectedEngine) =>
      projectedEngine.fundProduct({ productId, funder: "player", borrower: application.borrower }),
  });

  // Funding moves capital out of the player's hands and into an at-risk claim: some seeds
  // (harvest failure) now default where the unfunded baseline had nothing at stake at all.
  assert.equal(withoutFunding.probabilityOfDefault, 0);
  assert.ok(withFunding.probabilityOfDefault > 0);
  assert.notEqual(withFunding.meanNetValue, withoutFunding.meanNetValue);
});
