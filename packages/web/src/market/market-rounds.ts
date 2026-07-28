import type { LocalText } from "../i18n/local-text.ts";
import type { MarketSegment } from "./market-segment.ts";

export type MarketRound = {
  id: string;
  startsDay: number;
  spawnEveryDays: number;
  applicantsPerSpawn: number;
  amountMultiplier: number;
  termMultiplier: number;
  /** Higher values make the authored district and segment weights more peaked. */
  concentration: number;
  districtDemand: Readonly<Record<string, number>>;
  segmentDemand: Partial<Readonly<Record<MarketSegment, number>>>;
  briefing: {
    title: LocalText;
    body: LocalText;
    action: LocalText;
    severity: "watch" | "alert" | "opportunity";
  };
};

export function roundForDay(
  rounds: readonly MarketRound[],
  day: number,
): MarketRound {
  const ordered = [...rounds].sort(
    (first, second) => first.startsDay - second.startsDay,
  );
  return (
    [...ordered].reverse().find((round) => day >= round.startsDay) ??
    ordered[0]!
  );
}

export function isRoundTransition(
  rounds: readonly MarketRound[],
  previousDay: number,
  day: number,
): boolean {
  return roundForDay(rounds, previousDay).id !== roundForDay(rounds, day).id;
}

export function scaledRoundAmount(amount: number, round: MarketRound): number {
  return Math.max(10, Math.round((amount * round.amountMultiplier) / 10) * 10);
}

export function scaledRoundTerm(term: number, round: MarketRound): number {
  return Math.max(1, Math.round(term * round.termMultiplier));
}

export function weightedRoundChoice(
  weights: Readonly<Record<string, number>>,
  concentration: number,
  roll: number,
): string | null {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return null;
  const exponent = Math.max(0.25, concentration);
  const concentrated = entries.map(
    ([id, weight]) => [id, Math.pow(weight, exponent)] as const,
  );
  const total = concentrated.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const [id, weight] of concentrated) {
    cursor -= weight;
    if (cursor < 0) return id;
  }
  return concentrated.at(-1)?.[0] ?? null;
}
