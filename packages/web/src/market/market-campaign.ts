import type { LocalText } from "../i18n/local-text.ts";
import {
  METRO_REGION_MAP,
  NORTH_YARD_MAP,
  RIVERSIDE_MAP,
} from "./map/market-map-data.ts";
import type { MarketMapDefinition } from "./map/market-map.ts";
import type { MarketRound } from "./market-rounds.ts";
import type { MarketStressRules } from "./market-stress.ts";
import type {
  Customer,
  Depositor,
  Funding,
  MarketLevel,
} from "./market-world.ts";
import type { MarketNewsDefinition } from "./market-news.ts";

export type MarketGoals = {
  /**
   * Full trust wins the stage; zero loses it. Nothing else ends a run, and the
   * pressure to keep moving comes from the score itself — standing decays with
   * the bank's transaction volume, so a player who stops trading runs it down
   * to zero on their own.
   */
  trustTarget: number;
};

export type CustomerGenerationConfig = {
  termMin: number;
  termRange: number;
  /**
   * Days a generated applicant waits before taking their business elsewhere.
   * The visible-customer cap is a queue, not a warehouse: without an exit the
   * cap fills with requests nobody will fund and new arrivals stop forever.
   */
  patienceDays: number;
  incomeMin: number;
  incomeStep: number;
  incomeRange: number;
  amountMin: number;
  amountStep: number;
  amountRange: number;
  rateMin: number;
  rateRange: number;
};

export type DepositGenerationConfig = {
  amountMin: number;
  amountStep: number;
  amountRange: number;
  rateMin: number;
  rateRange: number;
};

/** A shared liquidity shock. Campaigns decide when it appears, never how deposits work. */
export type WithdrawalPressureConfig = {
  earliestDay: number;
  dayRange: number;
  warningDays: number;
  withdrawalShare: number;
  title: LocalText;
  body: LocalText;
  action: LocalText;
};

/**
 * Narrative copy that varies per stage but isn't a goal number or a rule —
 * kept here (like title/subtitle) so a new stage is pure data, never a new
 * branch in MarketApp.tsx.
 */
export type MarketStageCopy = {
  districtLabel: LocalText;
  missionCompleteLabel: LocalText;
  learnCustomerHint: LocalText;
  /** Shown once, as a dialog, before the stage's clock is allowed to run. */
  introBody: LocalText;
};

export type MarketStageConfig = {
  level: MarketLevel;
  /** The first level reveals systems through completed player actions. */
  onboarding: "guided" | "full";
  /** The opening contract is a teaching moment, not an early random failure. */
  introCustomerGuaranteedRepayment: boolean;
  startingCash: number;
  goals: MarketGoals;
  maxVisibleCustomers: number;
  spawnEveryDays: number;
  maxVisibleDepositors: number;
  depositSpawnEveryDays: number;
  fundingUnlockDelayDays: number;
  productCreationCost: number;
  introCustomerId: string | null;
  introApprovesAutomatically: boolean;
  randomizeDefaultRisk: boolean;
  fundingRepaymentsEnabled: boolean;
  /** One coordinate source shared by simulation placement, DOM, and Three.js. */
  map: MarketMapDefinition;
  /** Authored demand phases. The latest `startsDay` at a date is active. */
  rounds: readonly MarketRound[];
  /** Bounded, decaying contagion created by defaults in shared exposures. */
  stressRules: MarketStressRules;
  /** Campaign-authored market reporting and its hidden segment pressure. */
  newsSchedule: readonly MarketNewsDefinition[];
  customerSeeds: readonly Customer[];
  depositSeeds: readonly Depositor[];
  fundingSeeds: readonly Funding[];
  customerGeneration: CustomerGenerationConfig;
  depositGeneration: DepositGenerationConfig;
  withdrawalPressure: WithdrawalPressureConfig | null;
  copy: MarketStageCopy;
};

export type MarketCampaignStage = {
  id: string;
  number: number;
  title: LocalText;
  subtitle: LocalText;
  rewardId: string;
  image: string;
  config: MarketStageConfig;
};

const NO_CORRELATION_STRESS: MarketStressRules = {
  districtIncrease: 0,
  segmentIncrease: 0,
  decayPerDay: 0,
  maxPerExposure: 0,
  maxRiskAdjustment: 0,
};

