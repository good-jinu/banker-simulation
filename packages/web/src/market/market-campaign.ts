import type { LocalText } from "../i18n/local-text.ts";

export type TutorialDefinition = {
  kind: "first-yield";
  targetDemandId: string;
};

export type MarketCampaignStage = {
  id: string;
  number: number;
  title: LocalText;
  subtitle: LocalText;
  briefing: LocalText;
  focus: LocalText;
  seed: string;
  startingCash: number;
  repaidLoans: number;
  cashTarget: number;
  rewardId: string;
  image: string;
  /** Optional UI-only guidance. It never changes simulation rules. */
  tutorial?: TutorialDefinition;
};

const text = (en: string, ko: string): LocalText => ({ en, ko });

export const marketCampaignStages: readonly MarketCampaignStage[] = [
  {
    id: "first-yield",
    number: 1,
    seed: "first-yield",
    startingCash: 1000,
    title: text("The First Yield", "첫 번째 수익"),
    subtitle: text(
      "Fund one request and collect it",
      "요청 하나를 실행하고 상환받기",
    ),
    briefing: text(
      "Post a clear offer, serve one borrower, then advance to its repayment.",
      "명확한 제안을 게시하고 한 명에게 실행한 뒤 상환일까지 진행하세요.",
    ),
    focus: text("Target: 1 repaid contract", "목표: 상환 완료 계약 1건"),
    repaidLoans: 1,
    cashTarget: 1000,
    rewardId: "contract-stamp",
    image: "/assets/stages/stage-01.webp",
    tutorial: {
      kind: "first-yield",
      targetDemandId: "demand-1",
    },
  },
  {
    id: "room-to-breathe",
    number: 2,
    seed: "room-to-breathe",
    startingCash: 1000,
    title: text("Room to Breathe", "숨 쉴 여유"),
    subtitle: text(
      "Price a return that keeps the desk healthy",
      "금고를 지키는 수익률을 설계하기",
    ),
    briefing: text(
      "Use the requester variables to make one profitable, affordable offer.",
      "요청자 변수를 이용해 수익성과 감당 가능성을 모두 갖춘 제안을 만드세요.",
    ),
    focus: text(
      "Target: 1 repayment · $1,050 cash",
      "목표: 상환 1건 · 현금 $1,050",
    ),
    repaidLoans: 1,
    cashTarget: 1050,
    rewardId: "cashflow-lens",
    image: "/assets/stage-one/customers/daniel.webp",
  },
  {
    id: "safety-net",
    number: 3,
    seed: "safety-net",
    startingCash: 1100,
    title: text("The Safety Net", "안전망"),
    subtitle: text(
      "Use an income rule to screen risk",
      "소득 규칙으로 위험 걸러내기",
    ),
    briefing: text(
      "Build a conditional offer that serves stronger applicants while protecting your cash.",
      "조건 분기를 이용해 상환 가능성이 높은 신청자를 선별하세요.",
    ),
    focus: text(
      "Target: 1 repaid contract · $1,150 cash",
      "목표: 상환 완료 1건 · 현금 $1,150",
    ),
    repaidLoans: 1,
    cashTarget: 1150,
    rewardId: "collateral-seal",
    image: "/assets/stage-one/customers/sofia.webp",
  },
  {
    id: "payment-rhythm",
    number: 4,
    seed: "payment-rhythm",
    startingCash: 1200,
    title: text("Payment Rhythm", "상환 리듬"),
    subtitle: text(
      "Run two promises on one calendar",
      "하나의 달력에서 두 약속 운용하기",
    ),
    briefing: text(
      "Keep two loans moving at once and collect both repayments.",
      "두 대출을 동시에 운용하고 두 건 모두 상환받으세요.",
    ),
    focus: text("Target: 2 repaid contracts", "목표: 상환 완료 계약 2건"),
    repaidLoans: 2,
    cashTarget: 1200,
    rewardId: "schedule-dial",
    image: "/assets/campaign/market/civic.webp",
  },
  {
    id: "keep-till-open",
    number: 5,
    seed: "keep-till-open",
    startingCash: 1400,
    title: text("Keep the Till Open", "금고를 열어두기"),
    subtitle: text(
      "A portfolio needs liquidity",
      "포트폴리오에는 유동성이 필요합니다",
    ),
    briefing: text(
      "Manage several requests without draining the desk; recover three loans.",
      "금고를 비우지 않고 여러 요청을 관리해 세 건의 대출을 회수하세요.",
    ),
    focus: text(
      "Target: 3 repaid contracts · $1,500 cash",
      "목표: 상환 완료 3건 · 현금 $1,500",
    ),
    repaidLoans: 3,
    cashTarget: 1500,
    rewardId: "portfolio-lens",
    image: "/assets/campaign/market/workshop.webp",
  },
  {
    id: "funding-desk",
    number: 6,
    seed: "funding-desk",
    startingCash: 1600,
    title: text("Funding Desk", "펀딩 데스크"),
    subtitle: text(
      "Build a resilient lending machine",
      "안정적인 대출 시스템 만들기",
    ),
    briefing: text(
      "Use formulas and decisions to run a diversified book through four successful repayments.",
      "수식과 결정을 활용해 네 건의 성공적인 상환을 완료하세요.",
    ),
    focus: text(
      "Target: 4 repaid contracts · $1,800 cash",
      "목표: 상환 완료 4건 · 현금 $1,800",
    ),
    repaidLoans: 4,
    cashTarget: 1800,
    rewardId: "liquidity-ledger",
    image: "/assets/campaign/market/funding.webp",
  },
];

export function marketStageById(id: string): MarketCampaignStage {
  return (
    marketCampaignStages.find((stage) => stage.id === id) ??
    marketCampaignStages[0]!
  );
}
