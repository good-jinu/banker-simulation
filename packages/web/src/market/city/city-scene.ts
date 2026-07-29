import * as THREE from "three";
import {
  CAMERA_DIRECTION,
  clampMarketCamera,
  panMarketCamera,
  zoomMarketCameraAt,
  type MapProjection,
  type MarketCamera,
} from "../map/market-camera.ts";
import {
  initialMapDragGesture,
  updateMapDragGesture,
  wheelZoomFactor,
} from "../map/market-map-gesture.ts";
import type { MapPoint, MarketMapDefinition } from "../map/market-map.ts";
import { INK, PAPER } from "./city-materials.ts";
import {
  buildMarketCity,
  type CityDistrictVisualState,
} from "./market-city-layout.ts";

export type CityScene = {
  dispose: () => void;
  resize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setDistrictStates: (states: readonly CityDistrictVisualState[]) => void;
};

/** Owns the Three.js renderer while reporting the exact shared map projection. */
export function createCityScene(
  canvas: HTMLCanvasElement,
  map: MarketMapDefinition,
  seed: number,
  initialZoom: number,
  initialDistrictStates: readonly CityDistrictVisualState[],
  onProjectionChange: (projection: MapProjection) => void,
  onFirstDrag: () => void,
  onZoomChange: (zoom: number) => void,
): CityScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(PAPER, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 150, 260);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
  camera.up.set(0, 1, 0);
  const gradient = new THREE.DataTexture(
    new Uint8Array([78, 150, 235]),
    3,
    1,
    THREE.RedFormat,
  );
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const ink = new THREE.LineBasicMaterial({ color: INK });
  scene.add(new THREE.HemisphereLight(0xfff6dc, 0xa9a79f, 2.1));
  const sun = new THREE.DirectionalLight(0xfff8e6, 3.1);
  sun.position.set(55, 105, 48);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);
  const city = buildMarketCity(
    scene,
    map,
    seed,
    initialDistrictStates,
    gradient,
    ink,
  );

  let viewportWidth = 1;
  let viewportHeight = 1;
  let targetCamera: MarketCamera = clampMarketCamera(map, {
    center: { ...map.camera.initialCenter },
    zoom: initialZoom,
  });
  let displayedCamera: MarketCamera = {
    center: { ...targetCamera.center },
    zoom: targetCamera.zoom,
  };
  let dragging = false;
  let primaryPointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let dragGesture = initialMapDragGesture();
  let hasDragged = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDistance = 0;
  let pinchStartZoom = displayedCamera.zoom;
  let lastReport = "";

  function currentProjection(): MapProjection {
    return {
      camera: displayedCamera,
      viewport: { width: viewportWidth, height: viewportHeight },
    };
  }

  function updateThreeCamera(): void {
    const visibleHeight = map.camera.baseViewSize / displayedCamera.zoom;
    const aspect = viewportWidth / viewportHeight;
    camera.left = (-visibleHeight * aspect) / 2;
    camera.right = (visibleHeight * aspect) / 2;
    camera.top = visibleHeight / 2;
    camera.bottom = -visibleHeight / 2;
    const focusX = displayedCamera.center.x - map.size.width / 2;
    const focusZ = displayedCamera.center.y - map.size.height / 2;
    const distance = 165;
    camera.position.set(
      focusX + CAMERA_DIRECTION.x * distance,
      CAMERA_DIRECTION.y * distance,
      focusZ + CAMERA_DIRECTION.z * distance,
    );
    camera.lookAt(focusX, 0, focusZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function reportProjection(): void {
    const key = `${displayedCamera.center.x.toFixed(3)}:${displayedCamera.center.y.toFixed(3)}:${displayedCamera.zoom.toFixed(4)}:${viewportWidth}:${viewportHeight}`;
    if (key === lastReport) return;
    lastReport = key;
    onProjectionChange(currentProjection());
  }

  /** Client coordinates are viewport-relative; the projection is canvas-relative. */
  function canvasPoint(clientX: number, clientY: number): MapPoint {
    const bounds = canvas.getBoundingClientRect();
    return { x: clientX - bounds.left, y: clientY - bounds.top };
  }

  function setZoom(
    nextZoom: number,
    reportChange = false,
    anchorPixels?: MapPoint,
  ): void {
    targetCamera = zoomMarketCameraAt(
      map,
      {
        camera: targetCamera,
        viewport: { width: viewportWidth, height: viewportHeight },
      },
      nextZoom,
      anchorPixels,
    );
    if (reportChange) onZoomChange(targetCamera.zoom);
  }

  function distanceBetweenPointers(): number {
    const activePointers = [...pointers.values()];
    const first = activePointers[0];
    const second = activePointers[1];
    if (!first || !second) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function midpointBetweenPointers(): MapPoint | undefined {
    const activePointers = [...pointers.values()];
    const first = activePointers[0];
    const second = activePointers[1];
    if (!first || !second) return undefined;
    return canvasPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging = true;
    primaryPointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    if (pointers.size === 1) dragGesture = initialMapDragGesture();
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    if (pointers.size === 2) {
      pinchStartDistance = distanceBetweenPointers();
      pinchStartZoom = targetCamera.zoom;
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const distance = distanceBetweenPointers();
      if (pinchStartDistance > 0)
        setZoom(
          pinchStartZoom * (distance / pinchStartDistance),
          true,
          midpointBetweenPointers(),
        );
      return;
    }
    if (!dragging || event.pointerId !== primaryPointerId) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    dragGesture = updateMapDragGesture(dragGesture, {
      x: deltaX,
      y: deltaY,
    });
    if (!hasDragged && dragGesture.recognized) {
      hasDragged = true;
      onFirstDrag();
    }
    targetCamera = panMarketCamera(
      map,
      {
        camera: targetCamera,
        viewport: { width: viewportWidth, height: viewportHeight },
      },
      { x: deltaX, y: deltaY },
    );
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function endDrag(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    pinchStartDistance = 0;
    const remainingPointer = pointers.entries().next().value as
      [number, { x: number; y: number }] | undefined;
    if (remainingPointer) {
      const [pointerId, point] = remainingPointer;
      dragging = true;
      primaryPointerId = pointerId;
      lastX = point.x;
      lastY = point.y;
      dragGesture = initialMapDragGesture();
      return;
    }
    dragging = false;
    primaryPointerId = -1;
    canvas.classList.remove("is-dragging");
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = wheelZoomFactor(event);
    if (factor === 1) return;
    setZoom(
      targetCamera.zoom * factor,
      true,
      canvasPoint(event.clientX, event.clientY),
    );
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let animationFrame = 0;
  let disposed = false;
  let previousFrameTime = window.performance.now();

  function animate(frameTime: number): void {
    if (disposed) return;
    const deltaSeconds = Math.min(
      Math.max(0, frameTime - previousFrameTime) / 1_000,
      0.05,
    );
    previousFrameTime = frameTime;
    const ease = reducedMotion ? 1 : 0.2;
    displayedCamera = {
      center: {
        x: THREE.MathUtils.lerp(
          displayedCamera.center.x,
          targetCamera.center.x,
          ease,
        ),
        y: THREE.MathUtils.lerp(
          displayedCamera.center.y,
          targetCamera.center.y,
          ease,
        ),
      },
      zoom: THREE.MathUtils.lerp(displayedCamera.zoom, targetCamera.zoom, ease),
    };
    updateThreeCamera();
    reportProjection();
    city.update(deltaSeconds, reducedMotion);
    renderer.render(scene, camera);
    canvas.dataset.cityDrawCalls = String(renderer.info.render.calls);
    canvas.dataset.cityTriangles = String(renderer.info.render.triangles);
    animationFrame = window.requestAnimationFrame(animate);
  }
  animationFrame = window.requestAnimationFrame(animate);

  return {
    resize(width, height) {
      viewportWidth = Math.max(width, 1);
      viewportHeight = Math.max(height, 1);
      renderer.setSize(viewportWidth, viewportHeight, false);
      updateThreeCamera();
      reportProjection();
    },
    setZoom(nextZoom) {
      setZoom(nextZoom);
    },
    setDistrictStates(states) {
      city.setDistrictStates(states);
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("wheel", onWheel);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of objectMaterials) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      gradient.dispose();
      renderer.dispose();
    },
  };
}
