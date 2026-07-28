import { describe, expect, it } from "vitest";
import { parseDevMarketLaunch } from "./market-dev-query.ts";

describe("parseDevMarketLaunch", () => {
  it("ignores ordinary application URLs", () => {
    expect(parseDevMarketLaunch("?stage=first-yield")).toBeNull();
  });

  it("uses safe defaults for a direct market launch", () => {
    expect(parseDevMarketLaunch("?dev=market")).toEqual({
      stageId: "first-yield",
      phase: "intro",
      fresh: false,
    });
  });

  it("parses supported overrides and falls back from an unknown stage", () => {
    expect(
      parseDevMarketLaunch(
        "?dev=market&stage=credit-under-pressure&phase=map&fresh=1",
      ),
    ).toEqual({
      stageId: "credit-under-pressure",
      phase: "map",
      fresh: true,
    });
    expect(parseDevMarketLaunch("?dev=market&stage=unknown")).toMatchObject({
      stageId: "first-yield",
    });
  });

  it("opens the regional portfolio stage directly", () => {
    expect(
      parseDevMarketLaunch(
        "?dev=market&stage=portfolio-crossroads&phase=map&fresh=1",
      ),
    ).toEqual({
      stageId: "portfolio-crossroads",
      phase: "map",
      fresh: true,
    });
  });
});
