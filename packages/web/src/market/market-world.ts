import type { LocalText } from "../i18n/local-text.ts";
import {
  marketStageByLevel,
  marketStageById,
  type MarketGoals,
  type MarketStageConfig,
} from "./market-campaign.ts";

/**
 * Pure simulation core for the open-market level. The world is plain data,
 * every rule is a pure function of (world, action), and randomness flows
 * through the seed stored in the world itself — so the reducer is
 * deterministic, replayable, and safe under React StrictMode's double
 * invocation. React components render the world; they never advance it.
 */

export type CustomerStatus = "waiting" | "accepted";
/** A stage id string. Not a closed union — new stages don't need a type edit. */
export type MarketLevel = string;
/** Product types are deliberately a discriminated union so deposits and
 * insurance can add their own rules and lifecycle without changing loans. */
export type ProductKind = "loan" | "deposit" | "insurance";
export type OccupationRule = "any" | "employed" | "self-employed";
export type LoanProductRules = {
  minimumIncome: number;
  occupation: OccupationRule;
  minimumAmount: number;
  maximumAmount: number;
  minimumTerm: number;
  maximumTerm: number;
};
export type LoanProduct = {
  id: string;
  kind: "loan";
  name: string;
  x: number;
  y: number;
  rules: LoanProductRules;
};
/** Reserved variants make the product platform additive rather than loan-only. */
export type Product =
  | LoanProduct
  | { id: string; kind: "deposit"; name: string; x: number; y: number }
  | { id: string; kind: "insurance"; name: string; x: number; y: number };
export type CustomerExpression =
  "neutral" | "requesting" | "evaluating" | "worried" | "relieved" | "rejected";
export type FailureReason = "cash" | "trust" | null;

export type CustomerEvidence = {
  purpose: LocalText;
  employment: LocalText;
  debt: LocalText;
  collateral: LocalText;
};

export type Customer = {
  id: string;
  name: LocalText;
  job: LocalText;
  occupation?: Exclude<OccupationRule, "any"> | "unemployed";
  income: number;
  amount: number;
  rate: number;
  term: number;
  dueDay: number;
  appears: number;
  x: number;
  y: number;
  avatar: string;
  avatarStates?: Partial<Record<CustomerExpression, string>>;
  evidence: CustomerEvidence;
  status: CustomerStatus;
  /** Set only when the loan was issued by an automated product. */
  productId?: string;
};

export type Funding = {
  id: string;
  name: LocalText;
  amount: number;
  rate: number;
  dueDay: number;
  x: number;
  y: number;
  accepted: boolean;
  defaulted: boolean;
};

export type MarketEvent =
  | { type: "repayment"; amount: number }
  | { type: "customer-repayment"; customer: Customer; amount: number }
  | { type: "default"; customer: Customer; risk: number }
  | { type: "loan-request"; customer: Customer }
  | { type: "transfer"; from: string; to: string; amount: number }
  | { type: "product-created"; product: Product }
  | { type: "product-lent"; product: LoanProduct; customer: Customer }
  | {
      type: "product-cash-in";
      product: LoanProduct;
      customer: Customer;
      amount: number;
    }
  | { type: "borrowed"; lender: Funding }
  | {
      type: "funding-repayment";
      lender: Funding;
      amount: number;
      trustDelta: 2;
    }
  | {
      type: "funding-default";
      lender: Funding;
      amount: number;
      trustDelta: -20;
    }
  | { type: "funding-settlement"; lender: Funding; amount: number }
  | { type: "funding-unlocked" }
  | { type: "insolvent" }
  | { type: "mission-clear" };

export type MarketWorld = {
  level: MarketLevel;
  config: MarketStageConfig;
  seed: number;
  day: number;
  cash: number;
  customers: Customer[];
  products: Product[];
  funding: Funding[];
  loanCount: number;
  cumulativeLent: number;
  thirdLoanDay: number | null;
  missionCleared: boolean;
  insolvent: boolean;
  failureReason: FailureReason;
  trust: number;
  fundingAnnounced: boolean;
  /** Events produced by the most recent action only. */
  events: MarketEvent[];
};

