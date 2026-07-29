import { describe, expect, it } from "vitest";
import {
  initialMapDragGesture,
  updateMapDragGesture,
  wheelZoomFactor,
} from "./market-map-gesture.ts";

describe("market map drag gesture", () => {
  it("recognizes a slow drag from its cumulative path", () => {
    let gesture = initialMapDragGesture();
    gesture = updateMapDragGesture(gesture, { x: 1, y: 0 });
    gesture = updateMapDragGesture(gesture, { x: 1, y: 0 });
    gesture = updateMapDragGesture(gesture, { x: 1, y: 0 });

    expect(gesture.recognized).toBe(false);
    gesture = updateMapDragGesture(gesture, { x: 1, y: 0 });
    expect(gesture).toEqual({ distance: 4, recognized: true });
  });

  it("keeps a recognized drag latched", () => {
    const gesture = updateMapDragGesture(
      { distance: 5, recognized: true },
      { x: 0, y: 0 },
    );

    expect(gesture.recognized).toBe(true);
  });
});

describe("wheel zoom factor", () => {
  it("keeps one mouse notch to a comfortable step in either direction", () => {
    const zoomIn = wheelZoomFactor({ deltaY: -100 });
    const zoomOut = wheelZoomFactor({ deltaY: 100 });

    expect(zoomIn).toBeGreaterThan(1.1);
    expect(zoomIn).toBeLessThan(1.25);
    expect(zoomOut * zoomIn).toBeCloseTo(1, 10);
  });

  it("scales with the reported distance so a trackpad nudge stays a nudge", () => {
    const nudge = wheelZoomFactor({ deltaY: -4 });

    expect(nudge).toBeGreaterThan(1);
    expect(nudge).toBeLessThan(1.01);
    // Twenty trackpad events must not outrun a couple of mouse notches, which
    // is exactly what keying off the sign alone used to do.
    expect(nudge ** 20).toBeLessThan(wheelZoomFactor({ deltaY: -100 }) ** 2);
  });

  it("normalizes line and page deltas to pixels", () => {
    expect(wheelZoomFactor({ deltaY: -1, deltaMode: 1 })).toBeCloseTo(
      wheelZoomFactor({ deltaY: -16 }),
      10,
    );
    expect(wheelZoomFactor({ deltaY: -1, deltaMode: 2 })).toBe(
      wheelZoomFactor({ deltaY: -400 }),
    );
  });

  it("amplifies a trackpad pinch and caps a single hostile event", () => {
    expect(wheelZoomFactor({ deltaY: -4, ctrlKey: true })).toBeGreaterThan(
      wheelZoomFactor({ deltaY: -4 }),
    );
    expect(wheelZoomFactor({ deltaY: -100_000 })).toBe(
      wheelZoomFactor({ deltaY: -120 }),
    );
  });

  it("is inert for a zero or non-finite delta", () => {
    expect(wheelZoomFactor({ deltaY: 0 })).toBe(1);
    expect(wheelZoomFactor({ deltaY: Number.NaN })).toBe(1);
  });
});
