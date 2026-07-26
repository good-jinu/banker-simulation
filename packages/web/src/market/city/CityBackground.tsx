import { useEffect, useRef } from "react";
import type { CityPan, CityScene } from "./city-scene.ts";

type CityBackgroundProps = {
  customerCount: number;
  zoom: number;
  dragHint: string;
  showDragHint: boolean;
  onPanChange: (pan: CityPan) => void;
  onFirstDrag: () => void;
  onZoomChange: (zoom: number) => void;
};

/** Hosts the lazily loaded Three.js city canvas and its drag hint. */
export function CityBackground({
  customerCount,
  zoom,
  dragHint,
  showDragHint,
  onPanChange,
  onFirstDrag,
  onZoomChange,
}: CityBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const latestCustomerCount = useRef(customerCount);
  const latestZoom = useRef(zoom);
  const onPanChangeRef = useRef(onPanChange);
  const onFirstDragRef = useRef(onFirstDrag);
  const onZoomChangeRef = useRef(onZoomChange);
  latestCustomerCount.current = customerCount;
  latestZoom.current = zoom;
  onPanChangeRef.current = onPanChange;
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
          latestCustomerCount.current,
          (pan) => onPanChangeRef.current(pan),
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
  }, []);

  useEffect(() => {
    sceneRef.current?.setCustomerCount(customerCount);
  }, [customerCount]);

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
