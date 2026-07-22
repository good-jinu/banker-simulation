import type { LocalText } from "../i18n/local-text.ts";
import type { Customer, Funding, MarketLevel } from "./market-world.ts";

export type MarketGoals = {
  loanCount: number;
  cumulativeLent: number;
  netWorth: number;
  survivalDay: number | null;
  productCount: number;
};

export type CustomerGenerationConfig = {
  termMin: number;
  termRange: number;
  incomeMin: number;
  incomeStep: number;
  incomeRange: number;
  amountMin: number;
  amountStep: number;
  amountRange: number;
  rateMin: number;
  rateRange: number;
};

/**
 * Narrative copy that varies per stage but isn't a goal number or a rule —
 * kept here (like title/subtitle) so a new stage is pure data, never a new
 * branch in MarketApp.tsx.
 */
export type MarketStageCopy = {
  districtLabel: LocalText;
  goalLoansLabel: LocalText;
  goalCumulativeLentLabel: LocalText;
  goalNetWorthLabel: LocalText;
  goalProductLabel: LocalText;
  missionCompleteLabel: LocalText;
  learnCustomerHint: LocalText;
};

export type MarketStageConfig = {
  level: MarketLevel;
  startingCash: number;
  goals: MarketGoals;
  maxVisibleCustomers: number;
  spawnEveryDays: number;
  fundingUnlockDelayDays: number;
  productCreationCost: number;
  introCustomerId: string | null;
  introApprovesAutomatically: boolean;
  randomizeDefaultRisk: boolean;
  fundingRepaymentsEnabled: boolean;
  customerSeeds: readonly Customer[];
  fundingSeeds: readonly Funding[];
  customerGeneration: CustomerGenerationConfig;
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
  startingCash: 700,
  goals: {
    loanCount: 1,
    cumulativeLent: 500,
    netWorth: 1_500,
    survivalDay: null,
    productCount: 0,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  fundingUnlockDelayDays: 3,
  productCreationCost: 100,
  introCustomerId: "mina",
  introApprovesAutomatically: true,
  randomizeDefaultRisk: false,
  fundingRepaymentsEnabled: true,
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
    incomeMin: 1_800,
    incomeStep: 200,
    incomeRange: 22,
    amountMin: 80,
    amountStep: 10,
    amountRange: 38,
    rateMin: 7,
    rateRange: 10,
  },
  copy: {
    districtLabel: { en: "RIVERSIDE DISTRICT", ko: "리버사이드 지구" },
    goalLoansLabel: { en: "First loan", ko: "첫 대출" },
    goalCumulativeLentLabel: { en: "Lend $500", ko: "$500 대출" },
    goalNetWorthLabel: { en: "Net worth $1,500", ko: "순자산 $1,500" },
    // Stage has no product goal (productCount: 0), so this never renders.
    goalProductLabel: { en: "Create a loan product", ko: "대출 상품 만들기" },
    missionCompleteLabel: {
      en: "Three bank-management goals completed.",
      ko: "세 가지 은행 운영 목표를 모두 달성했습니다.",
    },
    learnCustomerHint: {
      en: "Get to know the customer before lending.",
      ko: "대출하기 전에 고객을 알아보세요.",
    },
  },
};

const creditUnderPressureConfig: MarketStageConfig = {
  level: "credit-under-pressure",
  startingCash: 900,
  goals: {
    loanCount: 3,
    cumulativeLent: 1_500,
    netWorth: 1_400,
    survivalDay: 26,
    productCount: 1,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  fundingUnlockDelayDays: 3,
  productCreationCost: 100,
  introCustomerId: "jun",
  introApprovesAutomatically: false,
  randomizeDefaultRisk: true,
  fundingRepaymentsEnabled: true,
  customerSeeds: [
    {
      id: "jun",
      name: { en: "Jun Park", ko: "준 박" },
      job: { en: "No current job", ko: "현재 직업 없음" },
      occupation: "unemployed",
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
    incomeMin: 900,
    incomeStep: 200,
    incomeRange: 16,
    amountMin: 300,
    amountStep: 100,
    amountRange: 19,
    rateMin: 10,
    rateRange: 11,
  },
  copy: {
    districtLabel: { en: "NORTH YARD DISTRICT", ko: "노스 야드 지구" },
    goalLoansLabel: { en: "Issue 3 loans", ko: "대출 3건 실행하기" },
    goalCumulativeLentLabel: {
      en: "Lend at least $1,500",
      ko: "대출 누적 $1,500 이상",
    },
    goalNetWorthLabel: {
      en: "Reach $1,400 in net worth",
      ko: "순자산 $1,400 달성",
    },
    goalProductLabel: { en: "Create a loan product", ko: "대출 상품 만들기" },
    missionCompleteLabel: {
      en: "You balanced credit risk, liquidity, and debt maturity through day 26.",
      ko: "26일까지 신용 위험, 유동성, 부채 만기를 균형 있게 관리했습니다.",
    },
    learnCustomerHint: {
      en: "Income relative to the loan amount determines repayment risk.",
      ko: "소득 대비 대출 금액이 상환 위험을 결정합니다.",
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
