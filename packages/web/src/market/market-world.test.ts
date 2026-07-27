import { describe, expect, it } from "vitest";
import { marketCampaignStages } from "./market-campaign.ts";
import {
  assessWorldTrust,
  createWorld,
  FIRST_CUSTOMER,
  defaultRisk,
  marketReducer,
  summarize,
  upcomingRepayment,
  worldOpinion,
  type MarketAction,
  type MarketWorld,
} from "./market-world.ts";
import {
  approachTrust,
  emptyReputation,
  rateFairness,
  TRUST_COLLAPSE,
  type Reputation,
} from "./market-trust.ts";

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

describe("upcoming repayment", () => {
  it("returns null when there are no scheduled obligations", () => {
    expect(upcomingRepayment(createWorld(1))).toBeNull();
  });

  it("shows a scheduled customer-withdrawal demand as an outgoing cash movement", () => {
    let world = createWorld(1);
    const depositor = world.depositors[0]!;
    world = marketReducer(
      { ...world, depositors: [depositor] },
      createDepositProduct(),
    );
    world = {
      ...world,
      withdrawalEvent: {
        warningDay: 2,
        withdrawalDay: 3,
        withdrawalShare: 1,
        status: "warned",
      },
    };

    expect(upcomingRepayment(world)).toEqual({
      dueDay: 3,
      incomingAmount: 0,
      outgoingAmount: depositor.amount * (1 + depositor.rate / 100),
    });
  });

  it("returns the nearest accepted customer repayment", () => {
    const world = run(createWorld(1), { type: "begin" });

    expect(upcomingRepayment(world)).toEqual({
      dueDay: FIRST_CUSTOMER.dueDay,
      incomingAmount: FIRST_CUSTOMER.amount * (1 + FIRST_CUSTOMER.rate / 100),
      outgoingAmount: 0,
    });
  });

  it("returns the nearest scheduled funding repayment", () => {
    const base = createWorld(1, "credit-under-pressure");
    const lender = base.funding[0]!;
    const world = {
      ...base,
      funding: [{ ...lender, accepted: true, dueDay: 8 }],
    };

    expect(upcomingRepayment(world)).toEqual({
      dueDay: 8,
      incomingAmount: 0,
      outgoingAmount: lender.amount * (1 + lender.rate / 100),
    });
  });

  it("groups incoming and outgoing amounts when they share the nearest due day", () => {
    const base = run(createWorld(1), { type: "begin" });
    const lender = base.funding[0]!;
    const world = {
      ...base,
      funding: [
        {
          ...lender,
          accepted: true,
          dueDay: FIRST_CUSTOMER.dueDay,
        },
      ],
    };

    expect(upcomingRepayment(world)).toEqual({
      dueDay: FIRST_CUSTOMER.dueDay,
      incomingAmount: FIRST_CUSTOMER.amount * (1 + FIRST_CUSTOMER.rate / 100),
      outgoingAmount: lender.amount * (1 + lender.rate / 100),
    });
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
    const world = run(createWorld(9, "credit-under-pressure"), ...days(30));
    expect(world.customers.length).toBeLessThanOrEqual(5);
    expect(
      world.customers.filter((c) => c.status === "waiting").length,
    ).toBeGreaterThan(0);
  });

  it("announces each spawned request as an event", () => {
    const world = run(createWorld(9, "credit-under-pressure"), ...days(3));
    const request = world.events.find((e) => e.type === "loan-request");
    expect(request).toBeDefined();
  });
});

