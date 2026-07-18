const DATABASE_NAME = "banker-simulation";
const DATABASE_VERSION = 2;
const STORE_NAME = "save-parts";

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

function migrateCampaign(value: unknown): CampaignProgress {
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

function migrateSettings(value: unknown): PlayerSettings {
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
    return {
      schemaVersion: 2,
      campaign: migrateCampaign(campaign),
      settings: migrateSettings(settings),
    };
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
