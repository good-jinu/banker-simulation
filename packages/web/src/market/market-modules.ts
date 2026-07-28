import type { Messages } from "../i18n/messages/index.ts";
import type { LoanProductModule } from "./market-product-types.ts";

type MarketMessages = Messages["market"];

/**
 * Module copy lives behind an exhaustive record rather than inline branches, so
 * adding a module to LOAN_PRODUCT_MODULES fails to compile until it is named
 * and explained in every locale.
 */
export function loanModuleLabel(
  m: MarketMessages,
  module: LoanProductModule,
): string {
  const labels: Record<LoanProductModule, string> = {
    "credit-check": m.creditCheckModule,
    guarantor: m.guarantorModule,
  };
  return labels[module];
}

export function loanModuleCopy(
  m: MarketMessages,
  module: LoanProductModule,
): string {
  const copy: Record<LoanProductModule, string> = {
    "credit-check": m.creditCheckModuleCopy,
    guarantor: m.guarantorModuleCopy,
  };
  return copy[module];
}
