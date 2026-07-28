import { describe, expect, it } from "vitest";
import {
  allocateMarketLot,
  createDistrictLots,
  marketPoint,
  validateMarketMap,
  type MarketDistrict,
  type MarketMapDefinition,
} from "./market-map.ts";
import {
  METRO_REGION_MAP,
  NORTH_YARD_MAP,
  RIVERSIDE_MAP,
} from "./market-map-data.ts";

const district: MarketDistrict = {
  id: "harbor",
  name: { en: "Harbor", ko: "항만" },
  center: { x: 20, y: 15 },
  bounds: { x: 0, y: 0, width: 40, height: 30 },
  segments: ["delivery", "small-business"],
  riskTags: ["supply-chain"],
  buildingMix: [
    { kind: "logistics", weight: 3 },
    { kind: "commercial", weight: 1 },
  ],
  demandWeight: 1,
};

function testMap(): MarketMapDefinition {
  return {
    id: "test-map",
    size: { width: 40, height: 30 },
    districts: [district],
    lots: createDistrictLots(district, 3, 2),
    nodes: [
      {
        id: "bank",
        kind: "bank",
        districtId: district.id,
        point: district.center,
      },
    ],
    edges: [],
    camera: {
      initialCenter: district.center,
      initialZoom: 1,
      minZoom: 0.5,
      maxZoom: 3,
      clusterZoom: 1,
      detailZoom: 2,
      baseViewSize: 40,
    },
    detailedNodeLimit: { desktop: 24, mobile: 12 },
  };
}

describe("market map", () => {
  it("creates stable lots within the authored district", () => {
    const first = createDistrictLots(district, 3, 2);
    const second = createDistrictLots(district, 3, 2);

    expect(first).toEqual(second);
    expect(first).toHaveLength(6);
    expect(first.every((lot) => lot.districtId === district.id)).toBe(true);
    expect(
      first.every(
        (lot) =>
          lot.point.x >= district.bounds.x &&
          lot.point.x <= district.bounds.x + district.bounds.width,
      ),
    ).toBe(true);
  });

  it("assigns only an empty lot and remains deterministic", () => {
    const map = testMap();
    const occupiedLocationIds = new Set([map.lots[0]!.id]);
    const first = allocateMarketLot(map, 17, { occupiedLocationIds });
    const second = allocateMarketLot(map, 17, { occupiedLocationIds });

    expect(first).toEqual(second);
    expect(first.lot?.id).not.toBe(map.lots[0]!.id);
  });

  it("resolves static and lot coordinates from one location table", () => {
    const map = testMap();
    expect(marketPoint(map, "bank")).toEqual(district.center);
    expect(marketPoint(map, map.lots[0]!.id)).toEqual(map.lots[0]!.point);
  });

  it("reports invalid data instead of hiding it in the renderer", () => {
    const map = testMap();
    expect(validateMarketMap(map)).toEqual([]);
    expect(
      validateMarketMap({
        ...map,
        lots: [
          ...map.lots,
          { ...map.lots[0]!, districtId: "missing-district" },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate map location"),
        expect.stringContaining("Unknown district"),
      ]),
    );
  });

  it("ships valid campaign maps at the selected large-map budget", () => {
    expect(validateMarketMap(RIVERSIDE_MAP)).toEqual([]);
    expect(validateMarketMap(NORTH_YARD_MAP)).toEqual([]);
    expect(validateMarketMap(METRO_REGION_MAP)).toEqual([]);
    expect(METRO_REGION_MAP.lots).toHaveLength(288);
    expect(
      METRO_REGION_MAP.lots.length +
        METRO_REGION_MAP.nodes.length +
        METRO_REGION_MAP.districts.length,
    ).toBe(300);
    expect(METRO_REGION_MAP.detailedNodeLimit).toEqual({
      desktop: 24,
      mobile: 12,
    });
  });
});
