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

test("standing offers move both legs of a trade and track remaining quantity", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 50);
  engine.issue("b", "grain", 30);

  const offerId = engine.postOffer({
    actor: "a",
    side: "buy",
    asset: "grain",
    amount: 20,
    priceAsset: "coin",
    pricePerUnit: 1.5,
  });
  engine.fillOffer({ actor: "b", offerId, amount: 10 });

  assert.equal(engine.balance("a", "grain"), 10);
  assert.equal(engine.balance("a", "coin"), 35);
  assert.equal(engine.balance("b", "coin"), 15);
  assert.equal(engine.inspect().offers.get(offerId)?.remaining, 10);

  assert.throws(() => engine.fillOffer({ actor: "b", offerId, amount: 11 }), /has only 10 left/);
  assert.throws(() => engine.fillOffer({ actor: "a", offerId, amount: 1 }), /its poster/);
  assert.throws(() => engine.withdrawOffer({ actor: "b", offerId }), /Only the poster/);

  engine.fillOffer({ actor: "b", offerId, amount: 10 });
  assert.equal(engine.inspect().offers.get(offerId)?.status, "filled");
});

test("a fill fails honestly when either side cannot deliver", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 5);
  engine.issue("b", "grain", 30);

  const offerId = engine.postOffer({
    actor: "a",
    side: "buy",
    asset: "grain",
    amount: 20,
    priceAsset: "coin",
    pricePerUnit: 1,
  });

  assert.throws(() => engine.fillOffer({ actor: "b", offerId, amount: 10 }), /insufficient coin/);
  engine.fillOffer({ actor: "b", offerId, amount: 5 });
  assert.equal(engine.balance("b", "coin"), 5);
});

test("a declined agreement never settles and leaves no reputation trace", () => {
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
  engine.declineAgreement(agreementId, "a");

  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "declined");
  assert.equal(engine.inspect().agreements.get(agreementId)?.declinedBy, "a");
  assert.throws(() => engine.acceptAgreement(agreementId, "a"), /not open/);

  engine.advanceTo(2);
  assert.equal(engine.balance("a", "seed"), 1);
  assert.deepEqual(engine.reputation("b"), { settled: 0, defaulted: 0, score: null });
});

test("funding requires the borrower's application, and funding consumes it", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 100);

  const productId = engine.publishProduct({
    creator: "a",
    name: "Open advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 2,
    fixedInterestRate: 0.1,
    creatorFeeRate: 0,
    minimumRepaymentReputation: 0,
  });

  assert.throws(
    () => engine.fundProduct({ productId, funder: "a", borrower: "b" }),
    /has not applied/,
  );

  const applicationId = engine.applyForProduct({ productId, borrower: "b" });
  assert.throws(() => engine.applyForProduct({ productId, borrower: "b" }), /already has an open/);

  engine.fundProduct({ productId, funder: "a", borrower: "b" });
  assert.equal(engine.inspect().applications.get(applicationId)?.status, "funded");
  assert.throws(
    () => engine.fundProduct({ productId, funder: "a", borrower: "b" }),
    /has not applied/,
  );
});

test("an application can be withdrawn by its borrower only", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 100);
  const productId = engine.publishProduct({
    creator: "a",
    name: "Open advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 2,
    fixedInterestRate: 0.1,
    creatorFeeRate: 0,
    minimumRepaymentReputation: 0,
  });
  const applicationId = engine.applyForProduct({ productId, borrower: "b" });

  assert.throws(
    () => engine.withdrawApplication({ actor: "a", applicationId }),
    /Only the applicant/,
  );
  engine.withdrawApplication({ actor: "b", applicationId });
  assert.equal(engine.inspect().applications.get(applicationId)?.status, "withdrawn");
  assert.throws(
    () => engine.fundProduct({ productId, funder: "a", borrower: "b" }),
    /has not applied/,
  );
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
  engine.applyForProduct({ productId, borrower: "b" });
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
  engine.applyForProduct({ productId, borrower: "b" });
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

