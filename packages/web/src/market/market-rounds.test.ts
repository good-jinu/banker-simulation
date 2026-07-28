import { describe, expect, it } from "vitest";
import {
  isRoundTransition,
  roundForDay,
  scaledRoundAmount,
  scaledRoundTerm,
  weightedRoundChoice,
  type MarketRound,
} from "./market-rounds.ts";

const copy = {
  title: { en: "Round", ko: "라운드" },
  body: { en: "Pressure rises.", ko: "압박이 커집니다." },
  action: { en: "Diversify.", ko: "분산하세요." },
  severity: "watch" as const,
};
const rounds: readonly MarketRound[] = [
  {
    id: "opening",
    startsDay: 0,
    spawnEveryDays: 3,
    applicantsPerSpawn: 1,
    amountMultiplier: 1,
    termMultiplier: 1,
    concentration: 1,
    districtDemand: { north: 1, south: 1 },
    segmentDemand: {},
    briefing: copy,
  },
  {
    id: "growth",
    startsDay: 10,
    spawnEveryDays: 1,
    applicantsPerSpawn: 3,
    amountMultiplier: 1.5,
    termMultiplier: 1.2,
    concentration: 2,
    districtDemand: { north: 3, south: 1 },
    segmentDemand: { technology: 3 },
    briefing: copy,
  },
];

describe("market rounds", () => {
  it("selects a round and detects only its boundary", () => {
    expect(roundForDay(rounds, 9).id).toBe("opening");
    expect(roundForDay(rounds, 10).id).toBe("growth");
    expect(isRoundTransition(rounds, 9, 10)).toBe(true);
    expect(isRoundTransition(rounds, 10, 11)).toBe(false);
  });

  it("scales contracts in stable monetary increments", () => {
    expect(scaledRoundAmount(430, rounds[1]!)).toBe(650);
    expect(scaledRoundTerm(7, rounds[1]!)).toBe(8);
  });

  it("makes concentration affect weighted demand, not determinism", () => {
    expect(weightedRoundChoice({ north: 3, south: 1 }, 2, 0.5)).toBe("north");
    expect(weightedRoundChoice({ north: 3, south: 1 }, 2, 0.99)).toBe("south");
  });
});