export type MarketAction =
  | { type: "restore"; world: MarketWorld }
  | { type: "advance-day" }
  | { type: "begin" }
  | { type: "approve"; customerId: string }
  | { type: "reject"; customerId: string }
  | { type: "borrow"; lenderId: string }
  | { type: "create-product"; product: LoanProduct };

export const GOALS: MarketGoals =
  marketStageByLevel("first-yield").config.goals;
export const CHALLENGE_GOALS: MarketGoals = marketStageByLevel(
  "credit-under-pressure",
).config.goals;

export const FIRST_CUSTOMER: Customer =
  marketStageByLevel("first-yield").config.customerSeeds[0]!;

const RANDOM_NAMES: LocalText[] = [
  { en: "Jun Park", ko: "준 박" },
  { en: "Seoyeon Lee", ko: "서연 이" },
  { en: "Doyoon Han", ko: "도윤 한" },
  { en: "Jiwoo Choi", ko: "지우 최" },
  { en: "Hajun Song", ko: "하준 송" },
  { en: "Yuna Jung", ko: "유나 정" },
  { en: "Hyunwoo Kang", ko: "현우 강" },
  { en: "Subin Oh", ko: "수빈 오" },
];
const RANDOM_JOBS: LocalText[] = [
  { en: "Delivery driver", ko: "택배 기사" },
  { en: "Freelance designer", ko: "프리랜서 디자이너" },
  { en: "Café owner", ko: "카페 운영자" },
  { en: "Nurse", ko: "간호사" },
  { en: "Academy instructor", ko: "학원 강사" },
  { en: "Restaurant owner", ko: "식당 운영자" },
  { en: "Software developer", ko: "소프트웨어 개발자" },
  { en: "Craft studio owner", ko: "공방 운영자" },
];
const RANDOM_AVATARS = [
  "/assets/pop-art/avatars/jun-neutral.png",
  "/assets/pop-art/avatars/auditor-neutral.png",
  "/assets/pop-art/avatars/fund-manager-neutral.png",
  "/assets/pop-art/avatars/mina-neutral.png",
  "/assets/pop-art/avatars/regulator-neutral.png",
  "/assets/pop-art/avatars/jun-evaluating.png",
];
const RANDOM_PURPOSES: LocalText[] = [
  { en: "Replace a delivery van tire", ko: "배달 차량 타이어 교체" },
  { en: "Buy supplies for a design contract", ko: "디자인 계약용 자재 구입" },
  { en: "Cover a slow café month", ko: "카페 비수기 운영비" },
  { en: "Pay a professional certification fee", ko: "자격증 시험 비용" },
  { en: "Restock a small restaurant", ko: "작은 식당 식자재 보충" },
];
const RANDOM_EMPLOYMENT: LocalText[] = [
  { en: "Stable work, paid monthly", ko: "월급을 받는 안정적인 일자리" },
  {
    en: "Contract work with an uneven schedule",
    ko: "일정하지 않은 계약직 일",
  },
  { en: "Growing business, first year", ko: "성장 중인 1년 차 사업" },
];
const RANDOM_DEBT: LocalText[] = [
  { en: "No other loans", ko: "다른 대출 없음" },
  { en: "One small credit-card balance", ko: "소액의 카드 잔액 하나" },
  { en: "A family loan due next season", ko: "다음 계절에 갚을 가족 대출" },
];
const RANDOM_COLLATERAL: LocalText[] = [
  { en: "A signed work contract", ko: "서명된 업무 계약서" },
  { en: "A business deposit", ko: "사업 보증금" },
  { en: "A guarantor from the workplace", ko: "직장의 보증인" },
  { en: "Nothing offered", ko: "제시한 담보 없음" },
];
const CUSTOMER_POSITIONS = [
  { x: 19, y: 21 },
  { x: 81, y: 21 },
  { x: 84, y: 76 },
  { x: 18, y: 76 },
  { x: 49, y: 14 },
  { x: 67, y: 83 },
  { x: 32, y: 83 },
];

/** mulberry32 step: returns a value in [0, 1) and the next seed. */
function nextRandom(seed: number): [value: number, nextSeed: number] {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(nextSeed ^ (nextSeed >>> 15), 1 | nextSeed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 0x1_0000_0000, nextSeed];
}

function randomInt(
  seed: number,
  bound: number,
): [value: number, nextSeed: number] {
  const [value, nextSeed] = nextRandom(seed);
  return [Math.floor(value * bound), nextSeed];
}

