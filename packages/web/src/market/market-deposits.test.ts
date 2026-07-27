import { describe, expect, it } from "vitest";
import {
  createWorld,
  marketReducer,
  summarize,
  type MarketAction,
  type MarketWorld,
} from "./market-world.ts";

function run(world: MarketWorld, ...actions: MarketAction[]): MarketWorld {
  return actions.reduce(marketReducer, world);
}

function days(count: number): MarketAction[] {
  return Array.from({ length: count }, () => ({ type: "advance-day" }));
}

function createDepositProduct(): MarketAction {
  return {
    type: "create-product",
    product: {
      id: "starter-savings",
      kind: "deposit",
      name: "Starter savings",
      x: 50,
      y: 68,
      active: true,
      interestRate: 2,
    },
  };
}

describe("customer deposits", () => {
  it("accepts deposits only after the bank launches a deposit product", () => {
    const start = createWorld(1);
    const depositor = start.depositors[0]!;
    expect(depositor.status).toBe("waiting");
    const accepted = marketReducer(
      { ...start, depositors: [depositor] },
      createDepositProduct(),
    );
    expect(accepted.cash).toBe(
      start.cash - start.config.productCreationCost + depositor.amount,
    );
    expect(summarize(accepted).depositLiabilities).toBe(depositor.amount);
    expect(summarize(accepted).netWorth).toBe(
      summarize(start).netWorth - start.config.productCreationCost,
    );
    expect(accepted.stats.depositsAccepted).toBe(1);
    expect(accepted.depositors[0]?.productId).toBe("starter-savings");
  });

  it("does not generate deposits without an active deposit product", () => {
    let world: MarketWorld = {
      ...createWorld(1),
      onboarding: "full",
      depositors: [],
      withdrawalEvent: null,
    };
    world = run(world, ...days(world.config.depositSpawnEveryDays));
    expect(world.depositors).toHaveLength(0);

    world = marketReducer(world, createDepositProduct());
    world = run(world, ...days(world.config.depositSpawnEveryDays));
    expect(world.depositors[0]).toMatchObject({
      status: "accepted",
      productId: "starter-savings",
      rate: 2,
    });
  });

  it("does not announce a zero-value withdrawal before deposits exist", () => {
    let world: MarketWorld = {
      ...createWorld(1),
      depositors: [],
      withdrawalEvent: {
        warningDay: 1,
        withdrawalDay: 2,
        withdrawalShare: 1,
        status: "scheduled",
      },
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.news).toHaveLength(0);
    world = marketReducer(world, { type: "advance-day" });
    expect(world.events).not.toContainEqual(
      expect.objectContaining({ type: "deposit-withdrawal" }),
    );
    expect(world.withdrawalEvent?.status).toBe("settled");
  });

  it("settles a warned withdrawal and records its interest cost", () => {
    const start = createWorld(1);
    const depositor = start.depositors[0]!;
    let world = marketReducer(
      { ...start, depositors: [depositor] },
      createDepositProduct(),
    );
    world = {
      ...world,
      withdrawalEvent: {
        warningDay: 1,
        withdrawalDay: 2,
        withdrawalShare: 1,
        status: "scheduled",
      },
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.withdrawalEvent?.status).toBe("warned");
    expect(
      world.news.some((article) => article.threadId === "deposit-withdrawal"),
    ).toBe(true);
    world = marketReducer(world, { type: "advance-day" });
    expect(world.depositors[0]?.status).toBe("withdrawn");
    expect(world.stats.depositPrincipalWithdrawn).toBe(depositor.amount);
    expect(world.stats.depositInterestPaid).toBeCloseTo(
      depositor.amount * (depositor.rate / 100),
    );
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "deposit-withdrawal" }),
    );
  });
});
