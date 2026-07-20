import { describe, expect, it } from "vitest";
import {
  emptySave,
  migrateSaveParts,
  type SaveEnvelope,
} from "./persistence.ts";

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
});
