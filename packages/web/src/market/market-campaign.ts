import type { LocalText } from "../i18n/local-text.ts";
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
      x: 19,
      y: 21,
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
      x: 9,
      y: 50,
      accepted: false,
      defaulted: false,
    },
    {
      id: "metro",
      name: { en: "Metro Bank", ko: "메트로 은행" },
      amount: 800,
      rate: 8,
      dueDay: 35,
      x: 50,
      y: 88,
      accepted: false,
      defaulted: false,
    },
    {
      id: "capital",
      name: { en: "Capital Partners", ko: "캐피탈 파트너스" },
      amount: 1_200,
      rate: 12,
      dueDay: 40,
      x: 91,
      y: 50,
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
      x: 19,
      y: 21,
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
      x: 9,
      y: 50,
      accepted: false,
      defaulted: false,
    },
    {
      id: "metro",
      name: { en: "Metro Bank", ko: "메트로 은행" },
      amount: 900,
      rate: 9,
      dueDay: 16,
      x: 50,
      y: 88,
      accepted: false,
      defaulted: false,
    },
    {
      id: "capital",
      name: { en: "Capital Partners", ko: "캐피탈 파트너스" },
      amount: 1_200,
      rate: 13,
      dueDay: 20,
      x: 91,
      y: 50,
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
