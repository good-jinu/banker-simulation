import { Landmark, SlidersHorizontal, X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { Locale } from "../i18n/locale.ts";
import { money } from "./market-format.ts";
import {
  avatarFor,
  type Customer,
  type Depositor,
  type Product,
} from "./market-world.ts";
import { loanModuleCopy, loanModuleLabel } from "./market-modules.ts";
import { LOAN_PRODUCT_MODULE_CAPACITY } from "./market-product-types.ts";

type ProductDetailsProps = {
  locale: Locale;
  product: Product;
  day: number;
  customers: Customer[];
  depositors: Depositor[];
  onClose: () => void;
  onToggleActive: (productId: string, active: boolean) => void;
};

export function ProductDetails({
  locale,
  product,
  day,
  customers,
  depositors,
  onClose,
  onToggleActive,
}: ProductDetailsProps) {
  const m = messagesFor(locale).market;
  const isLoan = product.kind === "loan";
  const occupationLabel = !isLoan
    ? null
    : product.rules.occupation === "any"
      ? m.productOccupationAny
      : product.rules.occupation === "employed"
        ? m.productOccupationEmployed
        : m.productOccupationSelfEmployed;
  const modules = isLoan ? (product.modules ?? []) : [];

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
        {isLoan ? <SlidersHorizontal /> : <Landmark />}
      </span>
      <small>
        {isLoan ? m.productDetailsEyebrow : m.depositProductDetailsEyebrow}
      </small>
      <h2 id="product-details-title">{product.name}</h2>
      <span
        className={`product-details-status${product.active ? " active" : " paused"}`}
      >
        {product.active ? m.productActive : m.productPaused}
      </span>
      <p className="request-copy">
        {isLoan
          ? product.active
            ? m.productActiveCopy
            : m.productPausedCopy
          : product.active
            ? m.depositActiveCopy
            : m.depositPausedCopy}
      </p>
      {isLoan ? (
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
      ) : (
        <dl className="product-detail-grid">
          <div>
            <dt>{m.productInterestRate}</dt>
            <dd>{m.annualRate(product.interestRate)}</dd>
          </div>
        </dl>
      )}
      <button
        className="product-toggle-button"
        onClick={() => onToggleActive(product.id, !product.active)}
      >
        {product.active ? m.pauseProduct : m.resumeProduct}
      </button>
      {isLoan && (
        <section
          className="product-modules"
          aria-labelledby="product-modules-title"
        >
          <strong id="product-modules-title">{m.productModules}</strong>
          <p>
            {m.productModuleSlots(modules.length, LOAN_PRODUCT_MODULE_CAPACITY)}
          </p>
          {modules.length === 0 ? (
            <p className="product-modules-empty">{m.productModulesEmpty}</p>
          ) : (
            <ul className="product-module-list">
              {modules.map((module) => (
                <li className="product-module" key={module}>
                  <strong>{loanModuleLabel(m, module)}</strong>
                  <p>{loanModuleCopy(m, module)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="product-connections">
        <strong>
          {isLoan
            ? m.productCustomersCount(customers.length)
            : m.productDepositorsCount(depositors.length)}
        </strong>
        {isLoan ? (
          customers.length === 0 ? (
            <p className="product-connections-empty">
              {m.productCustomersEmpty}
            </p>
          ) : (
            <ul className="product-connections-list">
              {customers.map((customer) => (
                <li key={customer.id} className="product-connection-row">
                  <span className="portrait">
                    <img
                      src={avatarFor(customer, "relieved")}
                      alt=""
                      aria-hidden="true"
                    />
                  </span>
                  <span className="product-connection-info">
                    <strong>{localize(customer.name, locale)}</strong>
                    <small>
                      {m.repaymentDue(
                        money(customer.amount * (1 + customer.rate / 100)),
                      )}{" "}
                      · {m.repaymentIn(Math.max(customer.dueDay - day, 0))}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : depositors.length === 0 ? (
          <p className="product-connections-empty">
            {m.productDepositorsEmpty}
          </p>
        ) : (
          <ul className="product-connections-list">
            {depositors.map((depositor) => (
              <li key={depositor.id} className="product-connection-row">
                <span className="portrait">
                  <img src={depositor.avatar} alt="" aria-hidden="true" />
                </span>
                <span className="product-connection-info">
                  <strong>{localize(depositor.name, locale)}</strong>
                  <small>
                    {m.depositBalance(money(depositor.balance))} ·{" "}
                    {m.depositRate(depositor.rate)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
