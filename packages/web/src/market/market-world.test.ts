import { describe, expect, it } from "vitest";
import { marketCampaignStages } from "./market-campaign.ts";
import {
  createWorld,
  FIRST_CUSTOMER,
  GOALS,
  defaultRisk,
  loanAutomationCapacity,
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

  it("books receivables and interest into net worth without double-counting cash", () => {
    const world = run(createWorld(1), { type: "begin" });
    const summary = summarize(world);
    expect(summary.totalAssets).toBe(600 + 100);
    expect(summary.netWorth).toBe(700);
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

describe("campaign configuration", () => {
  it("creates worlds from the selected stage config", () => {
    const stage = marketCampaignStages[1]!;
    const world = createWorld(1, stage.config);

    expect(world.level).toBe(stage.config.level);
    expect(world.cash).toBe(stage.config.startingCash);
    expect(world.config.goals).toEqual(stage.config.goals);
    expect(world.customers[0]?.amount).toBe(420);
    expect(world.funding[0]?.amount).toBe(600);
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

  it("blocks new funding when trust falls below 30", () => {
    const world = run(worldWithThreeLoans(), ...days(3));
    expect(summarize(world).fundingEligible).toBe(true);
    expect(summarize({ ...world, trust: 20 }).fundingEligible).toBe(false);
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
    expect(summary.fundingLiabilities).toBe(metro.amount);
    expect(summary.netWorth).toBeCloseTo(summary.totalAssets - metro.amount);
  });

  it("repays first-level funding on time and removes the lender node", () => {
    let world = run(worldWithThreeLoans(), ...days(3));
    world = marketReducer(world, { type: "borrow", lenderId: "metro" });
    const lender = world.funding.find((item) => item.id === "metro")!;
    world = {
      ...world,
      customers: [],
      funding: world.funding.map((item) =>
        item.id === lender.id ? { ...item, dueDay: world.day + 1 } : item,
      ),
    };
    const before = world.cash;
    world = marketReducer(world, { type: "advance-day" });

    expect(world.cash).toBe(before - lender.amount * (1 + lender.rate / 100));
    expect(world.funding.find((item) => item.id === lender.id)).toBeUndefined();
    expect(world.trust).toBe(82);
    expect(world.insolvent).toBe(false);
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "funding-repayment", trustDelta: 2 }),
    );
  });
});

describe("level two credit risk", () => {
  it("derives higher default risk from a larger loan relative to income", () => {
    const safe = { ...FIRST_CUSTOMER, income: 4_000, amount: 400 };
    const risky = { ...FIRST_CUSTOMER, income: 800, amount: 800 };
    expect(defaultRisk(risky)).toBeGreaterThan(defaultRisk(safe));
  });

  it("makes an applicant without income a certain default", () => {
    const applicant = createWorld(1, "credit-under-pressure").customers[0]!;
    expect(applicant.income).toBe(0);
    expect(defaultRisk(applicant)).toBe(100);
  });

  it("automatically lends only to customers inside a loan product's rules", () => {
    const start = createWorld(1, "credit-under-pressure");
    const eligible = {
      ...start.customers[0]!,
      id: "eligible",
      income: 2_500,
      occupation: "employed" as const,
      amount: 500,
      term: 8,
      status: "waiting" as const,
    };
    const excluded = {
      ...eligible,
      id: "excluded",
      income: 0,
      occupation: "unemployed" as const,
    };
    const world = marketReducer(
      { ...start, customers: [eligible, excluded] },
      {
        type: "create-product",
        product: {
          id: "income-guard",
          kind: "loan",
          name: "Income Guard",
          x: 50,
          y: 26,
          rules: {
            minimumIncome: 1_500,
            occupation: "employed",
            minimumAmount: 300,
            maximumAmount: 1_000,
            minimumTerm: 6,
            maximumTerm: 12,
          },
        },
      },
    );

    expect(
      world.customers.find((customer) => customer.id === "eligible")?.status,
    ).toBe("accepted");
    expect(
      world.customers.find((customer) => customer.id === "eligible")?.productId,
    ).toBe("income-guard");
    expect(
      world.customers.find((customer) => customer.id === "excluded")?.status,
    ).toBe("waiting");
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "product-lent" }),
    );
    expect(world.cash).toBe(300); // $900 start − $100 setup − $500 loan
  });

  it("signs more same-day customers when trust is higher", () => {
    const start = createWorld(1, "credit-under-pressure");
    const applicants = ["a", "b", "c"].map((id) => ({
      ...start.customers[0]!,
      id,
      income: 2_500,
      occupation: "employed" as const,
      amount: 200,
      term: 8,
      status: "waiting" as const,
    }));
    const product = {
      id: "wide-net",
      kind: "loan" as const,
      name: "Wide Net",
      x: 50,
      y: 26,
      rules: {
        minimumIncome: 1_500,
        occupation: "employed" as const,
        minimumAmount: 100,
        maximumAmount: 1_000,
        minimumTerm: 6,
        maximumTerm: 12,
      },
    };

    const trusted = marketReducer(
      { ...start, trust: 80, customers: applicants },
      { type: "create-product", product },
    );
    expect(loanAutomationCapacity(80)).toBe(3);
    expect(
      trusted.customers.filter((customer) => customer.status === "accepted"),
    ).toHaveLength(3);

    const wary = marketReducer(
      { ...start, trust: 50, customers: applicants },
      { type: "create-product", product },
    );
    expect(loanAutomationCapacity(50)).toBe(1);
    expect(
      wary.customers.filter((customer) => customer.status === "accepted"),
    ).toHaveLength(1);
  });

  it("writes off a defaulted challenge loan deterministically", () => {
    let world = createWorld(6, "credit-under-pressure");
    const customer = world.customers[0]!;
    world = {
      ...world,
      customers: [
        {
          ...customer,
          income: 200,
          amount: 400,
          dueDay: 1,
          status: "accepted",
        },
      ],
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.cash).toBe(900);
    expect(world.customers).toHaveLength(0);
    expect(world.events.some((event) => event.type === "default")).toBe(true);
  });

  it("defaults challenge funding on its due day when cash is insufficient", () => {
    let world: MarketWorld = {
      ...createWorld(1, "credit-under-pressure"),
      day: 3,
      thirdLoanDay: 0,
    };
    world = marketReducer(world, { type: "borrow", lenderId: "civic" });
    const civic = world.funding.find((lender) => lender.id === "civic")!;
    world = {
      ...world,
      cash: 100,
      funding: world.funding.map((lender) =>
        lender.id === civic.id ? { ...lender, dueDay: world.day + 1 } : lender,
      ),
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.cash).toBe(100);
    expect(
      world.funding.find((lender) => lender.id === civic.id)?.defaulted,
    ).toBe(true);
    expect(world.trust).toBe(60);
    expect(world.insolvent).toBe(false);
    expect(world.events.some((event) => event.type === "funding-default")).toBe(
      true,
    );
  });

  it("settles a defaulted lender automatically once cash recovers", () => {
    let world: MarketWorld = {
      ...createWorld(1, "credit-under-pressure"),
      day: 3,
      thirdLoanDay: 0,
      cash: 700,
      funding: createWorld(1, "credit-under-pressure").funding.map((lender) =>
        lender.id === "civic"
          ? { ...lender, accepted: true, defaulted: true, dueDay: 1 }
          : lender,
      ),
    };
    world = marketReducer(world, { type: "advance-day" });

    expect(world.cash).toBe(64);
    expect(
      world.funding.find((lender) => lender.id === "civic"),
    ).toBeUndefined();
    expect(world.trust).toBe(80);
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "funding-settlement", amount: 636 }),
    );
  });

  it("fails the game when trust reaches zero", () => {
    let world: MarketWorld = {
      ...createWorld(1, "credit-under-pressure"),
      day: 3,
      thirdLoanDay: 0,
      trust: 20,
      funding: createWorld(1, "credit-under-pressure").funding.map((lender) =>
        lender.id === "civic"
          ? { ...lender, accepted: true, dueDay: 4 }
          : lender,
      ),
    };
    world = {
      ...world,
      cash: 100,
    };
    world = marketReducer(world, { type: "advance-day" });

    expect(world.trust).toBe(0);
    expect(world.insolvent).toBe(true);
    expect(world.failureReason).toBe("trust");
  });
});

describe("mission clear", () => {
  it("latches once when all goals are met", () => {
    let world = run(createWorld(1), { type: "begin" });
    world = {
      ...world,
      cash: GOALS.netWorth + 500,
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
