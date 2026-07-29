import type {
  MarketDistrict,
  MarketLot,
  MarketMapDefinition,
  MarketMapNode,
} from "./market-map.ts";
import { createDistrictLots, reserveLotsForNodes } from "./market-map-lots.ts";

function compactLots(
  districtId: string,
  points: readonly { x: number; y: number }[],
): MarketLot[] {
  return points.map((point, index) => ({
    id: `${districtId}-lot-${index + 1}`,
    districtId,
    point,
    buildingKind:
      index % 5 === 0 ? "park" : index % 3 === 0 ? "residential" : "commercial",
  }));
}

function compactMap(id: string, district: MarketDistrict): MarketMapDefinition {
  const nodes: MarketMapNode[] = [
    {
      id: `${id}-bank`,
      kind: "bank",
      districtId: district.id,
      point: { x: 50, y: 49 },
    },
    {
      id: `${id}-loan-product`,
      kind: "loan-product",
      districtId: district.id,
      point: { x: 50, y: 26 },
    },
    {
      id: `${id}-deposit-product`,
      kind: "deposit-product",
      districtId: district.id,
      point: { x: 50, y: 68 },
    },
    {
      id: `${id}-funding-west`,
      kind: "funding",
      districtId: district.id,
      point: { x: 9, y: 50 },
    },
    {
      id: `${id}-funding-south`,
      kind: "funding",
      districtId: district.id,
      point: { x: 50, y: 88 },
    },
    {
      id: `${id}-funding-east`,
      kind: "funding",
      districtId: district.id,
      point: { x: 91, y: 50 },
    },
  ];
  const lots = compactLots(district.id, [
    { x: 19, y: 21 },
    { x: 81, y: 21 },
    { x: 84, y: 76 },
    { x: 18, y: 76 },
    { x: 49, y: 14 },
    { x: 67, y: 83 },
    { x: 32, y: 83 },
    { x: 30, y: 48 },
    { x: 70, y: 48 },
    { x: 66, y: 14 },
  ]);
  return {
    id,
    size: { width: 100, height: 100 },
    districts: [district],
    lots: reserveLotsForNodes(lots, nodes),
    nodes,
    edges: [
      {
        id: `${id}-bank-${district.id}`,
        fromId: `${id}-bank`,
        toId: district.id,
        kind: "bank-flow",
      },
    ],
    camera: {
      initialCenter: { x: 50, y: 50 },
      initialZoom: 1.55,
      minZoom: 1.2,
      maxZoom: 2.1,
      clusterZoom: 0,
      detailZoom: 0,
      baseViewSize: 106,
    },
    detailedNodeLimit: { desktop: 24, mobile: 12 },
  };
}

const riversideDistrict: MarketDistrict = {
  id: "riverside",
  name: { en: "Riverside", ko: "리버사이드" },
  center: { x: 50, y: 50 },
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  segments: ["workers", "small-business"],
  riskTags: ["stable-employment"],
  buildingMix: [
    { kind: "commercial", weight: 3 },
    { kind: "residential", weight: 3 },
    { kind: "park", weight: 1 },
  ],
  demandWeight: 1,
};

const northYardDistrict: MarketDistrict = {
  id: "north-yard",
  name: { en: "North Yard", ko: "노스 야드" },
  center: { x: 50, y: 50 },
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  segments: ["delivery", "low-credit", "small-business"],
  riskTags: ["income-volatility", "low-reserves"],
  buildingMix: [
    { kind: "logistics", weight: 4 },
    { kind: "budget", weight: 2 },
    { kind: "commercial", weight: 1 },
  ],
  demandWeight: 1,
};

export const RIVERSIDE_MAP = compactMap("riverside-market", riversideDistrict);
export const NORTH_YARD_MAP = compactMap(
  "north-yard-market",
  northYardDistrict,
);

