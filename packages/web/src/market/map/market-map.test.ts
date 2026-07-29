import { describe, expect, it } from "vitest";
import {
  marketPoint,
  type MarketDistrict,
  type MarketMapDefinition,
} from "./market-map.ts";
import { createDistrictLots } from "./market-map-lots.ts";

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
  it("resolves static and lot coordinates from one location table", () => {
    const map = testMap();
    expect(marketPoint(map, "bank")).toEqual(district.center);
    expect(marketPoint(map, map.lots[0]!.id)).toEqual(map.lots[0]!.point);
  });
});
