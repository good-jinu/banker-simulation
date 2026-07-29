import type { LocalText } from "../i18n/local-text.ts";
import type { MarketLocationRef } from "./map/market-map.ts";
import {
  allocateMarketLot,
  occupiedMarketLocations,
} from "./map/market-map-lots.ts";
import type { MarketSegment } from "./market-segment.ts";
import {
  marketStageByLevel,
  marketStageById,
  type MarketStageConfig,
} from "./market-campaign.ts";
import {
  approachTrust,
  assessTrust,
  decayReputation,
  openingReputation,
  recordActivity,
  openingTrust,
  rateFairness,
  trustReasonFor,
  TRUST_COLLAPSE,
  type Reputation,
  type TrustAssessment,
  type TrustContext,
  type TrustReason,
} from "./market-trust.ts";
import {
  publishMarketNews,
  riskAdjustmentForDistrict,
  riskAdjustmentForSegment,
  type MarketNews,
} from "./market-news.ts";
import {
  isRoundTransition,
  roundForDay,
  scaledRoundAmount,
  scaledRoundTerm,
  weightedRoundChoice,
  type MarketRound,
} from "./market-rounds.ts";
import {
  addMarketDefaultStress,
  decayMarketStress,
  emptyMarketStress,
  marketRiskPressure,
  type MarketStressState,
} from "./market-stress.ts";
import { defaultRisk, guaranteedDefaultRisk } from "./market-credit.ts";
import type {
  DepositProduct,
  LoanProduct,
  LoanProductModule,
  OccupationRule,
  Product,
} from "./market-product-types.ts";
import {
  automateProducts,
  createProduct,
  productForCustomer,
  setProductActive,
  setProductModule,
} from "./market-products.ts";
import { advanceOnboarding, type OnboardingStep } from "./market-onboarding.ts";

export type { OnboardingStep } from "./market-onboarding.ts";
export type { MarketSegment } from "./market-segment.ts";
export type {
  DepositProduct,
  LoanProduct,
  LoanProductModule,
  LoanProductRules,
  OccupationRule,
  Product,
  ProductKind,
} from "./market-product-types.ts";
export { defaultRisk } from "./market-credit.ts";

/**
 * Pure simulation core for the open-market level. The world is plain data,
 * every rule is a pure function of (world, action), and randomness flows
 * through the seed stored in the world itself — so the reducer is
 * deterministic, replayable, and safe under React StrictMode's double
 * invocation. React components render the world; they never advance it.
 */

export type CustomerStatus = "waiting" | "accepted";
export type DepositStatus = "waiting" | "accepted" | "withdrawn";
/** A stage id string. Not a closed union — new stages don't need a type edit. */
export type MarketLevel = string;
/** Groups that the market can describe without exposing a credit-score formula. */
export type CustomerExpression =
  "neutral" | "requesting" | "evaluating" | "worried" | "relieved" | "rejected";
export type FailureReason = "cash" | "trust" | null;
/**
 * A short, action-driven introduction for the first stage. Later stages start
 * with the complete bank because the player has already learned these verbs.
 */
export type CustomerEvidence = {
  purpose: LocalText;
  employment: LocalText;
  debt: LocalText;
  collateral: LocalText;
};

export type Customer = MarketLocationRef & {
  id: string;
  name: LocalText;
  job: LocalText;
  occupation?: Exclude<OccupationRule, "any"> | "unemployed";
  segment?: MarketSegment;
  income: number;
  amount: number;
  rate: number;
  term: number;
  dueDay: number;
  appears: number;
  /**
   * The day this applicant stops waiting and takes their request elsewhere.
   * Absent on scripted customers, who wait as long as the story needs them to.
   */
  expires?: number;
  avatar: string;
  avatarStates?: Partial<Record<CustomerExpression, string>>;
  evidence: CustomerEvidence;
  status: CustomerStatus;
  /** Set only when the loan was issued by an automated product. */
  productId?: string;
  /** A credit-bureau signal captured when an automated line checks it. */
  creditScore?: number;
  /** A qualifying guarantor was attached when this contract originated. */
  guaranteed?: boolean;
  /** Customers with a guarantor can qualify for the guarantor-backed line. */
  guarantor?: LocalText;
};

/** A depositor is a first-class market participant, not free cash. */
export type Depositor = MarketLocationRef & {
  id: string;
  name: LocalText;
  job: LocalText;
  amount: number;
  /** Annual interest paid when funds are withdrawn. */
  rate: number;
  /** Principal the bank currently owes this customer. */
  balance: number;
  appears: number;
  avatar: string;
  status: DepositStatus;
  /** Deposits can enter the bank only through an active deposit product. */
  productId?: string;
};

export type WithdrawalEvent = {
  warningDay: number;
  withdrawalDay: number;
  withdrawalShare: number;
  status: "scheduled" | "warned" | "settled";
};

