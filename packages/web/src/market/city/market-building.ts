import type {
  MarketBuildingKind,
  MarketLot,
  MarketMapDefinition,
} from "../map/market-map.ts";

export type MarketBuildingPartShape =
  "box" | "column" | "canopy" | "roof" | "roof-square";

export type MarketBuildingPart = {
  shape: MarketBuildingPartShape;
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotationY: number;
  grayColor: number;
  targetColor: number;
};

/** One independently addressable building assembled into the wider city. */
export type MarketBuilding = {
  id: string;
  districtId: string;
  kind: MarketBuildingKind;
  point: { x: number; y: number };
  order: number;
  parts: readonly MarketBuildingPart[];
};

const GRAY = 0x8b8982;
const ROAD_GRAY = 0x66645f;
const PALETTE = [
  0xee321d, 0x3eaf3c, 0xffd328, 0xf36b24, 0x2f7dbc, 0xf7e5b7,
] as const;

const KIND_COLOR: Record<MarketBuildingKind, number> = {
  bank: 0xee321d,
  commercial: 0xf36b24,
  logistics: 0x2f7dbc,
  residential: 0xffd328,
  technology: 0x8254c7,
  budget: 0xc7b389,
  public: 0xf7e5b7,
  park: 0x3eaf3c,
};

