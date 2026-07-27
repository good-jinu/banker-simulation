import { Landmark, Percent, X } from "lucide-react";
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
    <section className="product-builder" role="dialog" aria-modal="true">
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <span className="product-builder-icon">
        <Landmark aria-hidden="true" />
      </span>
      <small>{m.depositProductEyebrow}</small>
      <h2>{m.depositProductTitle}</h2>
      <p>{m.depositProductCopy}</p>
      <div className="product-preview">
        <Percent aria-hidden="true" />
        <strong>{m.depositProductRate(interestRate)}</strong>
      </div>
      <div className="product-cost">
        <Landmark aria-hidden="true" />
        <span>{m.productSetupCost(money(creationCost))}</span>
      </div>
      <button className="create-product-button" onClick={onCreate}>
        <Landmark aria-hidden="true" />
        {m.createDepositProduct(money(creationCost))}
      </button>
    </section>
  );
}