test("extending an obligation lets it settle at the new time instead of defaulting at the old one", () => {
  const engine = basicEngine();
  const agreementId = engine.proposeAgreement({
    proposer: "b",
    parties: ["a", "b"],
    obligations: [{ from: "a", to: "b", asset: "coin", amount: 10, dueAt: 2 }],
  });
  engine.acceptAgreement(agreementId, "a");
  const obligationId = engine.inspect().agreements.get(agreementId)!.obligations[0]!.id;

  assert.throws(
    () => engine.extendObligation({ actor: "a", agreementId, obligationId, newDueAt: 5 }),
    /Only the obligation's recipient/,
  );
  assert.throws(
    () => engine.extendObligation({ actor: "b", agreementId, obligationId, newDueAt: 2 }),
    /later integer tick/,
  );

  engine.extendObligation({ actor: "b", agreementId, obligationId, newDueAt: 5 });
  assert.equal(engine.inspect().agreements.get(agreementId)?.obligations[0]?.dueAt, 5);

  engine.advanceTo(2);
  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "active");

  engine.issue("a", "coin", 10);
  engine.advanceTo(5);
  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "completed");
});

test("calling in an obligation forces immediate settlement when the debtor can already pay", () => {
  const engine = basicEngine();
  engine.issue("a", "coin", 10);
  const agreementId = engine.proposeAgreement({
    proposer: "b",
    parties: ["a", "b"],
    obligations: [{ from: "a", to: "b", asset: "coin", amount: 10, dueAt: 10 }],
  });
  engine.acceptAgreement(agreementId, "a");
  const obligationId = engine.inspect().agreements.get(agreementId)!.obligations[0]!.id;

  assert.throws(
    () => engine.callInObligation({ actor: "a", agreementId, obligationId }),
    /Only the obligation's recipient/,
  );

  engine.callInObligation({ actor: "b", agreementId, obligationId });

  assert.equal(engine.balance("b", "coin"), 10);
  assert.equal(engine.inspect().agreements.get(agreementId)?.status, "completed");
});

test("calling in an obligation early defaults it and seizes collateral when the debtor cannot pay", () => {
  const engine = basicEngine();
  engine.defineAsset({ id: "land", name: "Land", kind: "property", divisible: false });
  engine.issue("a", "coin", 100);
  engine.issue("b", "land", 1);

  const productId = engine.publishProduct({
    creator: "a",
    name: "Advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 10,
    fixedInterestRate: 0,
    creatorFeeRate: 0,
    minimumRepaymentReputation: 0,
    collateral: { asset: "land", amount: 1 },
  });
  engine.applyForProduct({ productId, borrower: "b" });
  const funded = engine.fundProduct({ productId, funder: "a", borrower: "b" });
  // The borrower spends the advance long before the loan's natural due date.
  engine.transfer({ actor: "b", from: "b", to: "a", asset: "coin", amount: 10 });
  const repaymentObligationId = engine.inspect().agreements.get(funded.agreementId)!.obligations[1]!.id;

  engine.callInObligation({
    actor: "a",
    agreementId: funded.agreementId,
    obligationId: repaymentObligationId,
  });

  assert.equal(engine.inspect().agreements.get(funded.agreementId)?.status, "defaulted");
  assert.equal(engine.inspect().repaymentClaims.get(funded.repaymentClaimId)?.status, "defaulted");
  assert.equal(engine.balance("a", "land"), 1);
  assert.equal([...engine.inspect().collateralLocks.values()][0]?.status, "liquidated");
});

test("selling a repayment claim moves the sale price and the claim atomically", () => {
  const engine = basicEngine();
  engine.registerEntity("c", "C", "rule-based");
  engine.issue("a", "coin", 100);
  engine.issue("c", "coin", 50);

  const productId = engine.publishProduct({
    creator: "a",
    name: "Advance",
    fundingAsset: "coin",
    principalAmount: 10,
    term: 5,
    fixedInterestRate: 0.1,
    creatorFeeRate: 0,
    minimumRepaymentReputation: 0,
  });
  engine.applyForProduct({ productId, borrower: "b" });
  const funded = engine.fundProduct({ productId, funder: "a", borrower: "b" });

  assert.throws(
    () => engine.sellRepaymentClaim({ actor: "c", claimId: funded.repaymentClaimId, to: "a", price: 10 }),
    /Only the current claim holder/,
  );
  assert.throws(
    () => engine.sellRepaymentClaim({ actor: "a", claimId: funded.repaymentClaimId, to: "b", price: 20 }),
    /insufficient coin/,
  );

  engine.sellRepaymentClaim({ actor: "a", claimId: funded.repaymentClaimId, to: "c", price: 10 });

  assert.equal(engine.balance("a", "coin"), 100);
  assert.equal(engine.balance("c", "coin"), 40);
  assert.equal(engine.inspect().repaymentClaims.get(funded.repaymentClaimId)?.holder, "c");
});
