import { Coins, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import type { LoanProductRules } from "./market-world.ts";

type ProductBuilderProps = {
  locale: Locale;
  creationCost: number;
  onCreate: (rules: LoanProductRules) => void;
  onClose: () => void;
};

export function ProductBuilder({
  locale,
  creationCost,
  onCreate,
  onClose,
}: ProductBuilderProps) {
  const m = messagesFor(locale).market;
  const [rules, setRules] = useState<LoanProductRules>({
    minimumIncome: 1_500,
    occupation: "employed",
    interestRate: 10,
    // Reaches the first stage's small requests, which start at $80. A $300 floor
    // matched only 14% of the applicants the generator actually produces.
    minimumAmount: 100,
    maximumAmount: 1_000,
    minimumTerm: 6,
    maximumTerm: 12,
  });
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
      <button className="create-product-button" onClick={() => onCreate(rules)}>
        <SlidersHorizontal /> {m.createLoanProduct(money(creationCost))}
      </button>
    </section>
  );
}
