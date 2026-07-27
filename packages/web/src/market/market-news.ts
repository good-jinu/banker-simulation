import type { LocalText } from "../i18n/local-text.ts";
import type { MarketSegment } from "./market-world.ts";

/** A campaign-authored market story. Numbers affect simulation only; UI stays qualitative. */
export type MarketNewsDefinition = {
  id: string;
  threadId: string;
  day: number;
  phase: "signal" | "warning" | "outcome" | "recovery";
  severity: "watch" | "alert" | "opportunity";
  title: LocalText;
  body: LocalText;
  action: LocalText;
  affectedSegments: readonly MarketSegment[];
  /** Applied to affected customers' hidden default-risk estimate. */
  riskAdjustment: number;
};

export type MarketNews = MarketNewsDefinition & {
  publishedDay: number;
  read: boolean;
};

/** Publishes each scheduled article exactly once as the market day begins. */
export function publishMarketNews(
  news: readonly MarketNews[],
  schedule: readonly MarketNewsDefinition[],
  day: number,
): { news: MarketNews[]; published: MarketNews[] } {
  const published = schedule
    .filter(
      (article) =>
        article.day === day &&
        !news.some((publishedArticle) => publishedArticle.id === article.id),
    )
    .map((article) => ({ ...article, publishedDay: day, read: false }));
  return { news: [...news, ...published], published };
}

/** Hidden simulation pressure accumulated from the active market story. */
export function riskAdjustmentForSegment(
  news: readonly MarketNews[],
  segment: MarketSegment | undefined,
): number {
  if (!segment) return 0;
  return news.reduce(
    (total, article) =>
      article.affectedSegments.includes(segment)
        ? total + article.riskAdjustment
        : total,
    0,
  );
}

/** Alerts are the only news that may automatically hold a guarded line. */
export function hasMarketAlertForSegment(
  news: readonly MarketNews[],
  segment: MarketSegment | undefined,
): boolean {
  if (!segment) return false;
  const latestByThread = new Map<string, MarketNews>();
  for (const article of news) {
    if (article.affectedSegments.includes(segment))
      latestByThread.set(article.threadId, article);
  }
  return [...latestByThread.values()].some(
    (article) => article.severity === "alert" && article.riskAdjustment > 0,
  );
}

export function unreadMarketNewsCount(news: readonly MarketNews[]): number {
  return news.filter((article) => !article.read).length;
}
