import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeAssets,
  advanceWorldDay,
  availableCash,
  outstandingPrincipal,
  totalAssetValue,
  totalLiabilityValue,
  netWorth,
  type Asset,
  type MarketWorld,
} from "../src/market/market-world.ts";

function loanReceivable(
  id: string,
  status: Asset["status"],
  principal: number,
): Asset {
  return {
    id,
    kind: "loan-receivable",
    value: status === "active" ? principal : 0,
    status,
    loan: {
      contractId: "contract-1",
      actor: {
        id: `actor-${id}`,
        name: `Borrower ${id}`,
        gender: "female",
        age: 34,
        occupation: null,
        monthlyIncome: 300,
        image: "",
        riskBp: 500,
      },
      principal,
      repayment: principal + 50,
      signedDay: 0,
      dueDay: 10,
      defaultChanceBp: 500,
    },
  };
}

function world(assets: Asset[]): MarketWorld {
  return {
    seed: "portfolio-test",
    cursor: 0,
    day: 0,
    startingCash: 1_000,
    nextId: 1,
    demands: [],
    contracts: [],
    balanceSheet: {
      assets,
      liabilities: [
        { id: "payable-1", kind: "loan-payable", value: 200, status: "active" },
      ],
    },
    log: [],
  };
}

test("the balance sheet values every active asset and excludes liabilities", () => {
  const assetWorld = world([
    { id: "cash", kind: "cash", value: 1_000, status: "active" },
    loanReceivable("active-a", "active", 250),
    loanReceivable("active-b", "active", 175),
    loanReceivable("repaid", "settled", 400),
    loanReceivable("defaulted", "defaulted", 300),
  ]);

  assert.deepEqual(
    activeAssets(assetWorld).map(({ id, kind, value }) => ({
      id,
      kind,
      value,
    })),
    [
      { id: "cash", kind: "cash", value: 1_000 },
      { id: "active-a", kind: "loan-receivable", value: 250 },
      { id: "active-b", kind: "loan-receivable", value: 175 },
    ],
  );
  assert.equal(totalAssetValue(assetWorld), 1_425);
  assert.equal(outstandingPrincipal(assetWorld), 425);
  assert.equal(totalLiabilityValue(assetWorld), 200);
  assert.equal(netWorth(assetWorld), 1_225);
});

test("a repaid loan receivable settles into the cash asset", () => {
  const dueLoan = loanReceivable("due", "active", 100);
  dueLoan.loan = { ...dueLoan.loan!, dueDay: 1, defaultChanceBp: 0 };
  const next = advanceWorldDay(
    world([
      { id: "cash", kind: "cash", value: 900, status: "active" },
      dueLoan,
    ]),
  );

  assert.equal(availableCash(next), 1_050);
  assert.equal(next.balanceSheet.assets[1]?.status, "settled");
  assert.equal(next.balanceSheet.assets[1]?.value, 0);
  assert.equal(totalAssetValue(next), 1_050);
});
