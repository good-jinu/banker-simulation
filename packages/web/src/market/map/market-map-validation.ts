import type {
  MapPoint,
  MarketDistrict,
  MarketMapDefinition,
} from "./market-map.ts";

function isFinitePoint(point: MapPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointInsideMap(map: MarketMapDefinition, point: MapPoint): boolean {
  return (
    isFinitePoint(point) &&
    point.x >= 0 &&
    point.x <= map.size.width &&
    point.y >= 0 &&
    point.y <= map.size.height
  );
}

function pointInsideDistrict(
  district: MarketDistrict,
  point: MapPoint,
): boolean {
  return (
    isFinitePoint(point) &&
    point.x >= district.bounds.x &&
    point.x <= district.bounds.x + district.bounds.width &&
    point.y >= district.bounds.y &&
    point.y <= district.bounds.y + district.bounds.height
  );
}

function validateCamera(map: MarketMapDefinition, errors: string[]): void {
  const camera = map.camera;
  const zooms = [
    camera.minZoom,
    camera.initialZoom,
    camera.clusterZoom,
    camera.detailZoom,
    camera.maxZoom,
  ];
  if (
    zooms.some((zoom) => !Number.isFinite(zoom)) ||
    camera.minZoom <= 0 ||
    camera.minZoom > camera.initialZoom ||
    camera.initialZoom > camera.maxZoom ||
    camera.clusterZoom > camera.detailZoom ||
    camera.maxZoom <= 0
  ) {
    errors.push("Map camera zoom configuration is invalid");
  }
  if (!pointInsideMap(map, camera.initialCenter))
    errors.push("Map camera initial center is outside map bounds");
  if (!Number.isFinite(camera.baseViewSize) || camera.baseViewSize <= 0)
    errors.push("Map camera base view size must be positive");
}

/** Reports authoring errors before malformed data reaches the renderer. */
export function validateMarketMap(map: MarketMapDefinition): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(map.size.width) ||
    !Number.isFinite(map.size.height) ||
    map.size.width <= 0 ||
    map.size.height <= 0
  ) {
    errors.push("Map size must be finite and positive");
  }

  const districtsById = new Map<string, MarketDistrict>();
  for (const district of map.districts) {
    if (districtsById.has(district.id))
      errors.push(`Duplicate map district: ${district.id}`);
    districtsById.set(district.id, district);
    if (
      !Number.isFinite(district.bounds.width) ||
      !Number.isFinite(district.bounds.height) ||
      district.bounds.width < 0 ||
      district.bounds.height < 0 ||
      !pointInsideMap(map, district.bounds) ||
      district.bounds.x + district.bounds.width > map.size.width ||
      district.bounds.y + district.bounds.height > map.size.height
    ) {
      errors.push(`District outside map bounds: ${district.id}`);
    }
    if (!pointInsideDistrict(district, district.center))
      errors.push(`District center outside district bounds: ${district.id}`);
    if (!Number.isFinite(district.demandWeight) || district.demandWeight < 0)
      errors.push(`Invalid district demand weight: ${district.id}`);
  }

  const locationIds = new Set<string>();
  for (const location of [...map.lots, ...map.nodes]) {
    if (locationIds.has(location.id))
      errors.push(`Duplicate map location: ${location.id}`);
    locationIds.add(location.id);
    const district = districtsById.get(location.districtId);
    if (!district)
      errors.push(`Unknown district ${location.districtId}: ${location.id}`);
    if (!pointInsideMap(map, location.point))
      errors.push(`Location outside map bounds: ${location.id}`);
    else if (district && !pointInsideDistrict(district, location.point))
      errors.push(`Location outside district bounds: ${location.id}`);
  }

  if (!map.nodes.some((node) => node.kind === "bank"))
    errors.push("Map requires a bank node");

  const edgeIds = new Set<string>();
  for (const edge of map.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate map edge: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!locationIds.has(edge.fromId) && !districtsById.has(edge.fromId))
      errors.push(`Unknown edge origin: ${edge.id}`);
    if (!locationIds.has(edge.toId) && !districtsById.has(edge.toId))
      errors.push(`Unknown edge destination: ${edge.id}`);
  }

  validateCamera(map, errors);
  if (
    !Number.isInteger(map.detailedNodeLimit.desktop) ||
    !Number.isInteger(map.detailedNodeLimit.mobile) ||
    map.detailedNodeLimit.desktop < 0 ||
    map.detailedNodeLimit.mobile < 0
  ) {
    errors.push("Detailed node limits must be non-negative integers");
  }
  return errors;
}
