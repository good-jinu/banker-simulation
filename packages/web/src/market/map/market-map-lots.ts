import type { MarketSegment } from "../market-segment.ts";
import {
  marketDistrict,
  type MarketBuildingKind,
  type MarketBuildingWeight,
  type MarketDistrict,
  type MarketLocationRef,
  type MarketLot,
  type MarketMapDefinition,
  type MarketMapNode,
} from "./market-map.ts";

function hashText(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function weightedBuildingKind(
  mix: readonly MarketBuildingWeight[],
  key: string,
): MarketBuildingKind {
  const total = mix.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return "commercial";
  let roll = (hashText(key) / 0x1_0000_0000) * total;
  for (const item of mix) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item.kind;
  }
  return mix.at(-1)?.kind ?? "commercial";
}

function positiveGridSize(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

/**
 * Creates deterministic lot data inside a district's authored bounds.
 * The inset is clamped independently per axis so small districts cannot emit
 * lots beyond their own bounds.
 */
export function createDistrictLots(
  district: MarketDistrict,
  columns: number,
  rows: number,
  inset = 2.5,
): MarketLot[] {
  const safeColumns = positiveGridSize(columns);
  const safeRows = positiveGridSize(rows);
  const requestedInset = Number.isFinite(inset) ? Math.max(0, inset) : 0;
  const insetX = Math.min(
    requestedInset,
    Math.max(0, district.bounds.width / 2),
  );
  const insetY = Math.min(
    requestedInset,
    Math.max(0, district.bounds.height / 2),
  );
  const usableWidth = Math.max(0, district.bounds.width - insetX * 2);
  const usableHeight = Math.max(0, district.bounds.height - insetY * 2);
  const lots: MarketLot[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const id = `${district.id}-lot-${row + 1}-${column + 1}`;
      lots.push({
        id,
        districtId: district.id,
        point: {
          x:
            district.bounds.x +
            insetX +
            (usableWidth * (column + 0.5)) / safeColumns,
          y:
            district.bounds.y +
            insetY +
            (usableHeight * (row + 0.5)) / safeRows,
        },
        buildingKind: weightedBuildingKind(district.buildingMix, id),
      });
    }
  }
  return lots;
}

/**
 * Ordinary base plates are 4.15 map units wide and the bank's is 4.6, so two
 * footprints clear each other once their centers are this far apart on an axis.
 */
export const NODE_LOT_CLEARANCE = 4.4;

/**
 * Reserves every lot whose building footprint would collide with a map node.
 * The bank, products, and lenders own those blocks: nothing is drawn through
 * them, and no applicant is placed under their markers where the two would
 * overlap and swallow each other's clicks.
 *
 * Reserved lots stay in the map so the road grid still reads them.
 */
export function reserveLotsForNodes(
  lots: readonly MarketLot[],
  nodes: readonly MarketMapNode[],
  clearance = NODE_LOT_CLEARANCE,
): MarketLot[] {
  const safeClearance = Number.isFinite(clearance) ? Math.max(0, clearance) : 0;
  return lots.map((lot) => {
    const blocked = nodes.some(
      (node) =>
        Math.abs(node.point.x - lot.point.x) < safeClearance &&
        Math.abs(node.point.y - lot.point.y) < safeClearance,
    );
    return blocked && !lot.reserved ? { ...lot, reserved: true } : lot;
  });
}

export type LotAllocationOptions = {
  occupiedLocationIds: ReadonlySet<string>;
  preferredDistrictIds?: readonly string[];
  segment?: MarketSegment;
};

function nextAllocationSeed(seed: number): number {
  return (seed + 0x6d2b79f5) >>> 0;
}

/**
 * Finds an empty assignable lot without mutating the map. Preference filters
 * narrow the pool only when they leave at least one candidate.
 */
export function allocateMarketLot(
  map: MarketMapDefinition,
  seed: number,
  options: LotAllocationOptions,
): { lot: MarketLot | null; nextSeed: number } {
  const nextSeed = nextAllocationSeed(seed);
  let candidates = map.lots.filter(
    (lot) => !lot.reserved && !options.occupiedLocationIds.has(lot.id),
  );
  const preferredDistrictIds = options.preferredDistrictIds ?? [];
  if (preferredDistrictIds.length > 0) {
    const preferred = candidates.filter((lot) =>
      preferredDistrictIds.includes(lot.districtId),
    );
    if (preferred.length > 0) candidates = preferred;
  }
  if (options.segment) {
    const segment = options.segment;
    const matching = candidates.filter((lot) =>
      marketDistrict(map, lot.districtId)?.segments.includes(segment),
    );
    if (matching.length > 0) candidates = matching;
  }
  if (candidates.length === 0) return { lot: null, nextSeed };
  return {
    lot: candidates[nextSeed % candidates.length]!,
    nextSeed,
  };
}

export function occupiedMarketLocations(
  entities: readonly MarketLocationRef[],
): Set<string> {
  return new Set(entities.map((entity) => entity.locationId));
}
