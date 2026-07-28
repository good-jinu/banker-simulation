import * as THREE from "three";
import type { MarketMapDefinition } from "../map/market-map.ts";
import {
  buildingColorProgress,
  buildMarketBuildings,
  districtColorTarget,
  type MarketBuilding,
  type MarketBuildingPart,
  type MarketBuildingPartShape,
} from "./market-building.ts";
import { PAPER, ROAD_GRAY } from "./city-materials.ts";

export type CityDistrictVisualState = {
  districtId: string;
  stress: number;
  alert: boolean;
  outstandingBalance: number;
  sales: number;
  trust: number;
};

export type MarketCity = {
  group: THREE.Group;
  setDistrictStates: (states: readonly CityDistrictVisualState[]) => void;
  update: (deltaSeconds: number, reducedMotion: boolean) => void;
};

type PartReference = {
  mesh: THREE.InstancedMesh;
  index: number;
  gray: THREE.Color;
  target: THREE.Color;
};

type BuildingRenderState = {
  building: MarketBuilding;
  parts: PartReference[];
  currentProgress: number;
  targetProgress: number;
};

const COLOR_DURATION_SECONDS = 0.55;

function geometryFor(shape: MarketBuildingPartShape): THREE.BufferGeometry {
  switch (shape) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "column":
      return new THREE.CylinderGeometry(1, 1, 1, 8);
    case "canopy":
      return new THREE.ConeGeometry(1, 1, 7);
    case "roof":
      return new THREE.CylinderGeometry(0.85, 1, 1, 8);
    case "roof-square":
      return new THREE.CylinderGeometry(0.67, 1, 1, 4);
  }
}

function partMatrix(
  map: MarketMapDefinition,
  building: MarketBuilding,
  part: MarketBuildingPart,
): THREE.Matrix4 {
  const transform = new THREE.Object3D();
  transform.position.set(
    building.point.x - map.size.width / 2 + part.position.x,
    part.position.y,
    building.point.y - map.size.height / 2 + part.position.z,
  );
  transform.rotation.y = part.rotationY;
  transform.scale.set(part.scale.x, part.scale.y, part.scale.z);
  transform.updateMatrix();
  return transform.matrix.clone();
}

function addTransformedEdges(
  points: number[],
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): void {
  const edges = new THREE.EdgesGeometry(geometry, 28);
  const positions = edges.getAttribute("position");
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point
      .fromBufferAttribute(positions as THREE.BufferAttribute, index)
      .applyMatrix4(matrix);
    points.push(point.x, point.y, point.z);
  }
  edges.dispose();
}

function roadTransforms(map: MarketMapDefinition): THREE.Matrix4[] {
  const transforms: THREE.Matrix4[] = [];
  const transform = new THREE.Object3D();
  for (const district of map.districts) {
    const lots = map.lots.filter((lot) => lot.districtId === district.id);
    if (lots.length < 20) continue;
    const xValues = [...new Set(lots.map((lot) => lot.point.x))].sort(
      (first, second) => first - second,
    );
    const zValues = [...new Set(lots.map((lot) => lot.point.y))].sort(
      (first, second) => first - second,
    );
    for (let index = 0; index < xValues.length - 1; index += 1) {
      const x = (xValues[index]! + xValues[index + 1]!) / 2;
      transform.position.set(
        x - map.size.width / 2,
        0.02,
        district.center.y - map.size.height / 2,
      );
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.42, 0.14, district.bounds.height);
      transform.updateMatrix();
      transforms.push(transform.matrix.clone());
    }
    for (let index = 0; index < zValues.length - 1; index += 1) {
      const z = (zValues[index]! + zValues[index + 1]!) / 2;
      transform.position.set(
        district.center.x - map.size.width / 2,
        0.02,
        z - map.size.height / 2,
      );
      transform.rotation.set(0, 0, 0);
      transform.scale.set(district.bounds.width, 0.14, 0.42);
      transform.updateMatrix();
      transforms.push(transform.matrix.clone());
    }
  }
  return transforms;
}

function applyProgress(
  state: BuildingRenderState,
  progress: number,
  dirtyMeshes: Set<THREE.InstancedMesh>,
): void {
  const eased = progress * progress * (3 - 2 * progress);
  for (const part of state.parts) {
    part.mesh.setColorAt(
      part.index,
      part.gray.clone().lerp(part.target, eased),
    );
    dirtyMeshes.add(part.mesh);
  }
}

/**
 * Assembles independent building models into instanced render batches.
 *
 * Buildings retain their own identity and color progress while shared geometry
 * keeps a large map within a small draw-call budget.
 */
