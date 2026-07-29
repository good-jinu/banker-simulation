import type { MapPoint } from "./market-map.ts";

export type MapDragGesture = {
  distance: number;
  recognized: boolean;
};

export function initialMapDragGesture(): MapDragGesture {
  return { distance: 0, recognized: false };
}

/**
 * Accumulates the full gesture path so slow pointer movement still counts as
 * a drag even when no individual pointer event crosses the threshold.
 */
export function updateMapDragGesture(
  gesture: MapDragGesture,
  delta: MapPoint,
  threshold = 4,
): MapDragGesture {
  const distance =
    gesture.distance +
    Math.hypot(
      Number.isFinite(delta.x) ? delta.x : 0,
      Number.isFinite(delta.y) ? delta.y : 0,
    );
  return {
    distance,
    recognized: gesture.recognized || distance >= Math.max(0, threshold),
  };
}

/** Firefox reports lines or pages instead of pixels; normalize to pixels. */
const WHEEL_PIXELS_PER_LINE = 16;
const WHEEL_PIXELS_PER_PAGE = 400;
/** One mouse notch is ~100px, which lands near a comfortable 1.16x step. */
const ZOOM_EXPONENT_PER_PIXEL = 0.0015;
/** Caps a single hostile event without capping a sustained scroll. */
const WHEEL_PIXEL_LIMIT = 120;
/** A trackpad pinch arrives as a ctrl-held wheel with much smaller deltas. */
const PINCH_WHEEL_GAIN = 5;

export type WheelZoomInput = {
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
};

/**
 * Multiplier for one wheel event, scaled by how far the wheel actually
 * reported. Keying only off the sign makes a trackpad — which streams dozens of
 * sub-10px events per second — cross the entire zoom range in a fraction of a
 * second, while a mouse notch moves one step.
 */
export function wheelZoomFactor(event: WheelZoomInput): number {
  const perUnit =
    event.deltaMode === 1
      ? WHEEL_PIXELS_PER_LINE
      : event.deltaMode === 2
        ? WHEEL_PIXELS_PER_PAGE
        : 1;
  const pixels =
    event.deltaY * perUnit * (event.ctrlKey ? PINCH_WHEEL_GAIN : 1);
  if (!Number.isFinite(pixels) || pixels === 0) return 1;
  const limited = Math.max(
    -WHEEL_PIXEL_LIMIT,
    Math.min(WHEEL_PIXEL_LIMIT, pixels),
  );
  return Math.exp(-limited * ZOOM_EXPONENT_PER_PIXEL);
}
