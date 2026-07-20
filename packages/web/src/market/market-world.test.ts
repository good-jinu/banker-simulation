import { describe, expect, it } from "vitest";
import {
  createWorld,
  FIRST_CUSTOMER,
  GOALS,
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

describe("determinism", () => {
  it("produces identical worlds for identical seeds and actions", () => {
    const actions: MarketAction[] = [{ type: "begin" }, ...days(30)];
    const a = run(createWorld(42), ...actions);
    const b = run(createWorld(42), ...actions);
    expect(a).toEqual(b);
  });

  it("is pure: reducing the same state twice gives the same result", () => {
    const world = run(createWorld(7), { type: "begin" }, ...days(2));
    const once = marketReducer(world, { type: "advance-day" });
    const twice = marketReducer(world, { type: "advance-day" });
    expect(once).toEqual(twice);
  });
});

describe("lending", () => {
  it("begin lends to the first customer and moves cash out", () => {
    const world = run(createWorld(1), { type: "begin" });
    expect(world.cash).toBe(700 - FIRST_CUSTOMER.amount);
    expect(world.loanCount).toBe(1);
    expect(world.cumulativeLent).toBe(FIRST_CUSTOMER.amount);
    expect(
      world.customers.find((c) => c.id === FIRST_CUSTOMER.id)?.status,
    ).toBe("accepted");
  });

  it("repays principal plus interest on the due day, exactly once", () => {
    let world = run(createWorld(1), { type: "begin" });
    const dueDay = FIRST_CUSTOMER.dueDay;
    world = run(world, ...days(dueDay - 1));
    const before = world.cash;
    world = marketReducer(world, { type: "advance-day" });
    const expected = FIRST_CUSTOMER.amount * (1 + FIRST_CUSTOMER.rate / 100);
    expect(world.cash).toBe(before + expected);
    expect(world.events).toContainEqual({
      type: "repayment",
      amount: expected,
    });
    expect(world.customers.find((c) => c.id === FIRST_CUSTOMER.id)).toBe(
      undefined,
    );
  });

  it("rejects an approval the bank cannot fund", () => {
    let world = run(createWorld(1), ...days(3));
    const request = world.customers.find((c) => c.status === "waiting");
    expect(request).toBeDefined();
    world = { ...world, cash: request!.amount - 1 };
    const after = marketReducer(world, {
      type: "approve",
      customerId: request!.id,
    });
    expect(after.cash).toBe(world.cash);
    expect(after.loanCount).toBe(world.loanCount);
  });
});

describe("customer spawning", () => {
  it("spawns a request every third day up to the visible cap", () => {
    const world = run(createWorld(9), ...days(30));
    expect(world.customers.length).toBeLessThanOrEqual(5);
    expect(
      world.customers.filter((c) => c.status === "waiting").length,
    ).toBeGreaterThan(0);
  });

  it("announces each spawned request as an event", () => {
    const world = run(createWorld(9), ...days(3));
    const request = world.events.find((e) => e.type === "loan-request");
    expect(request).toBeDefined();
  });
});

describe("funding", () => {
  function worldWithThreeLoans(): MarketWorld {
    let world = run(createWorld(5), { type: "begin" });
    while (world.loanCount < 3) {
      world = marketReducer(world, { type: "advance-day" });
      const waiting = world.customers.find(
        (c) => c.status === "waiting" && c.id !== FIRST_CUSTOMER.id,
      );
      if (waiting && world.cash >= waiting.amount)
        world = marketReducer(world, {
          type: "approve",
          customerId: waiting.id,
        });
    }
    return world;
  }

  it("unlocks funding three days after the third loan, exactly once", () => {
    let world = worldWithThreeLoans();
    expect(summarize(world).fundingEligible).toBe(false);
    world = run(world, ...days(3));
    expect(summarize(world).fundingEligible).toBe(true);
    const historyAfterUnlock = run(world, ...days(2));
    expect(world.events).toContainEqual({ type: "funding-unlocked" });
    expect(historyAfterUnlock.events).not.toContainEqual({
      type: "funding-unlocked",
    });
  });

  it("borrowing adds cash and books the liability", () => {
    let world = run(worldWithThreeLoans(), ...days(3));
    const before = world.cash;
    world = marketReducer(world, { type: "borrow", lenderId: "metro" });
    const metro = world.funding.find((f) => f.id === "metro")!;
    expect(world.cash).toBe(before + metro.amount);
    expect(metro.accepted).toBe(true);
    expect(metro.dueDay).toBe(world.day + 35);
    const summary = summarize(world);
    expect(summary.fundingLiabilities).toBeCloseTo(metro.amount * 1.08);
    expect(summary.netCash).toBeCloseTo(world.cash - metro.amount * 1.08);
  });
});

describe("mission clear", () => {
  it("latches once when all goals are met", () => {
    let world = run(createWorld(1), { type: "begin" });
    world = {
      ...world,
      cash: GOALS.netCash + 500,
      cumulativeLent: GOALS.cumulativeLent,
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.missionCleared).toBe(true);
    expect(world.events).toContainEqual({ type: "mission-clear" });
    const later = marketReducer(world, { type: "advance-day" });
    expect(later.missionCleared).toBe(true);
    expect(later.events).not.toContainEqual({ type: "mission-clear" });
  });
});
