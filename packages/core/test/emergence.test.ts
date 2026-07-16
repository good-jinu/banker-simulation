import assert from "node:assert/strict";
import test from "node:test";
import { advanceWithAgents, runAgents } from "../src/domain/agents.ts";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { createDefaultScenario } from "../src/scenario.ts";

const FARM_ADVANCE = {
  creator: "player",
  name: "Seasonal Farm Advance",
  fundingAsset: "coin",
  principalAmount: 10,
  term: 6,
  fixedInterestRate: 0.15,
  creatorFeeRate: 0.02,
  minimumRepaymentReputation: 0,
  collateral: { asset: "land", amount: 1 },
} as const;

test("the world opens with posted prices and a barter proposal on the player's desk", () => {
  const { engine } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });
  const state = engine.inspect();

  const open = [...state.offers.values()].filter((offer) => offer.status === "open");
  assert.deepEqual(
    open.map(({ poster, side, asset, pricePerUnit }) => ({ poster, side, asset, pricePerUnit })),
    [
      { poster: "merchant", side: "sell", asset: "seed", pricePerUnit: 8 },
      { poster: "merchant", side: "buy", asset: "grain", pricePerUnit: 1.2 },
      { poster: "merchant", side: "buy", asset: "flour", pricePerUnit: 1.2 },
    ],
  );

  const agreements = [...state.agreements.values()];
  const declined = agreements.find((agreement) => agreement.status === "declined");
  assert.equal(declined?.declinedBy, "merchant");
  const pendingForPlayer = agreements.find(
    (agreement) => agreement.status === "proposed" && agreement.parties.includes("player"),
  );
  assert.ok(pendingForPlayer, "the farmer should turn to the player after the merchant declines");
});

test("a coin loan is repayable because grain has a market price", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const productId = engine.publishProduct(FARM_ADVANCE);
  runAgents(engine, agents);

  const application = [...engine.inspect().applications.values()].find(
    (candidate) => candidate.productId === productId && candidate.status === "open",
  );
  assert.ok(application, "the farmer should apply to an affordable product");
  assert.equal(application.borrower, "farmer");

  engine.fundProduct({ productId, funder: "player", borrower: "farmer" });
  runAgents(engine, agents);
  assert.equal(engine.balance("farmer", "seed"), 1, "the loan should let the farmer buy seed");

  advanceWithAgents(engine, agents, 6);

  const playerCoin = engine.balance("player", "coin");
  assert.ok(Math.abs(playerCoin - 16.5) < 1e-9, `player should end near 16.5, got ${playerCoin}`);
  assert.equal(engine.reputation("farmer").score, 1);
  assert.equal(engine.balance("farmer", "land"), 1, "collateral must release after repayment");
  assert.equal(engine.events().some((event) => event.type.toLowerCase().includes("loan")), false);
});

test("a failed harvest defaults the loan and moves the collateral to the claim holder", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.95]),
  });

  const productId = engine.publishProduct(FARM_ADVANCE);
  runAgents(engine, agents);
  engine.fundProduct({ productId, funder: "player", borrower: "farmer" });
  runAgents(engine, agents);

  advanceWithAgents(engine, agents, 6);

  const state = engine.inspect();
  const claim = [...state.repaymentClaims.values()][0];
  assert.equal(claim?.status, "defaulted");
  assert.equal(engine.balance("player", "land"), 1, "collateral must move to the claim holder");
  assert.equal(engine.balance("farmer", "land"), 0);
  assert.ok((engine.reputation("farmer").defaulted ?? 0) >= 1);
});

test("accepting the farmer's barter is a second viable strategy", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const proposal = [...engine.inspect().agreements.values()].find(
    (agreement) => agreement.status === "proposed" && agreement.parties.includes("player"),
  );
  assert.ok(proposal);
  engine.acceptAgreement(proposal.id, "player");
  assert.equal(engine.balance("farmer", "seed"), 1);

  advanceWithAgents(engine, agents, 6);

  assert.equal(engine.balance("player", "grain"), 12);
  assert.equal(engine.inspect().agreements.get(proposal.id)?.status, "completed");
  assert.equal(engine.reputation("farmer").score, 1);
});