export function createWorld(
  seed = 1,
  stageOrLevel: MarketStageConfig | MarketLevel = "first-yield",
): MarketWorld {
  const config =
    typeof stageOrLevel === "string"
      ? marketStageById(stageOrLevel).config
      : stageOrLevel;
  return {
    level: config.level,
    config,
    seed: seed >>> 0,
    day: 0,
    cash: config.startingCash,
    customers: config.customerSeeds.map((customer) => ({ ...customer })),
    products: [],
    funding: config.fundingSeeds.map((lender) => ({ ...lender })),
    loanCount: 0,
    cumulativeLent: 0,
    thirdLoanDay: null,
    missionCleared: false,
    insolvent: false,
    failureReason: null,
    trust: 80,
    fundingAnnounced: false,
    events: [],
  };
}

export function goalsFor(world: MarketWorld) {
  return world.config.goals;
}

/**
 * Challenge-level default chance. A loan at or below one month of income is
 * precarious; applicants earning several times the requested amount are safer.
 */
export function defaultRisk(customer: Customer): number {
  if (customer.income <= 0 || customer.occupation === "unemployed") return 100;
  const incomeToLoan = customer.income / customer.amount;
  return Math.min(55, Math.max(5, Math.round(62 - incomeToLoan * 18)));
}

/**
 * How many customers a loan product can sign in a single day. A trusted bank
 * draws a bigger queue than one the market is wary of, so this scales with
 * the same trust bands the trust rail shows the player.
 */
export function loanAutomationCapacity(trust: number): number {
  if (trust >= 80) return 3;
  if (trust >= 60) return 2;
  return 1;
}

export function avatarFor(
  customer: Customer,
  expression: CustomerExpression,
): string {
  return customer.avatarStates?.[expression] ?? customer.avatar;
}

export function summarize(world: MarketWorld) {
  // Receivables and liabilities use principal value. Interest is recognized
  // when a repayment actually moves cash, rather than at loan origination.
  const loanReceivables = world.customers
    .filter((customer) => customer.status === "accepted")
    .reduce((total, customer) => total + customer.amount, 0);
  const fundingLiabilities = world.funding
    .filter((lender) => lender.accepted)
    .reduce((total, lender) => total + lender.amount, 0);
  const totalAssets = world.cash + loanReceivables;
  const hasFunding = world.funding.some((lender) => lender.accepted);
  const trustBand =
    world.trust >= 80
      ? "strong"
      : world.trust >= 60
        ? "steady"
        : world.trust >= 30
          ? "at-risk"
          : "blocked";
  return {
    loanReceivables,
    fundingLiabilities,
    totalAssets,
    netWorth: totalAssets - fundingLiabilities,
    hasFunding,
    trustBand,
    fundingEligible:
      world.thirdLoanDay !== null &&
      world.day >= world.thirdLoanDay + world.config.fundingUnlockDelayDays &&
      !hasFunding &&
      world.trust >= 30,
  };
}

export type MarketSummary = ReturnType<typeof summarize>;

export function marketReducer(
  world: MarketWorld,
  action: MarketAction,
): MarketWorld {
  if (action.type === "restore") return { ...action.world, events: [] };
  if (world.insolvent || world.missionCleared) return { ...world, events: [] };
  switch (action.type) {
    case "advance-day":
      return withDerivedEvents(advanceDay(world));
    case "begin":
      return withDerivedEvents(begin(world));
    case "approve":
      return withDerivedEvents(approve(world, action.customerId));
    case "reject":
      return {
        ...world,
        customers: world.customers.filter(
          (customer) => customer.id !== action.customerId,
        ),
        events: [],
      };
    case "borrow":
      return withDerivedEvents(borrow(world, action.lenderId));
    case "create-product":
      return withDerivedEvents(createProduct(world, action.product));
  }
}

