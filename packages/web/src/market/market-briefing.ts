import type { MarketNews } from "./market-news.ts";

/**
 * A full-stop interruption: the clock holds while the player reads it. Kept as
 * a queue rather than a single slot because a campaign day may publish more
 * than one article, and swallowing the second one would lose story.
 */
export type Briefing =
  { kind: "stage-intro" } | { kind: "news"; article: MarketNews };

/** Severity is the fallback art direction when an article names no image. */
const SEVERITY_IMAGES: Record<MarketNews["severity"], string> = {
  watch: "/assets/pop-art/atoms/evidence-card.svg",
  alert: "/assets/pop-art/atoms/warning-burst.svg",
  opportunity: "/assets/pop-art/atoms/goal-badge.svg",
};

export function newsBriefingImage(article: MarketNews): string {
  return article.image ?? SEVERITY_IMAGES[article.severity];
}

export function briefingKey(briefing: Briefing): string {
  return briefing.kind === "stage-intro"
    ? "stage-intro"
    : `news:${briefing.article.id}`;
}

/**
 * Appends a briefing for every unread article in the market wire.
 *
 * `handled` holds the key of every story ever enqueued — not just the ones
 * still waiting. Mutated in place with each new key so the caller's record
 * survives re-renders and a read article cannot be re-enqueued.
 *
 * Returns `queue` itself when nothing was published, so React can bail out.
 */
export function queueNewsBriefings(
  queue: Briefing[],
  news: readonly MarketNews[],
  handled: Set<string>,
): Briefing[] {
  const added: Briefing[] = [];
  for (const article of news) {
    if (article.read) continue;
    const briefing: Briefing = { kind: "news", article };
    const key = briefingKey(briefing);
    if (handled.has(key)) continue;
    handled.add(key);
    added.push(briefing);
  }
  return added.length === 0 ? queue : [...queue, ...added];
}