test("a product with terms the borrower cannot live with attracts no applications", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const productId = engine.publishProduct({
    ...FARM_ADVANCE,
    name: "Predatory Advance",
    fixedInterestRate: 0.45,
  });
  runAgents(engine, agents);

  const applications = [...engine.inspect().applications.values()].filter(
    (application) => application.productId === productId,
  );
  assert.equal(applications.length, 0);
  assert.throws(
    () => engine.fundProduct({ productId, funder: "player", borrower: "farmer" }),
    /has not applied/,
  );
});

const WORKING_CAPITAL = {
  creator: "player",
  name: "Shared Working Capital",
  fundingAsset: "coin",
  principalAmount: 10,
  term: 12,
  fixedInterestRate: 0.15,
  creatorFeeRate: 0.02,
  minimumRepaymentReputation: 0,
} as const;

test("farm and mill compete for one player's deployable loan", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2, 0.2, 0.2]),
  });

  const productId = engine.publishProduct(WORKING_CAPITAL);
  runAgents(engine, agents);
  const borrowers = [...engine.inspect().applications.values()]
    .filter((application) => application.productId === productId && application.status === "open")
    .map((application) => application.borrower)
    .sort();

  assert.deepEqual(borrowers, ["farmer", "mill"]);
  assert.equal(engine.balance("player", "coin"), 15);
  engine.fundProduct({ productId, funder: "player", borrower: "mill" });
  assert.throws(
    () => engine.fundProduct({ productId, funder: "player", borrower: "farmer" }),
    /insufficient coin/,
  );
});

test("the rival waits one tick and then funds one remaining application", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2]),
  });

  const productId = engine.publishProduct(WORKING_CAPITAL);
  runAgents(engine, agents);
  assert.equal(engine.inspect().productFundings.size, 0, "the rival must give the player a full tick");

  advanceWithAgents(engine, agents, 1);
  const rivalFundings = [...engine.inspect().productFundings.values()].filter(
    (funding) => funding.funder === "rival",
  );
  assert.equal(rivalFundings.length, 1);
  assert.equal(rivalFundings[0]?.productId, productId);
  assert.equal(engine.balance("rival", "coin"), 2, "limited capital prevents a second loan");
});

test("funding the mill while the rival funds the farm completes the small production chain", () => {
  const { engine, agents } = createDefaultScenario({
    ids: new SequentialIdGenerator(),
    random: new SequenceRandom([0.2, 0.2, 0.2]),
  });

  const productId = engine.publishProduct(WORKING_CAPITAL);
  runAgents(engine, agents);
  engine.fundProduct({ productId, funder: "player", borrower: "mill" });
  runAgents(engine, agents);
  advanceWithAgents(engine, agents, 12);

  const millFunding = [...engine.inspect().productFundings.values()].find(
    (funding) => funding.funder === "player" && funding.borrower === "mill",
  );
  const millClaim = millFunding
    ? engine.inspect().repaymentClaims.get(millFunding.repaymentClaimId)
    : undefined;
  assert.equal(millClaim?.status, "settled");
  assert.ok(
    engine.events().some(
      (event) => event.type === "ProductionCompleted" &&
        (event.data as { owner: string }).owner === "mill",
    ),
    "financed grain should reach the mill and become flour",
  );
});

test("Jun lowers the grain bid when inventory accumulates", () => {
  const { engine, agents } = createDefaultScenario({ ids: new SequentialIdGenerator() });
  assert.equal(
    openGrainBid(engine.inspect()),
    1.2,
  );

  engine.issue("merchant", "grain", 5);
  runAgents(engine, agents);
  assert.equal(openGrainBid(engine.inspect()), 1);
});

function openGrainBid(state: ReturnType<ReturnType<typeof createDefaultScenario>["engine"]["inspect"]>): number | undefined {
  return [...state.offers.values()].find(
    (offer) => offer.status === "open" && offer.poster === "merchant" && offer.asset === "grain",
  )?.pricePerUnit;
}