const metroDistricts: readonly MarketDistrict[] = [
  {
    id: "old-market",
    name: { en: "Old Market", ko: "구시장" },
    center: { x: 20, y: 20 },
    bounds: { x: 0, y: 0, width: 40, height: 40 },
    segments: ["small-business", "workers"],
    riskTags: ["rent-pressure", "cyclical"],
    buildingMix: [
      { kind: "commercial", weight: 5 },
      { kind: "residential", weight: 2 },
      { kind: "park", weight: 1 },
    ],
    demandWeight: 1.1,
  },
  {
    id: "tech-quarter",
    name: { en: "Tech Quarter", ko: "테크 쿼터" },
    center: { x: 60, y: 20 },
    bounds: { x: 40, y: 0, width: 40, height: 40 },
    segments: ["technology", "workers"],
    riskTags: ["startup-heavy", "cyclical"],
    buildingMix: [
      { kind: "technology", weight: 5 },
      { kind: "commercial", weight: 2 },
      { kind: "public", weight: 1 },
    ],
    demandWeight: 1,
  },
  {
    id: "freight-basin",
    name: { en: "Freight Basin", ko: "화물 분지" },
    center: { x: 100, y: 20 },
    bounds: { x: 80, y: 0, width: 40, height: 40 },
    segments: ["delivery", "small-business"],
    riskTags: ["supply-chain", "income-volatility"],
    buildingMix: [
      { kind: "logistics", weight: 6 },
      { kind: "budget", weight: 1 },
      { kind: "public", weight: 1 },
    ],
    demandWeight: 0.9,
  },
  {
    id: "cedar-homes",
    name: { en: "Cedar Homes", ko: "시더 주거지" },
    center: { x: 20, y: 60 },
    bounds: { x: 0, y: 40, width: 40, height: 40 },
    segments: ["workers", "low-credit"],
    riskTags: ["rent-pressure", "stable-employment"],
    buildingMix: [
      { kind: "residential", weight: 6 },
      { kind: "park", weight: 1 },
      { kind: "public", weight: 1 },
    ],
    demandWeight: 1.15,
  },
  {
    id: "civic-heights",
    name: { en: "Civic Heights", ko: "시빅 하이츠" },
    center: { x: 60, y: 60 },
    bounds: { x: 40, y: 40, width: 40, height: 40 },
    segments: ["workers", "technology"],
    riskTags: ["stable-employment"],
    buildingMix: [
      { kind: "public", weight: 3 },
      { kind: "residential", weight: 3 },
      { kind: "technology", weight: 1 },
      { kind: "park", weight: 1 },
    ],
    demandWeight: 0.85,
  },
  {
    id: "south-works",
    name: { en: "South Works", ko: "사우스 웍스" },
    center: { x: 100, y: 60 },
    bounds: { x: 80, y: 40, width: 40, height: 40 },
    segments: ["delivery", "low-credit", "small-business"],
    riskTags: ["low-reserves", "income-volatility"],
    buildingMix: [
      { kind: "budget", weight: 4 },
      { kind: "logistics", weight: 2 },
      { kind: "commercial", weight: 1 },
      { kind: "park", weight: 1 },
    ],
    demandWeight: 1,
  },
];

const metroNodes: MarketMapNode[] = [
  {
    id: "metro-bank",
    kind: "bank",
    districtId: "civic-heights",
    point: { x: 60, y: 42 },
  },
  {
    id: "metro-loan-product",
    kind: "loan-product",
    districtId: "tech-quarter",
    point: { x: 55, y: 34 },
  },
  {
    id: "metro-deposit-product",
    kind: "deposit-product",
    districtId: "civic-heights",
    point: { x: 65, y: 50 },
  },
  {
    id: "metro-funding-west",
    kind: "funding",
    districtId: "cedar-homes",
    point: { x: 5, y: 52 },
  },
  {
    id: "metro-funding-south",
    kind: "funding",
    districtId: "civic-heights",
    point: { x: 60, y: 76 },
  },
  {
    id: "metro-funding-east",
    kind: "funding",
    districtId: "south-works",
    point: { x: 115, y: 52 },
  },
];

export const METRO_REGION_MAP: MarketMapDefinition = {
  id: "metro-region",
  size: { width: 120, height: 80 },
  districts: metroDistricts,
  // Six districts × forty-eight lots is the authored 288-lot simulation board.
  // The blocks the bank, products, and lenders stand on are reserved, not
  // removed, so the road grid still derives from the full lattice.
  lots: reserveLotsForNodes(
    metroDistricts.flatMap((district) =>
      createDistrictLots(district, 8, 6, 2.2),
    ),
    metroNodes,
  ),
  nodes: metroNodes,
  edges: [
    {
      id: "old-market-tech-quarter",
      fromId: "old-market",
      toId: "tech-quarter",
      kind: "district-adjacency",
    },
    {
      id: "tech-quarter-freight-basin",
      fromId: "tech-quarter",
      toId: "freight-basin",
      kind: "district-adjacency",
    },
    {
      id: "cedar-homes-civic-heights",
      fromId: "cedar-homes",
      toId: "civic-heights",
      kind: "district-adjacency",
    },
    {
      id: "civic-heights-south-works",
      fromId: "civic-heights",
      toId: "south-works",
      kind: "district-adjacency",
    },
    ...metroDistricts.map((district) => ({
      id: `metro-bank-${district.id}`,
      fromId: "metro-bank",
      toId: district.id,
      kind: "bank-flow" as const,
    })),
  ],
  camera: {
    initialCenter: { x: 60, y: 40 },
    initialZoom: 0.78,
    minZoom: 0.65,
    maxZoom: 3.2,
    clusterZoom: 1.15,
    detailZoom: 1.85,
    baseViewSize: 92,
  },
  detailedNodeLimit: { desktop: 24, mobile: 12 },
};
