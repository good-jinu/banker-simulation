/**
 * A market exposure group. Kept outside the reducer so map, news, campaign,
 * and credit modules can share it without importing the simulation runtime.
 */
export type MarketSegment =
  "workers" | "small-business" | "delivery" | "technology" | "low-credit";

export const MARKET_SEGMENTS: readonly MarketSegment[] = [
  "workers",
  "small-business",
  "delivery",
  "technology",
  "low-credit",
];
