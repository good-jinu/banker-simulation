import * as THREE from "three";
import { GRAY } from "./city-materials.ts";

export type OuterBuilding = {
  depth: number;
  height: number;
  width: number;
  x: number;
  z: number;
};

/** Adds the large grayscale city skirt using four instanced draw calls. */
export function addCityOutskirts(
  city: THREE.Group,
  buildings: OuterBuilding[],
  gradient: THREE.Texture,
): void {
  const baseMaterial = new THREE.MeshToonMaterial({
    color: GRAY,
    gradientMap: gradient,
  });
  const buildingMaterial = baseMaterial.clone();
  const windowMaterial = new THREE.MeshToonMaterial({
    color: 0xa9a69d,
    gradientMap: gradient,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const bases = new THREE.InstancedMesh(
    geometry,
    baseMaterial,
    buildings.length,
  );
  const towers = new THREE.InstancedMesh(
    geometry,
    buildingMaterial,
    buildings.length,
  );
  const windowsX = new THREE.InstancedMesh(
    geometry,
    windowMaterial,
    buildings.length,
  );
  const windowsZ = new THREE.InstancedMesh(
    geometry,
    windowMaterial,
    buildings.length,
  );
  const transform = new THREE.Object3D();

  for (let index = 0; index < buildings.length; index += 1) {
    const building = buildings[index]!;
    transform.position.set(building.x, 0.4, building.z);
    transform.scale.set(11.4, 0.8, 11.4);
    transform.updateMatrix();
    bases.setMatrixAt(index, transform.matrix);

    transform.position.set(building.x, 0.8 + building.height / 2, building.z);
    transform.scale.set(building.width, building.height, building.depth);
    transform.updateMatrix();
    towers.setMatrixAt(index, transform.matrix);

    const windowHeight = Math.max(1.2, building.height * 0.12);
    transform.position.set(
      building.x + building.width / 2 + 0.07,
      building.height * 0.55,
      building.z,
    );
    transform.scale.set(0.12, windowHeight, building.depth * 0.62);
    transform.updateMatrix();
    windowsX.setMatrixAt(index, transform.matrix);

    transform.position.set(
      building.x,
      building.height * 0.55,
      building.z + building.depth / 2 + 0.07,
    );
    transform.scale.set(building.width * 0.62, windowHeight, 0.12);
    transform.updateMatrix();
    windowsZ.setMatrixAt(index, transform.matrix);
  }

  for (const mesh of [bases, towers, windowsX, windowsZ]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  bases.receiveShadow = true;
  towers.castShadow = true;
  towers.receiveShadow = true;
  city.add(bases, towers, windowsX, windowsZ);
}