export type Funding = MarketLocationRef & {
  id: string;
  name: LocalText;
  amount: number;
  rate: number;
  dueDay: number;
  accepted: boolean;
  defaulted: boolean;
};

export type { TrustReason } from "./market-trust.ts";

/** Permanent run totals. Unlike reputation, these never decay and are safe to report. */
export type MarketRunStats = {
  repaid: number;
  defaulted: number;
  automatedIssued: number;
  automatedRepaid: number;
  automatedDefaulted: number;
  interestEarned: number;
  fundingBorrowed: number;
  fundingRepaid: number;
  fundingMissed: number;
  depositsAccepted: number;
  depositPrincipalWithdrawn: number;
  depositInterestPaid: number;
};

export function emptyMarketRunStats(): MarketRunStats {
  return {
    repaid: 0,
    defaulted: 0,
    automatedIssued: 0,
    automatedRepaid: 0,
    automatedDefaulted: 0,
    interestEarned: 0,
    fundingBorrowed: 0,
    fundingRepaid: 0,
    fundingMissed: 0,
    depositsAccepted: 0,
    depositPrincipalWithdrawn: 0,
    depositInterestPaid: 0,
  };
}

export type MarketEvent =
  | { type: "repayment"; amount: number }
  | {
      type: "customer-repayment";
      customer: Customer;
      amount: number;
    }
  | {
      type: "default";
      customer: Customer;
      risk: number;
    }
  | { type: "loan-request"; customer: Customer }
  | { type: "applicant-left"; customer: Customer }
  | { type: "deposit-accepted"; depositor: Depositor }
  | { type: "deposit-withdrawal"; amount: number }
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
    }
  | {
      type: "funding-default";
      lender: Funding;
      amount: number;
    }
  | { type: "funding-settlement"; lender: Funding; amount: number }
  | { type: "funding-unlocked" }
  | { type: "market-news"; news: MarketNews }
  | { type: "trust-shift"; direction: "up" | "down"; reason: TrustReason }
  | { type: "run-failed" }
  | { type: "mission-clear" };

export type MarketWorld = {
  level: MarketLevel;
  config: MarketStageConfig;
  seed: number;
  day: number;
  onboarding: OnboardingStep;
  cash: number;
  customers: Customer[];
  depositors: Depositor[];
  products: Product[];
  funding: Funding[];
  loanCount: number;
  cumulativeLent: number;
  /** Permanent loan originations by district, used to visualize local growth. */
  districtSales: Record<string, number>;
  thirdLoanDay: number | null;
  missionCleared: boolean;
  /** The run is over and lost — out of cash, out of trust, or out of days. */
  runFailed: boolean;
  failureReason: FailureReason;
  /** The displayed score. Never added to directly — it walks toward the
   * composite computed from `reputation` once per day. */
  trust: number;
  /** Decayed evidence the composite is recomputed from. */
  reputation: Reputation;
  fundingAnnounced: boolean;
  withdrawalEvent: WithdrawalEvent | null;
  /** Published market reporting, retained so a run can be reviewed after it ends. */
  news: MarketNews[];
  /** Decaying pressure caused by defaults in related regions and industries. */
  stress: MarketStressState;
  /** Monotonic suffix for multiple deterministic arrivals on the same day. */
  generationSequence: number;
  /** Non-decaying end-of-run accounting. */
  stats: MarketRunStats;
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
  | { type: "create-product"; product: LoanProduct | DepositProduct }
  | { type: "set-product-active"; productId: string; active: boolean }
  | {
      type: "set-product-module";
      productId: string;
      module: LoanProductModule;
      enabled: boolean;
    }
  | { type: "read-market-news" };

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

export function withdrawalEventFor(
  seed: number,
  config: MarketStageConfig,
): WithdrawalEvent | null {
  const pressure = config.withdrawalPressure;
  if (!pressure) return null;
  const withdrawalDay =
    pressure.earliestDay + ((seed >>> 8) % Math.max(1, pressure.dayRange));
  return {
    warningDay: Math.max(1, withdrawalDay - pressure.warningDays),
    withdrawalDay,
    withdrawalShare: pressure.withdrawalShare,
    status: "scheduled",
  };
}

export function createWorld(
  seed = 1,
  stageOrLevel: MarketStageConfig | MarketLevel = "first-yield",
): MarketWorld {
  const config =
    typeof stageOrLevel === "string"
      ? marketStageById(stageOrLevel).config
      : stageOrLevel;
  const withdrawalEvent = withdrawalEventFor(seed, config);
  return {
    level: config.level,
    config,
    seed: seed >>> 0,
    day: 0,
    onboarding: config.onboarding === "guided" ? "first-customer" : "full",
    cash: config.startingCash,
    customers: config.customerSeeds.map((customer) => ({ ...customer })),
    depositors: config.depositSeeds.map((depositor) => ({ ...depositor })),
    products: [],
    funding: config.fundingSeeds.map((lender) => ({ ...lender })),
    loanCount: 0,
    cumulativeLent: 0,
    districtSales: Object.fromEntries(
      config.map.districts.map((district) => [district.id, 0]),
    ),
    thirdLoanDay: null,
    missionCleared: false,
    runFailed: false,
    failureReason: null,
    // An unknown bank opens at the same standing its empty record implies:
    // no reach, no earnings, and a neutral prior on reliability.
    trust: openingTrust(config.startingCash),
    reputation: openingReputation(),
    fundingAnnounced: false,
    withdrawalEvent,
    news: [],
    stress: emptyMarketStress(),
    generationSequence: 0,
    stats: emptyMarketRunStats(),
    events: [],
  };
}

export function goalsFor(world: MarketWorld) {
  return world.config.goals;
}

/** The world-derived half of the trust inputs. Net assets, not gross, so
 * borrowed cash cannot inflate the score. */
export function trustContext(world: MarketWorld): TrustContext {
  const { netWorth } = summarize(world);
  return {
    netWorth,
    startingCash: world.config.startingCash,
    hasUnpaidObligation: world.funding.some(
      (lender) => lender.accepted && lender.defaulted,
    ),
  };
}

export function assessWorldTrust(world: MarketWorld): TrustAssessment {
  return assessTrust(world.reputation, trustContext(world));
}

export function correlatedRiskPressure(
  world: MarketWorld,
  customer: Pick<Customer, "districtId" | "segment">,
): number {
  return (
    riskAdjustmentForSegment(world.news, customer.segment) +
    riskAdjustmentForDistrict(world.news, customer.districtId) +
    marketRiskPressure(world.stress, customer, world.config.stressRules)
  );
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
  const depositLiabilities = world.depositors
    .filter((depositor) => depositor.status === "accepted")
    .reduce((total, depositor) => total + depositor.balance, 0);
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
    depositLiabilities,
    totalAssets,
    netWorth: totalAssets - fundingLiabilities - depositLiabilities,
    hasFunding,
    trustBand,
    fundingEligible:
      world.thirdLoanDay !== null &&
      world.day >= world.thirdLoanDay + world.config.fundingUnlockDelayDays &&
      !hasFunding &&
      // Lenders deal with a bank that has not gone backwards. Expressed
      // against the opening standing rather than a fixed 30, so the gate keeps
      // its meaning if the composite is ever retuned.
      world.trust >= openingTrust(world.config.startingCash),
  };
}

