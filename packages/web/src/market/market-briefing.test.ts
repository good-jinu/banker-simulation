import { describe, expect, it } from "vitest";
import {
  briefingKey,
  newsBriefingImage,
  queueNewsBriefings,
  type Briefing,
} from "./market-briefing.ts";
import type { MarketNews } from "./market-news.ts";
import type { MarketEvent } from "./market-world.ts";

function article(id: string, overrides: Partial<MarketNews> = {}): MarketNews {
  return {
    id,
    threadId: "thread",
    day: 3,
    phase: "signal",
    severity: "watch",
    title: { en: id, ko: id },
    body: { en: "body", ko: "본문" },
    action: { en: "action", ko: "조치" },
    affectedSegments: ["delivery"],
    riskAdjustment: 0,
    publishedDay: 3,
    read: false,
    ...overrides,
  };
}

function newsEvent(news: MarketNews): MarketEvent {
  return { type: "market-news", news };
}

describe("market briefings", () => {
  it("queues one briefing per published article, in publication order", () => {
    const queued = queueNewsBriefings(
      [],
      [newsEvent(article("first")), newsEvent(article("second"))],
      new Set(),
    );

    expect(queued.map(briefingKey)).toEqual(["news:first", "news:second"]);
  });

  it("ignores articles already waiting so a re-render cannot duplicate a story", () => {
    const handled = new Set<string>();
    const event = newsEvent(article("first"));
    const first = queueNewsBriefings([], [event], handled);
    const again = queueNewsBriefings(first, [event], handled);

    expect(again.map(briefingKey)).toEqual(["news:first"]);
  });

  it("does not resurrect a story that was queued and then dismissed", () => {
    const handled = new Set<string>();
    const event = newsEvent(article("first"));
    const queued = queueNewsBriefings([], [event], handled);
    const dismissed = queued.slice(1);

    // The publishing event is still in world.events at this point.
    expect(queueNewsBriefings(dismissed, [event], handled)).toEqual([]);
  });

  it("keeps briefings unrelated to news untouched, without a new array", () => {
    const intro: Briefing = { kind: "stage-intro" };
    const queue = [intro];
    const queued = queueNewsBriefings(
      queue,
      [{ type: "repayment", amount: 100 }],
      new Set(),
    );

    expect(queued).toBe(queue);
  });

  it("falls back to severity artwork and lets an article override it", () => {
    expect(newsBriefingImage(article("a", { severity: "alert" }))).toContain(
      "warning-burst",
    );
    expect(newsBriefingImage(article("b", { image: "/custom.png" }))).toBe(
      "/custom.png",
    );
  });
});
