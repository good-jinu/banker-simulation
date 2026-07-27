import { Landmark, X } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";

export function DepositProductBuilder({
  locale,
  creationCost,
  interestRate,
  onCreate,
  onClose,
}: {
  locale: Locale;
  creationCost: number;
  interestRate: number;
  onCreate: () => void;
  onClose: () => void;
}) {
  const m = messagesFor(locale).market;
  return (
    <section
      className="product-builder deposit-product-builder"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-product-title"
      aria-describedby="deposit-product-copy"
    >
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <header className="product-launch-header">
        <span className="product-builder-icon">
          <Landmark aria-hidden="true" />
        </span>
        <div>
          <h2 id="deposit-product-title">{m.depositProductTitle}</h2>
          <p id="deposit-product-copy">{m.depositProductCopy}</p>
        </div>
      </header>
      <dl className="deposit-product-summary">
        <div>
          <dt>{m.depositProductRateLabel}</dt>
          <dd>{m.depositProductRate(interestRate)}</dd>
        </div>
        <div>
          <dt>{m.productCostLabel}</dt>
          <dd>{money(creationCost)}</dd>
        </div>
      </dl>
      <button className="create-product-button" onClick={onCreate}>
        <Landmark aria-hidden="true" />
        {m.createDepositProduct(money(creationCost))}
      </button>
    </section>
  );
}