function steadyRound(
  districtId: string,
  spawnEveryDays: number,
): readonly MarketRound[] {
  return [
    {
      id: "steady-market",
      startsDay: 0,
      spawnEveryDays,
      applicantsPerSpawn: 1,
      amountMultiplier: 1,
      termMultiplier: 1,
      concentration: 1,
      districtDemand: { [districtId]: 1 },
      segmentDemand: {},
      briefing: {
        severity: "opportunity",
        title: { en: "The market is open", ko: "시장이 열렸습니다" },
        body: {
          en: "Demand is moving at its usual pace.",
          ko: "수요가 평소 속도로 움직이고 있습니다.",
        },
        action: {
          en: "Keep listening to each applicant.",
          ko: "각 신청자의 이야기를 계속 들어보세요.",
        },
      },
    },
  ];
}

const firstYieldConfig: MarketStageConfig = {
  level: "first-yield",
  onboarding: "guided",
  introCustomerGuaranteedRepayment: true,
  startingCash: 1_000,
  goals: {
    trustTarget: 100,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  maxVisibleDepositors: 4,
  depositSpawnEveryDays: 4,
  fundingUnlockDelayDays: 3,
  productCreationCost: 100,
  introCustomerId: "mina",
  introApprovesAutomatically: true,
  // Stage one is a calm growth lesson: every customer repays so funding and
  // deposit choices can be learned without credit-loss pressure.
  randomizeDefaultRisk: false,
  fundingRepaymentsEnabled: true,
  map: RIVERSIDE_MAP,
  rounds: steadyRound("riverside", 3),
  stressRules: NO_CORRELATION_STRESS,
  newsSchedule: [
    {
      id: "riverside-orders-signal",
      threadId: "riverside-orders",
      day: 6,
      phase: "signal",
      severity: "opportunity",
      title: {
        en: "Riverside orders are picking up",
        ko: "리버사이드 주문이 늘고 있습니다",
      },
      body: {
        en: "Local shops report a steadier flow of weekend customers.",
        ko: "지역 상점들이 주말 고객 흐름이 안정되고 있다고 전합니다.",
      },
      action: {
        en: "Watch small-business lines for a sustainable opening.",
        ko: "자영업자 라인에서 지속 가능한 기회를 살펴보세요.",
      },
      affectedSegments: ["small-business"],
      // Riverside never rolls for default, so any adjustment here is inert.
      // Kept at zero rather than pretending to move a number nobody rolls.
      riskAdjustment: 0,
    },
    {
      id: "riverside-orders-outcome",
      threadId: "riverside-orders",
      day: 15,
      phase: "outcome",
      severity: "opportunity",
      title: {
        en: "Riverside demand held through the month",
        ko: "리버사이드 수요가 한 달 동안 유지됐습니다",
      },
      body: {
        en: "The seasonal lift is now part of the district's ordinary trade.",
        ko: "계절적 수요가 이 지역의 일상적인 거래 흐름으로 자리 잡았습니다.",
      },
      action: {
        en: "Keep growing only where repayment performance supports it.",
        ko: "상환 성과가 뒷받침되는 라인만 계속 확장하세요.",
      },
      affectedSegments: ["small-business"],
      riskAdjustment: 0,
    },
  ],
  customerSeeds: [
    {
      id: "mina",
      name: { en: "Mina Kim", ko: "미나 김" },
      job: { en: "Neighborhood bakery employee", ko: "동네 베이커리 직원" },
      income: 2_400,
      amount: 100,
      rate: 10,
      term: 12,
      dueDay: 12,
      appears: 0,
      locationId: "riverside-lot-1",
      districtId: "riverside",
      avatar: "/assets/pop-art/avatars/mina-request.png",
      avatarStates: {
        neutral: "/assets/pop-art/avatars/mina-neutral.png",
        requesting: "/assets/pop-art/avatars/mina-request.png",
        evaluating: "/assets/pop-art/avatars/mina-neutral.png",
        worried: "/assets/pop-art/avatars/mina-request.png",
        relieved: "/assets/pop-art/avatars/mina-neutral.png",
        rejected: "/assets/pop-art/avatars/mina-request.png",
      },
      evidence: {
        purpose: {
          en: "Replace an oven belt before the morning shift",
          ko: "아침 근무 전 오븐 벨트 교체",
        },
        employment: {
          en: "Three years at the neighborhood bakery",
          ko: "동네 베이커리 3년 근무",
        },
        debt: { en: "No other loans", ko: "다른 대출 없음" },
        collateral: {
          en: "A signed next-month work schedule",
          ko: "다음 달 근무 일정표",
        },
      },
      status: "waiting",
    },
  ],
  // No seeded savers: deposits are something the player's own deposit product
  // attracts, so the growing queue reads as a consequence of the product system
  // rather than furniture that was always on the map.
  depositSeeds: [],
  fundingSeeds: [
    {
      id: "civic",
      name: { en: "Civic Credit Union", ko: "시민 신용금고" },
      amount: 500,
      rate: 5,
      dueDay: 30,
      locationId: "riverside-market-funding-west",
      districtId: "riverside",
      accepted: false,
      defaulted: false,
    },
    {
      id: "metro",
      name: { en: "Metro Bank", ko: "메트로 은행" },
      amount: 800,
      rate: 8,
      dueDay: 35,
      locationId: "riverside-market-funding-south",
      districtId: "riverside",
      accepted: false,
      defaulted: false,
    },
    {
      id: "capital",
      name: { en: "Capital Partners", ko: "캐피탈 파트너스" },
      amount: 1_200,
      rate: 12,
      dueDay: 40,
      locationId: "riverside-market-funding-east",
      districtId: "riverside",
      accepted: false,
      defaulted: false,
    },
  ],
  customerGeneration: {
    termMin: 9,
    termRange: 10,
    patienceDays: 7,
    incomeMin: 1_800,
    incomeStep: 200,
    incomeRange: 22,
    amountMin: 80,
    amountStep: 10,
    amountRange: 38,
    rateMin: 7,
    rateRange: 10,
  },
  depositGeneration: {
    amountMin: 120,
    amountStep: 40,
    amountRange: 11,
    rateMin: 1,
    rateRange: 3,
  },
  withdrawalPressure: {
    earliestDay: 18,
    dayRange: 8,
    warningDays: 2,
    withdrawalShare: 0.7,
    title: {
      en: "Residents are preparing to withdraw savings",
      ko: "주민들이 예금을 인출할 준비를 하고 있습니다",
    },
    body: {
      en: "A local rumour has people keeping more cash at home. Depositors will soon ask for part of their balances.",
      ko: "지역 소문으로 주민들이 현금을 더 보유하려 합니다. 곧 예금 고객들이 잔액 일부를 찾으려 할 것입니다.",
    },
    action: {
      en: "Keep enough cash on hand before the withdrawal day.",
      ko: "인출일 전까지 충분한 현금을 확보하세요.",
    },
  },
  copy: {
    districtLabel: { en: "RIVERSIDE DISTRICT", ko: "리버사이드 지구" },
    missionCompleteLabel: {
      en: "Your bank earned the market's complete trust.",
      ko: "우리 은행이 시장의 완전한 신뢰를 얻었습니다.",
    },
    learnCustomerHint: {
      en: "Get to know the customer before lending.",
      ko: "대출하기 전에 고객을 알아보세요.",
    },
    introBody: {
      en: "You have opened a small bank on Riverside. Listen to each customer, lend what you can afford, and let repayments grow the book. Nobody defaults here yet — this is where you learn the rhythm of the market.",
      ko: "리버사이드에 작은 은행을 열었습니다. 고객의 이야기를 듣고, 감당할 수 있는 만큼 빌려주고, 상환으로 자산을 키우세요. 아직 이곳에서는 아무도 돈을 떼먹지 않습니다 — 시장의 흐름을 익히는 단계입니다.",
    },
  },
};

const creditUnderPressureConfig: MarketStageConfig = {
  level: "credit-under-pressure",
  onboarding: "full",
  introCustomerGuaranteedRepayment: false,
  startingCash: 900,
  goals: {
    trustTarget: 100,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  maxVisibleDepositors: 3,
  depositSpawnEveryDays: 3,
  fundingUnlockDelayDays: 3,
  productCreationCost: 100,
  introCustomerId: "jun",
  introApprovesAutomatically: false,
  randomizeDefaultRisk: true,
  fundingRepaymentsEnabled: true,
  map: NORTH_YARD_MAP,
  rounds: steadyRound("north-yard", 3),
  stressRules: NO_CORRELATION_STRESS,
  newsSchedule: [
    {
      id: "yard-gigs-signal",
      threadId: "yard-gigs",
      day: 3,
      phase: "signal",
      severity: "watch",
      title: {
        en: "North Yard shifts are becoming irregular",
        ko: "노스 야드 근무 일정이 불규칙해지고 있습니다",
      },
      body: {
        en: "Delivery and casual workers report fewer predictable shifts.",
        ko: "배달·일용직 고객이 예측 가능한 근무가 줄었다고 말합니다.",
      },
      action: {
        en: "Review exposed lines before the next repayment cycle.",
        ko: "다음 상환 주기 전에 노출된 라인을 검토하세요.",
      },
      affectedSegments: ["delivery", "low-credit"],
      riskAdjustment: 0,
    },
    {
      id: "yard-gigs-warning",
      threadId: "yard-gigs",
      day: 8,
      phase: "warning",
      severity: "alert",
      title: {
        en: "North Yard repayment pressure is worsening",
        ko: "노스 야드 상환 압박이 커지고 있습니다",
      },
      body: {
        en: "Cash-flow pressure is now visible in delivery and precarious-work households.",
        ko: "배달·불안정 노동 고객군에서 현금흐름 압박이 뚜렷해지고 있습니다.",
      },
      action: {
        en: "Pause exposed automated lines, or fit them with a credit check or guarantor rule.",
        ko: "노출된 자동화 라인을 중단하거나, 신용조회·보증인 모듈을 장착하세요.",
      },
      affectedSegments: ["delivery", "low-credit"],
      riskAdjustment: 12,
    },
    {
      id: "yard-gigs-recovery",
      threadId: "yard-gigs",
      day: 20,
      phase: "recovery",
      severity: "watch",
      title: {
        en: "North Yard work is stabilizing",
        ko: "노스 야드 고용이 안정되고 있습니다",
      },
      body: {
        en: "The acute disruption has eased, though the district still needs care.",
        ko: "급격한 혼란은 줄었지만 이 지역은 여전히 주의가 필요합니다.",
      },
      action: {
        en: "Reopen lines gradually and watch the completed contracts.",
        ko: "라인을 천천히 재개하고 완료되는 계약을 지켜보세요.",
      },
      affectedSegments: ["delivery", "low-credit"],
      riskAdjustment: -12,
    },
  ],
  customerSeeds: [
    {
      id: "jun",
      name: { en: "Jun Park", ko: "준 박" },
      job: { en: "No current job", ko: "현재 직업 없음" },
      occupation: "unemployed",
      segment: "low-credit",
      income: 0,
      amount: 420,
      rate: 12,
      term: 4,
      dueDay: 4,
      appears: 0,
      locationId: "north-yard-lot-1",
      districtId: "north-yard",
      avatar: "/assets/pop-art/avatars/jun-evaluating.png",
      avatarStates: {
        neutral: "/assets/pop-art/avatars/jun-neutral.png",
        requesting: "/assets/pop-art/avatars/jun-neutral.png",
        evaluating: "/assets/pop-art/avatars/jun-evaluating.png",
        worried: "/assets/pop-art/avatars/jun-evaluating.png",
        relieved: "/assets/pop-art/avatars/jun-neutral.png",
        rejected: "/assets/pop-art/avatars/jun-evaluating.png",
      },
      evidence: {
        purpose: {
          en: "Cover rent while looking for work",
          ko: "구직 중인 동안 월세 충당",
        },
        employment: {
          en: "No current job or regular income",
          ko: "현재 직업과 정기 소득이 없음",
        },
        debt: {
          en: "A $900 credit-card balance remains",
          ko: "신용카드 잔액 $900이 남아 있음",
        },
        collateral: {
          en: "No collateral or guarantor offered",
          ko: "제시한 담보나 보증인이 없음",
        },
      },
      status: "waiting",
    },
  ],
  // As in the first stage, savers are attracted by the player's deposit product
  // rather than seeded. Deposits are the capital that makes this stage's
  // affordability squeeze survivable, so they have to be something earned.
  depositSeeds: [],
  fundingSeeds: [
    {
      id: "civic",
      name: { en: "Civic Credit Union", ko: "시민 신용금고" },
      amount: 600,
      rate: 6,
      dueDay: 12,
      locationId: "north-yard-market-funding-west",
      districtId: "north-yard",
      accepted: false,
      defaulted: false,
    },
    {
      id: "metro",
      name: { en: "Metro Bank", ko: "메트로 은행" },
      amount: 900,
      rate: 9,
      dueDay: 16,
      locationId: "north-yard-market-funding-south",
      districtId: "north-yard",
      accepted: false,
      defaulted: false,
    },
    {
      id: "capital",
      name: { en: "Capital Partners", ko: "캐피탈 파트너스" },
      amount: 1_200,
      rate: 13,
      dueDay: 20,
      locationId: "north-yard-market-funding-east",
      districtId: "north-yard",
      accepted: false,
      defaulted: false,
    },
  ],
  customerGeneration: {
    termMin: 6,
    termRange: 7,
    patienceDays: 5,
    // North Yard is meant to be survivable by good judgment, so the pool has
    // to contain enough genuinely sound applicants to build a book from. The
    // old range ran to $2,100 against incomes from $900, which made most of the
    // queue a bad bet at any price and left careful play with nothing to fund.
    incomeMin: 1_300,
    incomeStep: 200,
    incomeRange: 16,
    amountMin: 300,
    amountStep: 100,
    amountRange: 13,
    rateMin: 10,
    rateRange: 11,
  },
  depositGeneration: {
    amountMin: 220,
    amountStep: 60,
    amountRange: 13,
    rateMin: 1,
    rateRange: 4,
  },
  withdrawalPressure: null,
  copy: {
    districtLabel: { en: "NORTH YARD DISTRICT", ko: "노스 야드 지구" },
    missionCompleteLabel: {
      en: "Your decisions held up under pressure. The market fully trusts this bank.",
      ko: "압박 속에서도 판단을 증명했습니다. 시장이 이 은행을 완전히 신뢰합니다.",
    },
    learnCustomerHint: {
      en: "Income relative to the loan amount determines repayment risk.",
      ko: "소득 대비 대출 금액이 상환 위험을 결정합니다.",
    },
    introBody: {
      en: "North Yard runs on irregular work, and this time customers can default. Watch the market wire, keep cash for the depositors who will come asking, and remember that borrowed money has to be paid back on its due day.",
      ko: "노스 야드는 불규칙한 일자리로 돌아가고, 이번에는 고객이 돈을 갚지 못할 수 있습니다. 시장 뉴스를 주시하고, 찾아올 예금자를 위한 현금을 남겨두고, 빌린 돈에는 만기가 있다는 점을 잊지 마세요.",
    },
  },
};

const portfolioCrossroadsConfig: MarketStageConfig = {
  level: "portfolio-crossroads",
  onboarding: "full",
  introCustomerGuaranteedRepayment: false,
  startingCash: 4_200,
  goals: {
    trustTarget: 100,
  },
  maxVisibleCustomers: 60,
  spawnEveryDays: 2,
  maxVisibleDepositors: 18,
  depositSpawnEveryDays: 3,
  fundingUnlockDelayDays: 2,
  productCreationCost: 150,
  introCustomerId: "hana",
  introApprovesAutomatically: false,
  randomizeDefaultRisk: true,
  fundingRepaymentsEnabled: true,
  map: METRO_REGION_MAP,
  rounds: [
    {
      id: "district-opening",
      startsDay: 0,
      spawnEveryDays: 2,
      applicantsPerSpawn: 2,
      amountMultiplier: 1,
      termMultiplier: 1,
      concentration: 1,
      districtDemand: {
        "old-market": 1.2,
        "tech-quarter": 1,
        "freight-basin": 0.9,
        "cedar-homes": 1.15,
        "civic-heights": 0.85,
        "south-works": 1,
      },
      segmentDemand: {
        workers: 1.1,
        "small-business": 1.2,
        delivery: 0.9,
        technology: 0.9,
        "low-credit": 0.8,
      },
      briefing: {
        severity: "opportunity",
        title: {
          en: "Six districts enter the market",
          ko: "여섯 지역이 시장에 들어옵니다",
        },
        body: {
          en: "Demand is broad and manageable, but every district carries a different exposure.",
          ko: "수요는 넓고 감당할 만하지만 각 지역이 서로 다른 노출을 안고 있습니다.",
        },
        action: {
          en: "Build a diversified opening book.",
          ko: "분산된 초기 포트폴리오를 만드세요.",
        },
      },
    },
    {
      id: "regional-expansion",
      startsDay: 12,
      spawnEveryDays: 1,
      applicantsPerSpawn: 3,
      amountMultiplier: 1.3,
      termMultiplier: 1.1,
      concentration: 1.55,
      districtDemand: {
        "old-market": 1,
        "tech-quarter": 1.8,
        "freight-basin": 1.5,
        "cedar-homes": 0.9,
        "civic-heights": 0.8,
        "south-works": 1.2,
      },
      segmentDemand: {
        "small-business": 1.25,
        delivery: 1.5,
        technology: 1.8,
      },
      briefing: {
        severity: "watch",
        title: {
          en: "Regional expansion accelerates",
          ko: "지역 확장이 빨라집니다",
        },
        body: {
          en: "Technology and freight applications are arriving in larger batches and for larger amounts.",
          ko: "기술업과 화물업 신청이 더 큰 금액과 묶음으로 들어오고 있습니다.",
        },
        action: {
          en: "Compare new demand with the exposure already on your book.",
          ko: "새 수요를 이미 보유한 노출과 비교하세요.",
        },
      },
    },
    {
      id: "concentration-cycle",
      startsDay: 26,
      spawnEveryDays: 1,
      applicantsPerSpawn: 5,
      amountMultiplier: 1.65,
      termMultiplier: 1.2,
      concentration: 2.4,
      districtDemand: {
        "old-market": 0.7,
        "tech-quarter": 2.6,
        "freight-basin": 2.2,
        "cedar-homes": 0.7,
        "civic-heights": 0.6,
        "south-works": 1.8,
      },
      segmentDemand: {
        delivery: 2.2,
        technology: 2.7,
        "low-credit": 1.5,
      },
      briefing: {
        severity: "alert",
        title: {
          en: "Growth is becoming concentrated",
          ko: "성장이 집중되기 시작합니다",
        },
        body: {
          en: "The busiest districts now dominate the queue. A default there can pressure many related contracts.",
          ko: "가장 바쁜 지역이 대기열을 지배하고 있습니다. 그곳의 부도는 여러 관련 계약을 압박할 수 있습니다.",
        },
        action: {
          en: "Choose whether the yield is worth the correlated risk.",
          ko: "수익이 상관 리스크를 감수할 가치가 있는지 판단하세요.",
        },
      },
    },
  ],
  stressRules: {
    districtIncrease: 5,
    segmentIncrease: 7,
    decayPerDay: 1.5,
    maxPerExposure: 18,
    maxRiskAdjustment: 24,
  },
  newsSchedule: [
    {
      id: "freight-delays-warning",
      threadId: "freight-delays",
      day: 7,
      phase: "warning",
      severity: "alert",
      title: {
        en: "Freight Basin deliveries are backing up",
        ko: "화물 분지 배송이 밀리고 있습니다",
      },
      body: {
        en: "Warehouse queues are squeezing delivery and small-business cash flow.",
        ko: "창고 대기열이 배달업과 자영업의 현금흐름을 압박하고 있습니다.",
      },
      action: {
        en: "Review Freight Basin and delivery exposure before lending again.",
        ko: "추가 대출 전 화물 분지와 배달업 노출을 확인하세요.",
      },
      affectedSegments: ["delivery", "small-business"],
      affectedDistrictIds: ["freight-basin"],
      riskAdjustment: 8,
    },
    {
      id: "freight-delays-recovery",
      threadId: "freight-delays",
      day: 18,
      phase: "recovery",
      severity: "opportunity",
      title: {
        en: "Freight queues are clearing",
        ko: "화물 대기열이 해소되고 있습니다",
      },
      body: {
        en: "Deliveries are moving again, easing the immediate regional pressure.",
        ko: "배송이 다시 움직이면서 지역의 즉각적인 압박이 줄고 있습니다.",
      },
      action: {
        en: "Reopen exposure gradually rather than chasing the rebound.",
        ko: "반등을 좇기보다 노출을 점진적으로 다시 여세요.",
      },
      affectedSegments: ["delivery", "small-business"],
      affectedDistrictIds: ["freight-basin"],
      riskAdjustment: -8,
    },
    {
      id: "tech-funding-warning",
      threadId: "tech-funding",
      day: 23,
      phase: "warning",
      severity: "alert",
      title: {
        en: "Tech Quarter funding rounds are stalling",
        ko: "테크 쿼터 투자 라운드가 멈추고 있습니다",
      },
      body: {
        en: "Startups are stretching payroll while investors delay commitments.",
        ko: "투자자들의 약정이 지연되면서 스타트업이 급여 자금을 늘리고 있습니다.",
      },
      action: {
        en: "Watch technology concentration and short-reserve borrowers.",
        ko: "기술업 집중도와 준비금이 적은 차입자를 주시하세요.",
      },
      affectedSegments: ["technology"],
      affectedDistrictIds: ["tech-quarter"],
      riskAdjustment: 10,
    },
    {
      id: "tech-funding-recovery",
      threadId: "tech-funding",
      day: 36,
      phase: "recovery",
      severity: "watch",
      title: {
        en: "Selective funding returns to Tech Quarter",
        ko: "테크 쿼터에 선별적 투자가 돌아옵니다",
      },
      body: {
        en: "Stronger firms are closing rounds, though weaker borrowers remain exposed.",
        ko: "우량 기업은 투자를 마무리하고 있지만 취약 차입자의 노출은 남아 있습니다.",
      },
      action: {
        en: "Use applicant evidence instead of treating the whole district alike.",
        ko: "지역 전체를 같게 보지 말고 신청자의 증거를 활용하세요.",
      },
      affectedSegments: ["technology"],
      affectedDistrictIds: ["tech-quarter"],
      riskAdjustment: -10,
    },
  ],
  customerSeeds: [
    {
      id: "hana",
      name: { en: "Hana Lee", ko: "하나 이" },
      job: { en: "Old Market restaurant owner", ko: "구시장 식당 운영자" },
      occupation: "self-employed",
      segment: "small-business",
      income: 3_600,
      amount: 620,
      rate: 12,
      term: 8,
      dueDay: 8,
      appears: 0,
      locationId: "old-market-lot-3-4",
      districtId: "old-market",
      avatar: "/assets/pop-art/avatars/mina-request.png",
      avatarStates: {
        neutral: "/assets/pop-art/avatars/mina-neutral.png",
        requesting: "/assets/pop-art/avatars/mina-request.png",
        evaluating: "/assets/pop-art/avatars/mina-neutral.png",
        worried: "/assets/pop-art/avatars/mina-request.png",
        relieved: "/assets/pop-art/avatars/mina-neutral.png",
        rejected: "/assets/pop-art/avatars/mina-request.png",
      },
      evidence: {
        purpose: {
          en: "Replace two failing kitchen refrigerators",
          ko: "고장 난 주방 냉장고 두 대 교체",
        },
        employment: {
          en: "Seven years operating the same restaurant",
          ko: "같은 식당을 7년째 운영 중",
        },
        debt: {
          en: "One equipment lease with four payments remaining",
          ko: "4회 납부가 남은 장비 리스 한 건",
        },
        collateral: {
          en: "Restaurant equipment and a signed catering contract",
          ko: "식당 장비와 서명된 케이터링 계약",
        },
      },
      status: "waiting",
    },
  ],
  depositSeeds: [],
  fundingSeeds: [
    {
      id: "regional-reserve",
      name: { en: "Regional Reserve", ko: "지역 준비은행" },
      amount: 1_800,
      rate: 6,
      dueDay: 18,
      locationId: "metro-funding-west",
      districtId: "cedar-homes",
      accepted: false,
      defaulted: false,
    },
    {
      id: "city-clearing",
      name: { en: "City Clearing Bank", ko: "도시 결제은행" },
      amount: 2_600,
      rate: 9,
      dueDay: 24,
      locationId: "metro-funding-south",
      districtId: "civic-heights",
      accepted: false,
      defaulted: false,
    },
    {
      id: "growth-capital",
      name: { en: "Growth Capital", ko: "성장 캐피탈" },
      amount: 3_600,
      rate: 13,
      dueDay: 30,
      locationId: "metro-funding-east",
      districtId: "south-works",
      accepted: false,
      defaulted: false,
    },
  ],
  customerGeneration: {
    termMin: 6,
    termRange: 9,
    patienceDays: 6,
    incomeMin: 1_600,
    incomeStep: 250,
    incomeRange: 20,
    amountMin: 240,
    amountStep: 80,
    amountRange: 18,
    rateMin: 9,
    rateRange: 12,
  },
  depositGeneration: {
    amountMin: 300,
    amountStep: 100,
    amountRange: 17,
    rateMin: 1,
    rateRange: 4,
  },
  withdrawalPressure: {
    earliestDay: 24,
    dayRange: 8,
    warningDays: 3,
    withdrawalShare: 0.6,
    title: {
      en: "Households are moving savings between districts",
      ko: "가계가 지역 간에 예금을 옮기고 있습니다",
    },
    body: {
      en: "Regional risk reports have depositors preparing a coordinated withdrawal.",
      ko: "지역 위험 보도로 예금자들이 동시 인출을 준비하고 있습니다.",
    },
    action: {
      en: "Keep liquid cash behind the growing loan book.",
      ko: "성장하는 대출 자산 뒤에 유동 현금을 남겨두세요.",
    },
  },
  copy: {
    districtLabel: {
      en: "METRO REGIONAL MARKET",
      ko: "메트로 광역 시장",
    },
    missionCompleteLabel: {
      en: "A diversified regional bank earned the market's complete trust.",
      ko: "분산된 지역 은행이 시장의 완전한 신뢰를 얻었습니다.",
    },
    learnCustomerHint: {
      en: "Judge the applicant and the exposure already concentrated around them.",
      ko: "신청자와 그 주변에 이미 집중된 노출을 함께 판단하세요.",
    },
    introBody: {
      en: "Your bank now serves six connected districts. Demand will accelerate and defaults can pressure borrowers in the same industry or neighborhood. Zoom from the regional picture into individual conversations, and diversify before growth chooses your portfolio for you.",
      ko: "이제 은행은 서로 연결된 여섯 지역을 담당합니다. 수요는 빨라지고 부도는 같은 업종이나 지역의 차입자를 압박할 수 있습니다. 광역 현황에서 개별 대화까지 확대해 살펴보고, 성장이 포트폴리오를 대신 결정하기 전에 분산하세요.",
    },
  },
};

export const marketCampaignStages: readonly MarketCampaignStage[] = [
  {
    id: "first-yield",
    number: 1,
    title: { en: "The First Yield", ko: "첫 번째 수익" },
    subtitle: {
      en: "Grow a bank through simple lending",
      ko: "간단한 대출로 은행을 성장시키세요",
    },
    rewardId: "level-one-complete",
    image: "/assets/pop-art/backgrounds/market-map.png",
    config: firstYieldConfig,
  },
  {
    id: "credit-under-pressure",
    number: 2,
    title: { en: "Credit Under Pressure", ko: "압박 속의 신용 심사" },
    subtitle: {
      en: "Balance risk, liquidity, and debt repayment",
      ko: "위험, 유동성, 부채 상환을 균형 있게 관리하세요",
    },
    rewardId: "level-two-complete",
    image: "/assets/pop-art/backgrounds/underwriting-room.png",
    config: creditUnderPressureConfig,
  },
  {
    id: "portfolio-crossroads",
    number: 3,
    title: { en: "Portfolio Crossroads", ko: "포트폴리오의 갈림길" },
    subtitle: {
      en: "Diversify a growing regional loan book",
      ko: "성장하는 지역 포트폴리오를 분산하세요",
    },
    rewardId: "level-three-complete",
    image: "/assets/pop-art/backgrounds/market-map.png",
    config: portfolioCrossroadsConfig,
  },
];

export function marketStageById(id: string): MarketCampaignStage {
  return (
    marketCampaignStages.find((stage) => stage.id === id) ??
    marketCampaignStages[0]!
  );
}

export function marketStageByLevel(level: MarketLevel): MarketCampaignStage {
  return (
    marketCampaignStages.find((stage) => stage.config.level === level) ??
    marketCampaignStages[0]!
  );
}
