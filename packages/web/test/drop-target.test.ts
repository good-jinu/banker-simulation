import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DROP_RANGE_PX,
  nearestDropTarget,
} from "../src/market/drop-target.ts";

// Spec: a released drag lands on the nearest contract within DROP_RANGE_PX
// of the release point, or nowhere (the stage snaps the node back).

test("no candidates yields no target", () => {
  assert.equal(nearestDropTarget(10, 10, []), null);
});

test("a candidate outside DROP_RANGE_PX is not a target", () => {
  const candidates = [{ id: "contract-1", x: 0, y: DROP_RANGE_PX + 1 }];
  assert.equal(nearestDropTarget(0, 0, candidates), null);
});

test("a candidate exactly at DROP_RANGE_PX is still a target", () => {
  const candidates = [{ id: "contract-1", x: DROP_RANGE_PX, y: 0 }];
  assert.equal(nearestDropTarget(0, 0, candidates), "contract-1");
});

test("the nearest of several in-range candidates wins", () => {
  const candidates = [
    { id: "far", x: 30, y: 0 },
    { id: "near", x: 10, y: 0 },
    { id: "mid", x: 20, y: 0 },
  ];
  assert.equal(nearestDropTarget(0, 0, candidates), "near");
});

test("distance is euclidean, not per-axis", () => {
  // 45x + 45y is ~63.6px away: inside both axis ranges but outside the radius.
  const candidates = [{ id: "diagonal", x: 45, y: 45 }];
  assert.equal(nearestDropTarget(0, 0, candidates), null);
});

test("an exact-distance tie keeps the first candidate", () => {
  const candidates = [
    { id: "left", x: -10, y: 0 },
    { id: "right", x: 10, y: 0 },
  ];
  assert.equal(nearestDropTarget(0, 0, candidates), "left");
});
