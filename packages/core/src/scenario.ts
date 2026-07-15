import { InputSeekingAgent, ValueSeekingAgent, runAgents } from "./domain/agents.ts";
import { EconomicEngine } from "./domain/engine.ts";
import { RandomIdGenerator } from "./domain/ids.ts";
import { SeededRandom } from "./domain/random.ts";
import type { EventStore, IdGenerator, RandomSource } from "./domain/types.ts";
import { MemoryEventStore } from "./infrastructure/memory-event-store.ts";

export interface ScenarioOptions {
  store?: EventStore;
  ids?: IdGenerator;
  random?: RandomSource;
  runInitialAgents?: boolean;
}

export function createDefaultScenario(options: ScenarioOptions = {}) {
  const store = options.store ?? new MemoryEventStore();
  const engine = new EconomicEngine(
    store,
    options.ids ?? new RandomIdGenerator(),
    options.random ?? new SeededRandom(20260715),
  );

  if (engine.events().length === 0) {
    engine.registerEntity("farmer", "Mina's Farm", "rule-based");
    engine.registerEntity("merchant", "Jun's Trading House", "rule-based");
    engine.registerEntity("player", "Player Cooperative", "human");

    engine.defineAsset({ id: "coin", name: "Coin", kind: "currency", divisible: true });
    engine.defineAsset({ id: "seed", name: "Seed Lot", kind: "resource", divisible: false });
    engine.defineAsset({ id: "grain", name: "Grain", kind: "resource", divisible: true });
    engine.defineAsset({ id: "land", name: "Farm Plot", kind: "property", divisible: false });

    engine.issue("merchant", "seed", 10);
    engine.issue("merchant", "coin", 100);
    engine.issue("farmer", "land", 1);
    engine.issue("player", "seed", 2);
    engine.issue("player", "coin", 50);

    engine.registerProductionRule({
      id: "grain-harvest",
      owner: "farmer",
      startsAt: 6,
      every: 6,
      inputs: [{ asset: "seed", amount: 1 }],
      successChance: 0.7,
      successOutputs: [{ asset: "grain", amount: 20 }],
      failureOutputs: [{ asset: "grain", amount: 4 }],
    });
  }

  const agents = [
    new InputSeekingAgent({
      entityId: "farmer",
      inputAsset: "seed",
      inputAmount: 1,
      paymentAsset: "grain",
      paymentAmount: 12,
      repaymentDelay: 6,
      counterparties: ["merchant", "player"],
    }),
    new ValueSeekingAgent({
      entityId: "merchant",
      valuations: { coin: 1, seed: 10, grain: 1, land: 200 },
      discountPerTick: 0.01,
      minimumProfit: 0.5,
      minimumKnownReputation: 0.5,
    }),
  ];

  if (options.runInitialAgents ?? true) runAgents(engine, agents);
  return { engine, agents };
}

