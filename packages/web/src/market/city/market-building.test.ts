import { describe, expect, it } from "vitest";
import { METRO_REGION_MAP } from "../map/market-map-data.ts";
import {
  buildingColorProgress,
  buildMarketBuildings,
  districtColorTarget,
} from "./market-building.ts";

describe("market building assembly", () => {
  it("creates an independent deterministic model for every open lot and the bank", () => {
    const first = buildMarketBuildings(METRO_REGION_MAP, 1962);
    const again = buildMarketBuildings(METRO_REGION_MAP, 1962);
    const openLots = METRO_REGION_MAP.lots.filter((lot) => !lot.reserved);

    expect(first).toEqual(again);
    expect(openLots.length).toBeLessThan(METRO_REGION_MAP.lots.length);
    expect(first).toHaveLength(openLots.length + 1);
    expect(new Set(first.map((building) => building.id)).size).toBe(
      first.length,
    );
    expect(first.every((building) => building.parts.length > 0)).toBe(true);
  });

  it("leaves the blocks the bank and lenders stand on empty", () => {
    const buildings = buildMarketBuildings(METRO_REGION_MAP, 1962);
    const reserved = new Set(
      METRO_REGION_MAP.lots.filter((lot) => lot.reserved).map((lot) => lot.id),
    );

    expect(reserved.size).toBeGreaterThan(0);
    expect(buildings.some((building) => reserved.has(building.id))).toBe(false);
  });

  it("keeps the city grayscale without sales and colors buildings sequentially", () => {
    expect(districtColorTarget(48, 0, 100)).toBe(0);
    const target = districtColorTarget(48, 1_200, 60);
    expect(target).toBeGreaterThan(1);
    expect(buildingColorProgress(0, target)).toBe(1);
    expect(buildingColorProgress(Math.ceil(target), target)).toBe(0);
  });

  it("grows monotonically with sales and trust and never exceeds the district", () => {
    const opening = districtColorTarget(12, 300, 30);
    const trusted = districtColorTarget(12, 300, 80);
    const largerBook = districtColorTarget(12, 2_000, 80);

    expect(trusted).toBeGreaterThan(opening);
    expect(largerBook).toBeGreaterThan(trusted);
    expect(districtColorTarget(12, 1_000_000, 100)).toBe(12);
  });
});
