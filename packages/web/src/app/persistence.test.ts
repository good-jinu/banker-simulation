import { describe, expect, it } from "vitest";
import {
  emptySave,
  migrateMarketSession,
  migrateSaveParts,
  type SaveEnvelope,
} from "./persistence.ts";
import { marketCampaignStages } from "../market/market-campaign.ts";
import { createWorld } from "../market/market-world.ts";

describe("save migration", () => {
  it("returns a fresh version-two save for missing or malformed records", () => {
    expect(migrateSaveParts(null, "not settings")).toEqual(emptySave());
  });

  it("sanitizes legacy campaign and settings records", () => {
    const migrated = migrateSaveParts(
      {
        schemaVersion: 1,
        completedStageIds: ["first-yield", 7, null],
        rewards: ["level-one-complete", false],
        mostRecentStageId: 42,
      },
      {
        schemaVersion: 1,
        reducedMotion: "yes",
        locale: "ko",
      },
    );

    expect(migrated).toEqual({
      schemaVersion: 2,
      campaign: {
        schemaVersion: 2,
        completedStageIds: ["first-yield"],
        rewards: ["level-one-complete"],
        mostRecentStageId: null,
      },
      settings: {
        schemaVersion: 2,
        reducedMotion: false,
        locale: "ko",
      },
    } satisfies SaveEnvelope);
  });

  it("keeps only supported settings values", () => {
    expect(
      migrateSaveParts(
        { completedStageIds: [], rewards: [], mostRecentStageId: "second" },
        { reducedMotion: true, locale: "fr" },
      ).settings,
    ).toEqual({
      schemaVersion: 2,
      reducedMotion: true,
    });
  });

  it("restores a market session while dropping transient events", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const migrated = migrateMarketSession(
      {
        schemaVersion: 2,
        stageId: marketCampaignStages[0]!.id,
        phase: "map",
        world: { ...world, cash: 123, events: [{ type: "mission-clear" }] },
        consultation: {
          asked: ["purpose", "income", "unsupported"],
          lastQuestion: "income",
          expression: "relieved",
        },
        savedAt: 42,
      },
      marketCampaignStages[0]!.id,
      config,
    );

    expect(migrated).not.toBeNull();
    expect(migrated?.world.cash).toBe(123);
    expect(migrated?.world.events).toEqual([]);
    expect(migrated?.world.trust).toBe(world.trust);
    expect(migrated?.world.funding[0]?.defaulted).toBe(false);
    expect(migrated?.consultation).toEqual({
      asked: ["purpose", "income"],
      lastQuestion: "income",
      expression: "relieved",
    });
    expect(migrated?.ui).toEqual({ hasDraggedMap: false });
  });

  it("restores persisted map tutorial progress", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const migrated = migrateMarketSession(
      {
        schemaVersion: 2,
        stageId: marketCampaignStages[0]!.id,
        phase: "map",
        world,
        consultation: {},
        clock: {},
        ui: { hasDraggedMap: true },
      },
      marketCampaignStages[0]!.id,
      config,
    );

    expect(migrated?.ui).toEqual({ hasDraggedMap: true });
  });

  it("rejects a session belonging to another stage", () => {
    const config = marketCampaignStages[0]!.config;
    expect(
      migrateMarketSession(
        { schemaVersion: 2, stageId: "other-stage" },
        "first-yield",
        config,
      ),
    ).toBeNull();
  });

  it("rejects legacy market sessions instead of inventing trust", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const legacyWorld = { ...world } as Record<string, unknown>;
    delete legacyWorld.trust;

    expect(
      migrateMarketSession(
        {
          schemaVersion: 1,
          stageId: marketCampaignStages[0]!.id,
          phase: "map",
          world: legacyWorld,
        },
        marketCampaignStages[0]!.id,
        config,
      ),
    ).toBeNull();
  });
});
