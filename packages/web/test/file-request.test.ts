import assert from "node:assert/strict";
import { test } from "node:test";
import { constant, operation, value } from "../src/market/market-recipe.ts";
import {
  acceptRequest,
  availableCash,
  decideRequestOutcome,
  fileRequest,
  loanReceivables,
  matchingOpenDemandIds,
  type ContractOffer,
  type Demand,
  type DecisionOutcome,
  type MarketBuilderNode,
  type MarketWorld,
} from "../src/market/market-world.ts";

// Spec for what an automatically matched demand MEANS (`fileRequest` is the
// state transition after its map absorption animation):
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

/** A gate can draft/reject before the shared lending flow that follows it. */
function lendingNodes(decide: DecisionOutcome | null): MarketBuilderNode[] {
  const nodes: MarketBuilderNode[] = [{ id: "start", kind: "start" }];
  if (decide)
    nodes.push({
      id: "decide",
      kind: "decision",
      outcome: decide,
    });
  nodes.push(
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
  );
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
    nextId: 1,
    demands: [makeDemand()],
    contracts: [makeContract("draft")],
    balanceSheet: {
      assets: [{ id: "cash", kind: "cash", value: 1_000, status: "active" }],
      liabilities: [],
    },
    log: [],
    ...overrides,
  };
}

test("accepting a drafted request signs the loan and continues the contract", () => {
  const filed = fileRequest(makeWorld(), "demand-1", "contract-1");
  const result = acceptRequest(
    filed,
    "contract-1",
    filed.contracts[0]!.requests[0]!.id,
  );
  assert.equal(result.failure, null);
  const next = result.world;

  assert.equal(availableCash(next), 900);
  assert.equal(loanReceivables(next).length, 1);
  assert.equal(loanReceivables(next)[0]?.loan?.principal, 100);
  assert.equal(loanReceivables(next)[0]?.loan?.repayment, 150);
  assert.equal(loanReceivables(next)[0]?.loan?.dueDay, 10);
  assert.equal(loanReceivables(next)[0]?.status, "active");
  assert.equal(next.demands[0]?.status, "served");
  assert.equal(next.contracts[0]?.requests[0]?.status, "accepted");
  assert.equal(next.log.at(-1)?.kind, "loan-signed");
});

test("a new contract routes only matching open demands into absorption", () => {
  assert.deepEqual(matchingOpenDemandIds(makeWorld(), "contract-1"), [
    "demand-1",
  ]);

  const unavailable = makeWorld({
    demands: [makeDemand({ status: "served" })],
  });
  assert.deepEqual(matchingOpenDemandIds(unavailable, "contract-1"), []);

  const rejected = makeWorld({
    contracts: [makeContract("reject")],
  });
  assert.deepEqual(matchingOpenDemandIds(rejected, "contract-1"), []);
});

test("drop on a contract with no decision node files a pending request", () => {
  const world = makeWorld({ contracts: [makeContract(null)] });
  const next = fileRequest(world, "demand-1", "contract-1");

  assert.equal(
    availableCash(next),
    1_000,
    "no money moves until the banker accepts",
  );
  assert.equal(loanReceivables(next).length, 0);
  assert.equal(next.demands[0]?.status, "requesting");
  assert.equal(next.contracts[0]?.requests[0]?.status, "pending");
  assert.equal(next.log.at(-1)?.kind, "request-filed");
});

test("a condition branch merges into the decision that follows it", () => {
  const nodes: MarketBuilderNode[] = [
    { id: "start", kind: "start" },
    {
      id: "condition",
      kind: "condition",
      left: value("income"),
      comparator: ">",
      right: constant(1_000),
      thenSteps: [{ id: "reject", kind: "decision", outcome: "reject" }],
      elseSteps: [],
    },
    { id: "draft", kind: "decision", outcome: "draft" },
  ];

  assert.equal(decideRequestOutcome(nodes, makeDemand(), 1_000), "draft");
  assert.equal(
    decideRequestOutcome(
      nodes,
      makeDemand({ actor: { ...makeDemand().actor, monthlyIncome: 2_000 } }),
      1_000,
    ),
    "reject",
  );
});

test("rejecting drop keeps the demand open and bans this contract for it", () => {
  const world = makeWorld({ contracts: [makeContract("reject")] });
  const next = fileRequest(world, "demand-1", "contract-1");

  assert.equal(next.demands[0]?.status, "open");
  assert.deepEqual(next.demands[0]?.rejectedContractIds, ["contract-1"]);
  assert.equal(next.contracts[0]?.requests.length, 0);
  assert.equal(availableCash(next), 1_000);

  // The banned pair is a no-op from now on — the stage plays the reject X.
  assert.equal(fileRequest(next, "demand-1", "contract-1"), next);
});

test("accepting a drafted request fails when cash cannot cover it", () => {
  const filed = fileRequest(
    makeWorld({
      balanceSheet: {
        assets: [{ id: "cash", kind: "cash", value: 30, status: "active" }],
        liabilities: [],
      },
    }),
    "demand-1",
    "contract-1",
  );
  const result = acceptRequest(
    filed,
    "contract-1",
    filed.contracts[0]!.requests[0]!.id,
  );
  assert.equal(result.failure, "insufficient-cash");
  const next = result.world;
  assert.equal(loanReceivables(next).length, 0);
  assert.equal(availableCash(next), 30, "no partial payout");
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