/** Latch one-shot milestones (mission clear, funding unlock) after any action. */
function withDerivedEvents(world: MarketWorld): MarketWorld {
  const summary = summarize(world);
  const goals = goalsFor(world);
  let { missionCleared, fundingAnnounced, events } = world;
  if (
    !world.insolvent &&
    !missionCleared &&
    world.loanCount >= goals.loanCount &&
    world.cumulativeLent >= goals.cumulativeLent &&
    world.products.length >= goals.productCount &&
    summary.netWorth >= goals.netWorth &&
    // world.day is 0-indexed; the UI's "DAY N" header shows world.day + 1,
    // so the goal must clear against that same displayed day number.
    (goals.survivalDay === null || world.day + 1 >= goals.survivalDay)
  ) {
    missionCleared = true;
    events = [...events, { type: "mission-clear" }];
  }
  if (!world.insolvent && !fundingAnnounced && summary.fundingEligible) {
    fundingAnnounced = true;
    events = [...events, { type: "funding-unlocked" }];
  }
  return { ...world, missionCleared, fundingAnnounced, events };
}

function advanceDay(world: MarketWorld): MarketWorld {
  const day = world.day + 1;
  const events: MarketEvent[] = [];
  let repayment = 0;
  const repaidCustomers: Customer[] = [];
  let trust = world.trust;
  let seed = world.seed;
  let customers = world.customers.filter((customer) => {
    if (customer.status === "accepted" && customer.dueDay === day) {
      const risk = defaultRisk(customer);
      let roll = 100;
      if (world.config.randomizeDefaultRisk) {
        let random: number;
        [random, seed] = nextRandom(seed);
        roll = random * 100;
      }
      if (roll < risk) {
        events.push({ type: "default", customer, risk });
      } else {
        const amount = customer.amount * (1 + customer.rate / 100);
        repayment += amount;
        repaidCustomers.push(customer);
      }
      return false;
    }
    return true;
  });
  let cash = world.cash;
  if (repayment > 0) {
    cash += repayment;
    events.push({ type: "repayment", amount: repayment });
    for (const customer of repaidCustomers) {
      events.push({
        type: "customer-repayment",
        customer,
        amount: customer.amount * (1 + customer.rate / 100),
      });
      const product = productForCustomer(world.products, customer);
      if (product) {
        events.push({
          type: "product-cash-in",
          product,
          customer,
          amount: customer.amount * (1 + customer.rate / 100),
        });
      }
    }
  }
  const funding = world.funding.filter((lender) => {
    if (
      !world.config.fundingRepaymentsEnabled ||
      !lender.accepted ||
      lender.defaulted ||
      lender.dueDay !== day
    )
      return true;

    const amount = lender.amount * (1 + lender.rate / 100);
    if (cash >= amount) {
      cash -= amount;
      trust = Math.min(100, trust + 2);
      events.push({
        type: "funding-repayment",
        lender,
        amount,
        trustDelta: 2,
      });
      return false;
    }

    trust = Math.max(0, trust - 20);
    events.push({
      type: "funding-default",
      lender,
      amount,
      trustDelta: -20,
    });
    return true;
  });
  const settledDefaultedFundingIds = new Set<string>();
  for (const lender of [...funding].sort(
    (left, right) => left.dueDay - right.dueDay,
  )) {
    if (!lender.accepted || !lender.defaulted) continue;
    const amount = lender.amount * (1 + lender.rate / 100);
    if (cash < amount) continue;
    cash -= amount;
    settledDefaultedFundingIds.add(lender.id);
    events.push({ type: "funding-settlement", lender, amount });
  }
  const defaultedFundingIds = new Set(
    events
      .filter((event) => event.type === "funding-default")
      .map((event) => event.lender.id),
  );
  const normalizedFunding = funding
    .filter((lender) => !settledDefaultedFundingIds.has(lender.id))
    .map((lender) =>
      defaultedFundingIds.has(lender.id)
        ? { ...lender, defaulted: true }
        : lender,
    );
  const insolvent = cash < 0 || trust <= 0;
  const failureReason: FailureReason =
    trust <= 0 ? "trust" : cash < 0 ? "cash" : null;
  if (insolvent) events.push({ type: "insolvent" });
  if (
    day % world.config.spawnEveryDays === 0 &&
    customers.length < world.config.maxVisibleCustomers
  ) {
    const occupied = new Set(
      customers.map((customer) => `${customer.x},${customer.y}`),
    );
    const available = CUSTOMER_POSITIONS.filter(
      (position) => !occupied.has(`${position.x},${position.y}`),
    );
    if (available.length > 0) {
      let index: number;
      [index, seed] = randomInt(seed, available.length);
      let customer: Customer;
      [customer, seed] = randomCustomer(
        day,
        available[index]!,
        seed,
        world.config,
      );
      customers.push(customer);
      events.push({ type: "loan-request", customer });
    }
  }
  const automated = automateLoans({
    ...world,
    day,
    cash,
    customers,
    funding: normalizedFunding,
    seed,
    insolvent,
    failureReason,
    trust,
    events,
  });
  return {
    ...automated,
  };
}

