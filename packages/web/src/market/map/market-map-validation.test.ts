import { describe, expect, it } from "vitest";
import {
  METRO_REGION_MAP,
  NORTH_YARD_MAP,
  RIVERSIDE_MAP,
} from "./market-map-data.ts";
import { validateMarketMap } from "./market-map-validation.ts";

describe("market map validation", () => {
  it("reports structural authoring errors before rendering", () => {
    const map = RIVERSIDE_MAP;
    expect(validateMarketMap(map)).toEqual([]);
    expect(
      validateMarketMap({
        ...map,
        districts: [...map.districts, map.districts[0]!],
        lots: [
          ...map.lots,
          {
            ...map.lots[0]!,
            districtId: "missing-district",
            point: { x: -1, y: 0 },
          },
        ],
        edges: [...map.edges, map.edges[0]!],
        camera: { ...map.camera, initialZoom: map.camera.maxZoom + 1 },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate map district"),
        expect.stringContaining("Duplicate map location"),
        expect.stringContaining("Unknown district"),
        expect.stringContaining("Location outside map bounds"),
        expect.stringContaining("Duplicate map edge"),
        expect.stringContaining("camera zoom configuration"),
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
