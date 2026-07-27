import { Banknote, Equal, Landmark, Plus, Wallet, X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CustomerConsultation } from "./CustomerConsultation.tsx";
import { InterbankConversation } from "./InterbankConversation.tsx";
import { ProductBuilder } from "./ProductBuilder.tsx";
import { ProductDetails } from "./ProductDetails.tsx";
import { money } from "./market-format.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  type Customer,
  type Funding,
  type LoanProduct,
  type LoanProductRules,
  type MarketWorld,
} from "./market-world.ts";

type MarketDialogsProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  selected: Customer | null;
  selectedProductId: string | null;
  productBuilderOpen: boolean;
  fundingOpen: boolean;
  assetsOpen: boolean;
  onCloseSelected: () => void;
  onCloseSelectedProduct: () => void;
  onCloseProductBuilder: () => void;
  onCloseFunding: () => void;
  onCloseAssets: () => void;
  onApprove: (customer: Customer) => void;
  onReject: (customer: Customer) => void;
  onNeedFunding: () => void;
  onCreateProduct: (rules: LoanProductRules) => void;
  onToggleProduct: (productId: string, active: boolean) => void;
  onBorrow: (lender: Funding) => void;
  onComplete: () => void;
  onBack: () => void;
};

export function MarketDialogs({
  stage,
  locale,
  world,
  selected,
  selectedProductId,
  productBuilderOpen,
  fundingOpen,
  assetsOpen,
  onCloseSelected,
  onCloseSelectedProduct,
  onCloseProductBuilder,
  onCloseFunding,
  onCloseAssets,
  onApprove,
  onReject,
  onNeedFunding,
  onCreateProduct,
  onToggleProduct,
  onBorrow,
  onComplete,
  onBack,
}: MarketDialogsProps) {
  const m = messagesFor(locale).market;
  const { cash, day, customers, funding, trust } = world;
  const loanReceivables = customers
    .filter((customer) => customer.status === "accepted")
    .reduce((total, customer) => total + customer.amount, 0);
  const totalAssets = cash + loanReceivables;
  const fundingLiabilities = funding
    .filter((lender) => lender.accepted)
    .reduce((total, lender) => total + lender.amount, 0);
  const netWorth = totalAssets - fundingLiabilities;
  const trustBand =
    trust >= 80
      ? "strong"
      : trust >= 60
        ? "steady"
        : trust >= 30
          ? "at-risk"
          : "blocked";
  const trustLabel =
    trustBand === "strong"
      ? m.trustStrong
      : trustBand === "steady"
        ? m.trustSteady
        : trustBand === "at-risk"
          ? m.trustAtRisk
          : m.trustBlocked;
  const selectedProduct =
    selectedProductId === null
      ? null
      : (world.products.find(
          (product): product is LoanProduct =>
            product.kind === "loan" && product.id === selectedProductId,
        ) ?? null);

  return (
    <>
      {world.missionCleared && (
        <div
          className="mission-clear-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-clear-title"
        >
          <div className="money-confetti" aria-hidden="true">
            {Array.from({ length: 30 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--x": `${(index * 37 + 9) % 100}%`,
                    "--delay": `${(index % 10) * 0.09}s`,
                    "--drift": `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 5) * 9)}px`,
                  } as React.CSSProperties
                }
              >
                {index % 3 === 0 ? "$100" : "$"}
              </i>
            ))}
          </div>
          <section className="mission-clear-card">
            <span className="clear-seal">
              <img src="/assets/pop-art/atoms/approval-stamp.svg" alt="" />
            </span>
            <small>
              LEVEL {String(stage.number).padStart(2, "0")} COMPLETE
            </small>
            <h2 id="mission-clear-title">MISSION CLEAR!</h2>
            <p>{localize(stage.config.copy.missionCompleteLabel, locale)}</p>
            <div className="result-grid">
              <div>
                <span>{m.elapsedTime}</span>
                <strong>DAY {day + 1}</strong>
              </div>
              <div>
                <span>{m.trust}</span>
                <strong>{m.trustScore(trust)}</strong>
              </div>
              <div>
                <span>{m.loansIssued}</span>
                <strong>{m.loanProgress(world.loanCount)}</strong>
              </div>
              <div>
                <span>{m.cumulativeLoans}</span>
                <strong>{money(world.cumulativeLent)}</strong>
              </div>
              <div>
                <span>{m.currentCash}</span>
                <strong>{money(cash)}</strong>
              </div>
              <div>
                <span>{m.loanReceivables}</span>
                <strong>{money(loanReceivables)}</strong>
              </div>
              <div className="result-total">
                <span>{m.finalNetWorth}</span>
                <strong>{money(netWorth)}</strong>
              </div>
            </div>
            <button onClick={onComplete}>{m.checkResult}</button>
          </section>
        </div>
      )}
      {assetsOpen && (
        <div className="modal-backdrop" onMouseDown={onCloseAssets}>
          <section
            className="assets-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseAssets}
              aria-label={m.close}
            >
              <X />
            </button>
            <small>MY BANK BALANCE SHEET</small>
            <h2>{m.bankAssets}</h2>
            <div className="asset-summary">
              <span>{m.netWorth}</span>
              <strong>{money(netWorth)}</strong>
            </div>
            <div className={`trust-card trust-${trustBand}`}>
              <div>
                <span>{m.trust}</span>
                <strong>{m.trustScore(trust)}</strong>
              </div>
              <div className="trust-meter" aria-hidden="true">
                <span style={{ width: `${trust}%` }} />
              </div>
              <small>{trustLabel}</small>
            </div>
            <h3>{m.assets}</h3>
            <dl className="asset-rows">
              <div>
                <dt>{m.cash}</dt>
                <dd>{money(cash)}</dd>
              </div>
              <div>
                <dt>{m.loanReceivables}</dt>
                <dd>{money(loanReceivables)}</dd>
              </div>
              <div className="total">
                <dt>{m.totalAssets}</dt>
                <dd>{money(totalAssets)}</dd>
              </div>
            </dl>
            <div className="asset-equation" aria-hidden="true">
              <span>
                <Wallet />
                <small>{m.cash}</small>
              </span>
              <Plus className="eq-op" />
              <span>
                <Banknote />
                <small>{m.loanReceivables}</small>
              </span>
              <Equal className="eq-op" />
              <span>
                <Landmark />
                <small>{m.totalAssets}</small>
              </span>
            </div>
            <PortfolioDetails
              customers={customers}
              funding={funding}
              locale={locale}
              day={day}
            />
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onMouseDown={onCloseSelected}>
          <section
            className="consultation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseSelected}
              aria-label={m.close}
            >
              <X />
            </button>
            <CustomerConsultation
              customer={selected}
              locale={locale}
              showRiskEstimate={world.config.randomizeDefaultRisk}
              learnCustomerHint={localize(
                stage.config.copy.learnCustomerHint,
                locale,
              )}
              mode="request"
              sceneLabel={m.loanRequestTitle}
              onApprove={() => onApprove(selected)}
              onReject={() => onReject(selected)}
              onNeedFunding={onNeedFunding}
              canApprove={cash >= selected.amount}
            />
          </section>
        </div>
      )}
      {selectedProduct && (
        <div className="modal-backdrop" onMouseDown={onCloseSelectedProduct}>
          <ProductDetails
            locale={locale}
            product={selectedProduct}
            onClose={onCloseSelectedProduct}
            onToggleActive={onToggleProduct}
          />
        </div>
      )}
      {productBuilderOpen && (
        <div className="modal-backdrop">
          <ProductBuilder
            locale={locale}
            creationCost={world.config.productCreationCost}
            onCreate={onCreateProduct}
            onClose={onCloseProductBuilder}
          />
        </div>
      )}
      {fundingOpen && (
        <div className="modal-backdrop" onMouseDown={onCloseFunding}>
          <section
            className="funding-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseFunding}
              aria-label={m.close}
            >
              <X />
            </button>
            <InterbankConversation
              funding={funding}
              locale={locale}
              onBorrow={onBorrow}
            />
          </section>
        </div>
      )}
      {world.insolvent && (
        <div
          className="mission-clear-backdrop loss-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="loss-title"
        >
          <section className="mission-clear-card loss-card">
            <span className="clear-seal">
              <img src="/assets/pop-art/atoms/rejection-stamp.svg" alt="" />
            </span>
            <small>LEVEL {String(stage.number).padStart(2, "0")}</small>
            <h2 id="loss-title">
              {world.failureReason === "trust"
                ? m.trustFailureTitle
                : m.insolventTitle}
            </h2>
            <p>
              {world.failureReason === "trust"
                ? m.trustFailureDescription
                : m.insolventDescription}
            </p>
            <button onClick={onBack}>{m.returnToStages}</button>
          </section>
        </div>
      )}
    </>
  );
}

