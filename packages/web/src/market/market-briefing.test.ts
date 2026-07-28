import { describe, expect, it } from "vitest";
import {
  briefingKey,
  newsBriefingImage,
  queueNewsBriefings,
  type Briefing,
} from "./market-briefing.ts";
import type { MarketNews } from "./market-news.ts";

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

describe("market briefings", () => {
  it("queues one briefing per published article, in publication order", () => {
    const queued = queueNewsBriefings(
      [],
      [article("first"), article("second")],
      new Set(),
    );

    expect(queued.map(briefingKey)).toEqual(["news:first", "news:second"]);
  });

  it("ignores articles already waiting so a re-render cannot duplicate a story", () => {
    const handled = new Set<string>();
    const news = [article("first")];
    const first = queueNewsBriefings([], news, handled);
    const again = queueNewsBriefings(first, news, handled);

    expect(again.map(briefingKey)).toEqual(["news:first"]);
  });

  it("does not resurrect a story that was queued and then dismissed", () => {
    const handled = new Set<string>();
    const news = [article("first")];
    const queued = queueNewsBriefings([], news, handled);
    const dismissed = queued.slice(1);

    expect(queueNewsBriefings(dismissed, news, handled)).toEqual([]);
  });

  it("does not queue articles already read in the market wire", () => {
    expect(
      queueNewsBriefings([], [article("read", { read: true })], new Set()),
    ).toEqual([]);
  });

  it("keeps the queue untouched when there is no unread news", () => {
    const intro: Briefing = { kind: "stage-intro" };
    const queue = [intro];
    const queued = queueNewsBriefings(
      queue,
      [article("read", { read: true })],
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
