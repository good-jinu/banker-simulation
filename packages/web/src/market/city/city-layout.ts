import * as THREE from "three";
import {
  addSurface,
  GRAY,
  PALETTE,
  PAPER,
  ROAD_GRAY,
  type CityUnit,
  type ColoredSurface,
} from "./city-materials.ts";
import { addCityOutskirts, type OuterBuilding } from "./city-outskirts.ts";

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function addBuilding(
  city: THREE.Group,
  x: number,
  z: number,
  order: number,
  index: number,
  detailed: boolean,
  random: () => number,
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
): CityUnit {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  city.add(group);

  const surfaces: ColoredSurface[] = [];
  const color = PALETTE[index % PALETTE.length]!;
  const baseColor = PALETTE[(index + 2) % PALETTE.length]!;
  const height = 7 + random() * 19;
  const width = 7 + random() * 2.4;
  const depth = 7 + random() * 2.4;

  surfaces.push(
    addSurface(
      group,
      new THREE.BoxGeometry(11.4, 0.8, 11.4),
      baseColor,
      GRAY,
      gradient,
      ink,
      [0, 0.4, 0],
    ),
    addSurface(
      group,
      new THREE.BoxGeometry(width, height, depth),
      color,
      GRAY,
      gradient,
      ink,
      [0, 0.8 + height / 2, 0],
    ),
  );

  if (detailed) {
    const windowColor = index % 3 === 0 ? 0xffd328 : 0xf7e5b7;
    for (const side of [-1, 1]) {
      surfaces.push(
        addSurface(
          group,
          new THREE.BoxGeometry(
            width * 0.62,
            Math.max(1.2, height * 0.12),
            0.12,
          ),
          windowColor,
          new THREE.Color(0xa9a69d),
          gradient,
          ink,
          [0, height * 0.55, side * (depth / 2 + 0.07)],
        ),
      );
    }

    if (height > 14) {
      surfaces.push(
        addSurface(
          group,
          new THREE.CylinderGeometry(1.25, 1.45, 1.6, 8),
          PALETTE[(index + 3) % PALETTE.length]!,
          GRAY,
          gradient,
          ink,
          [width * 0.2, height + 1.6, depth * 0.16],
        ),
      );
    }
  }

  return { order, surfaces };
}

function addBank(
  city: THREE.Group,
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
): CityUnit {
  const group = new THREE.Group();
  city.add(group);
  const surfaces: ColoredSurface[] = [];

  surfaces.push(
    addSurface(
      group,
      new THREE.BoxGeometry(11.5, 0.9, 11.5),
      0xffd328,
      GRAY,
      gradient,
      ink,
      [0, 0.45, 0],
    ),
    addSurface(
      group,
      new THREE.BoxGeometry(9, 8, 8),
      0xee321d,
      GRAY,
      gradient,
      ink,
      [0, 4.9, 0],
    ),
    addSurface(
      group,
      new THREE.CylinderGeometry(3.1, 4.6, 3.4, 4),
      0xffd328,
      GRAY,
      gradient,
      ink,
      [0, 10.6, 0],
      [0, Math.PI / 4, 0],
    ),
  );

  for (const x of [-3, -1, 1, 3]) {
    surfaces.push(
      addSurface(
        group,
        new THREE.CylinderGeometry(0.45, 0.45, 5.6, 8),
        0xf7e5b7,
        new THREE.Color(0xa9a69d),
        gradient,
        ink,
        [x, 4.2, 4.12],
      ),
    );
  }

  return { order: 0, surfaces };
}

function addPark(
  city: THREE.Group,
  x: number,
  z: number,
  order: number,
  index: number,
  detailed: boolean,
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
): CityUnit {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  city.add(group);
  const surfaces: ColoredSurface[] = [
    addSurface(
      group,
      new THREE.BoxGeometry(11.4, 0.7, 11.4),
      0x3eaf3c,
      GRAY,
      gradient,
      ink,
      [0, 0.35, 0],
    ),
  ];

  const treePositions: Array<[number, number]> = [
    [-3.1, -2.8],
    [2.8, -2.1],
    [-1, 2.8],
  ];
  const visibleTrees = detailed ? treePositions : treePositions.slice(0, 1);
  for (const [treeX, treeZ] of visibleTrees) {
    surfaces.push(
      addSurface(
        group,
        new THREE.CylinderGeometry(0.32, 0.42, 2.2, 7),
        0xf36b24,
        ROAD_GRAY,
        gradient,
        ink,
        [treeX, 1.8, treeZ],
      ),
      addSurface(
        group,
        new THREE.ConeGeometry(1.7, 4.2, 7),
        index % 2 === 0 ? 0x3eaf3c : 0x2f7dbc,
        GRAY,
        gradient,
        ink,
        [treeX, 4.4, treeZ],
      ),
    );
  }

  return { order, surfaces };
}

/** Builds the deterministic 1960s city model and its color-progression units. */
export function buildCity(
  scene: THREE.Scene,
  gradient: THREE.Texture,
  ink: THREE.LineBasicMaterial,
): { city: THREE.Group; units: CityUnit[] } {
  const city = new THREE.Group();
  scene.add(city);
  const units: CityUnit[] = [];
  const outerBuildings: OuterBuilding[] = [];
  const random = seededRandom(1962);
  const grid = 25;
  const centerIndex = Math.floor(grid / 2);
  const detailedGridRadius = 7;
  const block = 12;
  const road = 4;
  const span = grid * block + (grid + 1) * road;
  const half = span / 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshToonMaterial({ color: PAPER, gradientMap: gradient }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  for (let index = 0; index <= grid; index += 1) {
    const position = -half + road / 2 + index * (block + road);
    for (const horizontal of [false, true]) {
      const group = new THREE.Group();
      city.add(group);
      const surface = addSurface(
        group,
        new THREE.BoxGeometry(
          horizontal ? span : road,
          0.18,
          horizontal ? road : span,
        ),
        0x2e6f91,
        ROAD_GRAY,
        gradient,
        ink,
        [horizontal ? 0 : position, 0.02, horizontal ? position : 0],
      );
      units.push({
        order: Math.abs(position) + 0.35 + (horizontal ? 0.02 : 0),
        surfaces: [surface],
      });
    }
  }

  let buildingIndex = 0;
  for (let gx = 0; gx < grid; gx += 1) {
    for (let gz = 0; gz < grid; gz += 1) {
      const x = -half + road + block / 2 + gx * (block + road);
      const z = -half + road + block / 2 + gz * (block + road);
      const order = Math.hypot(x, z);
      const detailed = order <= 72;
      const inDetailedGrid =
        Math.abs(gx - centerIndex) <= detailedGridRadius &&
        Math.abs(gz - centerIndex) <= detailedGridRadius;
      if (!inDetailedGrid) {
        outerBuildings.push({
          x,
          z,
          width: 7 + random() * 2.4,
          depth: 7 + random() * 2.4,
          height: 7 + random() * 19,
        });
      } else if (gx === centerIndex && gz === centerIndex) {
        units.push(addBank(city, gradient, ink));
      } else if ((gx + gz * 2) % 7 === 0) {
        units.push(
          addPark(city, x, z, order, buildingIndex, detailed, gradient, ink),
        );
      } else {
        units.push(
          addBuilding(
            city,
            x,
            z,
            order,
            buildingIndex,
            detailed,
            random,
            gradient,
            ink,
          ),
        );
      }
      buildingIndex += 1;
    }
  }

  addCityOutskirts(city, outerBuildings, gradient);

  units.sort((first, second) => first.order - second.order);
  return { city, units };
}