export type MarketSummary = ReturnType<typeof summarize>;

/** The nearest scheduled cash movement, expressed as contractual gross amounts. */
export type UpcomingRepayment = {
  dueDay: number;
  incomingAmount: number;
  outgoingAmount: number;
};

/**
 * Finds the next scheduled customer and funding repayments. Defaulted funding
 * is deliberately excluded: it is overdue debt, not a future due-date event.
 */
export function upcomingRepayment(
  world: MarketWorld,
): UpcomingRepayment | null {
  const customerRepayments = world.customers
    .filter(
      (customer) =>
        customer.status === "accepted" && customer.dueDay >= world.day,
    )
    .map((customer) => ({
      dueDay: customer.dueDay,
      incomingAmount: customer.amount * (1 + customer.rate / 100),
      outgoingAmount: 0,
    }));
  const fundingRepayments = world.config.fundingRepaymentsEnabled
    ? world.funding
        .filter(
          (lender) =>
            lender.accepted && !lender.defaulted && lender.dueDay >= world.day,
        )
        .map((lender) => ({
          dueDay: lender.dueDay,
          incomingAmount: 0,
          outgoingAmount: lender.amount * (1 + lender.rate / 100),
        }))
    : [];
  const pendingWithdrawalAmount =
    world.withdrawalEvent === null
      ? 0
      : withdrawalAmount(
          world.depositors,
          world.withdrawalEvent.withdrawalShare,
        );
  const withdrawal =
    world.withdrawalEvent &&
    world.withdrawalEvent.status === "warned" &&
    world.withdrawalEvent.withdrawalDay >= world.day &&
    pendingWithdrawalAmount > 0
      ? [
          {
            dueDay: world.withdrawalEvent.withdrawalDay,
            incomingAmount: 0,
            outgoingAmount: pendingWithdrawalAmount,
          },
        ]
      : [];
  const repayments = [
    ...customerRepayments,
    ...fundingRepayments,
    ...withdrawal,
  ];
  const dueDay = repayments.reduce<number | null>(
    (nearest, repayment) =>
      nearest === null ? repayment.dueDay : Math.min(nearest, repayment.dueDay),
    null,
  );
  if (dueDay === null) return null;

  return repayments
    .filter((repayment) => repayment.dueDay === dueDay)
    .reduce<UpcomingRepayment>(
      (notice, repayment) => ({
        ...notice,
        incomingAmount: notice.incomingAmount + repayment.incomingAmount,
        outgoingAmount: notice.outgoingAmount + repayment.outgoingAmount,
      }),
      { dueDay, incomingAmount: 0, outgoingAmount: 0 },
    );
}