export function buildMarketCity(
  scene: THREE.Scene,
  map: MarketMapDefinition,
  seed: number,
  states: readonly CityDistrictVisualState[],
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
): MarketCity {
  const group = new THREE.Group();
  scene.add(group);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(map.size.width + 28, map.size.height + 28),
    new THREE.MeshToonMaterial({ color: PAPER, gradientMap: gradient }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  group.add(ground);

  const roads = roadTransforms(map);
  if (roads.length > 0) {
    const roadMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshToonMaterial({
        color: ROAD_GRAY,
        gradientMap: gradient,
      }),
      roads.length,
    );
    roads.forEach((matrix, index) => roadMesh.setMatrixAt(index, matrix));
    roadMesh.instanceMatrix.needsUpdate = true;
    roadMesh.receiveShadow = true;
    group.add(roadMesh);
  }

  const buildings = buildMarketBuildings(map, seed);
  const partsByShape = new Map<
    MarketBuildingPartShape,
    { building: MarketBuilding; part: MarketBuildingPart }[]
  >();
  for (const building of buildings) {
    for (const part of building.parts) {
      const entries = partsByShape.get(part.shape) ?? [];
      entries.push({ building, part });
      partsByShape.set(part.shape, entries);
    }
  }

  const references = new Map<string, PartReference[]>();
  const outlinePoints: number[] = [];
  for (const [shape, entries] of partsByShape) {
    const geometry = geometryFor(shape);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshToonMaterial({
        color: 0xffffff,
        gradientMap: gradient,
      }),
      entries.length,
    );
    for (const [index, entry] of entries.entries()) {
      const matrix = partMatrix(map, entry.building, entry.part);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(entry.part.grayColor));
      addTransformedEdges(outlinePoints, geometry, matrix);
      const buildingReferences = references.get(entry.building.id) ?? [];
      buildingReferences.push({
        mesh,
        index,
        gray: new THREE.Color(entry.part.grayColor),
        target: new THREE.Color(entry.part.targetColor),
      });
      references.set(entry.building.id, buildingReferences);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shape !== "box";
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(outlinePoints, 3),
  );
  const outlines = new THREE.LineSegments(outlineGeometry, ink);
  outlines.renderOrder = 2;
  group.add(outlines);

  const districtBorderPoints: THREE.Vector3[] = [];
  for (const district of map.districts) {
    const halfWidth = district.bounds.width / 2;
    const halfHeight = district.bounds.height / 2;
    const centerX = district.center.x - map.size.width / 2;
    const centerZ = district.center.y - map.size.height / 2;
    const corners = [
      new THREE.Vector3(centerX - halfWidth, 0.18, centerZ - halfHeight),
      new THREE.Vector3(centerX + halfWidth, 0.18, centerZ - halfHeight),
      new THREE.Vector3(centerX + halfWidth, 0.18, centerZ + halfHeight),
      new THREE.Vector3(centerX - halfWidth, 0.18, centerZ + halfHeight),
    ];
    for (let index = 0; index < corners.length; index += 1) {
      districtBorderPoints.push(
        corners[index]!,
        corners[(index + 1) % corners.length]!,
      );
    }
  }
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(districtBorderPoints),
      ink,
    ),
  );

  const renderStates = buildings.map((building): BuildingRenderState => ({
    building,
    parts: references.get(building.id) ?? [],
    currentProgress: 0,
    targetProgress: 0,
  }));
  const statesByDistrict = new Map<string, BuildingRenderState[]>();
  for (const state of renderStates) {
    const districtStates =
      statesByDistrict.get(state.building.districtId) ?? [];
    districtStates.push(state);
    statesByDistrict.set(state.building.districtId, districtStates);
  }
  for (const districtStates of statesByDistrict.values()) {
    districtStates.sort(
      (first, second) =>
        first.building.order - second.building.order ||
        first.building.id.localeCompare(second.building.id),
    );
  }

  function setTargets(
    nextStates: readonly CityDistrictVisualState[],
    initialize = false,
  ): void {
    const nextByDistrict = new Map(
      nextStates.map((state) => [state.districtId, state]),
    );
    const dirtyMeshes = new Set<THREE.InstancedMesh>();
    for (const [districtId, districtBuildings] of statesByDistrict) {
      const state = nextByDistrict.get(districtId);
      const target = districtColorTarget(
        districtBuildings.length,
        state?.sales ?? 0,
        state?.trust ?? 0,
      );
      districtBuildings.forEach((building, index) => {
        building.targetProgress = buildingColorProgress(index, target);
        if (!initialize) return;
        building.currentProgress = building.targetProgress;
        applyProgress(building, building.currentProgress, dirtyMeshes);
      });
    }
    for (const mesh of dirtyMeshes) mesh.instanceColor!.needsUpdate = true;
  }
  setTargets(states, true);

  return {
    group,
    setDistrictStates(nextStates) {
      setTargets(nextStates);
    },
    update(deltaSeconds, reducedMotion) {
      const dirtyMeshes = new Set<THREE.InstancedMesh>();
      for (const districtBuildings of statesByDistrict.values()) {
        const growing = districtBuildings.find(
          (state) => state.currentProgress < state.targetProgress,
        );
        const fading = [...districtBuildings]
          .reverse()
          .find((state) => state.currentProgress > state.targetProgress);
        const active = growing ?? fading;
        if (!active) continue;
        const step = reducedMotion
          ? 1
          : Math.max(0, deltaSeconds) / COLOR_DURATION_SECONDS;
        active.currentProgress =
          active.currentProgress < active.targetProgress
            ? Math.min(active.targetProgress, active.currentProgress + step)
            : Math.max(active.targetProgress, active.currentProgress - step);
        applyProgress(active, active.currentProgress, dirtyMeshes);
      }
      for (const mesh of dirtyMeshes) mesh.instanceColor!.needsUpdate = true;
    },
  };
}
