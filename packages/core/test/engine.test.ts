import assert from "node:assert/strict";
import test from "node:test";
import { EconomicEngine } from "../src/domain/engine.ts";
import { DomainError } from "../src/domain/errors.ts";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { MemoryEventStore } from "../src/infrastructure/memory-event-store.ts";

function basicEngine(randomValue = 0.1): EconomicEngine {
  const engine = new EconomicEngine(
    new MemoryEventStore(),
    new SequentialIdGenerator(),
    new SequenceRandom([randomValue]),
  );
  engine.registerEntity("a", "A", "human");
  engine.registerEntity("b", "B", "rule-based");
  engine.defineAsset({ id: "coin", name: "Coin", kind: "currency", divisible: true });
  engine.defineAsset({ id: "seed", name: "Seed", kind: "resource", divisible: false });
  engine.defineAsset({ id: "grain", name: "Grain", kind: "resource", divisible: true });
  return engine;
}

test("owners can transfer scarce assets but cannot overdraw them", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 10);
  engine.transfer({ actor: "a", from: "a", to: "b", asset: "coin", amount: 4 });

  assert.equal(engine.balance("a", "coin"), 6);
  assert.equal(engine.balance("b", "coin"), 4);
  assert.throws(
    () => engine.transfer({ actor: "a", from: "a", to: "b", asset: "coin", amount: 7 }),
    DomainError,
  );
  assert.throws(
    () => engine.transfer({ actor: "b", from: "a", to: "b", asset: "coin", amount: 1 }),
    /Only an asset owner/,
  );
});

test("a generic agreement moves value now and enforces another transfer later", () => {
  const engine = basicEngine();
  engine.issue("a", "seed", 1);
  engine.issue("b", "grain", 12);

  const agreementId = engine.proposeAgreement({
    proposer: "b",
    parties: ["a", "b"],
    obligations: [
      { from: "a", to: "b", asset: "seed", amount: 1, dueAt: 0 },
      { from: "b", to: "a", asset: "grain", amount: 12, dueAt: 2 },
    ],
  });
  engine.acceptAgreement(agreementId, "a");

  assert.equal(engine.balance("b", "seed"), 1);
  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "active");

  engine.advanceTo(2);

  assert.equal(engine.balance("a", "grain"), 12);
  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "completed");
  assert.deepEqual(engine.reputation("b"), { settled: 1, defaulted: 0, score: 1 });
});

test("an unfunded future promise defaults and damages public reputation", () => {
  const engine = basicEngine();
  engine.issue("a", "seed", 1);
  const agreementId = engine.proposeAgreement({
    proposer: "b",
    parties: ["a", "b"],
    obligations: [
      { from: "a", to: "b", asset: "seed", amount: 1, dueAt: 0 },
      { from: "b", to: "a", asset: "grain", amount: 12, dueAt: 2 },
    ],
  });
  engine.acceptAgreement(agreementId, "a");
  engine.advanceTo(2);

  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "defaulted");
  assert.deepEqual(engine.reputation("b"), { settled: 0, defaulted: 1, score: 0 });
});

test("production consumes scarce inputs and exposes agents to deterministic risk", () => {
  const engine = basicEngine(0.9);
  engine.issue("b", "seed", 1);
  engine.registerProductionRule({
    owner: "b",
    startsAt: 1,
    every: 1,
    inputs: [{ asset: "seed", amount: 1 }],
    successChance: 0.7,
    successOutputs: [{ asset: "grain", amount: 20 }],
    failureOutputs: [{ asset: "grain", amount: 4 }],
  });
  engine.advanceTo(1);

  assert.equal(engine.balance("b", "seed"), 0);
  assert.equal(engine.balance("b", "grain"), 4);
  const production = engine.events().find((event) => event.type === "ProductionCompleted");
  assert.equal((production?.data as { successful: boolean }).successful, false);
});

test("currency conservation survives a long deterministic transfer sequence", () => {
  const engine = basicEngine();
  engine.registerEntity("c", "C", "rule-based");
  engine.issue("a", "coin", 100);

  for (let index = 0; index < 200; index += 1) {
    const from = index % 2 === 0 ? "a" : "b";
    const to = from === "a" ? "b" : "a";
    if (engine.balance(from, "coin") > 0) {
      engine.transfer({ actor: from, from, to, asset: "coin", amount: 1 });
    }
  }

  const total = ["a", "b", "c"].reduce(
    (sum, entity) => sum + engine.balance(entity, "coin"),
    0,
  );
  assert.equal(total, 100);
  assert.equal(engine.events().filter((event) => event.type === "AssetIssued").length, 1);
});

test("a published product composes funding, a repayment claim, fee, and collateral release", () => {
  const engine = basicEngine();
  engine.defineAsset({ id: "land", name: "Land", kind: "property", divisible: false });
  engine.issue("a", "coin", 100);
  engine.issue("b", "coin", 11);
  engine.issue("b", "land", 1);

  const productId = engine.publishProduct({
    creator: "a",
    name: "Seed advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 2,
    fixedInterestRate: 0.1,
    creatorFeeRate: 0.1,
    minimumRepaymentReputation: 0,
    collateral: { asset: "land", amount: 1 },
  });
  const funded = engine.fundProduct({ productId, funder: "a", borrower: "b" });

  assert.equal(engine.balance("a", "coin"), 90);
  assert.equal(engine.balance("b", "coin"), 21);
  assert.throws(
    () => engine.transfer({ actor: "b", from: "b", to: "a", asset: "land", amount: 1 }),
    /insufficient land/,
  );

  engine.advanceTo(2);

  assert.equal(engine.inspect().agreements.get(funded.agreementId)?.status, "completed");
  assert.equal(engine.inspect().repaymentClaims.get(funded.repaymentClaimId)?.status, "settled");
  assert.equal([...engine.inspect().collateralLocks.values()][0]?.status, "released");
  assert.equal(engine.balance("b", "land"), 1);
});

test("a transferred repayment claim receives the locked collateral when the borrower defaults", () => {
  const engine = basicEngine();
  engine.registerEntity("c", "C", "rule-based");
  engine.defineAsset({ id: "land", name: "Land", kind: "property", divisible: false });
  engine.issue("a", "coin", 100);
  engine.issue("b", "land", 1);

  const productId = engine.publishProduct({
    creator: "a",
    name: "Collateralized advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 2,
    fixedInterestRate: 0,
    creatorFeeRate: 0,
    minimumRepaymentReputation: 0,
    collateral: { asset: "land", amount: 1 },
  });
  const funded = engine.fundProduct({ productId, funder: "a", borrower: "b" });
  engine.transferRepaymentClaim({ actor: "a", claimId: funded.repaymentClaimId, to: "c" });

  // The borrower spends the advance before the promise comes due.
  engine.transfer({ actor: "b", from: "b", to: "a", asset: "coin", amount: 10 });
  engine.advanceTo(2);

  assert.equal(engine.inspect().repaymentClaims.get(funded.repaymentClaimId)?.status, "defaulted");
  assert.equal(engine.balance("c", "land"), 1);
  assert.equal(engine.inspect().collateralLocks.size, 1);
  assert.equal([...engine.inspect().collateralLocks.values()][0]?.status, "liquidated");
});
