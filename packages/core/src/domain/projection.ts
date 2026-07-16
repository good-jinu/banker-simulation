import { advanceWithAgents, runAgents, type RuleBasedAgent } from "./agents.ts";
import { EconomicEngine } from "./engine.ts";
import { RandomIdGenerator } from "./ids.ts";
import { SeededRandom } from "./random.ts";
import { balanceOf, rebuildWorld } from "./state.ts";
import type { StoredEvent } from "./types.ts";
import { MemoryEventStore } from "../infrastructure/memory-event-store.ts";

export interface ProjectionSample {
  seed: number;
  playerNetValue: number;
  newDefaults: number;
  newLiquidations: number;
}

export interface ProjectionSummary {
  ticks: number;
  samples: ProjectionSample[];
  probabilityOfDefault: number;
  meanNetValue: number;
  bestCase: ProjectionSample;
  worstCase: ProjectionSample;
}

export interface ProjectionInput {
  events: StoredEvent[];
  agents: RuleBasedAgent[];
  ticks: number;
  seeds: number[];
  perspective: string;
  valuation: Record<string, number>;
  apply?: (engine: EconomicEngine) => void;
}

/** Simulates N ticks forward under many RNG seeds without touching the caller's event store. */
export function projectOutcome(input: ProjectionInput): ProjectionSummary {
  if (input.seeds.length === 0) throw new Error("projectOutcome requires at least one seed");

  const baseline = rebuildWorld(input.events);
  const defaultedBaseline = new Set(
    [...baseline.agreements.values()]
      .filter((agreement) => agreement.status === "defaulted")
      .map((agreement) => agreement.id),
  );
  const liquidationsBaseline = input.events.filter(
    (event) => event.type === "CollateralLiquidated",
  ).length;

  const samples = input.seeds.map((seed) => {
    const store = new MemoryEventStore();
    store.append(input.events, 0);
    const engine = new EconomicEngine(store, new RandomIdGenerator(), new SeededRandom(seed));

    input.apply?.(engine);
    runAgents(engine, input.agents);
    advanceWithAgents(engine, input.agents, input.ticks);

    const finalState = engine.inspect();
    const newDefaults = [...finalState.agreements.values()].filter(
      (agreement) => agreement.status === "defaulted" && !defaultedBaseline.has(agreement.id),
    ).length;
    const newLiquidations =
      engine.events().filter((event) => event.type === "CollateralLiquidated").length -
      liquidationsBaseline;
    const playerNetValue = [...finalState.assets.values()].reduce(
      (total, asset) =>
        total + balanceOf(finalState, input.perspective, asset.id) * (input.valuation[asset.id] ?? 0),
      0,
    );

    const sample: ProjectionSample = { seed, playerNetValue, newDefaults, newLiquidations };
    return sample;
  });

  const probabilityOfDefault =
    samples.filter((sample) => sample.newDefaults > 0).length / samples.length;
  const meanNetValue =
    samples.reduce((total, sample) => total + sample.playerNetValue, 0) / samples.length;
  const bestCase = samples.reduce((best, sample) =>
    sample.playerNetValue > best.playerNetValue ? sample : best,
  );
  const worstCase = samples.reduce((worst, sample) =>
    sample.playerNetValue < worst.playerNetValue ? sample : worst,
  );

  return { ticks: input.ticks, samples, probabilityOfDefault, meanNetValue, bestCase, worstCase };
}