function hashValue(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function randomUnit(key: string): number {
  return hashValue(key) / 0x1_0000_0000;
}

function boxPart(
  position: MarketBuildingPart["position"],
  scale: MarketBuildingPart["scale"],
  targetColor: number,
  grayColor = GRAY,
): MarketBuildingPart {
  return {
    shape: "box",
    position,
    scale,
    rotationY: 0,
    grayColor,
    targetColor,
  };
}

function ordinaryBuildingParts(
  lot: MarketLot,
  seed: number,
): MarketBuildingPart[] {
  const first = randomUnit(`${seed}:${lot.id}:height`);
  const second = randomUnit(`${seed}:${lot.id}:width`);
  const paletteIndex = hashValue(lot.id) % PALETTE.length;
  const bodyColor = KIND_COLOR[lot.buildingKind];
  const baseColor = PALETTE[(paletteIndex + 2) % PALETTE.length]!;
  const heightBias: Record<MarketBuildingKind, number> = {
    bank: 1,
    commercial: 1,
    logistics: 0.58,
    residential: 0.82,
    technology: 1.16,
    budget: 0.62,
    public: 0.88,
    park: 0,
  };
  const height = (3.1 + first * 7.4) * heightBias[lot.buildingKind];
  const width = 2.8 + second * 0.95;
  const depth = 2.8 + first * 0.95;
  const rotationY = second > 0.72 ? Math.PI / 2 : 0;
  const parts: MarketBuildingPart[] = [
    boxPart({ x: 0, y: 0.2, z: 0 }, { x: 4.15, y: 0.4, z: 4.15 }, baseColor),
    {
      ...boxPart(
        { x: 0, y: 0.4 + height / 2, z: 0 },
        { x: width, y: height, z: depth },
        bodyColor,
      ),
      rotationY,
    },
  ];
  const windowColor = paletteIndex % 3 === 0 ? 0xffd328 : 0xf7e5b7;
  for (const side of [-1, 1]) {
    parts.push(
      boxPart(
        {
          x: 0,
          y: Math.max(1.5, height * 0.58),
          z: side * (depth / 2 + 0.05),
        },
        {
          x: width * 0.62,
          y: Math.max(0.48, height * 0.12),
          z: 0.08,
        },
        windowColor,
        0xa9a69d,
      ),
    );
  }
  if (height > 6) {
    parts.push({
      shape: "roof",
      position: {
        x: width * 0.2,
        y: height + 0.9,
        z: depth * 0.16,
      },
      scale: { x: 0.58, y: 0.82, z: 0.58 },
      rotationY: 0,
      grayColor: GRAY,
      targetColor: PALETTE[(paletteIndex + 3) % PALETTE.length]!,
    });
  }
  return parts;
}

function parkParts(lot: MarketLot, seed: number): MarketBuildingPart[] {
  const parts: MarketBuildingPart[] = [
    boxPart({ x: 0, y: 0.18, z: 0 }, { x: 4.15, y: 0.36, z: 4.15 }, 0x3eaf3c),
  ];
  const positions = [
    { x: -1.15, z: -1.05 },
    { x: 1.08, z: -0.82 },
    { x: -0.34, z: 1.12 },
  ];
  const visibleTrees = 1 + (hashValue(`${seed}:${lot.id}:trees`) % 3);
  for (const [index, point] of positions.slice(0, visibleTrees).entries()) {
    parts.push(
      {
        shape: "column",
        position: { x: point.x, y: 0.82, z: point.z },
        scale: { x: 0.26, y: 1.25, z: 0.26 },
        rotationY: 0,
        grayColor: ROAD_GRAY,
        targetColor: 0xf36b24,
      },
      {
        shape: "canopy",
        position: { x: point.x, y: 2.05, z: point.z },
        scale: { x: 0.88, y: 2.05, z: 0.88 },
        rotationY: 0,
        grayColor: GRAY,
        targetColor: index % 2 === 0 ? 0x3eaf3c : 0x2f7dbc,
      },
    );
  }
  return parts;
}

function bankBuilding(map: MarketMapDefinition): MarketBuilding | null {
  const node = map.nodes.find((candidate) => candidate.kind === "bank");
  if (!node) return null;
  const parts: MarketBuildingPart[] = [
    boxPart({ x: 0, y: 0.23, z: 0 }, { x: 4.6, y: 0.46, z: 4.6 }, 0xffd328),
    boxPart({ x: 0, y: 2.18, z: 0 }, { x: 3.6, y: 3.2, z: 3.2 }, 0xee321d),
    {
      shape: "roof-square",
      position: { x: 0, y: 4.72, z: 0 },
      scale: { x: 1.85, y: 1.36, z: 1.85 },
      rotationY: Math.PI / 4,
      grayColor: GRAY,
      targetColor: 0xffd328,
    },
    ...[-1.2, -0.4, 0.4, 1.2].map((x): MarketBuildingPart => ({
      shape: "column",
      position: { x, y: 2.05, z: 1.68 },
      scale: { x: 0.18, y: 2.24, z: 0.18 },
      rotationY: 0,
      grayColor: 0xa9a69d,
      targetColor: 0xf7e5b7,
    })),
  ];
  return {
    id: node.id,
    districtId: node.districtId,
    kind: "bank",
    point: node.point,
    order: -1,
    parts,
  };
}

/** Builds independent, deterministic building models from authored map lots. */
export function buildMarketBuildings(
  map: MarketMapDefinition,
  seed: number,
): MarketBuilding[] {
  const buildings: MarketBuilding[] = map.lots.map((lot) => {
    const district = map.districts.find(
      (candidate) => candidate.id === lot.districtId,
    );
    const distance = district
      ? Math.hypot(
          lot.point.x - district.center.x,
          lot.point.y - district.center.y,
        )
      : 0;
    return {
      id: lot.id,
      districtId: lot.districtId,
      kind: lot.buildingKind,
      point: lot.point,
      order: distance + randomUnit(`${seed}:${lot.id}:order`) * 0.25,
      parts:
        lot.buildingKind === "park"
          ? parkParts(lot, seed)
          : ordinaryBuildingParts(lot, seed),
    } satisfies MarketBuilding;
  });
  const bank = bankBuilding(map);
  if (bank) buildings.push(bank);
  return buildings.sort(
    (first, second) =>
      first.districtId.localeCompare(second.districtId) ||
      first.order - second.order ||
      first.id.localeCompare(second.id),
  );
}

/**
 * Fractional number of buildings that should be colored in one district.
 * Square-root sales growth prevents a single large loan from painting a block.
 */
export function districtColorTarget(
  buildingCount: number,
  sales: number,
  trust: number,
): number {
  const safeCount = Math.max(0, Math.floor(buildingCount));
  if (safeCount === 0 || sales <= 0) return 0;
  const trustFactor = 0.7 + Math.min(100, Math.max(0, trust)) / 100;
  return Math.min(safeCount, Math.sqrt(Math.max(0, sales) / 75) * trustFactor);
}

export function buildingColorProgress(
  buildingIndex: number,
  colorTarget: number,
): number {
  return Math.min(1, Math.max(0, colorTarget - buildingIndex));
}
