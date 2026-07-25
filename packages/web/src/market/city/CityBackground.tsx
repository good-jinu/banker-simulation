import { useEffect, useRef } from "react";
import type { CityPan, CityScene } from "./city-scene.ts";

type CityBackgroundProps = {
  customerCount: number;
  dragHint: string;
  onPanChange: (pan: CityPan) => void;
};

/** Hosts the lazily loaded Three.js city canvas and its drag hint. */
export function CityBackground({
  customerCount,
  dragHint,
  onPanChange,
}: CityBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const latestCustomerCount = useRef(customerCount);
  const onPanChangeRef = useRef(onPanChange);
  latestCustomerCount.current = customerCount;
  onPanChangeRef.current = onPanChange;

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
        );
        sceneRef.current = cityScene;
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

  return (
    <div className="city-background" aria-hidden="true">
      <canvas ref={canvasRef} />
      <span className="city-drag-hint">{dragHint}</span>
    </div>
  );
}
