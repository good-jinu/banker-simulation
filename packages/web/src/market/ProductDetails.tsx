import { SlidersHorizontal, X } from "lucide-react";
import { messagesFor } from "../i18n/messages/index.ts";
import type { Locale } from "../i18n/locale.ts";
import { money } from "./market-format.ts";
import type { LoanProduct } from "./market-world.ts";

type ProductDetailsProps = {
  locale: Locale;
  product: LoanProduct;
  onClose: () => void;
  onToggleActive: (productId: string, active: boolean) => void;
};

export function ProductDetails({
  locale,
  product,
  onClose,
  onToggleActive,
}: ProductDetailsProps) {
  const m = messagesFor(locale).market;
  const occupationLabel =
    product.rules.occupation === "any"
      ? m.productOccupationAny
      : product.rules.occupation === "employed"
        ? m.productOccupationEmployed
        : m.productOccupationSelfEmployed;

  return (
    <section
      className="detail-modal product-details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-details-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <span className="product-details-icon" aria-hidden="true">
        <SlidersHorizontal />
      </span>
      <small>{m.productDetailsEyebrow}</small>
      <h2 id="product-details-title">{product.name}</h2>
      <span
        className={`product-details-status${product.active ? " active" : " paused"}`}
      >
        {product.active ? m.productActive : m.productPaused}
      </span>
      <p className="request-copy">
        {product.active ? m.productActiveCopy : m.productPausedCopy}
      </p>
      <dl className="product-detail-grid">
        <div>
          <dt>{m.productMinimumIncome}</dt>
          <dd>{money(product.rules.minimumIncome)}</dd>
        </div>
        <div>
          <dt>{m.productOccupation}</dt>
          <dd>{occupationLabel}</dd>
        </div>
        <div>
          <dt>{m.productInterestRate}</dt>
          <dd>{m.annualRate(product.rules.interestRate)}</dd>
        </div>
        <div>
          <dt>{m.productLoanRange}</dt>
          <dd>
            {money(product.rules.minimumAmount)} –{" "}
            {money(product.rules.maximumAmount)}
          </dd>
        </div>
        <div>
          <dt>{m.productDueRange}</dt>
          <dd>
            {m.rangeDays(product.rules.minimumTerm)} –{" "}
            {m.rangeDays(product.rules.maximumTerm)}
          </dd>
        </div>
      </dl>
      <button
        className="product-toggle-button"
        onClick={() => onToggleActive(product.id, !product.active)}
      >
        {product.active ? m.pauseProduct : m.resumeProduct}
      </button>
    </section>
  );
}
