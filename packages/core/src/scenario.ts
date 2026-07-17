import {
  FundingSeekingAgent,
  InputPurchasingAgent,
  InputSeekingAgent,
  InventoryPricingAgent,
  LiquiditySeekingAgent,
  MarketMakerAgent,
  RivalLenderAgent,
  ValueSeekingAgent,
  runAgents,
} from "./domain/agents.ts";
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
    engine.registerEntity("mill", "Sol's Mill", "rule-based");
    engine.registerEntity("merchant", "Jun's Trading House", "rule-based");
    engine.registerEntity("rival", "Aster Capital", "rule-based");
    engine.registerEntity("player", "Player Cooperative", "human");

    engine.defineAsset({ id: "coin", name: "Coin", kind: "currency", divisible: true });
    engine.defineAsset({ id: "seed", name: "Seed Lot", kind: "resource", divisible: false });
    engine.defineAsset({ id: "grain", name: "Grain", kind: "resource", divisible: true });
    engine.defineAsset({ id: "flour", name: "Flour", kind: "resource", divisible: true });
    engine.defineAsset({ id: "land", name: "Farm Plot", kind: "property", divisible: false });

    engine.issue("merchant", "seed", 10);
    engine.issue("merchant", "coin", 100);
    engine.issue("rival", "coin", 12);
    engine.issue("farmer", "land", 1);
    engine.issue("player", "seed", 2);
    engine.issue("player", "coin", 15);

    // Harvest lands one tick before a t+6 repayment comes due, so grain can become coin in time.
    engine.registerProductionRule({
      id: "grain-harvest",
      owner: "farmer",
      startsAt: 5,
      every: 6,
      inputs: [{ asset: "seed", amount: 1 }],
      successChance: 0.7,
      successOutputs: [{ asset: "grain", amount: 20 }],
      failureOutputs: [{ asset: "grain", amount: 4 }],
    });
    // Mina sells grain near repayment time; Sol can then mill it before a t+12 loan is due.
    engine.registerProductionRule({
      id: "flour-milling",
      owner: "mill",
      startsAt: 11,
      every: 6,
      inputs: [{ asset: "grain", amount: 6 }],
      successChance: 0.85,
      successOutputs: [{ asset: "flour", amount: 12 }],
      failureOutputs: [{ asset: "flour", amount: 4 }],
    });
  }

  const agents = [
    // Jun supplies farm inputs and buys the chain's final output.
    new MarketMakerAgent({
      entityId: "merchant",
      offers: [
        { side: "sell", asset: "seed", priceAsset: "coin", pricePerUnit: 8, amount: 10 },
        { side: "buy", asset: "flour", priceAsset: "coin", pricePerUnit: 1.2, amount: 60 },
      ],
    }),
    // Jun's grain bid falls as his warehouse fills; ordinary offer events expose every reprice.
    new InventoryPricingAgent({
      entityId: "merchant",
      side: "buy",
      asset: "grain",
      priceAsset: "coin",
      amount: 60,
      priceBands: [
        { below: 5, pricePerUnit: 1.2 },
        { below: 15, pricePerUnit: 1 },
        { below: Number.POSITIVE_INFINITY, pricePerUnit: 0.7 },
      ],
    }),
    // Sol posts the best grain bid only when financing gives the mill buying power.
    new MarketMakerAgent({
      entityId: "mill",
      offers: [
        { side: "buy", asset: "grain", priceAsset: "coin", pricePerUnit: 1.25, amount: 8 },
      ],
    }),
    new InputPurchasingAgent({
      entityId: "farmer",
      inputAsset: "seed",
      inputAmount: 1,
      priceAsset: "coin",
      maxPricePerUnit: 10,
    }),
    new FundingSeekingAgent({
      entityId: "farmer",
      fundingAsset: "coin",
      neededBalance: 8,
      wantAsset: { asset: "seed", amount: 1 },
      maxInterestRate: 0.3,
      minTerm: 6,
      collateralBudget: { land: 1 },
    }),
    new FundingSeekingAgent({
      entityId: "mill",
      fundingAsset: "coin",
      neededBalance: 8,
      maxInterestRate: 0.25,
      minTerm: 12,
    }),
    new InputSeekingAgent({
      entityId: "farmer",
      inputAsset: "seed",
      inputAmount: 1,
      paymentAsset: "grain",
      paymentAmount: 12,
      repaymentDelay: 6,
      counterparties: ["merchant", "player"],
    }),
    new LiquiditySeekingAgent({
      entityId: "farmer",
      cashAsset: "coin",
      horizon: 3,
      sellAssets: ["grain"],
    }),
    new LiquiditySeekingAgent({
      entityId: "mill",
      cashAsset: "coin",
      horizon: 3,
      sellAssets: ["flour"],
    }),
    // Aster waits a complete tick, then spends its limited capital on one acceptable application.
    new RivalLenderAgent({
      entityId: "rival",
      waitTicks: 1,
      fundingAsset: "coin",
      minimumInterestRate: 0.1,
      maximumPrincipal: 12,
    }),
    // Jun is barter-averse: cheap grain promises get declined, so financing falls to the player.
    new ValueSeekingAgent({
      entityId: "merchant",
      valuations: { coin: 1, seed: 10, grain: 1, land: 200 },
      discountPerTick: 0.01,
      minimumProfit: 2,
      minimumKnownReputation: 0.5,
    }),
  ];

  if (options.runInitialAgents ?? true) runAgents(engine, agents);
  return { engine, agents };
}
