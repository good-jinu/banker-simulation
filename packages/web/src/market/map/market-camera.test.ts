import { describe, expect, it } from "vitest";
import {
  initialMarketCamera,
  mapLod,
  panMarketCamera,
  projectMapPoint,
  zoomMarketCameraAt,
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

  it("holds the anchored ground point under the cursor while zooming", () => {
    const camera = initialMarketCamera(map.camera);
    const viewport = { width: 1_000, height: 600 };
    const before = { camera, viewport };
    // An off-center block the player points at, and the pixel it currently
    // occupies — that pixel is what the cursor is sitting on.
    const anchored = { x: 92, y: 17 };
    const anchor = projectMapPoint(map, before, anchored);

    const zoomedIn = zoomMarketCameraAt(map, before, camera.zoom * 1.8, anchor);
    const projectedAfter = projectMapPoint(
      map,
      { camera: zoomedIn, viewport },
      anchored,
    );

    expect(zoomedIn.zoom).toBeCloseTo(camera.zoom * 1.8, 5);
    expect(zoomedIn.center).not.toEqual(camera.center);
    expect(projectedAfter.x).toBeCloseTo(anchor.x, 5);
    expect(projectedAfter.y).toBeCloseTo(anchor.y, 5);
  });

  it("zooms about the viewport center when no anchor is given", () => {
    const camera = initialMarketCamera(map.camera);
    const projection = { camera, viewport: { width: 1_000, height: 600 } };

    expect(zoomMarketCameraAt(map, projection, 2)).toEqual({
      center: camera.center,
      zoom: 2,
    });
  });

  it("does not drift the camera when the zoom step is clamped away", () => {
    const camera = { center: { x: 60, y: 40 }, zoom: map.camera.maxZoom };
    const projection = { camera, viewport: { width: 1_000, height: 600 } };
    const next = zoomMarketCameraAt(map, projection, 99, { x: 900, y: 20 });

    expect(next.zoom).toBe(map.camera.maxZoom);
    expect(next.center).toEqual(camera.center);
  });

  it("uses authored LOD thresholds", () => {
    expect(mapLod(map, 0.8)).toBe("district");
    expect(mapLod(map, 1.1)).toBe("cluster");
    expect(mapLod(map, 2)).toBe("detail");
  });
});
