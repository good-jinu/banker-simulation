import * as THREE from "three";
import { buildCity } from "./city-layout.ts";
import { INK, PAPER, setUnitProgress } from "./city-materials.ts";

const VIEW_SIZE = 102;
const COLOR_DURATION_SECONDS = 0.55;

export type CityPan = {
  x: number;
  y: number;
};

export type CityScene = {
  dispose: () => void;
  resize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setCustomerCount: (count: number) => void;
};

/** Owns rendering, synchronized map panning, progression, and disposal. */
export function createCityScene(
  canvas: HTMLCanvasElement,
  initialCustomerCount: number,
  onPanChange: (pan: CityPan) => void,
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
  scene.fog = new THREE.Fog(PAPER, 480, 650);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 650);
  camera.position.set(92, 112, 92);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

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
  scene.add(new THREE.HemisphereLight(0xfff6dc, 0xa9a79f, 2.2));
  const sun = new THREE.DirectionalLight(0xfff8e6, 3.4);
  sun.position.set(58, 110, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -250;
  sun.shadow.camera.right = 250;
  sun.shadow.camera.top = 250;
  sun.shadow.camera.bottom = -250;
  scene.add(sun);

  const { city, units } = buildCity(scene, gradient, ink);
  let requestedCount = Math.min(
    Math.max(initialCustomerCount, 0),
    units.length,
  );
  let completedCount = requestedCount;
  let activeProgress = 0;
  for (let index = 0; index < units.length; index += 1) {
    setUnitProgress(units[index]!, index < completedCount ? 1 : 0);
  }

  const cameraUp = new THREE.Vector3().setFromMatrixColumn(
    camera.matrixWorld,
    1,
  );
  const screenRight = new THREE.Vector3().setFromMatrixColumn(
    camera.matrixWorld,
    0,
  );
  screenRight.y = 0;
  screenRight.normalize();
  const screenDown = new THREE.Vector3(-cameraUp.x, 0, -cameraUp.z).normalize();
  const screenDownProjection = Math.abs(screenDown.dot(cameraUp));
  let targetScreenX = 0;
  let targetScreenY = 0;
  let displayedScreenX = 0;
  let displayedScreenY = 0;
  let panLimitX = 120;
  let panLimitY = 80;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let zoom = 1;
  let reportedScreenX = Number.NaN;
  let reportedScreenY = Number.NaN;
  let dragging = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let hasDragged = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  function updateProjection(): void {
    const aspect = viewportWidth / viewportHeight;
    const visibleSize = VIEW_SIZE / zoom;
    camera.left = (-visibleSize * aspect) / 2;
    camera.right = (visibleSize * aspect) / 2;
    camera.top = visibleSize / 2;
    camera.bottom = -visibleSize / 2;
    camera.updateProjectionMatrix();
  }

  function setZoom(nextZoom: number, reportChange = false): void {
    const boundedZoom = THREE.MathUtils.clamp(nextZoom, 0.8, 1.4);
    if (zoom === boundedZoom) return;
    zoom = boundedZoom;
    updateProjection();
    if (reportChange) onZoomChange(zoom);
  }

  function distanceBetweenPointers(): number {
    const activePointers = [...pointers.values()];
    const first = activePointers[0];
    const second = activePointers[1];
    if (!first || !second) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(pointerId);
    canvas.classList.add("is-dragging");
    if (pointers.size === 2) {
      pinchStartDistance = distanceBetweenPointers();
      pinchStartZoom = zoom;
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const distance = distanceBetweenPointers();
      if (pinchStartDistance > 0) {
        setZoom(pinchStartZoom * (distance / pinchStartDistance), true);
      }
      return;
    }
    if (!dragging || event.pointerId !== pointerId) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    if (!hasDragged && Math.hypot(deltaX, deltaY) >= 4) {
      hasDragged = true;
      onFirstDrag();
    }
    targetScreenX = THREE.MathUtils.clamp(
      targetScreenX + deltaX,
      -panLimitX,
      panLimitX,
    );
    targetScreenY = THREE.MathUtils.clamp(
      targetScreenY + deltaY,
      -panLimitY,
      panLimitY,
    );
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function endDrag(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    pinchStartDistance = 0;
    const remainingPointer = pointers.entries().next().value;
    if (remainingPointer) {
      const [nextPointerId, point] = remainingPointer;
      dragging = true;
      pointerId = nextPointerId;
      lastX = point.x;
      lastY = point.y;
      return;
    }
    dragging = false;
    pointerId = -1;
    canvas.classList.remove("is-dragging");
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9), true);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let previousFrameTime = window.performance.now();
  let animationFrame = 0;
  let disposed = false;

  function animate(frameTime: number): void {
    if (disposed) return;
    const delta = Math.min((frameTime - previousFrameTime) / 1_000, 0.05);
    previousFrameTime = frameTime;
    const panEase = reducedMotion ? 1 : 0.2;
    displayedScreenX = THREE.MathUtils.lerp(
      displayedScreenX,
      targetScreenX,
      panEase,
    );
    displayedScreenY = THREE.MathUtils.lerp(
      displayedScreenY,
      targetScreenY,
      panEase,
    );
    const worldUnitsPerPixel =
      VIEW_SIZE / (zoom * Math.max(canvas.clientHeight, 1));
    city.position
      .set(0, 0, 0)
      .addScaledVector(screenRight, displayedScreenX * worldUnitsPerPixel)
      .addScaledVector(
        screenDown,
        (displayedScreenY * worldUnitsPerPixel) / screenDownProjection,
      );
    if (
      Number.isNaN(reportedScreenX) ||
      Number.isNaN(reportedScreenY) ||
      Math.abs(displayedScreenX - reportedScreenX) > 0.05 ||
      Math.abs(displayedScreenY - reportedScreenY) > 0.05
    ) {
      reportedScreenX = displayedScreenX;
      reportedScreenY = displayedScreenY;
      onPanChange({ x: displayedScreenX, y: displayedScreenY });
    }

    if (requestedCount < completedCount) {
      for (let index = requestedCount; index < units.length; index += 1) {
        setUnitProgress(units[index]!, 0);
      }
      completedCount = requestedCount;
      activeProgress = 0;
    } else if (completedCount < requestedCount) {
      activeProgress = reducedMotion
        ? 1
        : Math.min(1, activeProgress + delta / COLOR_DURATION_SECONDS);
      setUnitProgress(units[completedCount]!, activeProgress);
      if (activeProgress >= 1) {
        completedCount += 1;
        activeProgress = 0;
      }
    }

    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(animate);
  }
  animationFrame = window.requestAnimationFrame(animate);

  return {
    resize(width, height) {
      viewportWidth = Math.max(width, 1);
      viewportHeight = Math.max(height, 1);
      panLimitX = Math.min(viewportWidth * 0.2, 140);
      panLimitY = Math.min(viewportHeight * 0.16, 100);
      targetScreenX = THREE.MathUtils.clamp(
        targetScreenX,
        -panLimitX,
        panLimitX,
      );
      targetScreenY = THREE.MathUtils.clamp(
        targetScreenY,
        -panLimitY,
        panLimitY,
      );
      updateProjection();
      renderer.setSize(viewportWidth, viewportHeight, false);
    },
    setZoom(nextZoom) {
      setZoom(nextZoom);
    },
    setCustomerCount(count) {
      requestedCount = Math.min(Math.max(Math.floor(count), 0), units.length);
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("wheel", onWheel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) material.dispose();
        }
        if (object instanceof THREE.LineSegments) object.geometry.dispose();
      });
      gradient.dispose();
      ink.dispose();
      renderer.dispose();
    },
  };
}