function randomCustomer(
  day: number,
  position: { x: number; y: number },
  initialSeed: number,
  config: MarketStageConfig,
): [Customer, number] {
  let seed = initialSeed;
  const roll = (bound: number): number => {
    let value: number;
    [value, seed] = randomInt(seed, bound);
    return value;
  };
  const generation = config.customerGeneration;
  const term = generation.termMin + roll(generation.termRange);
  const customer: Customer = {
    id: `customer-${day}`,
    name: RANDOM_NAMES[roll(RANDOM_NAMES.length)]!,
    job: RANDOM_JOBS[roll(RANDOM_JOBS.length)]!,
    occupation: "employed",
    income:
      generation.incomeMin +
      roll(generation.incomeRange) * generation.incomeStep,
    amount:
      generation.amountMin +
      roll(generation.amountRange) * generation.amountStep,
    rate: generation.rateMin + roll(generation.rateRange),
    term,
    dueDay: day + term,
    appears: day,
    x: position.x,
    y: position.y,
    avatar: RANDOM_AVATARS[roll(RANDOM_AVATARS.length)]!,
    evidence: {
      purpose: RANDOM_PURPOSES[roll(RANDOM_PURPOSES.length)]!,
      employment: RANDOM_EMPLOYMENT[roll(RANDOM_EMPLOYMENT.length)]!,
      debt: RANDOM_DEBT[roll(RANDOM_DEBT.length)]!,
      collateral: RANDOM_COLLATERAL[roll(RANDOM_COLLATERAL.length)]!,
    },
    status: "waiting",
  };
  return [customer, seed];
}

/** The scripted intro loan to the first customer. */
function begin(world: MarketWorld): MarketWorld {
  const first = world.customers.find(
    (customer) => customer.id === world.config.introCustomerId,
  );
  if (
    !world.config.introApprovesAutomatically ||
    !first ||
    first.status !== "waiting"
  )
    return { ...world, events: [] };
  return {
    ...world,
    cash: world.cash - first.amount,
    customers: world.customers.map((customer) =>
      customer.id === first.id ? { ...customer, status: "accepted" } : customer,
    ),
    loanCount: world.loanCount + 1,
    cumulativeLent: world.cumulativeLent + first.amount,
    events: [
      { type: "transfer", from: "banker", to: first.id, amount: first.amount },
    ],
  };
}

function approve(world: MarketWorld, customerId: string): MarketWorld {
  const customer = world.customers.find((item) => item.id === customerId);
  if (
    !customer ||
    customer.status !== "waiting" ||
    world.cash < customer.amount
  )
    return { ...world, events: [] };
  return lend(world, customer, undefined);
}

function lend(
  world: MarketWorld,
  customer: Customer,
  product?: LoanProduct,
): MarketWorld {
  const loanCount = world.loanCount + 1;
  const acceptedCustomer = {
    ...customer,
    status: "accepted" as const,
    dueDay: world.day + customer.term,
    ...(product ? { productId: product.id } : {}),
  };
  const events: MarketEvent[] = [
    {
      type: "transfer",
      from: product?.id ?? "banker",
      to: customer.id,
      amount: customer.amount,
    },
  ];
  if (product)
    events.push({ type: "product-lent", product, customer: acceptedCustomer });
  return {
    ...world,
    cash: world.cash - customer.amount,
    customers: world.customers.map((item) =>
      item.id === customer.id ? acceptedCustomer : item,
    ),
    loanCount,
    cumulativeLent: world.cumulativeLent + customer.amount,
    thirdLoanDay: loanCount === 3 ? world.day : world.thirdLoanDay,
    events: product ? [...world.events, ...events] : events,
  };
}

