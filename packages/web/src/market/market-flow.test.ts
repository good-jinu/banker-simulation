import { describe, expect, it } from "vitest";
import { flowForEvent, type FlowLabels, type MapPoint } from "./market-flow.ts";
import { createWorld } from "./market-world.ts";

const labels: FlowLabels = {
  funded: "funded",
  cashIn: "cash in",
  repaid: "repaid",
  paid: "paid",
  settled: "settled",
  defaulted: "defaulted",
  automated: "automated",
  retrieved: "retrieved",
};

const points: Record<string, MapPoint> = {
  banker: { x: 50, y: 49 },
  "loan-product-1": { x: 50, y: 26 },
  "customer-1": { x: 19, y: 21 },
};

const pointFor = (id: string): MapPoint => points[id] ?? { x: 50, y: 50 };

describe("market flow coordinates", () => {
  it("keeps automated lending on the visible product node", () => {
    const flow = flowForEvent(
      {
        type: "transfer",
        from: "loan-product-1",
        to: "customer-1",
        amount: 100,
      },
      pointFor,
      labels,
    );

    expect(flow).toMatchObject({
      from: points.banker,
      to: points["loan-product-1"],
      kind: "loan-out",
    });
  });

  it("returns automated repayments from the product to the bank", () => {
    const customer = {
      ...createWorld(1).customers[0]!,
      productId: "loan-product-1",
      status: "accepted" as const,
    };
    const flow = flowForEvent(
      {
        type: "product-cash-in",
        product: {
          id: "loan-product-1",
          kind: "loan",
          name: "Income Guard",
          locationId: "riverside-market-loan-product",
          districtId: "riverside",
          active: true,
          rules: {
            minimumIncome: 1_500,
            occupation: "any",
            interestRate: 10,
            minimumAmount: 100,
            maximumAmount: 1_000,
            minimumTerm: 6,
            maximumTerm: 12,
          },
        },
        customer,
        amount: 110,
      },
      pointFor,
      labels,
    );

    expect(flow).toMatchObject({
      from: points["loan-product-1"],
      to: points.banker,
      stampAt: points["loan-product-1"],
      kind: "product-cash-in",
    });
  });
});
