import type { LocalText } from "../../i18n/local-text.ts";
import type { MarketSegment } from "../market-segment.ts";

export type MapPoint = { x: number; y: number };
export type MapSize = { width: number; height: number };

export type MarketBuildingKind =
  | "bank"
  | "commercial"
  | "logistics"
  | "residential"
  | "technology"
  | "budget"
  | "public"
  | "park";

export type MarketRiskTag =
  | "cyclical"
  | "supply-chain"
  | "rent-pressure"
  | "income-volatility"
  | "startup-heavy"
  | "low-reserves"
  | "stable-employment";

export type MarketBuildingWeight = {
  kind: MarketBuildingKind;
  weight: number;
};

export type MarketDistrict = {
  id: string;
  name: LocalText;
  center: MapPoint;
  bounds: MapPoint & MapSize;
  segments: readonly MarketSegment[];
  riskTags: readonly MarketRiskTag[];
  buildingMix: readonly MarketBuildingWeight[];
  /** Relative applicant demand before the active round modifies it. */
  demandWeight: number;
};

export type MarketLot = {
  id: string;
  districtId: string;
  point: MapPoint;
  buildingKind: MarketBuildingKind;
  /** Reserved lots host the bank, products, or lenders and are not assigned. */
  reserved?: boolean;
};

export type MarketMapNodeKind =
  "bank" | "loan-product" | "deposit-product" | "funding" | "landmark";

export type MarketMapNode = {
  id: string;
  kind: MarketMapNodeKind;
  districtId: string;
  point: MapPoint;
};

export type MarketMapEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: "district-adjacency" | "bank-flow";
};

export type MarketMapCameraConfig = {
  initialCenter: MapPoint;
  initialZoom: number;
  minZoom: number;
  maxZoom: number;
  clusterZoom: number;
  detailZoom: number;
  /** Orthographic vertical span at zoom 1. */
  baseViewSize: number;
};

export type MarketMapDefinition = {
  id: string;
  size: MapSize;
  districts: readonly MarketDistrict[];
  lots: readonly MarketLot[];
  nodes: readonly MarketMapNode[];
  edges: readonly MarketMapEdge[];
  camera: MarketMapCameraConfig;
  detailedNodeLimit: { desktop: number; mobile: number };
};

export type MarketLocationRef = {
  locationId: string;
  districtId: string;
};

export type MarketMapLocation = MarketLot | MarketMapNode;

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

/** Creates deterministic lot data inside a district's authored bounds. */
export function createDistrictLots(
  district: MarketDistrict,
  columns: number,
  rows: number,
  inset = 2.5,
): MarketLot[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const usableWidth = Math.max(0, district.bounds.width - inset * 2);
  const usableHeight = Math.max(0, district.bounds.height - inset * 2);
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
            inset +
            (usableWidth * (column + 0.5)) / safeColumns,
          y:
            district.bounds.y + inset + (usableHeight * (row + 0.5)) / safeRows,
        },
        buildingKind: weightedBuildingKind(district.buildingMix, id),
      });
    }
  }
  return lots;
}

export function marketLocation(
  map: MarketMapDefinition,
  locationId: string,
): MarketMapLocation | undefined {
  return (
    map.lots.find((lot) => lot.id === locationId) ??
    map.nodes.find((node) => node.id === locationId)
  );
}

export function marketPoint(
  map: MarketMapDefinition,
  locationId: string,
): MapPoint {
  return (
    marketLocation(map, locationId)?.point ??
    map.nodes.find((node) => node.kind === "bank")?.point ??
    map.camera.initialCenter
  );
}

export function marketDistrict(
  map: MarketMapDefinition,
  districtId: string,
): MarketDistrict | undefined {
  return map.districts.find((district) => district.id === districtId);
}

export function mapNodeForKind(
  map: MarketMapDefinition,
  kind: MarketMapNodeKind,
  index = 0,
): MarketMapNode | undefined {
  return map.nodes.filter((node) => node.kind === kind)[index];
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
    const matching = candidates.filter((lot) =>
      marketDistrict(map, lot.districtId)?.segments.includes(options.segment!),
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

export function validateMarketMap(map: MarketMapDefinition): string[] {
  const errors: string[] = [];
  const districtIds = new Set(map.districts.map((district) => district.id));
  const locationIds = new Set<string>();
  for (const location of [...map.lots, ...map.nodes]) {
    if (locationIds.has(location.id))
      errors.push(`Duplicate map location: ${location.id}`);
    locationIds.add(location.id);
    if (!districtIds.has(location.districtId))
      errors.push(`Unknown district ${location.districtId}: ${location.id}`);
    if (
      location.point.x < 0 ||
      location.point.x > map.size.width ||
      location.point.y < 0 ||
      location.point.y > map.size.height
    )
      errors.push(`Location outside map bounds: ${location.id}`);
  }
  if (!map.nodes.some((node) => node.kind === "bank"))
    errors.push("Map requires a bank node");
  for (const edge of map.edges) {
    if (!locationIds.has(edge.fromId) && !districtIds.has(edge.fromId))
      errors.push(`Unknown edge origin: ${edge.id}`);
    if (!locationIds.has(edge.toId) && !districtIds.has(edge.toId))
      errors.push(`Unknown edge destination: ${edge.id}`);
  }
  return errors;
}
