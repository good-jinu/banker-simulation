import type { MarketStageConfig } from "../market/market-campaign.ts";
import {
  isConsultationQuestionId,
  type ConsultationProgress,
} from "../market/market-consultation.ts";
import { CLOCK_SPEEDS, type ClockSpeed } from "../lib/game-clock.ts";
import {
  emptyMarketRunStats,
  type MarketRunStats,
  type MarketWorld,
  withdrawalEventFor,
} from "../market/market-world.ts";
import { isReputation, openingReputation } from "../market/market-trust.ts";
import { isOnboardingStep } from "../market/market-onboarding.ts";
import {
  inferredCompletedCoachmarks,
  initialMarketUiState,
  isCoachmarkId,
  type MarketUiState,
} from "../market/market-ui-state.ts";

const DATABASE_NAME = "banker-simulation";
const DATABASE_VERSION = 3;
const STORE_NAME = "save-parts";

const MARKET_SESSION_SCHEMA_VERSION = 1;

export interface CampaignProgress {
  schemaVersion: 1;
  completedStageIds: string[];
  rewards: string[];
  mostRecentStageId: string | null;
}

export interface PlayerSettings {
  schemaVersion: 1;
  reducedMotion: boolean;
  locale?: "en" | "ko";
}

export interface SaveEnvelope {
  schemaVersion: 1;
  campaign: CampaignProgress;
  settings: PlayerSettings;
}

export interface MarketSessionSave {
  schemaVersion: 1;
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
    schemaVersion: 1,
    campaign: {
      schemaVersion: 1,
      completedStageIds: [],
      rewards: [],
      mostRecentStageId: null,
    },
    settings: { schemaVersion: 1, reducedMotion: false },
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
    schemaVersion: 1,
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
    schemaVersion: 1,
    reducedMotion: record.reducedMotion === true,
    ...(locale ? { locale } : {}),
  };
}

export function migrateSaveParts(
  campaignValue: unknown,
  settingsValue: unknown,
): SaveEnvelope {
  return {
    schemaVersion: 1,
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
      store.put({ schemaVersion: 1 }, "meta");
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
    if (product.kind === "deposit") {
      return {
        ...product,
        active: product.active !== false,
        interestRate:
          typeof product.interestRate === "number" ? product.interestRate : 2,
      };
    }
    return product;
  }) as MarketWorld["products"];
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

/**
 * Fills in reputation terms a save predates. `activity` is new, and a returning
 * player should resume with the market's attention rather than at the standing
 * of a bank that has not traded in weeks.
 */
function migrateReputation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return typeof value.activity === "number" && Number.isFinite(value.activity)
    ? value
    : { ...value, activity: openingReputation().activity };
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
  const rawWorld = isRecord(value.world)
    ? { ...value.world, reputation: migrateReputation(value.world.reputation) }
    : value.world;
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
    // `insolvent` is the older name for the same flag, from before a lost run
    // could mean anything but running out of money.
    typeof (rawWorld.runFailed ?? rawWorld.insolvent) !== "boolean" ||
    !rawWorld.funding.every(
      (lender) => isRecord(lender) && typeof lender.defaulted === "boolean",
    )
  )
    return null;

  const rawConsultation = isRecord(value.consultation)
    ? value.consultation
    : {};
  const asked = Array.isArray(rawConsultation.asked)
    ? rawConsultation.asked.filter(isConsultationQuestionId)
    : [];
  const lastQuestion =
    rawConsultation.lastQuestion === "purpose" ||
    rawConsultation.lastQuestion === "income"
      ? rawConsultation.lastQuestion
      : null;
  const consultationCustomerId =
    typeof rawConsultation.customerId === "string"
      ? rawConsultation.customerId
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
  let products = migrateProducts(rawWorld.products);
  let depositors = Array.isArray(rawWorld.depositors)
    ? (rawWorld.depositors as MarketWorld["depositors"]).map((depositor) => ({
        ...depositor,
      }))
    : config.depositSeeds.map((depositor) => ({ ...depositor }));
  let onboarding: MarketWorld["onboarding"] = isOnboardingStep(
    rawWorld.onboarding,
  )
    ? rawWorld.onboarding
    : "full";
  // Deposits taken before products existed need a product to belong to, and an
  // accepted depositor with no product is the only sound evidence of that.
  // Onboarding state is not: a stage whose config opens at "full" would mint a
  // free deposit product on every reload, handing the player the run's most
  // valuable asset for none of its cost.
  if (
    depositors.some((depositor) => depositor.status === "accepted") &&
    !products.some((product) => product.kind === "deposit")
  ) {
    const migratedProductId = "migrated-savings-product";
    const rate =
      depositors.find((depositor) => depositor.status === "accepted")?.rate ??
      2;
    products = [
      ...products,
      {
        id: migratedProductId,
        kind: "deposit",
        name: "Existing savings",
        x: 50,
        y: 68,
        active: true,
        interestRate: rate,
      },
    ];
    depositors = depositors.map((depositor) =>
      depositor.status === "accepted" && !depositor.productId
        ? { ...depositor, productId: migratedProductId }
        : depositor,
    );
  }
  const hasDepositProduct = products.some(
    (product) => product.kind === "deposit",
  );
  if (onboarding === "deposits" && hasDepositProduct) onboarding = "products";
  if (onboarding === "products" && !hasDepositProduct) onboarding = "deposits";
  const rawUi = isRecord(value.ui) ? value.ui : {};
  const hasDraggedMap = rawUi.hasDraggedMap === true;
  // Saves predating the stage briefing carry no flag. A run already past day 0
  // has clearly started, so replaying its opening would be an interruption.
  const seenStageIntro =
    rawUi.seenStageIntro === true ||
    (typeof rawWorld.day === "number" && rawWorld.day > 0);
  const savedIntroduced = Array.isArray(rawUi.introducedCoachmarks)
    ? rawUi.introducedCoachmarks.filter(isCoachmarkId)
    : [];
  const savedCompleted = Array.isArray(rawUi.completedCoachmarks)
    ? rawUi.completedCoachmarks.filter(isCoachmarkId)
    : [];
  const inferredCompleted = inferredCompletedCoachmarks(
    onboarding,
    asked,
    hasDraggedMap,
  );
  const completedCoachmarks = [
    ...new Set([...savedCompleted, ...inferredCompleted]),
  ];
  const introducedCoachmarks = [
    ...new Set([...savedIntroduced, ...completedCoachmarks]),
  ];
  return {
    schemaVersion: MARKET_SESSION_SCHEMA_VERSION,
    stageId,
    phase: value.phase === "map" ? "map" : "intro",
    world: {
      ...(rawWorld as MarketWorld),
      level: config.level,
      config,
      runFailed: (rawWorld.runFailed ?? rawWorld.insolvent) === true,
      // Existing saved runs predate the guided lesson. Keep their earned
      // systems visible rather than moving a returning player backwards.
      onboarding,
      funding: rawWorld.funding as MarketWorld["funding"],
      products,
      depositors,
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
    consultation: {
      customerId: consultationCustomerId,
      asked,
      lastQuestion,
      expression,
    },
    clock: { paused: rawClock.paused !== false, speed },
    ui: {
      ...initialMarketUiState(),
      hasDraggedMap,
      seenStageIntro,
      introducedCoachmarks,
      completedCoachmarks,
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
