import { describe, expect, it } from "vitest";
import {
  emptySave,
  migrateMarketSession,
  migrateSaveParts,
  type SaveEnvelope,
} from "./persistence.ts";
import { marketCampaignStages } from "../market/market-campaign.ts";
import { createWorld, type Depositor } from "../market/market-world.ts";

describe("save migration", () => {
  it("returns a fresh version-one save for missing or malformed records", () => {
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
      schemaVersion: 1,
      campaign: {
        schemaVersion: 1,
        completedStageIds: ["first-yield"],
        rewards: ["level-one-complete"],
        mostRecentStageId: null,
      },
      settings: {
        schemaVersion: 1,
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
      schemaVersion: 1,
      reducedMotion: true,
    });
  });

  it("restores a market session while dropping transient events", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
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
      customerId: null,
      asked: ["purpose", "income"],
      lastQuestion: "income",
      expression: "relieved",
    });
    expect(migrated?.ui).toEqual({
      hasDraggedMap: false,
      seenStageIntro: false,
      introducedCoachmarks: ["first-customer"],
      completedCoachmarks: ["first-customer"],
    });
  });

  it("restores persisted map tutorial progress", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
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

    expect(migrated?.ui).toEqual({
      hasDraggedMap: true,
      seenStageIntro: false,
      introducedCoachmarks: ["drag-market-map"],
      completedCoachmarks: ["drag-market-map"],
    });
  });

  it("treats a run already underway as having seen its stage briefing", () => {
    const config = marketCampaignStages[0]!.config;
    const world = createWorld(7, config);
    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: marketCampaignStages[0]!.id,
        phase: "map",
        // A save written before the briefing existed carries no flag at all.
        world: { ...world, day: 4 },
        consultation: {},
        clock: {},
        ui: {},
      },
      marketCampaignStages[0]!.id,
      config,
    );

    expect(migrated?.ui.seenStageIntro).toBe(true);
  });

  it("hydrates deposit state for a session saved before deposits were introduced", () => {
    const stage = marketCampaignStages[0]!;
    const world = createWorld(7, stage.config);
    const legacyWorld = { ...world } as Record<string, unknown>;
    delete legacyWorld.depositors;
    delete legacyWorld.withdrawalEvent;
    delete legacyWorld.news;
    delete legacyWorld.stats;
    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: stage.id,
        phase: "map",
        world: legacyWorld,
      },
      stage.id,
      stage.config,
    );

    expect(migrated?.world.depositors).toHaveLength(
      stage.config.depositSeeds.length,
    );
    expect(migrated?.world.withdrawalEvent).not.toBeNull();
    expect(migrated?.world.stats.depositsAccepted).toBe(0);
  });

  it("keeps every system visible for a save from before guided onboarding", () => {
    const stage = marketCampaignStages[0]!;
    const legacyWorld = { ...createWorld(7, stage.config) } as Record<
      string,
      unknown
    >;
    delete legacyWorld.onboarding;

    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: stage.id,
        phase: "map",
        world: legacyWorld,
      },
      stage.id,
      stage.config,
    );

    expect(migrated?.world.onboarding).toBe("full");
  });

  it("attaches legacy accepted deposits to a migrated savings product", () => {
    const stage = marketCampaignStages[0]!;
    const world = createWorld(7, stage.config);
    // A saver from an older save, when deposits arrived without a product.
    const depositor: Depositor = {
      id: "legacy-savings",
      name: { en: "Legacy Saver", ko: "이전 예금자" },
      job: { en: "Village pharmacist", ko: "마을 약사" },
      amount: 260,
      rate: 2,
      balance: 0,
      appears: 0,
      locationId: "riverside-lot-2",
      districtId: "riverside",
      avatar: "/assets/pop-art/avatars/auditor-neutral.png",
      status: "waiting",
    };
    const legacyWorld = {
      ...world,
      onboarding: "full",
      depositors: [
        {
          ...depositor,
          status: "accepted",
          balance: depositor.amount,
        },
      ],
    };

    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: stage.id,
        phase: "map",
        world: legacyWorld,
      },
      stage.id,
      stage.config,
    );

    const depositProduct = migrated?.world.products.find(
      (product) => product.kind === "deposit",
    );
    expect(depositProduct).toBeDefined();
    expect(migrated?.world.depositors[0]?.productId).toBe(depositProduct?.id);
  });

  it("never mints a deposit product a stage did not pay for", () => {
    // A stage whose config opens at "full" onboarding must not be mistaken for a
    // save predating the product system: reloading would grant the deposit
    // product, and its savers, for free.
    for (const stage of marketCampaignStages) {
      const world = createWorld(7, stage.config);
      const migrated = migrateMarketSession(
        {
          schemaVersion: 1,
          stageId: stage.id,
          phase: "map",
          world: { ...world },
        },
        stage.id,
        stage.config,
      );

      expect(migrated?.world.products).toEqual([]);
      expect(migrated?.world.cash).toBe(world.cash);
    }
  });

  it("rejects a session belonging to another stage", () => {
    const config = marketCampaignStages[0]!.config;
    expect(
      migrateMarketSession(
        { schemaVersion: 1, stageId: "other-stage" },
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

  it("resumes a save written before transaction volume was tracked", () => {
    const world = createWorld(1);
    const { activity: _dropped, ...legacyReputation } = world.reputation;
    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: "first-yield",
        phase: "map",
        world: { ...world, day: 4, reputation: legacyReputation },
        savedAt: 1,
      },
      "first-yield",
      marketCampaignStages[0]!.config,
    );
    // Accepted rather than discarded, and resumed with the market's attention
    // instead of the standing of a bank that has not traded in weeks.
    expect(migrated).not.toBeNull();
    expect(migrated?.world.reputation.activity).toBeGreaterThan(0);
  });

  it("places legacy coordinates and initializes new portfolio risk fields", () => {
    const stage = marketCampaignStages[0]!;
    const world = createWorld(7, stage.config);
    const legacyCustomer = {
      ...world.customers[0]!,
      x: 19,
      y: 21,
    } as Record<string, unknown>;
    delete legacyCustomer.locationId;
    delete legacyCustomer.districtId;
    const legacyWorld = { ...world, customers: [legacyCustomer] } as Record<
      string,
      unknown
    >;
    delete legacyWorld.stress;
    delete legacyWorld.generationSequence;
    delete legacyWorld.districtSales;

    const migrated = migrateMarketSession(
      {
        schemaVersion: 1,
        stageId: stage.id,
        phase: "map",
        world: legacyWorld,
        savedAt: 1,
      },
      stage.id,
      stage.config,
    );

    expect(migrated?.world.customers[0]).toMatchObject({
      locationId: "riverside-lot-1",
      districtId: "riverside",
    });
    expect(migrated?.world.stress).toEqual({
      districts: {},
      segments: {},
    });
    expect(migrated?.world.generationSequence).toBeGreaterThan(0);
    expect(migrated?.world.districtSales.riverside).toBe(world.cumulativeLent);
  });
});
