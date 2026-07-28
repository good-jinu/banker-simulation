import { describe, expect, it } from "vitest";
import {
  initialMarketCamera,
  mapLod,
  panMarketCamera,
  projectMapPoint,
} from "./market-camera.ts";
import type { MarketMapDefinition } from "./market-map.ts";

const map: MarketMapDefinition = {
  id: "camera-test",
  size: { width: 120, height: 80 },
  districts: [],
  lots: [],
  nodes: [],
  edges: [],
  camera: {
    initialCenter: { x: 60, y: 40 },
    initialZoom: 1,
    minZoom: 0.5,
    maxZoom: 3,
    clusterZoom: 1.1,
    detailZoom: 2,
    baseViewSize: 100,
  },
  detailedNodeLimit: { desktop: 24, mobile: 12 },
};

describe("market camera", () => {
  it("keeps the camera center fixed at the viewport center", () => {
    const camera = initialMarketCamera(map.camera);
    expect(
      projectMapPoint(
        map,
        { camera, viewport: { width: 1_000, height: 600 } },
        camera.center,
      ),
    ).toEqual({ x: 500, y: 300 });
  });

  it("moves projected content with a pointer drag", () => {
    const camera = initialMarketCamera(map.camera);
    const projection = {
      camera,
      viewport: { width: 1_000, height: 600 },
    };
    const next = panMarketCamera(map, projection, { x: 80, y: -45 });
    const movedCenter = projectMapPoint(
      map,
      { ...projection, camera: next },
      camera.center,
    );

    expect(movedCenter.x).toBeCloseTo(580, 5);
    expect(movedCenter.y).toBeCloseTo(255, 5);
  });

  it("uses authored LOD thresholds", () => {
    expect(mapLod(map, 0.8)).toBe("district");
    expect(mapLod(map, 1.1)).toBe("cluster");
    expect(mapLod(map, 2)).toBe("detail");
  });
});
