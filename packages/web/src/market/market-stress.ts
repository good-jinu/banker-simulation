import type { MarketSegment } from "./market-segment.ts";

export type MarketStressPressure = {
  value: number;
  updatedDay: number;
};

export type MarketStressState = {
  districts: Record<string, MarketStressPressure>;
  segments: Partial<Record<MarketSegment, MarketStressPressure>>;
};

export type MarketStressRules = {
  districtIncrease: number;
  segmentIncrease: number;
  decayPerDay: number;
  maxPerExposure: number;
  maxRiskAdjustment: number;
};

export function emptyMarketStress(): MarketStressState {
  return { districts: {}, segments: {} };
}

function decayedPressure(
  pressure: MarketStressPressure,
  day: number,
  decayPerDay: number,
): MarketStressPressure | null {
  const elapsed = Math.max(0, day - pressure.updatedDay);
  const value = Math.max(0, pressure.value - elapsed * decayPerDay);
  return value <= 0 ? null : { value, updatedDay: day };
}

export function decayMarketStress(
  stress: MarketStressState,
  day: number,
  rules: MarketStressRules,
): MarketStressState {
  const districts: MarketStressState["districts"] = {};
  for (const [districtId, pressure] of Object.entries(stress.districts)) {
    const decayed = decayedPressure(pressure, day, rules.decayPerDay);
    if (decayed) districts[districtId] = decayed;
  }
  const segments: MarketStressState["segments"] = {};
  for (const [segment, pressure] of Object.entries(stress.segments) as Array<
    [MarketSegment, MarketStressPressure]
  >) {
    const decayed = decayedPressure(pressure, day, rules.decayPerDay);
    if (decayed) segments[segment] = decayed;
  }
  return { districts, segments };
}

export function addMarketDefaultStress(
  stress: MarketStressState,
  day: number,
  exposure: { districtId: string; segment?: MarketSegment },
  rules: MarketStressRules,
): MarketStressState {
  const districtValue = Math.min(
    rules.maxPerExposure,
    (stress.districts[exposure.districtId]?.value ?? 0) +
      rules.districtIncrease,
  );
  const segments = { ...stress.segments };
  if (exposure.segment) {
    segments[exposure.segment] = {
      value: Math.min(
        rules.maxPerExposure,
        (segments[exposure.segment]?.value ?? 0) + rules.segmentIncrease,
      ),
      updatedDay: day,
    };
  }
  return {
    districts: {
      ...stress.districts,
      [exposure.districtId]: { value: districtValue, updatedDay: day },
    },
    segments,
  };
}

export function marketRiskPressure(
  stress: MarketStressState,
  exposure: { districtId: string; segment?: MarketSegment },
  rules: MarketStressRules,
): number {
  const district = stress.districts[exposure.districtId]?.value ?? 0;
  const segment = exposure.segment
    ? (stress.segments[exposure.segment]?.value ?? 0)
    : 0;
  return Math.min(rules.maxRiskAdjustment, Math.round(district + segment));
}
