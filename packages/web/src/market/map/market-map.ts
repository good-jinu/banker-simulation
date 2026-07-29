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
