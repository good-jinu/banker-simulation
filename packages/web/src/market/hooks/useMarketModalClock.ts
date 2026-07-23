import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { type GameClock } from "../../lib/game-clock.ts";
import type { ClockSpeed } from "../../lib/game-clock.ts";

export type ClockView = { paused: boolean; speed: ClockSpeed };

export function useMarketModalClock(
  modalOpen: boolean,
  clockRef: RefObject<GameClock | null>,
  setClockView: Dispatch<SetStateAction<ClockView>>,
): void {
  const modalWasOpenRef = useRef(false);
  const resumeAfterModalRef = useRef(false);

  useEffect(() => {
    const clock = clockRef.current;
    if (!clock) return;

    if (modalOpen && !modalWasOpenRef.current) {
      modalWasOpenRef.current = true;
      resumeAfterModalRef.current = !clock.paused;
      if (clock.paused) return;
      clock.pause();
      setClockView((current) => ({ ...current, paused: true }));
      return;
    }

    if (!modalOpen && modalWasOpenRef.current) {
      modalWasOpenRef.current = false;
      if (resumeAfterModalRef.current) {
        clock.play();
        setClockView((current) => ({ ...current, paused: false }));
      }
      resumeAfterModalRef.current = false;
    }
  }, [clockRef, modalOpen, setClockView]);
}
