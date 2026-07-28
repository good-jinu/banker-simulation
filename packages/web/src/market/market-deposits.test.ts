import { describe, expect, it } from "vitest";
import {
  createWorld,
  marketReducer,
  summarize,
  type Depositor,
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
      locationId: "riverside-market-deposit-product",
      districtId: "riverside",
      active: true,
      interestRate: 2,
    },
  };
}

/** No stage seeds savers, so a waiting depositor is authored here. */
function waitingDepositor(): Depositor {
  return {
    id: "test-savings",
    name: { en: "Test Saver", ko: "테스트 예금자" },
    job: { en: "Village pharmacist", ko: "마을 약사" },
    amount: 260,
    rate: 2,
    balance: 0,
    appears: 0,
    locationId: "riverside-lot-2",
    districtId: "riverside",
    avatar: "/assets/pop-art/avatars/auditor-neutral.png",
    status: "waiting",
  };
}

describe("customer deposits", () => {
  it("accepts deposits only after the bank launches a deposit product", () => {
    const start = createWorld(1);
    const depositor = waitingDepositor();
    expect(start.depositors).toHaveLength(0);
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

  it("waits rather than spending its one withdrawal on an empty deposit book", () => {
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
    world = run(world, ...days(6));
    expect(
      world.news.some((article) => article.threadId === "deposit-withdrawal"),
    ).toBe(false);
    expect(world.events).not.toContainEqual(
      expect.objectContaining({ type: "deposit-withdrawal" }),
    );
    // Still armed: letting the date lapse would hand a player who launches
    // savings late a run with no liquidity test in it at all.
    expect(world.withdrawalEvent?.status).toBe("scheduled");
  });

  it("still warns a saver who arrives after the scheduled warning day", () => {
    let world: MarketWorld = {
      ...createWorld(1),
      depositors: [],
      withdrawalEvent: {
        warningDay: 1,
        withdrawalDay: 4,
        withdrawalShare: 1,
        status: "scheduled",
      },
    };
    // The warning day passes with an empty book: nobody to warn yet.
    world = marketReducer(world, { type: "advance-day" });
    expect(world.withdrawalEvent?.status).toBe("scheduled");
    expect(world.news).toHaveLength(0);

    // A deposit product then attracts a saver, still ahead of the withdrawal.
    world = marketReducer(
      { ...world, depositors: [waitingDepositor()] },
      createDepositProduct(),
    );
    world = marketReducer(world, { type: "advance-day" });
    expect(world.withdrawalEvent?.status).toBe("warned");
    expect(
      world.news.some((article) => article.threadId === "deposit-withdrawal"),
    ).toBe(true);
  });

  it("settles a warned withdrawal and records its interest cost", () => {
    const start = createWorld(1);
    const depositor = waitingDepositor();
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
    // Arming fixes the withdrawal to the full notice period from today, so the
    // saver always gets the warning days the stage promises.
    const { warningDays } = world.config.withdrawalPressure!;
    expect(world.withdrawalEvent?.withdrawalDay).toBe(world.day + warningDays);
    world = run(world, ...days(warningDays));
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
