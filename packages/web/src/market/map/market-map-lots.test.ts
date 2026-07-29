import { describe, expect, it } from "vitest";
import type {
  MarketDistrict,
  MarketMapDefinition,
  MarketMapNode,
} from "./market-map.ts";
import {
  allocateMarketLot,
  createDistrictLots,
  NODE_LOT_CLEARANCE,
  reserveLotsForNodes,
} from "./market-map-lots.ts";
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
    nodes: [],
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

describe("market map lots", () => {
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
          lot.point.x <= district.bounds.x + district.bounds.width &&
          lot.point.y >= district.bounds.y &&
          lot.point.y <= district.bounds.y + district.bounds.height,
      ),
    ).toBe(true);
  });

  it("clamps invalid grid inputs and oversized insets inside tiny districts", () => {
    const tinyDistrict: MarketDistrict = {
      ...district,
      id: "tiny",
      center: { x: 11, y: 21 },
      bounds: { x: 10, y: 20, width: 2, height: 2 },
    };

    expect(createDistrictLots(tinyDistrict, Number.NaN, 0, 20)).toEqual([
      expect.objectContaining({
        point: tinyDistrict.center,
      }),
    ]);
  });

  it("assigns only an empty lot and remains deterministic", () => {
    const map = testMap();
    const occupiedLocationIds = new Set([map.lots[0]!.id]);
    const first = allocateMarketLot(map, 17, { occupiedLocationIds });
    const second = allocateMarketLot(map, 17, { occupiedLocationIds });

    expect(first).toEqual(second);
    expect(first.lot?.id).not.toBe(map.lots[0]!.id);
  });

  it("reserves the lots a node footprint would collide with", () => {
    const lots = createDistrictLots(district, 3, 2);
    const nodes: MarketMapNode[] = [
      {
        id: "bank",
        kind: "bank",
        districtId: district.id,
        point: lots[0]!.point,
      },
    ];
    const reserved = reserveLotsForNodes(lots, nodes);

    expect(reserved[0]!.reserved).toBe(true);
    expect(reserved.filter((lot) => lot.reserved)).toHaveLength(1);
    // Distant lots are returned untouched rather than rewritten.
    expect(reserved.at(-1)).toBe(lots.at(-1));
  });

  it("never allocates a reserved lot", () => {
    const lots = createDistrictLots(district, 3, 2);
    const map: MarketMapDefinition = {
      ...testMap(),
      lots: reserveLotsForNodes(lots, [
        {
          id: "bank",
          kind: "bank",
          districtId: district.id,
          point: lots[0]!.point,
        },
      ]),
    };
    const taken = new Set<string>();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { lot } = allocateMarketLot(map, attempt * 7_919, {
        occupiedLocationIds: taken,
      });
      if (lot) taken.add(lot.id);
    }

    expect(taken.size).toBe(lots.length - 1);
    expect(taken.has(lots[0]!.id)).toBe(false);
  });

  it("keeps every authored map free of node and lot footprint overlap", () => {
    for (const map of [METRO_REGION_MAP, RIVERSIDE_MAP, NORTH_YARD_MAP]) {
      const collisions = map.lots.filter(
        (lot) =>
          !lot.reserved &&
          map.nodes.some(
            (node) =>
              Math.abs(node.point.x - lot.point.x) < NODE_LOT_CLEARANCE &&
              Math.abs(node.point.y - lot.point.y) < NODE_LOT_CLEARANCE,
          ),
      );

      expect({
        map: map.id,
        collisions: collisions.map((lot) => lot.id),
      }).toEqual({ map: map.id, collisions: [] });
    }
  });
});
