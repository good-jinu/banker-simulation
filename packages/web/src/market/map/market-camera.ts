import type {
  MapPoint,
  MarketMapCameraConfig,
  MarketMapDefinition,
} from "./market-map.ts";

export type MarketCamera = {
  center: MapPoint;
  zoom: number;
};

export type MapProjection = {
  camera: MarketCamera;
  viewport: { width: number; height: number };
};

const CAMERA_OFFSET = { x: 92, y: 112, z: 92 };
const offsetLength = Math.hypot(
  CAMERA_OFFSET.x,
  CAMERA_OFFSET.y,
  CAMERA_OFFSET.z,
);
const forward = {
  x: -CAMERA_OFFSET.x / offsetLength,
  y: -CAMERA_OFFSET.y / offsetLength,
  z: -CAMERA_OFFSET.z / offsetLength,
};
const rightLength = Math.hypot(-forward.z, forward.x);
export const CAMERA_RIGHT = {
  x: -forward.z / rightLength,
  y: 0,
  z: forward.x / rightLength,
};
export const CAMERA_UP = {
  x: CAMERA_RIGHT.y * forward.z - CAMERA_RIGHT.z * forward.y,
  y: CAMERA_RIGHT.z * forward.x - CAMERA_RIGHT.x * forward.z,
  z: CAMERA_RIGHT.x * forward.y - CAMERA_RIGHT.y * forward.x,
};
export const CAMERA_DIRECTION = {
  x: CAMERA_OFFSET.x / offsetLength,
  y: CAMERA_OFFSET.y / offsetLength,
  z: CAMERA_OFFSET.z / offsetLength,
};

export function initialMarketCamera(
  config: MarketMapCameraConfig,
): MarketCamera {
  return {
    center: { ...config.initialCenter },
    zoom: config.initialZoom,
  };
}

export function clampMarketCamera(
  map: MarketMapDefinition,
  camera: MarketCamera,
): MarketCamera {
  return {
    center: {
      x: Math.min(map.size.width, Math.max(0, camera.center.x)),
      y: Math.min(map.size.height, Math.max(0, camera.center.y)),
    },
    zoom: Math.min(
      map.camera.maxZoom,
      Math.max(map.camera.minZoom, camera.zoom),
    ),
  };
}

/** Projects a ground-plane map point with the same orthographic basis as Three.js. */
export function projectMapPoint(
  map: MarketMapDefinition,
  projection: MapProjection,
  point: MapPoint,
): MapPoint {
  const height = Math.max(1, projection.viewport.height);
  const width = Math.max(1, projection.viewport.width);
  const aspect = width / height;
  const visibleHeight = map.camera.baseViewSize / projection.camera.zoom;
  const visibleWidth = visibleHeight * aspect;
  const relativeX = point.x - projection.camera.center.x;
  const relativeZ = point.y - projection.camera.center.y;
  const cameraX = relativeX * CAMERA_RIGHT.x + relativeZ * CAMERA_RIGHT.z;
  const cameraY = relativeX * CAMERA_UP.x + relativeZ * CAMERA_UP.z;
  return {
    x: ((cameraX / (visibleWidth / 2) + 1) * width) / 2,
    y: ((1 - cameraY / (visibleHeight / 2)) * height) / 2,
  };
}

/**
 * Inverts the projection for a screen-pixel offset, returning the ground-plane
 * vector that spans it. Null when the basis is degenerate.
 */
function groundOffsetForPixels(
  map: MarketMapDefinition,
  projection: MapProjection,
  offsetPixels: MapPoint,
): MapPoint | null {
  if (!Number.isFinite(offsetPixels.x) || !Number.isFinite(offsetPixels.y))
    return null;
  const pixelsPerUnit =
    Math.max(1, projection.viewport.height) /
    (map.camera.baseViewSize / projection.camera.zoom);
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return null;
  const screenX = offsetPixels.x / pixelsPerUnit;
  const screenY = offsetPixels.y / pixelsPerUnit;
  const a = CAMERA_RIGHT.x;
  const b = CAMERA_RIGHT.z;
  const c = -CAMERA_UP.x;
  const d = -CAMERA_UP.z;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.0001) return null;
  return {
    x: (d * screenX - b * screenY) / determinant,
    y: (-c * screenX + a * screenY) / determinant,
  };
}

/** Converts a drag in pixels to a ground-plane camera movement. */
export function panMarketCamera(
  map: MarketMapDefinition,
  projection: MapProjection,
  deltaPixels: MapPoint,
): MarketCamera {
  const ground = groundOffsetForPixels(map, projection, deltaPixels);
  if (!ground) return projection.camera;
  return clampMarketCamera(map, {
    ...projection.camera,
    center: {
      x: projection.camera.center.x - ground.x,
      y: projection.camera.center.y - ground.y,
    },
  });
}

/**
 * Zooms while holding the ground point under `anchorPixels` in place, so the
 * district beneath the cursor or the pinch midpoint stays where the player is
 * looking. Without an anchor the zoom stays centered on the viewport, which is
 * what the on-screen zoom buttons want.
 */
export function zoomMarketCameraAt(
  map: MarketMapDefinition,
  projection: MapProjection,
  nextZoom: number,
  anchorPixels?: MapPoint,
): MarketCamera {
  const camera = projection.camera;
  const zoomed = clampMarketCamera(map, { ...camera, zoom: nextZoom });
  if (!anchorPixels) return zoomed;
  // Clamping can swallow the whole step at a zoom limit; the anchor must not
  // drift the camera when the zoom itself did not change.
  const ratio = camera.zoom / zoomed.zoom;
  if (!Number.isFinite(ratio) || ratio === 1) return zoomed;
  const offset = groundOffsetForPixels(map, projection, {
    x: anchorPixels.x - projection.viewport.width / 2,
    y: anchorPixels.y - projection.viewport.height / 2,
  });
  if (!offset) return zoomed;
  return clampMarketCamera(map, {
    zoom: zoomed.zoom,
    center: {
      x: camera.center.x + offset.x * (1 - ratio),
      y: camera.center.y + offset.y * (1 - ratio),
    },
  });
}

export function mapLod(
  map: MarketMapDefinition,
  zoom: number,
): "district" | "cluster" | "detail" {
  if (zoom >= map.camera.detailZoom) return "detail";
  if (zoom >= map.camera.clusterZoom) return "cluster";
  return "district";
}

export function isProjectedPointVisible(
  projection: MapProjection,
  point: MapPoint,
  margin = 48,
): boolean {
  return (
    point.x >= -margin &&
    point.x <= projection.viewport.width + margin &&
    point.y >= -margin &&
    point.y <= projection.viewport.height + margin
  );
}
