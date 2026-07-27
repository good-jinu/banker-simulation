import { Banknote, Equal, Landmark, Plus, Wallet, X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CustomerConsultation } from "./CustomerConsultation.tsx";
import { DepositRequest } from "./DepositRequest.tsx";
import { InterbankConversation } from "./InterbankConversation.tsx";
import { ProductBuilder } from "./ProductBuilder.tsx";
import { ProductDetails } from "./ProductDetails.tsx";
import { MarketNewsDesk } from "./MarketNewsDesk.tsx";
import { MarketResultReport } from "./MarketResultReport.tsx";
import { money } from "./market-format.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  type Customer,
  type Depositor,
  type Funding,
  type LoanProduct,
  type LoanProductRules,
  type MarketSegment,
  type MarketWorld,
} from "./market-world.ts";

type MarketDialogsProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  selected: Customer | null;
  selectedDepositor: Depositor | null;
  selectedProductId: string | null;
  productBuilderOpen: boolean;
  fundingOpen: boolean;
  assetsOpen: boolean;
  newsOpen: boolean;
  onCloseSelected: () => void;
  onCloseSelectedDepositor: () => void;
  onCloseSelectedProduct: () => void;
  onCloseProductBuilder: () => void;
  onCloseFunding: () => void;
  onCloseAssets: () => void;
  onCloseNews: () => void;
  onApprove: (customer: Customer) => void;
  onReject: (customer: Customer) => void;
  onAcceptDeposit: (depositor: Depositor) => void;
  onRejectDeposit: (depositor: Depositor) => void;
  onNeedFunding: () => void;
  onCreateProduct: (rules: LoanProductRules) => void;
  onToggleProduct: (productId: string, active: boolean) => void;
  onToggleProductAlertGuard: (productId: string, enabled: boolean) => void;
  onShowNewsSegment: (segment: MarketSegment) => void;
  onBorrow: (lender: Funding) => void;
  onComplete: () => void;
  onBack: () => void;
};

export function MarketDialogs({
  stage,
  locale,
  world,
  selected,
  selectedDepositor,
  selectedProductId,
  productBuilderOpen,
  fundingOpen,
  assetsOpen,
  newsOpen,
  onCloseSelected,
  onCloseSelectedDepositor,
  onCloseSelectedProduct,
  onCloseProductBuilder,
  onCloseFunding,
  onCloseAssets,
  onCloseNews,
  onApprove,
  onReject,
  onAcceptDeposit,
  onRejectDeposit,
  onNeedFunding,
  onCreateProduct,
  onToggleProduct,
  onToggleProductAlertGuard,
  onShowNewsSegment,
  onBorrow,
  onComplete,
  onBack,
}: MarketDialogsProps) {
  const m = messagesFor(locale).market;
  const { cash, day, customers, depositors, funding, trust } = world;
  const loanReceivables = customers
    .filter((customer) => customer.status === "accepted")
    .reduce((total, customer) => total + customer.amount, 0);
  const totalAssets = cash + loanReceivables;
  const fundingLiabilities = funding
    .filter((lender) => lender.accepted)
    .reduce((total, lender) => total + lender.amount, 0);
  const depositLiabilities = depositors
    .filter((depositor) => depositor.status === "accepted")
    .reduce((total, depositor) => total + depositor.balance, 0);
  const netWorth = totalAssets - fundingLiabilities - depositLiabilities;
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
          <MarketResultReport
            stage={stage}
            locale={locale}
            world={world}
            won
            onContinue={onComplete}
          />
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
              <div>
                <dt>{m.depositLiabilities}</dt>
                <dd>{money(depositLiabilities)}</dd>
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
              depositors={depositors}
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
      {selectedDepositor && (
        <div className="modal-backdrop" onMouseDown={onCloseSelectedDepositor}>
          <section
            className="consultation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseSelectedDepositor}
              aria-label={m.close}
            >
              <X />
            </button>
            <DepositRequest
              depositor={selectedDepositor}
              locale={locale}
              onAccept={() => onAcceptDeposit(selectedDepositor)}
              onReject={() => onRejectDeposit(selectedDepositor)}
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
            onToggleAlertGuard={onToggleProductAlertGuard}
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
      {newsOpen && (
        <div className="modal-backdrop" onMouseDown={onCloseNews}>
          <MarketNewsDesk
            locale={locale}
            world={world}
            onClose={onCloseNews}
            onShowSegment={onShowNewsSegment}
          />
        </div>
      )}
      {world.insolvent && (
        <div
          className="mission-clear-backdrop loss-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="loss-title"
        >
          <MarketResultReport
            stage={stage}
            locale={locale}
            world={world}
            won={false}
            onContinue={onBack}
          />
        </div>
      )}
    </>
  );
}

function PortfolioDetails({
  customers,
  depositors,
  funding,
  locale,
  day,
}: {
  customers: Customer[];
  depositors: Depositor[];
  funding: Funding[];
  locale: Locale;
  day: number;
}) {
  const m = messagesFor(locale).market;
  const loans = customers.filter((customer) => customer.status === "accepted");
  const deposits = depositors.filter(
    (depositor) => depositor.status === "accepted",
  );
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
      <h3>{m.depositBook}</h3>
      {deposits.length === 0 ? (
        <p className="portfolio-empty">{m.noCustomerDeposits}</p>
      ) : (
        <div className="portfolio-list">
          {deposits.map((depositor) => (
            <article key={depositor.id}>
              <strong>{localize(depositor.name, locale)}</strong>
              <span>{money(depositor.balance)}</span>
              <small>{m.depositRate(depositor.rate)}</small>
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
