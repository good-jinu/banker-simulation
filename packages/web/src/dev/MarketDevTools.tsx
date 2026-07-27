import {
  useCallback,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  deleteMarketSession,
  loadMarketSession,
  saveMarketSession,
  type MarketSessionSave,
} from "../app/persistence.ts";
import { type GameClock } from "../lib/game-clock.ts";
import type { MarketCampaignStage } from "../market/market-campaign.ts";
import {
  createWorld,
  type MarketAction,
  type MarketWorld,
} from "../market/market-world.ts";
import type { ClockView } from "../market/hooks/useMarketModalClock.ts";
import {
  initialMarketUiState,
  type MarketUiState,
} from "../market/market-ui-state.ts";

type MarketDevToolsProps = {
  stage: MarketCampaignStage;
  world: MarketWorld;
  dispatch: Dispatch<MarketAction>;
  clockView: ClockView;
  setClockView: Dispatch<SetStateAction<ClockView>>;
  ui: MarketUiState;
  setUi: Dispatch<SetStateAction<MarketUiState>>;
  clockRef: RefObject<GameClock | null>;
};

/** Development-only manual session controls, loaded outside production builds. */
export function MarketDevTools({
  stage,
  world,
  dispatch,
  clockView,
  setClockView,
  ui,
  setUi,
  clockRef,
}: MarketDevToolsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const createSnapshot = useCallback(
    (): MarketSessionSave => ({
      schemaVersion: 1,
      stageId: stage.id,
      phase: "map",
      world: { ...world, events: [] },
      consultation: { asked: [], lastQuestion: null, expression: "requesting" },
      clock: clockView,
      ui,
      savedAt: Date.now(),
    }),
    [clockView, stage.id, ui, world],
  );
  const save = useCallback(async () => {
    await saveMarketSession(createSnapshot());
    setStatus("Saved");
  }, [createSnapshot]);
  const load = useCallback(async () => {
    const session = await loadMarketSession(stage.id, stage.config);
    if (!session) {
      setStatus("No saved session");
      return;
    }
    dispatch({ type: "restore", world: session.world });
    setClockView(session.clock);
    setUi(session.ui);
    clockRef.current?.setSpeed(session.clock.speed);
    if (session.clock.paused) clockRef.current?.pause();
    else clockRef.current?.play();
    setStatus("Loaded");
  }, [clockRef, dispatch, setClockView, setUi, stage.config, stage.id]);
  const reset = useCallback(async () => {
    await deleteMarketSession(stage.id);
    dispatch({
      type: "restore",
      world: createWorld(Date.now() >>> 0, stage.config),
    });
    setClockView({ paused: true, speed: 1 });
    setUi(initialMarketUiState());
    clockRef.current?.pause();
    clockRef.current?.setSpeed(1);
    setStatus("Reset");
  }, [clockRef, dispatch, setClockView, setUi, stage.config, stage.id]);
  const exportSnapshot = useCallback(() => {
    const blob = new Blob([JSON.stringify(createSnapshot(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `banker-${stage.id}-snapshot.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Exported");
  }, [createSnapshot, stage.id]);

  return (
    <aside className="dev-test-panel" aria-label="Manual test controls">
      <strong>DEV TEST</strong>
      <div>
        <button onClick={() => void save()}>Save</button>
        <button onClick={() => void load()}>Load</button>
        <button onClick={() => void reset()}>Reset</button>
        <button onClick={exportSnapshot}>Export JSON</button>
      </div>
      {status && <small>{status}</small>}
    </aside>
  );
}
