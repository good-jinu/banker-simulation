import { describe, expect, it } from "vitest";
import {
  createWorld,
  FIRST_CUSTOMER,
  marketReducer,
  type MarketAction,
  type MarketWorld,
} from "./market-world.ts";

function run(world: MarketWorld, ...actions: MarketAction[]): MarketWorld {
  return actions.reduce(marketReducer, world);
}

function days(count: number): MarketAction[] {
  return Array.from({ length: count }, () => ({ type: "advance-day" }));
}

describe("guided first-stage onboarding flow", () => {
  it("reveals the next system only after its teaching action", () => {
    let world = createWorld(1);
    const firstCustomer = world.customers[0]!;
    expect(world.onboarding).toBe("first-customer");

    world = marketReducer(world, {
      type: "approve",
      customerId: firstCustomer.id,
    });
    expect(world.onboarding).toBe("first-repayment");

    world = run(world, ...days(firstCustomer.term));
    expect(world.onboarding).toBe("second-decision");
    const secondCustomer = world.customers.find(
      (customer) => customer.status === "waiting",
    );
    expect(secondCustomer).toBeDefined();

    world = marketReducer(world, {
      type: "reject",
      customerId: secondCustomer!.id,
    });
    expect(world.onboarding).toBe("deposits");

    world = marketReducer(world, {
      type: "create-product",
      product: {
        id: "starter-savings",
        kind: "deposit",
        name: "Starter savings",
        locationId: "riverside-market-deposit-product",
        districtId: "riverside",
        active: true,
        interestRate: 2,
      },
    });
    expect(world.onboarding).toBe("products");
    // Nothing to accept yet: savers are attracted by the product, not seeded.
    expect(world.depositors).toHaveLength(0);

    world = marketReducer(world, {
      type: "create-product",
      product: {
        id: "starter-line",
        kind: "loan",
        name: "Starter line",
        locationId: "riverside-market-loan-product",
        districtId: "riverside",
        active: true,
        rules: {
          minimumIncome: 1_500,
          occupation: "employed",
          interestRate: 10,
          minimumAmount: 100,
          maximumAmount: 1_000,
          minimumTerm: 6,
          maximumTerm: 12,
        },
      },
    });
    expect(world.onboarding).toBe("full");

    // The payoff of the product system: the open market now brings savers in on
    // its own, already attached to the product that attracted them.
    world = run(world, ...days(world.config.depositSpawnEveryDays));
    expect(world.depositors[0]).toMatchObject({
      status: "accepted",
      productId: "starter-savings",
    });
  });

  it("protects the opening repayment from random failure", () => {
    const first = run(createWorld(1), { type: "begin" });
    const settled = run(first, ...days(FIRST_CUSTOMER.term));
    expect(settled.events).toContainEqual(
      expect.objectContaining({ type: "customer-repayment" }),
    );
  });
});
