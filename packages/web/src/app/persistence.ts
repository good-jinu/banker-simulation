import type { MarketStageConfig } from "../market/market-campaign.ts";
import type { ConsultationProgress } from "../market/CustomerConsultation.tsx";
import { CLOCK_SPEEDS, type ClockSpeed } from "../lib/game-clock.ts";
import {
  emptyMarketRunStats,
  type MarketRunStats,
  type MarketWorld,
  withdrawalEventFor,
} from "../market/market-world.ts";
import { isReputation } from "../market/market-trust.ts";
import {
  initialMarketUiState,
  type MarketUiState,
} from "../market/market-ui-state.ts";

const DATABASE_NAME = "banker-simulation";
const DATABASE_VERSION = 3;
const STORE_NAME = "save-parts";

const MARKET_SESSION_SCHEMA_VERSION = 2;

export interface CampaignProgress {
  schemaVersion: 2;
  completedStageIds: string[];
  rewards: string[];
  mostRecentStageId: string | null;
}

export interface PlayerSettings {
  schemaVersion: 2;
  reducedMotion: boolean;
  locale?: "en" | "ko";
}

export interface SaveEnvelope {
  schemaVersion: 2;
  campaign: CampaignProgress;
  settings: PlayerSettings;
}

export interface MarketSessionSave {
  schemaVersion: 2;
  stageId: string;
  phase: "intro" | "map";
  world: MarketWorld;
  consultation: ConsultationProgress;
  clock: { paused: boolean; speed: ClockSpeed };
  ui: MarketUiState;
  savedAt: number;
}

export function emptySave(): SaveEnvelope {
  return {
    schemaVersion: 2,
    campaign: {
      schemaVersion: 2,
      completedStageIds: [],
      rewards: [],
      mostRecentStageId: null,
    },
    settings: { schemaVersion: 2, reducedMotion: false },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the save database"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () =>
      reject(request.error ?? new Error("Save operation failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

export function migrateCampaign(value: unknown): CampaignProgress {
  const fallback = emptySave().campaign;
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    schemaVersion: 2,
    completedStageIds: Array.isArray(record.completedStageIds)
      ? record.completedStageIds.filter(
          (stageId): stageId is string => typeof stageId === "string",
        )
      : [],
    rewards: Array.isArray(record.rewards)
      ? record.rewards.filter(
          (reward): reward is string => typeof reward === "string",
        )
      : [],
    mostRecentStageId:
      typeof record.mostRecentStageId === "string"
        ? record.mostRecentStageId
        : null,
  };
}

export function migrateSettings(value: unknown): PlayerSettings {
  const fallback = emptySave().settings;
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const locale =
    record.locale === "ko" || record.locale === "en"
      ? record.locale
      : undefined;
  return {
    schemaVersion: 2,
    reducedMotion: record.reducedMotion === true,
    ...(locale ? { locale } : {}),
  };
}

export function migrateSaveParts(
  campaignValue: unknown,
  settingsValue: unknown,
): SaveEnvelope {
  return {
    schemaVersion: 2,
    campaign: migrateCampaign(campaignValue),
    settings: migrateSettings(settingsValue),
  };
}

export async function loadGame(): Promise<SaveEnvelope> {
  if (!("indexedDB" in globalThis)) return emptySave();
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const [campaign, settings] = await Promise.all([
      requestValue(store.get("campaign")),
      requestValue(store.get("settings")),
    ]);
    return migrateSaveParts(campaign, settings);
  } finally {
    database.close();
  }
}

export async function saveGame(save: SaveEnvelope): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({ schemaVersion: 2 }, "meta");
      store.put(structuredClone(save.campaign), "campaign");
      store.put(structuredClone(save.settings), "settings");
      store.delete("activeRun");
      store.delete("draft");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save the game"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Save was interrupted"));
    });
  } finally {
    database.close();
  }
}