export function marketReducer(
  world: MarketWorld,
  action: MarketAction,
): MarketWorld {
  if (action.type === "restore") return { ...action.world, events: [] };
  if (action.type === "read-market-news") {
    return {
      ...world,
      news: world.news.map((article) => ({ ...article, read: true })),
      events: [],
    };
  }
  if (world.runFailed || world.missionCleared) return { ...world, events: [] };
  switch (action.type) {
    case "advance-day":
      return withDerivedEvents(advanceDay(world));
    case "begin":
      return withDerivedEvents(begin(world));
    case "approve":
      return withDerivedEvents(
        advanceOnboardingAfterCustomerDecision(
          world,
          approve(world, action.customerId),
          action.customerId,
        ),
      );
    case "reject":
      return withDerivedEvents(
        advanceOnboardingAfterCustomerDecision(
          world,
          {
            ...world,
            customers: world.customers.filter(
              (customer) => customer.id !== action.customerId,
            ),
            events: [],
          },
          action.customerId,
        ),
      );
    case "borrow":
      return withDerivedEvents(borrow(world, action.lenderId));
    case "create-product":
      return withDerivedEvents(
        advanceOnboardingAfterProduct(
          world,
          createProduct(world, action.product),
        ),
      );
    case "set-product-active":
      return withDerivedEvents(
        setProductActive(world, action.productId, action.active),
      );
    case "set-product-module":
      return withDerivedEvents(
        setProductModule(
          world,
          action.productId,
          action.module,
          action.enabled,
        ),
      );
  }
}

/** Latch one-shot milestones (full trust, funding unlock) after any action. */
function withDerivedEvents(world: MarketWorld): MarketWorld {
  const summary = summarize(world);
  const goals = goalsFor(world);
  let { missionCleared, fundingAnnounced, events } = world;
  if (!world.runFailed && !missionCleared && world.trust >= goals.trustTarget) {
    missionCleared = true;
    events = [...events, { type: "mission-clear" }];
  }
  if (!world.runFailed && !fundingAnnounced && summary.fundingEligible) {
    fundingAnnounced = true;
    events = [...events, { type: "funding-unlocked" }];
  }
  return { ...world, missionCleared, fundingAnnounced, events };
}

function advanceOnboardingAfterCustomerDecision(
  previous: MarketWorld,
  next: MarketWorld,
  customerId: string,
): MarketWorld {
  if (
    previous.onboarding === "first-customer" &&
    customerId === previous.config.introCustomerId &&
    next.customers.some(
      (customer) =>
        customer.id === customerId && customer.status === "accepted",
    )
  ) {
    return {
      ...next,
      onboarding: advanceOnboarding(previous.onboarding, "intro-loan-approved"),
    };
  }
  if (
    previous.onboarding === "second-decision" &&
    customerId !== previous.config.introCustomerId
  ) {
    return {
      ...next,
      onboarding: advanceOnboarding(
        previous.onboarding,
        "second-decision-made",
      ),
    };
  }
  return next;
}

function advanceOnboardingAfterProduct(
  previous: MarketWorld,
  next: MarketWorld,
): MarketWorld {
  if (next.products.length <= previous.products.length) return next;
  const created = next.products.find(
    (product) =>
      !previous.products.some(
        (previousProduct) => previousProduct.id === product.id,
      ),
  );
  if (previous.onboarding === "deposits" && created?.kind === "deposit") {
    return {
      ...next,
      onboarding: advanceOnboarding(
        previous.onboarding,
        "deposit-product-created",
      ),
    };
  }
  if (previous.onboarding === "products" && created?.kind === "loan") {
    return {
      ...next,
      onboarding: advanceOnboarding(
        previous.onboarding,
        "loan-product-created",
      ),
    };
  }
  return next;
}

