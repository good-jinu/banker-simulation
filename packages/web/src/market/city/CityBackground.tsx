import { useEffect, useRef } from "react";
import type { MapProjection } from "../map/market-camera.ts";
import type { MarketMapDefinition } from "../map/market-map.ts";
import type { CityDistrictVisualState } from "./market-city-layout.ts";
import type { CityScene } from "./city-scene.ts";

type CityBackgroundProps = {
  map: MarketMapDefinition;
  seed: number;
  districtStates: readonly CityDistrictVisualState[];
  zoom: number;
  dragHint: string;
  showDragHint: boolean;
  onProjectionChange: (projection: MapProjection) => void;
  onFirstDrag: () => void;
  onZoomChange: (zoom: number) => void;
};

/** Hosts the lazily loaded Three.js city canvas and its drag hint. */
export function CityBackground({
  map,
  seed,
  districtStates,
  zoom,
  dragHint,
  showDragHint,
  onProjectionChange,
  onFirstDrag,
  onZoomChange,
}: CityBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const latestZoom = useRef(zoom);
  const latestDistrictStates = useRef(districtStates);
  const onProjectionChangeRef = useRef(onProjectionChange);
  const onFirstDragRef = useRef(onFirstDrag);
  const onZoomChangeRef = useRef(onZoomChange);
  latestZoom.current = zoom;
  latestDistrictStates.current = districtStates;
  onProjectionChangeRef.current = onProjectionChange;
  onFirstDragRef.current = onFirstDrag;
  onZoomChangeRef.current = onZoomChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sceneCanvas: HTMLCanvasElement = canvas;
    let cancelled = false;
    let cityScene: CityScene | null = null;
    let observer: ResizeObserver | null = null;

    async function mountScene(): Promise<void> {
      try {
        const { createCityScene } = await import("./city-scene.ts");
        if (cancelled) return;
        cityScene = createCityScene(
          sceneCanvas,
          map,
          seed,
          latestZoom.current,
          latestDistrictStates.current,
          (projection) => onProjectionChangeRef.current(projection),
          () => onFirstDragRef.current(),
          (nextZoom) => onZoomChangeRef.current(nextZoom),
        );
        sceneRef.current = cityScene;
        cityScene.setZoom(latestZoom.current);
        observer = new ResizeObserver((entries) => {
          const size = entries[0]?.contentRect;
          if (size) cityScene?.resize(size.width, size.height);
        });
        observer.observe(sceneCanvas);
        cityScene.resize(sceneCanvas.clientWidth, sceneCanvas.clientHeight);
      } catch {
        sceneCanvas.dataset.cityRenderer = "unavailable";
      }
    }
    void mountScene();

    return () => {
      cancelled = true;
      observer?.disconnect();
      sceneRef.current = null;
      cityScene?.dispose();
    };
  }, [map, seed]);

  useEffect(() => {
    sceneRef.current?.setDistrictStates(districtStates);
  }, [districtStates]);

  useEffect(() => {
    sceneRef.current?.setZoom(zoom);
  }, [zoom]);

  return (
    <div className="city-background" aria-hidden="true">
      <canvas ref={canvasRef} />
      {showDragHint && <span className="city-drag-hint">{dragHint}</span>}
    </div>
  );
}
