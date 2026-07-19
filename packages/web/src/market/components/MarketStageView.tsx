import { useEffect, useRef } from "react";
import type { Locale } from "../../i18n/locale.ts";
import { MarketStage } from "../market-stage.ts";
import type { MarketWorld } from "../market-world.ts";

export type DemandAbsorption = {
  id: string;
  demandId: string;
  contractId: string;
};

export function MarketStageView({
  world,
  locale,
  suspended,
  timeFlowing,
  highlightedDemandId,
  highlightedContractId,
  pendingAbsorptions,
  onTapDemand,
  onTapContract,
  onAbsorptionComplete,
  onMoveContract,
}: {
  world: MarketWorld;
  locale: Locale;
  /** True while an opaque overlay covers the map; pauses Pixi rendering. */
  suspended: boolean;
  /** True while the game clock advances; map nodes vibrate to show it. */
  timeFlowing: boolean;
  /** Optional demand node to call out for a tutorial. */
  highlightedDemandId: string | null;
  /** Optional contract node to call out for a tutorial. */
  highlightedContractId: string | null;
  pendingAbsorptions: readonly DemandAbsorption[];
  onTapDemand: (demandId: string) => void;
  onTapContract: (contractId: string) => void;
  onAbsorptionComplete: (absorption: DemandAbsorption) => void;
  onMoveContract: (contractId: string, x: number, y: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<MarketStage | null>(null);
  // Callbacks live in a ref so the Pixi app never re-initializes just
  // because a render produced fresh closures.
  const callbacksRef = useRef({
    onTapDemand,
    onTapContract,
    onMoveContract,
  });
  callbacksRef.current = {
    onTapDemand,
    onTapContract,
    onMoveContract,
  };
  const worldRef = useRef(world);
  worldRef.current = world;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = new MarketStage();
    stageRef.current = stage;
    void stage
      .init(
        host,
        {
          onTapDemand: (id) => callbacksRef.current.onTapDemand(id),
          onTapContract: (id) => callbacksRef.current.onTapContract(id),
          onMoveContract: (contractId, x, y) =>
            callbacksRef.current.onMoveContract(contractId, x, y),
        },
        locale,
      )
      .then(() => stage.syncWorld(worldRef.current));
    return () => {
      stageRef.current = null;
      stage.destroy();
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setLocale(locale);
  }, [locale]);

  useEffect(() => {
    stageRef.current?.syncWorld(world);
  }, [world]);

  useEffect(() => {
    stageRef.current?.setSuspended(suspended);
  }, [suspended]);

  useEffect(() => {
    stageRef.current?.setTimeFlowing(timeFlowing);
  }, [timeFlowing]);

  useEffect(() => {
    stageRef.current?.setHighlightedDemand(highlightedDemandId);
  }, [highlightedDemandId]);

  useEffect(() => {
    stageRef.current?.setHighlightedContract(highlightedContractId);
  }, [highlightedContractId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || suspended) return;
    for (const absorption of pendingAbsorptions)
      stage.absorbDemand(absorption.demandId, absorption.contractId, () =>
        onAbsorptionComplete(absorption),
      );
  }, [onAbsorptionComplete, pendingAbsorptions, suspended]);

  return (
    <div
      ref={hostRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    />
  );
}
