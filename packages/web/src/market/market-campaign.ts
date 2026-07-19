import type { LocalText } from "../i18n/local-text.ts";

export type MarketCampaignStage = {
  id: string;
  number: number;
  title: LocalText;
  subtitle: LocalText;
  rewardId: string;
  image: string;
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
  },
];

export function marketStageById(id: string): MarketCampaignStage {
  return (
    marketCampaignStages.find((stage) => stage.id === id) ??
    marketCampaignStages[0]!
  );
}