function PortfolioDetails({
  customers,
  funding,
  locale,
  day,
}: {
  customers: Customer[];
  funding: Funding[];
  locale: Locale;
  day: number;
}) {
  const m = messagesFor(locale).market;
  const loans = customers.filter((customer) => customer.status === "accepted");
  const debts = funding.filter((lender) => lender.accepted);
  return (
    <div className="portfolio-details">
      <h3>{m.loanBook}</h3>
      {loans.length === 0 ? (
        <p className="portfolio-empty">{m.noOutstandingLoans}</p>
      ) : (
        <div className="portfolio-list">
          {loans.map((customer) => (
            <article key={customer.id}>
              <strong>{localize(customer.name, locale)}</strong>
              <span>{money(customer.amount)}</span>
              <small>
                {m.dueInDays(Math.max(customer.dueDay - day, 0))} ·{" "}
                {m.repaymentDue(
                  money(customer.amount * (1 + customer.rate / 100)),
                )}
              </small>
            </article>
          ))}
        </div>
      )}
      <h3>{m.fundingBook}</h3>
      {debts.length === 0 ? (
        <p className="portfolio-empty">{m.noFundingObligations}</p>
      ) : (
        <div className="portfolio-list">
          {debts.map((lender) => (
            <article key={lender.id}>
              <strong>{localize(lender.name, locale)}</strong>
              <span>{money(lender.amount)}</span>
              <small>
                {lender.defaulted
                  ? m.defaultedDebt(
                      money(lender.amount * (1 + lender.rate / 100)),
                    )
                  : `${m.dueInDays(Math.max(lender.dueDay - day, 0))} · ${m.repaymentDue(money(lender.amount * (1 + lender.rate / 100)))}`}
              </small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
