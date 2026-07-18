import assert from "node:assert/strict";
import { test } from "node:test";
import { constant, operation, value } from "../src/market/market-recipe.ts";
import {
  fileRequest,
  type ContractOffer,
  type Demand,
  type DecisionOutcome,
  type MarketBuilderNode,
  type MarketWorld,
} from "../src/market/market-world.ts";

// Spec for what a demand-onto-contract drop MEANS (`fileRequest` is the
// handler behind the stage's `onDropDemand` callback):
//   accept → loan signed, cash leaves, demand served
//   draft  → request waits pending, nothing moves yet
//   reject → demand returns to the map and never asks this contract again
//   no-op  → unknown ids, non-open demands, and unfit contracts change nothing
// The canvas relies on "changed world = accepted" to pick pulse vs snap-back.

function makeDemand(overrides: Partial<Demand> = {}): Demand {
  return {
    id: "demand-1",
    actor: {
      id: "actor-1",
      name: "Test Person",
      gender: "female",
      age: 34,
      occupation: null,
      monthlyIncome: 300,
      image: "",
      riskBp: 500,
    },
    amount: 100,
    payableAfterDays: 10,
    maxRepayment: 200,
    x: 0.5,
    y: 0.5,
    createdDay: 0,
    expiresDay: 16,
    status: "open",
    rejectedContractIds: [],
    ...overrides,
  };
}

/** Fund `amount` on day 0, wait `days`, collect 1.5×, then decide. */
function lendingNodes(decide: DecisionOutcome | null): MarketBuilderNode[] {
  const nodes: MarketBuilderNode[] = [
    { id: "start", kind: "start" },
    {
      id: "fund",
      kind: "transfer",
      senderId: "player",
      recipientId: "requester",
      amount: value("amount"),
    },
    { id: "wait", kind: "wait", days: value("days") },
    {
      id: "repay",
      kind: "transfer",
      senderId: "requester",
      recipientId: "player",
      amount: operation("multiply", value("amount"), constant(1.5)),
    },
  ];
  if (decide)
    nodes.push({
      id: "decide",
      kind: "decision",
      left: constant(1),
      comparator: ">",
      right: constant(0),
      thenOutcome: decide,
      elseOutcome: decide,
    });
  return nodes;
}

function makeContract(
  decide: DecisionOutcome | null,
  overrides: Partial<ContractOffer> = {},
): ContractOffer {
  return {
    id: "contract-1",
    x: 0.3,
    y: 0.3,
    postedDay: 0,
    requests: [],
    builderNodes: lendingNodes(decide),
    ...overrides,
  };
}

function makeWorld(overrides: Partial<MarketWorld> = {}): MarketWorld {
  return {
    seed: "test-seed",
    cursor: 0,
    day: 0,
    startingCash: 1_000,
    cash: 1_000,
    nextId: 1,
    demands: [makeDemand()],
    contracts: [makeContract("accept")],
    loans: [],
    log: [],
    ...overrides,
  };
}

test("accepting drop signs the loan, pays out cash, and serves the demand", () => {
  const next = fileRequest(makeWorld(), "demand-1", "contract-1");

  assert.equal(next.cash, 900);
  assert.equal(next.loans.length, 1);
  assert.equal(next.loans[0]?.principal, 100);
  assert.equal(next.loans[0]?.repayment, 150);
  assert.equal(next.loans[0]?.dueDay, 10);
  assert.equal(next.loans[0]?.status, "active");
  assert.equal(next.demands[0]?.status, "served");
  assert.equal(next.contracts[0]?.requests[0]?.status, "accepted");
  assert.equal(next.log.at(-1)?.kind, "loan-signed");
});

test("drop on a contract with no decision node files a pending request", () => {
  const world = makeWorld({ contracts: [makeContract(null)] });
  const next = fileRequest(world, "demand-1", "contract-1");

  assert.equal(next.cash, 1_000, "no money moves until the banker accepts");
  assert.equal(next.loans.length, 0);
  assert.equal(next.demands[0]?.status, "requesting");
  assert.equal(next.contracts[0]?.requests[0]?.status, "pending");
  assert.equal(next.log.at(-1)?.kind, "request-filed");
});

test("rejecting drop keeps the demand open and bans this contract for it", () => {
  const world = makeWorld({ contracts: [makeContract("reject")] });
  const next = fileRequest(world, "demand-1", "contract-1");

  assert.equal(next.demands[0]?.status, "open");
  assert.deepEqual(next.demands[0]?.rejectedContractIds, ["contract-1"]);
  assert.equal(next.contracts[0]?.requests.length, 0);
  assert.equal(next.cash, 1_000);

  // The banned pair is a no-op from now on — the stage plays the reject X.
  assert.equal(fileRequest(next, "demand-1", "contract-1"), next);
});

test("accept downgrades to a pending request when cash cannot cover it", () => {
  const next = fileRequest(makeWorld({ cash: 30 }), "demand-1", "contract-1");
  assert.equal(next.loans.length, 0);
  assert.equal(next.cash, 30, "no partial payout");
  assert.equal(next.demands[0]?.status, "requesting");
  assert.equal(next.contracts[0]?.requests[0]?.status, "pending");
});

test("drop is a no-op for unknown ids or a demand that is not open", () => {
  const world = makeWorld();
  assert.equal(fileRequest(world, "demand-404", "contract-1"), world);
  assert.equal(fileRequest(world, "demand-1", "contract-404"), world);

  const served = makeWorld({
    demands: [makeDemand({ status: "served" })],
  });
  assert.equal(fileRequest(served, "demand-1", "contract-1"), served);
});

test("drop is a no-op when the contract does not satisfy the demand", () => {
  // 1.5× repayment exceeds what this person agreed to pay back.
  const stingy = makeWorld({
    demands: [makeDemand({ maxRepayment: 120 })],
  });
  assert.equal(fileRequest(stingy, "demand-1", "contract-1"), stingy);

  // The unchanged-world contract is what drives the canvas snap-back.
  const next = fileRequest(stingy, "demand-1", "contract-1");
  assert.equal(next.demands[0]?.status, "open");
});
