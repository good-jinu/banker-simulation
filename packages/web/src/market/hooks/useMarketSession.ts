import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  loadMarketSession,
  saveMarketSession,
  type MarketSessionSave,
} from "../../app/persistence.ts";
import type { MarketCampaignStage } from "../market-campaign.ts";
import {
  createWorld,
  type MarketAction,
  type MarketWorld,
} from "../market-world.ts";
import type { ClockView } from "./useMarketModalClock.ts";
import {
  initialMarketUiState,
  type MarketUiState,
} from "../market-ui-state.ts";
import type { ConsultationProgress } from "../market-consultation.ts";

type UseMarketSessionOptions = {
  stage: MarketCampaignStage;
  world: MarketWorld;
  dispatch: Dispatch<MarketAction>;
  clockView: ClockView;
  setClockView: Dispatch<SetStateAction<ClockView>>;
  ui: MarketUiState;
  setUi: Dispatch<SetStateAction<MarketUiState>>;
  consultation: ConsultationProgress;
  setConsultation: Dispatch<SetStateAction<ConsultationProgress>>;
  devMode: boolean;
  devPhase: "intro" | "map";
  devFresh: boolean;
};

export function useMarketSession({
  stage,
  world,
  dispatch,
  clockView,
  setClockView,
  ui,
  setUi,
  consultation,
  setConsultation,
  devMode,
  devPhase,
  devFresh,
}: UseMarketSessionOptions) {
  const [sessionReady, setSessionReady] = useState(false);
  const createSnapshot = useCallback(
    (): MarketSessionSave => ({
      schemaVersion: 1,
      stageId: stage.id,
      phase: "map",
      world: { ...world, events: [] },
      consultation,
      clock: clockView,
      ui,
      savedAt: Date.now(),
    }),
    [clockView, consultation, stage.id, ui, world],
  );

  useEffect(() => {
    let cancelled = false;
    loadMarketSession(stage.id, stage.config)
      .then((session) => {
        if (cancelled) return;
        if (session && !(devMode && devFresh)) {
          dispatch({ type: "restore", world: session.world });
          setClockView(session.clock);
          setUi(session.ui);
          setConsultation(session.consultation);
        } else if (devMode && devPhase === "map") {
          dispatch({
            type: "restore",
            world: createWorld(Date.now() >>> 0, stage.config),
          });
          setUi(initialMarketUiState());
        }
        setSessionReady(true);
      })
      .catch(() => {
        if (!cancelled) setSessionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    devFresh,
    devMode,
    devPhase,
    dispatch,
    setClockView,
    setConsultation,
    setUi,
    stage.config,
    stage.id,
  ]);

  useEffect(() => {
    if (!sessionReady) return;
    const handle = window.setTimeout(() => {
      void saveMarketSession(createSnapshot());
    }, 180);
    return () => window.clearTimeout(handle);
  }, [createSnapshot, devMode, sessionReady]);

  return { sessionReady };
}