function marketSessionKey(stageId: string): string {
  return `market-session:${stageId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function migrateProducts(value: unknown): MarketWorld["products"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((product) => {
    if (product.kind === "loan") {
      const rules = isRecord(product.rules)
        ? {
            ...product.rules,
            interestRate:
              typeof product.rules.interestRate === "number"
                ? product.rules.interestRate
                : 10,
          }
        : product.rules;
      return { ...product, active: product.active !== false, rules };
    }
    return product;
  }) as MarketWorld["products"];
}

function emptyConsultation(): ConsultationProgress {
  return { asked: [], lastQuestion: null, expression: "requesting" };
}

function migrateMarketRunStats(value: unknown): MarketRunStats {
  const fallback = emptyMarketRunStats();
  if (!isRecord(value)) return fallback;
  return Object.fromEntries(
    Object.keys(fallback).map((key) => [
      key,
      typeof value[key] === "number"
        ? value[key]
        : fallback[key as keyof MarketRunStats],
    ]),
  ) as MarketRunStats;
}

export function migrateMarketSession(
  value: unknown,
  stageId: string,
  config: MarketStageConfig,
): MarketSessionSave | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== MARKET_SESSION_SCHEMA_VERSION ||
    value.stageId !== stageId
  )
    return null;
  const rawWorld = value.world;
  if (
    !isRecord(rawWorld) ||
    typeof rawWorld.day !== "number" ||
    typeof rawWorld.cash !== "number" ||
    !Array.isArray(rawWorld.customers) ||
    !Array.isArray(rawWorld.funding) ||
    typeof rawWorld.trust !== "number" ||
    !Number.isFinite(rawWorld.trust) ||
    rawWorld.trust < 0 ||
    rawWorld.trust > 100 ||
    // Trust is derived from the reputation record, so a save without one
    // cannot be replayed. Reject rather than invent a plausible history.
    !isReputation(rawWorld.reputation) ||
    (rawWorld.failureReason !== null &&
      rawWorld.failureReason !== "cash" &&
      rawWorld.failureReason !== "trust") ||
    typeof rawWorld.insolvent !== "boolean" ||
    !rawWorld.funding.every(
      (lender) => isRecord(lender) && typeof lender.defaulted === "boolean",
    )
  )
    return null;

  const rawConsultation = isRecord(value.consultation)
    ? value.consultation
    : {};
  const asked = Array.isArray(rawConsultation.asked)
    ? rawConsultation.asked.filter(
        (question): question is "purpose" | "income" =>
          question === "purpose" || question === "income",
      )
    : [];
  const lastQuestion =
    rawConsultation.lastQuestion === "purpose" ||
    rawConsultation.lastQuestion === "income"
      ? rawConsultation.lastQuestion
      : null;
  const expression =
    rawConsultation.expression === "neutral" ||
    rawConsultation.expression === "requesting" ||
    rawConsultation.expression === "evaluating" ||
    rawConsultation.expression === "worried" ||
    rawConsultation.expression === "relieved" ||
    rawConsultation.expression === "rejected"
      ? rawConsultation.expression
      : "requesting";
  const rawClock = isRecord(value.clock) ? value.clock : {};
  const speed = CLOCK_SPEEDS.includes(rawClock.speed as ClockSpeed)
    ? (rawClock.speed as ClockSpeed)
    : 1;
  return {
    schemaVersion: MARKET_SESSION_SCHEMA_VERSION,
    stageId,
    phase: value.phase === "map" ? "map" : "intro",
    world: {
      ...(rawWorld as MarketWorld),
      level: config.level,
      config,
      funding: rawWorld.funding as MarketWorld["funding"],
      products: migrateProducts(rawWorld.products),
      depositors: Array.isArray(rawWorld.depositors)
        ? (rawWorld.depositors as MarketWorld["depositors"])
        : config.depositSeeds.map((depositor) => ({ ...depositor })),
      withdrawalEvent: isRecord(rawWorld.withdrawalEvent)
        ? (rawWorld.withdrawalEvent as MarketWorld["withdrawalEvent"])
        : withdrawalEventFor(
            typeof rawWorld.seed === "number" ? rawWorld.seed : 1,
            config,
          ),
      news: Array.isArray(rawWorld.news) ? rawWorld.news : [],
      stats: migrateMarketRunStats(rawWorld.stats),
      events: [],
    },
    consultation: { asked, lastQuestion, expression },
    clock: { paused: rawClock.paused !== false, speed },
    ui: {
      ...initialMarketUiState(),
      hasDraggedMap: isRecord(value.ui) && value.ui.hasDraggedMap === true,
    },
    savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
  };
}

export async function loadMarketSession(
  stageId: string,
  config: MarketStageConfig,
): Promise<MarketSessionSave | null> {
  if (!("indexedDB" in globalThis)) return null;
  const database = await openDatabase();
  let value: unknown;
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    value = await requestValue(
      transaction.objectStore(STORE_NAME).get(marketSessionKey(stageId)),
    );
  } finally {
    database.close();
  }
  const session = migrateMarketSession(value, stageId, config);
  if (value !== undefined && session === null) {
    await deleteMarketSession(stageId);
  }
  return session;
}

export async function saveMarketSession(
  session: MarketSessionSave,
): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction
        .objectStore(STORE_NAME)
        .put(structuredClone(session), marketSessionKey(session.stageId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save market session"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Market session save aborted"));
    });
  } finally {
    database.close();
  }
}

export async function deleteMarketSession(stageId: string): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(marketSessionKey(stageId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("Could not delete market session"),
        );
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Market session delete aborted"));
    });
  } finally {
    database.close();
  }
}
