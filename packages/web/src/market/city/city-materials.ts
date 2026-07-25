import * as THREE from "three";

export const PAPER = 0xf7e5b7;
export const INK = 0x11100d;
export const GRAY = new THREE.Color(0x8b8982);
export const ROAD_GRAY = new THREE.Color(0x66645f);
export const PALETTE = [
  0xee321d, 0x3eaf3c, 0xffd328, 0xf36b24, 0x2f7dbc, 0xf7e5b7,
];

export type ColoredSurface = {
  material: THREE.MeshToonMaterial;
  gray: THREE.Color;
  target: THREE.Color;
};

export type CityUnit = {
  order: number;
  surfaces: ColoredSurface[];
};

function addInk(mesh: THREE.Mesh, material: THREE.LineBasicMaterial): void {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 28),
    material,
  );
  lines.renderOrder = 2;
  mesh.add(lines);
}

export function addSurface(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  targetColor: number,
  gray: THREE.Color,
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
  position: [number, number, number],
  rotation?: [number, number, number],
): ColoredSurface {
  const material = new THREE.MeshToonMaterial({
    color: gray,
    gradientMap: gradient,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addInk(mesh, ink);
  parent.add(mesh);
  return {
    material,
    gray: gray.clone(),
    target: new THREE.Color(targetColor),
  };
}

/** Blends every surface in one city unit from grayscale to its pop-art color. */
export function setUnitProgress(unit: CityUnit, progress: number): void {
  const eased = progress * progress * (3 - 2 * progress);
  for (const surface of unit.surfaces) {
    surface.material.color.lerpColors(surface.gray, surface.target, eased);
  }
}
