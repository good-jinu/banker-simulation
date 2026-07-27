import { ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import { CityBackground } from "../city/CityBackground.tsx";
import type { CityPan } from "../city/city-scene.ts";

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.2;

export function MapViewport({
  customerCount,
  dragHint,
  hasDraggedMap,
  zoomInLabel,
  zoomOutLabel,
  onFirstDrag,
  onPanChange,
  onZoomChange,
  showNavigation = true,
}: {
  customerCount: number;
  dragHint: string;
  hasDraggedMap: boolean;
  zoomInLabel: string;
  zoomOutLabel: string;
  onFirstDrag: () => void;
  onPanChange: (pan: CityPan) => void;
  onZoomChange: (zoom: number) => void;
  showNavigation?: boolean;
}) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    onZoomChange(zoom);
  }, [onZoomChange, zoom]);

  return (
    <>
      <CityBackground
        customerCount={customerCount}
        zoom={zoom}
        dragHint={dragHint}
        showDragHint={showNavigation && !hasDraggedMap}
        onPanChange={onPanChange}
        onFirstDrag={onFirstDrag}
        onZoomChange={setZoom}
      />
      {showNavigation && (
        <div className="map-zoom-controls">
          <button
            onClick={() =>
              setZoom((current) => Math.min(current + ZOOM_STEP, MAX_ZOOM))
            }
            aria-label={zoomInLabel}
            disabled={zoom >= MAX_ZOOM}
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <button
            onClick={() =>
              setZoom((current) => Math.max(current - ZOOM_STEP, MIN_ZOOM))
            }
            aria-label={zoomOutLabel}
            disabled={zoom <= MIN_ZOOM}
          >
            <ZoomOut aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