describe("funding", () => {
  function worldWithThreeLoans(): MarketWorld {
    let world = run(
      { ...createWorld(5), onboarding: "full" },
      { type: "begin" },
    );
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

  it("blocks new funding when trust has slipped below its opening standing", () => {
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
    expect(world.reputation.fundingHonored).toBe(1);
    expect(world.reputation.fundingMissed).toBe(0);
    expect(world.insolvent).toBe(false);
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "funding-repayment" }),
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
          active: true,
          rules: {
            minimumIncome: 1_500,
            occupation: "employed",
            interestRate: 9,
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
    expect(world.stats.automatedIssued).toBe(1);
    expect(world.cash).toBe(300); // $900 start − $100 setup − $500 loan
  });

  it("holds an alert-affected customer when an automated line has a guard", () => {
    const start = createWorld(1, "credit-under-pressure");
    const product = {
      id: "guarded-line",
      kind: "loan" as const,
      name: "Guarded line",
      x: 50,
      y: 26,
      active: false,
      rules: {
        minimumIncome: 1_500,
        occupation: "employed" as const,
        interestRate: 10,
        minimumAmount: 100,
        maximumAmount: 1_000,
        minimumTerm: 6,
        maximumTerm: 12,
      },
    };
    const withProduct = marketReducer(
      { ...start, customers: [] },
      { type: "create-product", product },
    );
    const guarded = marketReducer(withProduct, {
      type: "set-product-alert-guard",
      productId: product.id,
      enabled: true,
    });
    const warning = start.config.newsSchedule.find(
      (article) => article.id === "yard-gigs-warning",
    )!;
    const applicant = {
      ...start.customers[0]!,
      id: "delivery-applicant",
      income: 2_500,
      occupation: "employed" as const,
      segment: "delivery" as const,
      amount: 400,
      term: 8,
      status: "waiting" as const,
    };
    const held = marketReducer(
      {
        ...guarded,
        news: [{ ...warning, publishedDay: 8, read: true }],
        customers: [applicant],
      },
      { type: "set-product-active", productId: product.id, active: true },
    );

    expect(held.customers[0]?.status).toBe("waiting");
  });

  it("contracts every matching same-day customer when cash is available", () => {
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
      active: true,
      rules: {
        minimumIncome: 1_500,
        occupation: "employed" as const,
        interestRate: 9,
        minimumAmount: 100,
        maximumAmount: 1_000,
        minimumTerm: 6,
        maximumTerm: 12,
      },
    };

    const contracted = marketReducer(
      { ...start, customers: applicants },
      { type: "create-product", product },
    );
    expect(
      contracted.customers.filter((customer) => customer.status === "accepted"),
    ).toHaveLength(3);
    expect(
      contracted.customers
        .filter((customer) => customer.status === "accepted")
        .every((customer) => customer.rate === 9),
    ).toBe(true);
  });

  it("pauses new automated lending without changing existing contracts", () => {
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
    const product = {
      id: "pauseable",
      kind: "loan" as const,
      name: "Pauseable",
      x: 50,
      y: 26,
      active: true,
      rules: {
        minimumIncome: 1_500,
        occupation: "employed" as const,
        interestRate: 10,
        minimumAmount: 100,
        maximumAmount: 1_000,
        minimumTerm: 6,
        maximumTerm: 12,
      },
    };
    const active = marketReducer(
      { ...start, customers: [eligible] },
      { type: "create-product", product },
    );
    const laterRequest = { ...eligible, id: "later", amount: 100 };
    const paused = marketReducer(
      {
        ...active,
        customers: [...active.customers, laterRequest],
      },
      { type: "set-product-active", productId: product.id, active: false },
    );

    expect(paused.products[0]).toMatchObject({ active: false });
    expect(
      paused.customers.find((customer) => customer.id === "eligible")?.status,
    ).toBe("accepted");
    expect(
      paused.customers.find((customer) => customer.id === "later")?.status,
    ).toBe("waiting");

    const resumed = marketReducer(paused, {
      type: "set-product-active",
      productId: product.id,
      active: true,
    });
    expect(
      resumed.customers.find((customer) => customer.id === "later")?.status,
    ).toBe("accepted");
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
    expect(world.reputation.fundingMissed).toBe(1);
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
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "funding-settlement", amount: 636 }),
    );
  });

  it("survives a single missed funding payment instead of ending the game", () => {
    const base = createWorld(1, "credit-under-pressure");
    let world: MarketWorld = {
      ...base,
      day: 3,
      thirdLoanDay: 0,
      cash: 100,
      trust: 60,
      funding: base.funding.map((lender) =>
        lender.id === "civic"
          ? { ...lender, accepted: true, dueDay: 4 }
          : lender,
      ),
    };
    world = marketReducer(world, { type: "advance-day" });

    // A broken promise is the strongest negative signal, but it is a ceiling
    // and a reliability hit — not an instant loss.
    expect(world.reputation.fundingMissed).toBe(1);
    expect(world.insolvent).toBe(false);
    expect(assessWorldTrust(world).ceilingCause).toBe("unpaid-obligation");
  });

  it("fails the game only when the bank's standing genuinely collapses", () => {
    const base = createWorld(1, "credit-under-pressure");
    let world: MarketWorld = {
      ...base,
      day: 3,
      thirdLoanDay: 0,
      cash: 0,
      customers: [],
      trust: 20,
      reputation: {
        ...emptyReputation(),
        defaulted: 12,
        realizedProfit: -5_000,
        openLoss: 5_000,
        fundingMissed: 4,
      },
      funding: base.funding.map((lender) =>
        lender.id === "civic"
          ? { ...lender, accepted: true, defaulted: true, dueDay: 99 }
          : lender,
      ),
    };
    world = run(world, ...days(6));

    expect(world.trust).toBeLessThanOrEqual(TRUST_COLLAPSE);
    expect(world.insolvent).toBe(true);
    expect(world.failureReason).toBe("trust");
  });
});

