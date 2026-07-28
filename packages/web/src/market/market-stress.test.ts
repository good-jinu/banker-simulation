import { describe, expect, it } from "vitest";
import {
  addMarketDefaultStress,
  decayMarketStress,
  emptyMarketStress,
  marketRiskPressure,
  type MarketStressRules,
} from "./market-stress.ts";

const rules: MarketStressRules = {
  districtIncrease: 7,
  segmentIncrease: 9,
  decayPerDay: 2,
  maxPerExposure: 18,
  maxRiskAdjustment: 20,
};

describe("market stress", () => {
  it("adds bounded pressure to both exposure groups", () => {
    let stress = emptyMarketStress();
    for (let count = 0; count < 4; count += 1) {
      stress = addMarketDefaultStress(
        stress,
        3,
        { districtId: "harbor", segment: "delivery" },
        rules,
      );
    }
    expect(stress.districts.harbor?.value).toBe(18);
    expect(stress.segments.delivery?.value).toBe(18);
    expect(
      marketRiskPressure(
        stress,
        { districtId: "harbor", segment: "delivery" },
        rules,
      ),
    ).toBe(20);
  });

  it("decays by elapsed days and removes exhausted pressure", () => {
    const stressed = addMarketDefaultStress(
      emptyMarketStress(),
      2,
      { districtId: "harbor", segment: "delivery" },
      rules,
    );
    const decayed = decayMarketStress(stressed, 5, rules);
    const exhausted = decayMarketStress(decayed, 12, rules);

    expect(decayed.districts.harbor?.value).toBe(1);
    expect(decayed.segments.delivery?.value).toBe(3);
    expect(exhausted).toEqual(emptyMarketStress());
  });
});
