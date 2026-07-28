import { Coins, SlidersHorizontal, X } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { localize } from "../i18n/local-text.ts";
import { money } from "./market-format.ts";
import { customerMatchesLoanRules } from "./market-products.ts";
import type { LoanProductRules, MarketWorld } from "./market-world.ts";

/**
 * The bank's standard lending policy. Fixed, not authored: this dialog is a
 * confirmation of the terms the stage teaches, so the rules live here as a
 * constant rather than behind a setter no control ever calls.
 */
const STANDARD_LOAN_RULES: LoanProductRules = {
  minimumIncome: 1_500,
  occupation: "employed",
  // Priced to sit inside the market's ordinary band — customers ask 7–20% and
  // the trust model only calls a rate unfair above 22. At 10% an automated line
  // earned less than the same loans written by hand, which made the stage's own
  // automation the worse move.
  interestRate: 14,
  // Reaches the first stage's small requests, which start at $80. A $300 floor
  // matched only 14% of the applicants the generator actually produces.
  minimumAmount: 100,
  maximumAmount: 1_000,
  minimumTerm: 6,
  // Wide enough to cover both stages' generated terms. A 12-day ceiling left
  // the line blind to 40% of Riverside's applicants, who then piled up unfunded.
  maximumTerm: 16,
};

type ProductBuilderProps = {
  locale: Locale;
  creationCost: number;
  world: MarketWorld;
  onCreate: (rules: LoanProductRules) => void;
  onClose: () => void;
};

export function ProductBuilder({
  locale,
  creationCost,
  world,
  onCreate,
  onClose,
}: ProductBuilderProps) {
  const m = messagesFor(locale).market;
  const rules = STANDARD_LOAN_RULES;
  let availableCash = Math.max(0, world.cash - creationCost);
  const batch = [];
  for (const customer of world.customers) {
    if (!customerMatchesLoanRules(customer, rules)) continue;
    if (availableCash < customer.amount) continue;
    batch.push(customer);
    availableCash -= customer.amount;
  }
  const batchAmount = batch.reduce(
    (total, customer) => total + customer.amount,
    0,
  );
  const districtExposureTotals = new Map<string, number>();
  for (const customer of batch) {
    districtExposureTotals.set(
      customer.districtId,
      (districtExposureTotals.get(customer.districtId) ?? 0) + customer.amount,
    );
  }
  const districtExposure = [...districtExposureTotals]
    .map(([districtId, amount]) => ({ districtId, amount }))
    .sort((first, second) => second.amount - first.amount)[0];
  const dominantDistrict = districtExposure
    ? world.config.map.districts.find(
        (district) => district.id === districtExposure.districtId,
      )
    : null;
  return (
    <section
      className="product-builder guided-product-builder"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-product-title"
      aria-describedby="guided-product-copy"
    >
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <header className="product-launch-header">
        <span className="product-builder-icon">
          <SlidersHorizontal aria-hidden="true" />
        </span>
        <div>
          <h2 id="guided-product-title">{m.guidedProductTitle}</h2>
          <p id="guided-product-copy">{m.guidedProductCopy}</p>
        </div>
      </header>
      <div className="product-cost">
        <Coins aria-hidden="true" />
        <span>{m.productSetupCost(money(creationCost))}</span>
      </div>
      <dl className="guided-product-summary">
        <div>
          <dt>{m.guidedProductEligibility}</dt>
          <dd>{m.guidedProductEligibilityValue(money(rules.minimumIncome))}</dd>
        </div>
        <div>
          <dt>{m.productCostLabel}</dt>
          <dd>{money(creationCost)}</dd>
        </div>
        <div className="guided-product-terms">
          <dt>{m.guidedProductTerms}</dt>
          <dd>
            {m.guidedProductTermsValue(
              money(rules.minimumAmount),
              money(rules.maximumAmount),
              rules.interestRate,
              rules.minimumTerm,
              rules.maximumTerm,
            )}
          </dd>
        </div>
      </dl>
      <div className="product-batch-preview">
        <strong>{m.productBatchPreview}</strong>
        <span>{m.productBatchApproval(batch.length, money(batchAmount))}</span>
        <span>{m.productBatchCashLeft(money(availableCash))}</span>
        {dominantDistrict && districtExposure && (
          <em>
            {m.productBatchConcentration(
              localize(dominantDistrict.name, locale),
              money(districtExposure.amount),
            )}
          </em>
        )}
      </div>
      <button className="create-product-button" onClick={() => onCreate(rules)}>
        <SlidersHorizontal /> {m.createLoanProduct(money(creationCost))}
      </button>
    </section>
  );
}
