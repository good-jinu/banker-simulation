import { useEffect, useRef } from "react";
import { MarketStage } from "../market-stage.ts";
import type { MarketWorld } from "../market-world.ts";

export function MarketStageView({
  world,
  suspended,
  timeFlowing,
  highlightedDemandId,
  onTapDemand,
  onTapContract,
  onDropDemand,
  onMoveContract,
}: {
  world: MarketWorld;
  /** True while an opaque overlay covers the map; pauses Pixi rendering. */
  suspended: boolean;
  /** True while the game clock advances; map nodes vibrate to show it. */
  timeFlowing: boolean;
  /** Optional demand node to call out for a tutorial. */
  highlightedDemandId: string | null;
  onTapDemand: (demandId: string) => void;
  onTapContract: (contractId: string) => void;
  onDropDemand: (demandId: string, contractId: string) => boolean;
  onMoveContract: (contractId: string, x: number, y: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<MarketStage | null>(null);
  // Callbacks live in a ref so the Pixi app never re-initializes just
  // because a render produced fresh closures.
  const callbacksRef = useRef({
    onTapDemand,
    onTapContract,
    onDropDemand,
    onMoveContract,
  });
  callbacksRef.current = {
    onTapDemand,
    onTapContract,
    onDropDemand,
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
      .init(host, {
        onTapDemand: (id) => callbacksRef.current.onTapDemand(id),
        onTapContract: (id) => callbacksRef.current.onTapContract(id),
        onDropDemand: (demandId, contractId) =>
          callbacksRef.current.onDropDemand(demandId, contractId),
        onMoveContract: (contractId, x, y) =>
          callbacksRef.current.onMoveContract(contractId, x, y),
      })
      .then(() => stage.syncWorld(worldRef.current));
    return () => {
      stageRef.current = null;
      stage.destroy();
    };
  }, []);

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

  return (
    <div
      ref={hostRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    />
  );
}
