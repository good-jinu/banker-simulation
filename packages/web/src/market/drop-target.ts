/**
 * Drop resolution for the open-market map — the spec for where a dragged
 * demand node lands: on the nearest contract within DROP_RANGE_PX of the
 * release point, or nowhere (the node snaps back).  Kept free of Pixi so
 * the rule is unit-testable; `market-stage.ts` feeds it node positions.
 */
export const DROP_RANGE_PX = 56;

export interface DropCandidate {
  id: string;
  x: number;
  y: number;
}

/** Nearest candidate within range of (x, y), or null. Ties keep the first. */
export function nearestDropTarget(
  x: number,
  y: number,
  candidates: Iterable<DropCandidate>,
  rangePx: number = DROP_RANGE_PX,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance > rangePx || distance >= bestDistance) continue;
    bestId = candidate.id;
    bestDistance = distance;
  }
  return bestId;
}
