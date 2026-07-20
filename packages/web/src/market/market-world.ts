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
export type MarketLevel = "first-yield" | "credit-under-pressure";

export type Customer = {
  id: string;
  name: LocalText;
  job: LocalText;
  income: number;
  amount: number;
  rate: number;
  term: number;
  dueDay: number;
  appears: number;
  x: number;
  y: number;
  avatar: string;
  status: CustomerStatus;
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
};

export type MarketEvent =
  | { type: "repayment"; amount: number }
  | { type: "default"; customer: Customer; risk: number }
  | { type: "loan-request"; customer: Customer }
  | { type: "transfer"; from: string; to: string; amount: number }
  | { type: "borrowed"; lender: Funding }
  | { type: "funding-repayment"; lender: Funding; amount: number }
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
  funding: Funding[];
  loanCount: number;
  cumulativeLent: number;
  thirdLoanDay: number | null;
  missionCleared: boolean;
  insolvent: boolean;
  fundingAnnounced: boolean;
  /** Events produced by the most recent action only. */
  events: MarketEvent[];
};

export type MarketAction =
  | { type: "advance-day" }
  | { type: "begin" }
  | { type: "approve"; customerId: string }
  | { type: "reject"; customerId: string }
  | { type: "borrow"; lenderId: string };

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
  "/assets/avatars/jun-neutral.webp",
  "/assets/avatars/auditor-neutral.webp",
  "/assets/avatars/fund-manager-neutral.webp",
  "/assets/avatars/mina-neutral.webp",
  "/assets/avatars/regulator-neutral.webp",
  "/assets/avatars/jun-evaluating.webp",
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
    funding: config.fundingSeeds.map((lender) => ({ ...lender })),
    loanCount: 0,
    cumulativeLent: 0,
    thirdLoanDay: null,
    missionCleared: false,
    insolvent: false,
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
  const incomeToLoan = customer.income / customer.amount;
  return Math.min(55, Math.max(5, Math.round(62 - incomeToLoan * 18)));
}

export function summarize(world: MarketWorld) {
  const loanReceivables = world.customers
    .filter((customer) => customer.status === "accepted")
    .reduce(
      (total, customer) => total + customer.amount * (1 + customer.rate / 100),
      0,
    );
  const fundingLiabilities = world.funding
    .filter((lender) => lender.accepted)
    .reduce(
      (total, lender) => total + lender.amount * (1 + lender.rate / 100),
      0,
    );
  const totalAssets = world.cash + loanReceivables;
  const hasFunding = world.funding.some((lender) => lender.accepted);
  return {
    loanReceivables,
    fundingLiabilities,
    totalAssets,
    netWorth: totalAssets - fundingLiabilities,
    netCash: world.cash - fundingLiabilities,
    hasFunding,
    fundingEligible:
      world.thirdLoanDay !== null &&
      world.day >= world.thirdLoanDay + world.config.fundingUnlockDelayDays &&
      !hasFunding,
  };
}

export type MarketSummary = ReturnType<typeof summarize>;

export function marketReducer(
  world: MarketWorld,
  action: MarketAction,
): MarketWorld {
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
    summary.netCash >= goals.netCash &&
    (goals.survivalDay === null || world.day >= goals.survivalDay)
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
  let seed = world.seed;
  const customers = world.customers.filter((customer) => {
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
        repayment += customer.amount * (1 + customer.rate / 100);
      }
      return false;
    }
    return true;
  });
  let cash = world.cash;
  if (repayment > 0) {
    cash += repayment;
    events.push({ type: "repayment", amount: repayment });
  }
  const funding = world.funding.filter((lender) => {
    if (!world.config.fundingRepaymentsEnabled) return true;
    if (lender.accepted && lender.dueDay === day) {
      const amount = lender.amount * (1 + lender.rate / 100);
      cash -= amount;
      events.push({ type: "funding-repayment", lender, amount });
      return false;
    }
    return true;
  });
  const insolvent = cash < 0;
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
  return { ...world, day, cash, customers, funding, seed, insolvent, events };
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
  const loanCount = world.loanCount + 1;
  return {
    ...world,
    cash: world.cash - customer.amount,
    customers: world.customers.map((item) =>
      item.id === customerId
        ? { ...item, status: "accepted", dueDay: world.day + item.term }
        : item,
    ),
    loanCount,
    cumulativeLent: world.cumulativeLent + customer.amount,
    thirdLoanDay: loanCount === 3 ? world.day : world.thirdLoanDay,
    events: [
      {
        type: "transfer",
        from: "banker",
        to: customer.id,
        amount: customer.amount,
      },
    ],
  };
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
