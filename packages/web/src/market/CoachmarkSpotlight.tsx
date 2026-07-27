import { useEffect, useLayoutEffect, useState } from "react";
import type { CoachmarkId } from "./market-ui-state.ts";

type SpotlightRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

const PADDING = 8;
const MAX_TARGET_SEARCH_FRAMES = 120;

export function CoachmarkSpotlight({
  id,
  title,
  copy,
  onShown,
}: {
  id: CoachmarkId;
  title: string;
  copy: string;
  onShown: (id: CoachmarkId) => void;
}) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let searchFrames = 0;
    let observer: ResizeObserver | null = null;
    let detach = () => {};

    const measure = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-coachmark="${id}"]`,
      );
      if (!target) {
        searchFrames += 1;
        if (searchFrames >= MAX_TARGET_SEARCH_FRAMES) {
          console.warn(`Coachmark target not found: ${id}`);
          return;
        }
        frame = window.requestAnimationFrame(measure);
        return;
      }
      const update = () => {
        const bounds = target.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        setRect({
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        });
      };
      update();
      observer = new ResizeObserver(update);
      observer.observe(target);
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      detach = () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    };

    measure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      detach();
    };
  }, [id]);

  useEffect(() => {
    if (rect) onShown(id);
  }, [id, onShown, rect]);

  if (!rect) return null;

  const top = Math.max(0, rect.top - PADDING);
  const left = Math.max(0, rect.left - PADDING);
  const right = Math.min(window.innerWidth, rect.right + PADDING);
  const bottom = Math.min(window.innerHeight, rect.bottom + PADDING);
  const tooltipWidth = Math.min(300, window.innerWidth - 24);
  const tooltipLeft = Math.min(
    Math.max(12, rect.left + rect.width / 2 - tooltipWidth / 2),
    window.innerWidth - tooltipWidth - 12,
  );
  const tooltipTop =
    bottom + 130 < window.innerHeight ? bottom + 16 : Math.max(12, top - 118);

  return (
    <div className="coachmark-layer" aria-live="polite">
      <div
        className="coachmark-scrim"
        style={{ inset: `0 0 ${window.innerHeight - top}px 0` }}
      />
      <div
        className="coachmark-scrim"
        style={{
          top,
          left: 0,
          width: left,
          height: bottom - top,
        }}
      />
      <div
        className="coachmark-scrim"
        style={{
          top,
          left: right,
          right: 0,
          height: bottom - top,
        }}
      />
      <div
        className="coachmark-scrim"
        style={{ top: bottom, right: 0, bottom: 0, left: 0 }}
      />
      <div
        className="coachmark-ring"
        style={{
          top,
          left,
          width: right - left,
          height: bottom - top,
        }}
      />
      <aside
        className="coachmark-tip"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        <small>{title}</small>
        <strong>{copy}</strong>
      </aside>
    </div>
  );
}