function advanceDay(world: MarketWorld): MarketWorld {
  const day = world.day + 1;
  const marketReport = publishMarketNews(
    world.news,
    world.config.newsSchedule,
    day,
  );
  let news = marketReport.news;
  const events: MarketEvent[] = marketReport.published.map((news) => ({
    type: "market-news",
    news,
  }));
  const round = roundForDay(world.config.rounds, day);
  if (isRoundTransition(world.config.rounds, world.day, day)) {
    const roundNews: MarketNews = {
      id: `round-${round.id}-${day}`,
      threadId: `round-${round.id}`,
      day,
      publishedDay: day,
      phase: "signal",
      severity: round.briefing.severity,
      title: round.briefing.title,
      body: round.briefing.body,
      action: round.briefing.action,
      affectedSegments: Object.keys(round.segmentDemand) as MarketSegment[],
      affectedDistrictIds: Object.keys(round.districtDemand),
      riskAdjustment: 0,
      read: false,
    };
    news = [...news, roundNews];
    events.push({ type: "market-news", news: roundNews });
  }
  let repayment = 0;
  const repaidCustomers: Customer[] = [];
  const stats = { ...world.stats };
  let withdrawalEvent = world.withdrawalEvent;
  let depositors = world.depositors;
  let onboarding = world.onboarding;
  let stress = decayMarketStress(world.stress, day, world.config.stressRules);
  let generationSequence = world.generationSequence;
  // The warning arms on the first day the bank actually holds savings, on or
  // after its scheduled day, and fixes the withdrawal to the notice period from
  // that moment. Savers arrive on the deposit product's own schedule, so a
  // fixed date would either give a late-joining saver no notice at all, or —
  // if the date simply passed with an empty deposit book — let a player skip
  // the stage's only liquidity test by launching savings a few days later.
  if (
    withdrawalEvent?.status === "scheduled" &&
    day >= withdrawalEvent.warningDay &&
    depositors.some((depositor) => depositor.status === "accepted")
  ) {
    const pressure = world.config.withdrawalPressure;
    if (pressure) {
      const withdrawalDay = day + Math.max(1, pressure.warningDays);
      const withdrawalNews: MarketNews = {
        id: `withdrawal-warning-${withdrawalDay}`,
        threadId: "deposit-withdrawal",
        day,
        publishedDay: day,
        phase: "warning",
        severity: "alert",
        title: pressure.title,
        body: pressure.body,
        action: pressure.action,
        affectedSegments: [],
        riskAdjustment: 0,
        read: false,
      };
      news = [...news, withdrawalNews];
      events.push({ type: "market-news", news: withdrawalNews });
      withdrawalEvent = { ...withdrawalEvent, withdrawalDay, status: "warned" };
    }
  }
  // A day of forgetting happens before the day's events are recorded, so
  // today's outcomes are weighed at full value against a fading history.
  const reputation = decayReputation(world.reputation);
  // The market cannot lose interest in a bank that has not opened for general
  // business yet. The guided lesson is scripted rather than traded — its long
  // wait for the first repayment is not the player standing still.
  if (world.onboarding !== "full")
    reputation.activity = world.reputation.activity;
  let seed = world.seed;
  const dueOutcomes = new Map<string, { defaulted: boolean; risk: number }>();
  for (const customer of world.customers
    .filter(
      (candidate) =>
        candidate.status === "accepted" && candidate.dueDay === day,
    )
    .sort((first, second) => first.id.localeCompare(second.id))) {
    const marketAdjustment =
      riskAdjustmentForSegment(news, customer.segment) +
      riskAdjustmentForDistrict(news, customer.districtId) +
      marketRiskPressure(stress, customer, world.config.stressRules);
    const baseRisk =
      customer.id === world.config.introCustomerId &&
      world.onboarding === "first-repayment" &&
      world.config.introCustomerGuaranteedRepayment
        ? 0
        : defaultRisk(customer, marketAdjustment);
    const risk = customer.guaranteed
      ? guaranteedDefaultRisk(baseRisk)
      : baseRisk;
    let roll = 100;
    if (world.config.randomizeDefaultRisk) {
      let random: number;
      [random, seed] = nextRandom(seed);
      roll = random * 100;
    }
    dueOutcomes.set(customer.id, { defaulted: roll < risk, risk });
  }
  const defaultedCustomers: Customer[] = [];
  let customers = world.customers.filter((customer) => {
    // An applicant nobody funded eventually goes elsewhere. Held back until the
    // full market opens so a tutorial customer can never walk out mid-lesson.
    if (
      customer.status === "waiting" &&
      world.onboarding === "full" &&
      customer.expires !== undefined &&
      day >= customer.expires
    ) {
      events.push({ type: "applicant-left", customer });
      return false;
    }
    if (customer.status === "accepted" && customer.dueDay === day) {
      const outcome = dueOutcomes.get(customer.id);
      if (outcome?.defaulted) {
        // Severity, not a flat penalty: the write-off hits realized profit and
        // open losses in proportion to the principal actually lost.
        reputation.defaulted += 1;
        reputation.activity += 1;
        reputation.openLoss += customer.amount;
        reputation.realizedProfit -= customer.amount;
        if (customer.productId) reputation.productDefaulted += 1;
        stats.defaulted += 1;
        if (customer.productId) stats.automatedDefaulted += 1;
        events.push({ type: "default", customer, risk: outcome.risk });
        defaultedCustomers.push(customer);
      } else {
        const amount = customer.amount * (1 + customer.rate / 100);
        repayment += amount;
        repaidCustomers.push(customer);
      }
      return false;
    }
    return true;
  });
  // Today's due contracts all used the same opening snapshot. Their contagion
  // becomes visible only after every outcome for the day has been fixed.
  for (const customer of defaultedCustomers) {
    stress = addMarketDefaultStress(
      stress,
      day,
      customer,
      world.config.stressRules,
    );
  }
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
      // A customer counts as served only here, at repayment — never at
      // approval — and the loan's size buys no extra credit.
      reputation.repaid += 1;
      reputation.activity += 1;
      reputation.realizedProfit += customer.amount * (customer.rate / 100);
      reputation.fairness += rateFairness(customer.rate);
      if (customer.productId) reputation.productRepaid += 1;
      stats.repaid += 1;
      stats.interestEarned += customer.amount * (customer.rate / 100);
      if (customer.productId) stats.automatedRepaid += 1;
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
  if (
    onboarding === "first-repayment" &&
    repaidCustomers.some(
      (customer) => customer.id === world.config.introCustomerId,
    )
  ) {
    onboarding = advanceOnboarding(onboarding, "intro-loan-repaid");
    let secondCustomer: Customer | null;
    [secondCustomer, seed] = generateApplicant(
      day,
      generationSequence,
      customers,
      depositors,
      seed,
      world.config,
      round,
    );
    if (secondCustomer) {
      generationSequence += 1;
      customers.push(secondCustomer);
      events.push({ type: "loan-request", customer: secondCustomer });
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
      reputation.fundingHonored += 1;
      reputation.realizedProfit -= lender.amount * (lender.rate / 100);
      stats.fundingRepaid += 1;
      events.push({
        type: "funding-repayment",
        lender,
        amount,
      });
      return false;
    }

    // The bank breaking its own promise is the strongest negative signal it
    // can send: it hits the funding record and caps trust outright.
    reputation.fundingMissed += 1;
    stats.fundingMissed += 1;
    events.push({
      type: "funding-default",
      lender,
      amount,
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
  // Only a warned event settles: an unarmed one is still waiting for savers.
  if (
    withdrawalEvent?.status === "warned" &&
    withdrawalEvent.withdrawalDay === day
  ) {
    const payout = withdrawalAmount(
      depositors,
      withdrawalEvent.withdrawalShare,
    );
    const principal = depositors
      .filter((depositor) => depositor.status === "accepted")
      .reduce(
        (total, depositor) =>
          total + depositor.balance * withdrawalEvent!.withdrawalShare,
        0,
      );
    const interest = payout - principal;
    if (payout > 0) {
      cash -= payout;
      depositors = depositors.map((depositor) => {
        if (depositor.status !== "accepted") return depositor;
        const balance =
          depositor.balance * (1 - withdrawalEvent!.withdrawalShare);
        return {
          ...depositor,
          balance,
          status: balance < 1 ? "withdrawn" : "accepted",
        };
      });
      reputation.realizedProfit -= interest;
      stats.depositPrincipalWithdrawn += principal;
      stats.depositInterestPaid += interest;
      events.push({ type: "deposit-withdrawal", amount: payout });
    }
    withdrawalEvent = { ...withdrawalEvent, status: "settled" };
  }
  // Net assets, computed the same way summarize() does. Automated lending runs
  // after this point but only swaps cash for receivables, so it cannot move
  // net worth — and therefore cannot move trust on the day it fires.
  const receivables = customers
    .filter((customer) => customer.status === "accepted")
    .reduce((total, customer) => total + customer.amount, 0);
  const liabilities = normalizedFunding
    .filter((lender) => lender.accepted)
    .reduce((total, lender) => total + lender.amount, 0);
  const depositLiabilities = depositors
    .filter((depositor) => depositor.status === "accepted")
    .reduce((total, depositor) => total + depositor.balance, 0);
  const assessment = assessTrust(reputation, {
    netWorth: cash + receivables - liabilities - depositLiabilities,
    startingCash: world.config.startingCash,
    hasUnpaidObligation: normalizedFunding.some(
      (lender) => lender.accepted && lender.defaulted,
    ),
  });
  const trust = approachTrust(world.trust, assessment.target);
  if (Math.abs(trust - world.trust) >= 0.5) {
    const direction = trust > world.trust ? "up" : "down";
    events.push({
      type: "trust-shift",
      direction,
      reason: trustReasonFor(assessment, direction, {
        fundingDefault: events.some(
          (event) => event.type === "funding-default",
        ),
        customerDefault: events.some((event) => event.type === "default"),
        repaid: events.some((event) => event.type === "customer-repayment"),
      }),
    });
  }

  const runFailed = cash < 0 || trust <= TRUST_COLLAPSE;
  const failureReason: FailureReason =
    trust <= TRUST_COLLAPSE ? "trust" : cash < 0 ? "cash" : null;
  if (runFailed) events.push({ type: "run-failed" });
  if (onboarding === "full" && day % round.spawnEveryDays === 0) {
    const capacity = Math.max(
      0,
      world.config.maxVisibleCustomers - customers.length,
    );
    const applicantCount = Math.min(round.applicantsPerSpawn, capacity);
    for (let index = 0; index < applicantCount; index += 1) {
      let customer: Customer | null;
      [customer, seed] = generateApplicant(
        day,
        generationSequence,
        customers,
        depositors,
        seed,
        world.config,
        round,
      );
      if (!customer) break;
      generationSequence += 1;
      customers.push(customer);
      events.push({ type: "loan-request", customer });
    }
  }
  if (
    onboarding === "full" &&
    world.products.some(
      (product) => product.kind === "deposit" && product.active,
    ) &&
    day % world.config.depositSpawnEveryDays === 0 &&
    depositors.filter((depositor) => depositor.status !== "withdrawn").length <
      world.config.maxVisibleDepositors
  ) {
    let depositor: Depositor | null;
    [depositor, seed] = generateDepositor(
      day,
      generationSequence,
      customers,
      depositors,
      seed,
      world.config,
      round,
    );
    if (depositor) {
      generationSequence += 1;
      depositors = [...depositors, depositor];
    }
  }
  const automated = automateProducts({
    ...world,
    day,
    onboarding,
    cash,
    customers,
    depositors,
    funding: normalizedFunding,
    seed,
    runFailed,
    failureReason,
    trust,
    reputation,
    news,
    stress,
    generationSequence,
    stats,
    withdrawalEvent,
    events,
  });
  return {
    ...automated,
  };
}

function withdrawalAmount(
  depositors: readonly Depositor[],
  withdrawalShare: number,
): number {
  return depositors
    .filter((depositor) => depositor.status === "accepted")
    .reduce(
      (total, depositor) =>
        total +
        depositor.balance * withdrawalShare * (1 + depositor.rate / 100),
      0,
    );
}

function randomCustomer(
  day: number,
  sequence: number,
  location: MarketLocationRef,
  segment: MarketSegment,
  initialSeed: number,
  config: MarketStageConfig,
  round: MarketRound,
): [Customer, number] {
  let seed = initialSeed;
  const roll = (bound: number): number => {
    let value: number;
    [value, seed] = randomInt(seed, bound);
    return value;
  };
  const generation = config.customerGeneration;
  const term = scaledRoundTerm(
    generation.termMin + roll(generation.termRange),
    round,
  );
  const jobIndexes = jobIndexesForSegment(segment);
  const jobIndex = jobIndexes[roll(jobIndexes.length)]!;
  const collateralIndex = roll(RANDOM_COLLATERAL.length);
  const guarantor =
    collateralIndex === 2
      ? { en: "Workplace guarantor", ko: "직장 보증인" }
      : undefined;
  const customer: Customer = {
    id: `customer-${day}-${sequence}`,
    name: RANDOM_NAMES[roll(RANDOM_NAMES.length)]!,
    job: RANDOM_JOBS[jobIndex]!,
    occupation: "employed",
    segment,
    income:
      generation.incomeMin +
      roll(generation.incomeRange) * generation.incomeStep,
    amount: scaledRoundAmount(
      generation.amountMin +
        roll(generation.amountRange) * generation.amountStep,
      round,
    ),
    rate: generation.rateMin + roll(generation.rateRange),
    term,
    dueDay: day + term,
    appears: day,
    expires: day + generation.patienceDays,
    ...location,
    avatar: RANDOM_AVATARS[roll(RANDOM_AVATARS.length)]!,
    evidence: {
      purpose: RANDOM_PURPOSES[roll(RANDOM_PURPOSES.length)]!,
      employment: RANDOM_EMPLOYMENT[roll(RANDOM_EMPLOYMENT.length)]!,
      debt: RANDOM_DEBT[roll(RANDOM_DEBT.length)]!,
      collateral: RANDOM_COLLATERAL[collateralIndex]!,
    },
    status: "waiting",
    ...(guarantor ? { guarantor } : {}),
  };
  return [customer, seed];
}

function randomDepositor(
  day: number,
  sequence: number,
  location: MarketLocationRef,
  initialSeed: number,
  config: MarketStageConfig,
): [Depositor, number] {
  let seed = initialSeed;
  const roll = (bound: number): number => {
    let value: number;
    [value, seed] = randomInt(seed, bound);
    return value;
  };
  const generation = config.depositGeneration;
  const depositor: Depositor = {
    id: `depositor-${day}-${sequence}`,
    name: RANDOM_NAMES[roll(RANDOM_NAMES.length)]!,
    job: RANDOM_JOBS[roll(RANDOM_JOBS.length)]!,
    amount:
      generation.amountMin +
      roll(generation.amountRange) * generation.amountStep,
    rate: generation.rateMin + roll(generation.rateRange),
    balance: 0,
    appears: day,
    ...location,
    avatar: RANDOM_AVATARS[roll(RANDOM_AVATARS.length)]!,
    status: "waiting",
  };
  return [depositor, seed];
}

function jobIndexesForSegment(segment: MarketSegment): readonly number[] {
  switch (segment) {
    case "delivery":
      return [0];
    case "technology":
      return [1, 6];
    case "small-business":
      return [1, 2, 5, 7];
    case "low-credit":
      return [0, 4, 5];
    case "workers":
      return [3, 4];
  }
}

function chooseDemandDistrict(
  config: MarketStageConfig,
  round: MarketRound,
  initialSeed: number,
): [districtId: string, nextSeed: number] {
  let random: number;
  let seed: number;
  [random, seed] = nextRandom(initialSeed);
  const weights = Object.fromEntries(
    config.map.districts.map((district) => [
      district.id,
      round.districtDemand[district.id] ?? district.demandWeight,
    ]),
  );
  return [
    weightedRoundChoice(weights, round.concentration, random) ??
      config.map.districts[0]!.id,
    seed,
  ];
}

function chooseDemandSegment(
  config: MarketStageConfig,
  round: MarketRound,
  districtId: string,
  initialSeed: number,
): [segment: MarketSegment, nextSeed: number] {
  let random: number;
  let seed: number;
  [random, seed] = nextRandom(initialSeed);
  const district = config.map.districts.find(
    (candidate) => candidate.id === districtId,
  );
  const candidates = district?.segments ?? ["workers"];
  const weights = Object.fromEntries(
    candidates.map((segment) => [segment, round.segmentDemand[segment] ?? 1]),
  );
  return [
    (weightedRoundChoice(
      weights,
      round.concentration,
      random,
    ) as MarketSegment | null) ?? candidates[0]!,
    seed,
  ];
}

function generateApplicant(
  day: number,
  sequence: number,
  customers: readonly Customer[],
  depositors: readonly Depositor[],
  initialSeed: number,
  config: MarketStageConfig,
  round: MarketRound,
): [Customer | null, number] {
  let districtId: string;
  let seed: number;
  [districtId, seed] = chooseDemandDistrict(config, round, initialSeed);
  const allocation = allocateMarketLot(config.map, seed, {
    occupiedLocationIds: occupiedMarketLocations([...customers, ...depositors]),
    preferredDistrictIds: [districtId],
  });
  seed = allocation.nextSeed;
  if (!allocation.lot) return [null, seed];
  let segment: MarketSegment;
  [segment, seed] = chooseDemandSegment(
    config,
    round,
    allocation.lot.districtId,
    seed,
  );
  return randomCustomer(
    day,
    sequence,
    {
      locationId: allocation.lot.id,
      districtId: allocation.lot.districtId,
    },
    segment,
    seed,
    config,
    round,
  );
}

function generateDepositor(
  day: number,
  sequence: number,
  customers: readonly Customer[],
  depositors: readonly Depositor[],
  initialSeed: number,
  config: MarketStageConfig,
  round: MarketRound,
): [Depositor | null, number] {
  let districtId: string;
  let seed: number;
  [districtId, seed] = chooseDemandDistrict(config, round, initialSeed);
  const allocation = allocateMarketLot(config.map, seed, {
    occupiedLocationIds: occupiedMarketLocations([...customers, ...depositors]),
    preferredDistrictIds: [districtId],
  });
  if (!allocation.lot) return [null, allocation.nextSeed];
  return randomDepositor(
    day,
    sequence,
    {
      locationId: allocation.lot.id,
      districtId: allocation.lot.districtId,
    },
    allocation.nextSeed,
    config,
  );
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
  // The scripted loan is a real loan: it goes through the same path so it books
  // the same cash, contract and business record as one the player writes.
  return advanceOnboardingAfterCustomerDecision(
    world,
    lend(world, first),
    first.id,
  );
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
    ...(product
      ? { productId: product.id, rate: product.rules.interestRate }
      : {}),
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
    // Writing the loan is business the moment it happens: standing should
    // respond to a bank that is working, not only to contracts that have
    // already run their term.
    reputation: recordActivity(world.reputation),
    loanCount,
    cumulativeLent: world.cumulativeLent + customer.amount,
    districtSales: {
      ...world.districtSales,
      [customer.districtId]:
        (world.districtSales[customer.districtId] ?? 0) + customer.amount,
    },
    thirdLoanDay: loanCount === 3 ? world.day : world.thirdLoanDay,
    events: product ? [...world.events, ...events] : events,
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
    stats: {
      ...world.stats,
      fundingBorrowed: world.stats.fundingBorrowed + lender.amount,
    },
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
