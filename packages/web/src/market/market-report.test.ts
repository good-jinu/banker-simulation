import { describe, expect, it } from "vitest";
import { emptyMarketRunStats } from "./market-world.ts";
import { resultDiagnoses } from "./market-report.ts";

describe("resultDiagnoses", () => {
  it("prioritizes an actionable funding miss", () => {
    expect(
      resultDiagnoses({
        ...emptyMarketRunStats(),
        fundingMissed: 1,
        defaulted: 2,
      }),
    ).toEqual(["funding", "losses"]);
  });

  it("recognizes a young book without exposing score weights", () => {
    expect(resultDiagnoses(emptyMarketRunStats())).toEqual(["thin-book"]);
  });

  it("recognizes a resilient completed book", () => {
    expect(
      resultDiagnoses({
        ...emptyMarketRunStats(),
        repaid: 5,
        interestEarned: 20,
      }),
    ).toEqual(["resilient"]);
  });
});
