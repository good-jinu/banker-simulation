import type { LocalText } from "../i18n/local-text.ts";
import type { Customer, Funding, MarketLevel } from "./market-world.ts";

export type MarketGoals = {
  loanCount: number;
  cumulativeLent: number;
  netCash: number;
  survivalDay: number | null;
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

export type MarketStageConfig = {
  level: MarketLevel;
  startingCash: number;
  goals: MarketGoals;
  maxVisibleCustomers: number;
  spawnEveryDays: number;
  fundingUnlockDelayDays: number;
  introCustomerId: string | null;
  introApprovesAutomatically: boolean;
  randomizeDefaultRisk: boolean;
  fundingRepaymentsEnabled: boolean;
  customerSeeds: readonly Customer[];
  fundingSeeds: readonly Funding[];
  customerGeneration: CustomerGenerationConfig;
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
    netCash: 2_000,
    survivalDay: null,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  fundingUnlockDelayDays: 3,
  introCustomerId: "mina",
  introApprovesAutomatically: true,
  randomizeDefaultRisk: false,
  fundingRepaymentsEnabled: false,
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
      avatar: "/assets/avatars/mina-request.webp",
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
};

const creditUnderPressureConfig: MarketStageConfig = {
  level: "credit-under-pressure",
  startingCash: 900,
  goals: {
    loanCount: 3,
    cumulativeLent: 1_500,
    netCash: 1_400,
    survivalDay: 26,
  },
  maxVisibleCustomers: 5,
  spawnEveryDays: 3,
  fundingUnlockDelayDays: 3,
  introCustomerId: "jun",
  introApprovesAutomatically: false,
  randomizeDefaultRisk: true,
  fundingRepaymentsEnabled: true,
  customerSeeds: [
    {
      id: "jun",
      name: { en: "Jun Park", ko: "준 박" },
      job: { en: "Warehouse supervisor", ko: "물류센터 반장" },
      income: 3_600,
      amount: 420,
      rate: 12,
      term: 8,
      dueDay: 8,
      appears: 0,
      x: 19,
      y: 21,
      avatar: "/assets/avatars/jun-evaluating.webp",
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
    image: "/assets/stages/stage-01.webp",
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
    image: "/assets/stages/stage-01.webp",
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
