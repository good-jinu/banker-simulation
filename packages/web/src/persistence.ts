import type { ContractProgram } from "@banker-simulation/contracts";
import type { StageEvent } from "@banker-simulation/core";
import type { StageScore } from "@banker-simulation/content";

const DATABASE_NAME = "banker-simulation";
const DATABASE_VERSION = 1;
const STORE_NAME = "save-parts";

export interface CampaignProgress {
  schemaVersion: 1;
  completedStageIds: string[];
  rewards: string[];
  bestScores: Record<string, StageScore>;
  mostRecentStageId: string | null;
}

export interface ActiveRunSave {
  schemaVersion: 1;
  stageId: string;
  events: StageEvent[];
}

export interface PlayerSettings {
  schemaVersion: 1;
  reducedMotion: boolean;
}

export interface SaveEnvelope {
  schemaVersion: 1;
  campaign: CampaignProgress;
  activeRun: ActiveRunSave | null;
  draft: ContractProgram | null;
  settings: PlayerSettings;
}

export function emptySave(): SaveEnvelope {
  return {
    schemaVersion: 1,
    campaign: {
      schemaVersion: 1,
      completedStageIds: [],
      rewards: [],
      bestScores: {},
      mostRecentStageId: null,
    },
    activeRun: null,
    draft: null,
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

export async function loadGame(): Promise<SaveEnvelope> {
  if (!("indexedDB" in globalThis)) return emptySave();
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const [meta, campaign, activeRun, draft, settings] = await Promise.all([
      requestValue(store.get("meta")),
      requestValue(store.get("campaign")),
      requestValue(store.get("activeRun")),
      requestValue(store.get("draft")),
      requestValue(store.get("settings")),
    ]);
    if ((meta as { schemaVersion?: number } | undefined)?.schemaVersion !== 1)
      return emptySave();
    const fallback = emptySave();
    return {
      schemaVersion: 1,
      campaign: (campaign as CampaignProgress | undefined) ?? fallback.campaign,
      activeRun: (activeRun as ActiveRunSave | null | undefined) ?? null,
      draft: (draft as ContractProgram | null | undefined) ?? null,
      settings: (settings as PlayerSettings | undefined) ?? fallback.settings,
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
      store.put({ schemaVersion: save.schemaVersion }, "meta");
      store.put(structuredClone(save.campaign), "campaign");
      store.put(structuredClone(save.activeRun), "activeRun");
      store.put(structuredClone(save.draft), "draft");
      store.put(structuredClone(save.settings), "settings");
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
