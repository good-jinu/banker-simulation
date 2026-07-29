import { ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { CityBackground } from "../city/CityBackground.tsx";
import type { CityDistrictVisualState } from "../city/market-city-layout.ts";
import type { MapProjection } from "./market-camera.ts";
import type { MarketMapDefinition } from "./market-map.ts";

export function MapViewport({
  map,
  seed,
  districtStates,
  dragHint,
  hasDraggedMap,
  zoomInLabel,
  zoomOutLabel,
  onFirstDrag,
  onProjectionChange,
  showNavigation = true,
}: {
  map: MarketMapDefinition;
  seed: number;
  districtStates: readonly CityDistrictVisualState[];
  dragHint: string;
  hasDraggedMap: boolean;
  zoomInLabel: string;
  zoomOutLabel: string;
  onFirstDrag: () => void;
  onProjectionChange: (projection: MapProjection) => void;
  showNavigation?: boolean;
}) {
  const [zoom, setZoom] = useState(map.camera.initialZoom);
  // The world RNG advances as applicants and outcomes are generated. The city
  // seed is visual state, so keep its opening value for this mounted map rather
  // than rebuilding the renderer and resetting its camera on every RNG change.
  const [citySeed] = useState(seed);
  const zoomStep = (map.camera.maxZoom - map.camera.minZoom) / 8;

  return (
    <>
      <CityBackground
        map={map}
        seed={citySeed}
        districtStates={districtStates}
        zoom={zoom}
        dragHint={dragHint}
        showDragHint={showNavigation && !hasDraggedMap}
        onProjectionChange={onProjectionChange}
        onFirstDrag={onFirstDrag}
        onZoomChange={setZoom}
      />
      {showNavigation && (
        <div className="map-zoom-controls">
          <button
            onClick={() =>
              setZoom((current) =>
                Math.min(current + zoomStep, map.camera.maxZoom),
              )
            }
            aria-label={zoomInLabel}
            disabled={zoom >= map.camera.maxZoom}
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <button
            onClick={() =>
              setZoom((current) =>
                Math.max(current - zoomStep, map.camera.minZoom),
              )
            }
            aria-label={zoomOutLabel}
            disabled={zoom <= map.camera.minZoom}
          >
            <ZoomOut aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