describe("bank trust", () => {
  /** A bank that has done everything right: a broad book of repaid, fairly
   * priced contracts, healthy earnings, and no outstanding obligation. */
  function masteryReputation(): Reputation {
    return {
      ...emptyReputation(),
      repaid: 20,
      defaulted: 0,
      realizedProfit: 400,
      openLoss: 0,
      fairness: 20,
      productRepaid: 8,
      productDefaulted: 0,
      // Comfortably above the confidence sample so a day of decay cannot pull
      // the funding record back under full marks.
      fundingHonored: 8,
      fundingMissed: 0,
    };
  }

  it("opens every stage at the standing its empty record justifies", () => {
    // Not a hardcoded 30: no reach, half-strength assets and a neutral
    // reliability prior compute to it. Both stages open identically because
    // the thresholds scale with the stage's starting cash.
    const opening = createWorld(1).trust;
    expect(opening).toBeGreaterThan(25);
    expect(opening).toBeLessThan(35);
    expect(createWorld(1, "credit-under-pressure").trust).toBeCloseTo(opening);
  });

  it("does not drift on day one, having opened at its own target", () => {
    const start = createWorld(1);
    const next = marketReducer(start, { type: "advance-day" });
    expect(next.trust).toBeCloseTo(start.trust);
    expect(next.events).not.toContainEqual(
      expect.objectContaining({ type: "trust-shift" }),
    );
  });

  it("grants nothing for approving a loan, only for repayment", () => {
    const start = createWorld(1);
    const approved = marketReducer(start, { type: "begin" });
    expect(assessWorldTrust(approved).target).toBeLessThanOrEqual(
      assessWorldTrust(start).target,
    );
    expect(approved.reputation.repaid).toBe(0);
  });

  it("does not let a larger loan buy more trust than a small one", () => {
    const small = { ...FIRST_CUSTOMER, amount: 100 };
    const large = { ...FIRST_CUSTOMER, amount: 500 };
    const book = (customer: typeof FIRST_CUSTOMER): Reputation => ({
      ...emptyReputation(),
      repaid: 1,
      fairness: rateFairness(customer.rate),
    });
    expect(book(large).repaid).toBe(book(small).repaid);
  });

  it("saturates reach so repeating the same cheap loan stops paying", () => {
    const context = {
      netWorth: 700,
      startingCash: 700,
      hasUnpaidObligation: false,
    };
    const at = (repaid: number) =>
      assessWorldTrust({
        ...createWorld(1),
        reputation: { ...emptyReputation(), repaid, fairness: repaid },
        cash: context.netWorth,
      }).pillars.reach;
    expect(at(8)).toBe(1);
    expect(at(40)).toBe(1);
  });

  it("ignores borrowed cash by scoring net assets, not gross", () => {
    const base = createWorld(1);
    const borrowed: MarketWorld = {
      ...base,
      cash: base.cash + 1_000,
      funding: base.funding.map((lender, index) =>
        index === 0 ? { ...lender, accepted: true, amount: 1_000 } : lender,
      ),
    };
    expect(assessWorldTrust(borrowed).pillars.strength).toBeCloseTo(
      assessWorldTrust(base).pillars.strength,
    );
  });

  it("caps trust while the bank's own obligation is unpaid", () => {
    const base = createWorld(1);
    const world: MarketWorld = {
      ...base,
      reputation: masteryReputation(),
      funding: base.funding.map((lender, index) =>
        index === 0
          ? { ...lender, accepted: true, defaulted: true, amount: 1 }
          : lender,
      ),
    };
    const assessment = assessWorldTrust(world);
    expect(assessment.ceiling).toBe(90);
    expect(assessment.ceilingCause).toBe("unpaid-obligation");
    expect(assessment.target).toBeLessThanOrEqual(90);
  });

  it("caps trust at 80 while a recent loss is still open", () => {
    const world: MarketWorld = {
      ...createWorld(1),
      reputation: { ...masteryReputation(), openLoss: 200 },
    };
    const assessment = assessWorldTrust(world);
    expect(assessment.ceilingCause).toBe("open-losses");
    expect(assessment.target).toBeLessThanOrEqual(80);
  });

  it("caps trust at 60 when reliability is weak, however profitable", () => {
    const world: MarketWorld = {
      ...createWorld(1),
      cash: 100_000,
      reputation: {
        ...emptyReputation(),
        repaid: 30,
        defaulted: 30,
        realizedProfit: 100_000,
        fairness: 30,
      },
    };
    const assessment = assessWorldTrust(world);
    // A weighted mean alone would let this book average its way up.
    expect(assessment.composite).toBeGreaterThan(60);
    expect(assessment.ceilingCause).toBe("weak-reliability");
    expect(assessment.target).toBe(60);
  });

  it("reaches 100 only with reach, profit, assets and no open obligation", () => {
    const base = createWorld(1);
    const mastered: MarketWorld = {
      ...base,
      cash: base.config.startingCash * 2,
      reputation: masteryReputation(),
    };
    expect(assessWorldTrust(mastered).target).toBe(100);

    // Removing any single ingredient must drop it back below full marks.
    expect(assessWorldTrust({ ...mastered, cash: 0 }).target).toBeLessThan(100);
    expect(
      assessWorldTrust({
        ...mastered,
        reputation: { ...masteryReputation(), repaid: 2, fairness: 2 },
      }).target,
    ).toBeLessThan(100);
    expect(
      assessWorldTrust({
        ...mastered,
        reputation: { ...masteryReputation(), realizedProfit: 0 },
      }).target,
    ).toBeLessThan(100);
  });

  it("prices predatory lending as unfair and market rates as fair", () => {
    expect(rateFairness(10)).toBe(1);
    expect(rateFairness(21)).toBe(1);
    expect(rateFairness(31)).toBeLessThan(1);
    expect(rateFairness(40)).toBe(0);
  });

  it("climbs slowly and falls fast", () => {
    const climbed = approachTrust(50, 100) - 50;
    const dropped = 50 - approachTrust(50, 0);
    expect(climbed).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(climbed * 3);
  });

  it("lets a damaged bank recover as its losses age out", () => {
    let world: MarketWorld = {
      ...createWorld(1),
      reputation: { ...masteryReputation(), openLoss: 400 },
    };
    const damaged = assessWorldTrust(world).target;
    world = run(world, ...days(60));
    expect(assessWorldTrust(world).target).toBeGreaterThan(damaged);
  });

  it("reports opinion as bands rather than numbers", () => {
    const opinion = worldOpinion({
      ...createWorld(1),
      cash: 1_400,
      reputation: masteryReputation(),
    });
    expect(opinion).toMatchObject({
      reach: "high",
      strength: "high",
      reliability: "high",
      ceilingCause: null,
    });
  });

  it("explains a downward move without naming a number", () => {
    const base = createWorld(1);
    const world = marketReducer(
      {
        ...base,
        trust: 90,
        reputation: { ...emptyReputation(), openLoss: 300 },
      },
      { type: "advance-day" },
    );
    expect(world.trust).toBeLessThan(90);
    expect(world.events).toContainEqual(
      expect.objectContaining({ type: "trust-shift", direction: "down" }),
    );
    for (const event of world.events) {
      expect(event).not.toHaveProperty("trustDelta");
    }
  });

  it("can actually be won by underwriting carefully", () => {
    // Guards the property that is easy to lose when retuning weights: a
    // composite whose pillars crest at different moments can sit at 97 forever
    // and quietly make the stage unwinnable.
    let world = marketReducer(
      { ...createWorld(1), onboarding: "full" },
      { type: "begin" },
    );
    for (let day = 0; day < 200 && !world.missionCleared; day++) {
      for (const customer of world.customers) {
        if (customer.status !== "waiting") continue;
        if (defaultRisk(customer) > 22) continue;
        if (world.cash < customer.amount * 1.5) continue;
        world = marketReducer(world, {
          type: "approve",
          customerId: customer.id,
        });
      }
      world = marketReducer(world, { type: "advance-day" });
    }
    expect(world.insolvent).toBe(false);
    expect(world.missionCleared).toBe(true);
    expect(world.trust).toBe(100);
  });

  it("no longer lets a handful of cheap repeat loans win the stage", () => {
    // Under the old accumulator this exact loop was worth +12 a contract:
    // six of them took a bank from 30 to 100.
    let world = createWorld(1);
    const mina = world.customers[0]!;
    for (let round = 0; round < 8; round++) {
      world = {
        ...world,
        customers: [{ ...mina, id: `mina-${round}`, status: "waiting" }],
      };
      world = marketReducer(world, {
        type: "approve",
        customerId: `mina-${round}`,
      });
      world = run(world, ...days(13));
    }
    expect(world.missionCleared).toBe(false);
    expect(world.trust).toBeLessThan(70);
  });

  it("latches completion once when trust reaches 100", () => {
    const base = createWorld(1);
    let world: MarketWorld = {
      ...base,
      cash: base.config.startingCash * 2,
      trust: 99,
      reputation: masteryReputation(),
    };
    world = marketReducer(world, { type: "advance-day" });
    expect(world.trust).toBe(100);
    expect(world.missionCleared).toBe(true);
    expect(world.events).toContainEqual({ type: "mission-clear" });
    const later = marketReducer(world, { type: "advance-day" });
    expect(later.missionCleared).toBe(true);
    expect(later.events).not.toContainEqual({ type: "mission-clear" });
  });
});