function customerMatchesLoanProduct(
  customer: Customer,
  product: LoanProduct,
): boolean {
  const { rules } = product;
  const occupationMatches =
    rules.occupation === "any" || customer.occupation === rules.occupation;
  return (
    customer.status === "waiting" &&
    customer.income >= rules.minimumIncome &&
    occupationMatches &&
    customer.amount >= rules.minimumAmount &&
    customer.amount <= rules.maximumAmount &&
    customer.term >= rules.minimumTerm &&
    customer.term <= rules.maximumTerm
  );
}

/**
 * Processes automated loan approvals based on active loan products.
 *
 * Performance Optimization:
 * Instead of creating intermediate World objects on every loan approval,
 * this function accumulates state updates using local mutable variables
 * and constructs a single new World object at the end.
 */
function automateLoans(world: MarketWorld): MarketWorld {
  // Track state changes in local variables to avoid creating multiple intermediate World objects
  let currentCash = world.cash;
  let loanCount = world.loanCount;
  let cumulativeLent = world.cumulativeLent;
  let thirdLoanDay = world.thirdLoanDay;

  // Create a single shallow copy of the customers array to mutate safely
  const nextCustomers = [...world.customers];
  const newEvents: MarketEvent[] = [];

  for (const product of world.products) {
    if (product.kind !== "loan") continue;

    // Daily capacity limits how many customers this product can sign per day
    const capacity = loanAutomationCapacity(world.trust);
    let signed = 0;

    for (let i = 0; i < nextCustomers.length; i++) {
      if (signed >= capacity) break;

      const customer = nextCustomers[i]!;
      if (!customerMatchesLoanProduct(customer, product)) continue;
      if (currentCash < customer.amount) continue;

      // Update counters and cash
      loanCount += 1;
      currentCash -= customer.amount;
      cumulativeLent += customer.amount;
      if (loanCount === 3 && thirdLoanDay === null) {
        thirdLoanDay = world.day;
      }

      // Update individual customer state
      const acceptedCustomer: Customer = {
        ...customer,
        status: "accepted",
        dueDay: world.day + customer.term,
        productId: product.id,
      };

      nextCustomers[i] = acceptedCustomer;
      signed += 1;

      // Push events directly to the local array
      newEvents.push(
        {
          type: "transfer",
          from: product.id,
          to: customer.id,
          amount: customer.amount,
        },
        {
          type: "product-lent",
          product,
          customer: acceptedCustomer,
        },
      );
    }
  }

  // Referential Integrity: If no loans were issued, return the original world reference unchanged.
  // This helps prevent unnecessary React re-renders.
  if (newEvents.length === 0) {
    return world;
  }

  // Construct and return the updated World object once at the end
  return {
    ...world,
    cash: currentCash,
    customers: nextCustomers,
    loanCount,
    cumulativeLent,
    thirdLoanDay,
    events: [...world.events, ...newEvents],
  };
}

function createProduct(world: MarketWorld, product: LoanProduct): MarketWorld {
  if (
    world.products.some((item) => item.id === product.id) ||
    world.cash < world.config.productCreationCost
  )
    return { ...world, events: [] };
  return automateLoans({
    ...world,
    cash: world.cash - world.config.productCreationCost,
    products: [...world.products, product],
    events: [{ type: "product-created", product }],
  });
}

function productForCustomer(
  products: Product[],
  customer: Customer,
): LoanProduct | undefined {
  if (!customer.productId) return undefined;
  const product = products.find((item) => item.id === customer.productId);
  return product?.kind === "loan" ? product : undefined;
}

function borrow(world: MarketWorld, lenderId: string): MarketWorld {
  const lender = world.funding.find((item) => item.id === lenderId);
  if (!lender || lender.accepted || !summarize(world).fundingEligible)
    return { ...world, events: [] };
  const accepted = {
    ...lender,
    accepted: true,
    dueDay: world.day + lender.dueDay,
  };
  return {
    ...world,
    cash: world.cash + lender.amount,
    funding: world.funding.map((item) =>
      item.id === lenderId ? accepted : item,
    ),
    events: [
      {
        type: "transfer",
        from: lender.id,
        to: "banker",
        amount: lender.amount,
      },
      { type: "borrowed", lender: accepted },
    ],
  };
}
