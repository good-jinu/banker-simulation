import type { LocalText } from "../i18n/local-text.ts";
import type { MarketMapDefinition } from "./market-world.ts";

export type TutorialDefinition = {
  kind: "first-yield";
  targetDemandId: string;
  depositZoneId: string;
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
  assetTarget?: number;
  rewardId: string;
  image: string;
  market?: MarketMapDefinition;
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
    assetTarget: 3000,
    rewardId: "contract-stamp",
    image: "/assets/stages/stage-01.webp",
    tutorial: {
      kind: "first-yield",
      targetDemandId: "demand-1",
      depositZoneId: "savings-quarter",
    },
    market: {
      width: 1840,
      height: 980,
      zones: [
        {
          id: "neighborhood-credit",
          label: text("Neighborhood Credit", "생활 금융 지구"),
          description: text(
            "Residents seeking loans up to $500",
            "$500 이하 생활자금 대출 수요",
          ),
          bounds: { x: 0.035, y: 0.08, width: 0.43, height: 0.82 },
          unlock: { type: "always" },
          maxOpenDemands: 5,
          spawnRules: [
            {
              id: "stage-one-consumer-loans",
              kind: "loan",
              weight: 1,
              amount: { min: 100, max: 500, step: 50 },
              termDays: { min: 30, max: 120, step: 30 },
              returnRate: { min: 0.06, max: 0.1 },
              firstDemand: { amount: 300, termDays: 30, returnRate: 0.1 },
              borrowerProfile: {
                minimumMonthlyIncome: 2000,
                repaymentGuaranteed: true,
              },
            },
          ],
        },
        {
          id: "savings-quarter",
          label: text("Savings Quarter", "저축 금융 지구"),
          description: text(
            "Residents placing long-term cash for interest",
            "장기 이자를 원하는 일반인 예금 수요",
          ),
          bounds: { x: 0.535, y: 0.08, width: 0.43, height: 0.82 },
          unlock: { type: "repaid-loans", count: 1 },
          maxOpenDemands: 5,
          spawnRules: [
            {
              id: "stage-one-consumer-deposits",
              kind: "deposit",
              weight: 1,
              amount: { min: 500, max: 900, step: 100 },
              termDays: { min: 180, max: 360, step: 30 },
              returnRate: { min: 0.04, max: 0.06 },
              firstDemand: { amount: 700, termDays: 180, returnRate: 0.06 },
            },
          ],
        },
      ],
    },
  },
];

export function marketStageById(id: string): MarketCampaignStage {
  return (
    marketCampaignStages.find((stage) => stage.id === id) ??
    marketCampaignStages[0]!
  );
}
