import { describe, expect, it } from "vitest";
import {
  hasMarketAlertForSegment,
  publishMarketNews,
  riskAdjustmentForSegment,
  unreadMarketNewsCount,
  type MarketNewsDefinition,
} from "./market-news.ts";

const deliveryWarning: MarketNewsDefinition = {
  id: "delivery-warning",
  threadId: "delivery-slowdown",
  day: 4,
  phase: "warning",
  severity: "alert",
  title: { en: "Warning", ko: "경보" },
  body: { en: "Body", ko: "본문" },
  action: { en: "Act", ko: "대응" },
  affectedSegments: ["delivery"],
  riskAdjustment: 12,
};

describe("market news", () => {
  it("publishes a scheduled article once and preserves its unread state", () => {
    const first = publishMarketNews([], [deliveryWarning], 4);
    const second = publishMarketNews(first.news, [deliveryWarning], 4);

    expect(first.published).toHaveLength(1);
    expect(unreadMarketNewsCount(first.news)).toBe(1);
    expect(second.published).toHaveLength(0);
  });

  it("only applies pressure and an automated hold to the affected segment", () => {
    const { news } = publishMarketNews([], [deliveryWarning], 4);

    expect(riskAdjustmentForSegment(news, "delivery")).toBe(12);
    expect(riskAdjustmentForSegment(news, "workers")).toBe(0);
    expect(hasMarketAlertForSegment(news, "delivery")).toBe(true);
    expect(hasMarketAlertForSegment(news, "workers")).toBe(false);
  });

  it("lets a recovery article release a line from the earlier alert", () => {
    const recovery: MarketNewsDefinition = {
      ...deliveryWarning,
      id: "delivery-recovery",
      day: 8,
      phase: "recovery",
      severity: "watch",
      riskAdjustment: -12,
    };
    const warning = publishMarketNews([], [deliveryWarning, recovery], 4);
    const resolved = publishMarketNews(
      warning.news,
      [deliveryWarning, recovery],
      8,
    );

    expect(hasMarketAlertForSegment(resolved.news, "delivery")).toBe(false);
    expect(riskAdjustmentForSegment(resolved.news, "delivery")).toBe(0);
  });
});
