import type { MarketRunStats } from "./market-world.ts";

export type ResultDiagnosis =
  "losses" | "funding" | "automation" | "thin-book" | "resilient";

/** Produces a short, action-oriented debrief without revealing trust weights. */
export function resultDiagnoses(stats: MarketRunStats): ResultDiagnosis[] {
  const diagnoses: ResultDiagnosis[] = [];
  if (stats.fundingMissed > 0) diagnoses.push("funding");
  if (stats.defaulted > stats.repaid) diagnoses.push("losses");
  if (stats.automatedRepaid > stats.automatedDefaulted)
    diagnoses.push("automation");
  if (stats.repaid + stats.defaulted < 3) diagnoses.push("thin-book");
  return diagnoses.length > 0 ? diagnoses.slice(0, 2) : ["resilient"];
}
