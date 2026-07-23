import { useEffect, type Dispatch, type RefObject } from "react";
import { GameClock } from "../../lib/game-clock.ts";
import type { MarketAction } from "../market-world.ts";

const DAY_MS = 1_500;

export function useMarketClock(
  ready: boolean,
  dispatch: Dispatch<MarketAction>,
  clockRef: RefObject<GameClock | null>,
) {
  useEffect(() => {
    if (!ready) return;
    const clock = new GameClock(() => {
      dispatch({ type: "advance-day" });
      return true;
    }, DAY_MS);
    clockRef.current = clock;
    clock.start();
    return () => clock.dispose();
  }, [clockRef, dispatch, ready]);
}
