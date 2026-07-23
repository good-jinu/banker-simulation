import {
  marketCampaignStages,
  marketStageById,
} from "../market/market-campaign.ts";

export type DevMarketLaunch = {
  stageId: string;
  phase: "intro" | "map";
  fresh: boolean;
};

/** Parse the supported local development URL without affecting production boot. */
export function parseDevMarketLaunch(search: string): DevMarketLaunch | null {
  const query = new URLSearchParams(search);
  if (query.get("dev") !== "market") return null;
  return {
    stageId: marketStageById(query.get("stage") ?? marketCampaignStages[0]!.id)
      .id,
    phase: query.get("phase") === "map" ? "map" : "intro",
    fresh: query.get("fresh") === "1",
  };
}
