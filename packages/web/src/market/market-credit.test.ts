import { describe, expect, it } from "vitest";
import {
  creditScoreFor,
  defaultRisk,
  guaranteedDefaultRisk,
} from "./market-credit.ts";

describe("market credit", () => {
  const safeApplicant = {
    income: 3_000,
    amount: 300,
    occupation: "employed" as const,
  };
  const riskyApplicant = {
    income: 600,
    amount: 800,
    occupation: "employed" as const,
  };

  it("turns lower repayment risk into a higher credit score", () => {
    expect(defaultRisk(riskyApplicant)).toBeGreaterThan(
      defaultRisk(safeApplicant),
    );
    expect(creditScoreFor(riskyApplicant)).toBeLessThan(
      creditScoreFor(safeApplicant),
    );
  });

  it("keeps a guarantor-backed loan risky, but materially safer", () => {
    const risk = defaultRisk(riskyApplicant);
    expect(guaranteedDefaultRisk(risk)).toBeLessThan(risk);
    expect(guaranteedDefaultRisk(risk)).toBeGreaterThan(0);
  });
});
