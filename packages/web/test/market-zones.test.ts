import assert from "node:assert/strict";
import { test } from "node:test";
import { constant, operation, value } from "../src/market/market-recipe.ts";
import { marketCampaignStages } from "../src/market/market-campaign.ts";
import {
  advanceWorldDay,
  availableCash,
  emptyWorld,
  fileRequest,
  isZoneUnlocked,
  matchingOpenDemandIds,
  moveContract,
  postContract,
  totalAssetValue,
  totalLiabilityValue,
  type Asset,
  type MarketBuilderNode,
} from "../src/market/market-world.ts";

const firstStage = marketCampaignStages[0]!;

function depositNodes(): MarketBuilderNode[] {
  return [
    { id: "start", kind: "start" },
    {
      id: "receive",
      kind: "transfer",
      senderId: "customer",
      recipientId: "player",
      amount: value("amount"),
    },
    { id: "wait", kind: "wait", days: value("days") },
    {
      id: "maturity",
      kind: "transfer",
      senderId: "player",
      recipientId: "customer",
      amount: operation("multiply", value("amount"), constant(1.06)),
    },
  ];
}

function firstLoanNodes(): MarketBuilderNode[] {
  return [
    { id: "start", kind: "start" },
    {
      id: "fund",
      kind: "transfer",
      senderId: "player",
      recipientId: "customer",
      amount: value("amount"),
    },
    { id: "wait", kind: "wait", days: value("days") },
    {
      id: "repay",
      kind: "transfer",
      senderId: "customer",
      recipientId: "player",
      amount: operation("multiply", value("amount"), constant(1.1)),
    },
  ];
}

test("stage one zones keep loan demand under $500 and deposits locked", () => {
  const world = emptyWorld(
    firstStage.seed,
    firstStage.startingCash,
    firstStage.market,
  );
  const savings = world.market!.zones.find(
    (zone) => zone.id === "savings-quarter",
  )!;

  assert.equal(isZoneUnlocked(world, savings), false);
  assert.equal(world.demands.length, 4);
  assert.ok(
    world.demands.every(
      (demand) =>
        demand.kind === "loan" &&
        demand.zoneId === "neighborhood-credit" &&
        demand.amount <= 500,
    ),
  );
  assert.equal(world.demands[0]?.amount, 300);
});

test("the seeded tutorial borrower completes the first repayment objective", () => {
  let world = emptyWorld(
    firstStage.seed,
    firstStage.startingCash,
    firstStage.market,
  );
  const firstDemand = world.demands[0]!;
  world = postContract(world, firstLoanNodes(), firstDemand.zoneId);
  const contract = world.contracts[0]!;
  world = fileRequest(world, firstDemand.id, contract.id);
  for (let day = 0; day < firstDemand.payableAfterDays; day += 1)
    world = advanceWorldDay(world);

  assert.equal(
    world.balanceSheet.assets.find((asset) => asset.kind === "loan-receivable")
      ?.status,
    "settled",
  );
  assert.ok(
    world.market!.zones.some(
      (zone) => zone.id === "savings-quarter" && isZoneUnlocked(world, zone),
    ),
  );
});

test("a first repayment unlocks deposits and a matching contract books cash and liability", () => {
  let world = emptyWorld(
    firstStage.seed,
    firstStage.startingCash,
    firstStage.market,
  );
  const actor = world.demands[0]!.actor;
  const dueLoan: Asset = {
    id: "loan-tutorial",
    kind: "loan-receivable",
    value: 300,
    status: "active",
    loan: {
      contractId: "contract-tutorial",
      actor,
      principal: 300,
      repayment: 330,
      signedDay: 0,
      dueDay: 1,
      defaultChanceBp: 0,
    },
  };
  world = {
    ...world,
    balanceSheet: {
      ...world.balanceSheet,
      assets: [
        { id: "cash", kind: "cash", value: 700, status: "active" },
        dueLoan,
      ],
    },
  };

  world = advanceWorldDay(world);
  const deposit = world.demands.find(
    (demand) => demand.kind === "deposit" && demand.status === "open",
  )!;
  assert.ok(deposit);
  assert.equal(deposit.zoneId, "savings-quarter");

  world = postContract(world, depositNodes(), deposit.zoneId);
  const contract = world.contracts.at(-1)!;
  assert.deepEqual(matchingOpenDemandIds(world, contract.id), [deposit.id]);

  world = fileRequest(world, deposit.id, contract.id);
  assert.equal(availableCash(world), 1_730);
  assert.equal(totalAssetValue(world), 1_730);
  assert.equal(totalLiabilityValue(world), 742);
  assert.equal(world.balanceSheet.liabilities[0]?.kind, "deposit-liability");
  assert.equal(world.contracts.at(-1)?.requests[0]?.status, "accepted");

  const outside = moveContract(world, contract.id, 0.5, 0.02);
  const nextDeposit = {
    ...deposit,
    id: "deposit-outside-check",
    status: "open" as const,
  };
  assert.deepEqual(
    matchingOpenDemandIds(
      { ...outside, demands: [...outside.demands, nextDeposit] },
      contract.id,
    ),
    [],
  );
});
