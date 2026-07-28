import { describe, expect, it } from "vitest";
import {
  createWorld,
  marketReducer,
  type MarketAction,
  type MarketWorld,
} from "./market-world.ts";
import { marketCampaignStages } from "./market-campaign.ts";
import { assessTrust, openingReputation } from "./market-trust.ts";

function run(world: MarketWorld, ...actions: MarketAction[]): MarketWorld {
  return actions.reduce(marketReducer, world);
}

function days(count: number): MarketAction[] {
  return Array.from({ length: count }, () => ({ type: "advance-day" }));
}

function fullMarket(stageIndex = 0, seed = 1): MarketWorld {
  return {
    ...createWorld(seed, marketCampaignStages[stageIndex]!.config),
    onboarding: "full",
  };
}

describe("transaction volume drives trust", () => {
  it("opens with the market's attention rather than at zero", () => {
    const world = createWorld(1);
    expect(world.trust).toBeGreaterThan(20);
    expect(world.runFailed).toBe(false);
  });

  it("counts a loan, a repayment and a deposit as business", () => {
    const start = fullMarket();
    const before = start.reputation.activity;
    const lent = marketReducer(start, { type: "begin" });
    expect(lent.reputation.activity).toBeGreaterThan(before);

    // The intro contract resolving is business again, at its own due day.
    const settled = run(lent, ...days(lent.config.customerSeeds[0]!.term));
    expect(settled.stats.repaid).toBe(1);
    expect(settled.reputation.activity).toBeGreaterThan(0);
  });

  it("runs an idle bank down to zero and ends the stage", () => {
    // The whole point of the model: no timer, no stall. A bank that stops
    // trading loses because the market stops rating it.
    let world = fullMarket();
    expect(world.trust).toBeGreaterThan(0);
    world = run(world, ...days(120));
    expect(world.trust).toBe(0);
    expect(world.runFailed).toBe(true);
    expect(world.failureReason).toBe("trust");
  });

  it("names too-few-deals as the cause while the score slides", () => {
    let world = fullMarket();
    const reasons: string[] = [];
    for (let day = 0; day < 40 && !world.runFailed; day += 1) {
      world = marketReducer(world, { type: "advance-day" });
      for (const event of world.events)
        if (event.type === "trust-shift") reasons.push(event.reason);
    }
    expect(reasons).toContain("market-quiet");
  });

  it("holds standing up for a bank that keeps trading", () => {
    // Same 40 days as the idle run, but lending whatever it can afford.
    let world = fullMarket();
    for (let day = 0; day < 40 && !world.runFailed; day += 1) {
      for (const customer of [...world.customers]) {
        if (customer.status !== "waiting") continue;
        if (world.cash < customer.amount) continue;
        world = marketReducer(world, {
          type: "approve",
          customerId: customer.id,
        });
      }
      world = marketReducer(world, { type: "advance-day" });
    }
    expect(world.runFailed).toBe(false);
    expect(world.trust).toBeGreaterThan(createWorld(1).trust);
  });

  it("cannot be won on volume alone", () => {
    // Momentum is a multiplier, not a pillar: churning deals lifts the cap on
    // trust, it does not substitute for a book that performs.
    const busy = assessTrust(
      { ...openingReputation(), activity: 50 },
      { netWorth: 1_000, startingCash: 1_000, hasUnpaidObligation: false },
    );
    expect(busy.momentum).toBe(1);
    expect(busy.target).toBeLessThan(60);
  });

  it("caps trust in proportion to how quiet the bank is", () => {
    const context = {
      netWorth: 1_000,
      startingCash: 1_000,
      hasUnpaidObligation: false,
    };
    const busy = assessTrust(openingReputation(), context);
    const quiet = assessTrust({ ...openingReputation(), activity: 0 }, context);
    expect(quiet.momentum).toBe(0);
    expect(quiet.target).toBe(0);
    expect(busy.target).toBeGreaterThan(0);
  });
});
