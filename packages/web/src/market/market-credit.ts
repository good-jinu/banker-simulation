import type { Customer } from "./market-world.ts";

/** The shared credit model powers both underwriting signals and repayment. */
export function defaultRisk(
  customer: Pick<Customer, "income" | "amount" | "occupation">,
  marketAdjustment = 0,
): number {
  if (customer.income <= 0 || customer.occupation === "unemployed") return 100;
  const incomeToLoan = customer.income / customer.amount;
  return Math.min(
    75,
    Math.max(5, Math.round(62 - incomeToLoan * 18 + marketAdjustment)),
  );
}

/** A credit bureau is informative, not omniscient: scores express repayment risk. */
export function creditScoreFor(
  customer: Pick<Customer, "income" | "amount" | "occupation">,
  marketAdjustment = 0,
): number {
  return Math.max(
    300,
    Math.min(850, 850 - defaultRisk(customer, marketAdjustment) * 5),
  );
}

/** A qualifying guarantor absorbs part of the repayment risk, never all of it. */
export function guaranteedDefaultRisk(risk: number): number {
  return Math.max(5, Math.round(risk * 0.4));
}
