import { Banknote, Equal, Landmark, Minus, Wallet, X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import {
  summarize,
  type Customer,
  type Depositor,
  type Funding,
  type MarketWorld,
} from "./market-world.ts";

export function MarketAssetsDialog({
  world,
  locale,
  onClose,
}: {
  world: MarketWorld;
  locale: Locale;
  onClose: () => void;
}) {
  const m = messagesFor(locale).market;
  const { cash, day, customers, depositors, funding, trust } = world;
  // The balance sheet the simulation actually scores the bank on. Re-deriving
  // it here once let the panel and the trust model disagree.
  const {
    loanReceivables,
    totalAssets,
    fundingLiabilities,
    depositLiabilities,
    netWorth,
    trustBand,
  } = summarize(world);
  const totalLiabilities = fundingLiabilities + depositLiabilities;
  const trustLabel =
    trustBand === "strong"
      ? m.trustStrong
      : trustBand === "steady"
        ? m.trustSteady
        : trustBand === "at-risk"
          ? m.trustAtRisk
          : m.trustBlocked;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="assets-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={m.close}>
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
            <strong>{m.trustScore(Math.floor(trust))}</strong>
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
        <h3>{m.liabilities}</h3>
        <dl className="asset-rows">
          <div>
            <dt>{m.depositLiabilities}</dt>
            <dd>{money(depositLiabilities)}</dd>
          </div>
          <div>
            <dt>{m.bankRepaymentObligation}</dt>
            <dd>{money(fundingLiabilities)}</dd>
          </div>
          <div className="total">
            <dt>{m.totalLiabilities}</dt>
            <dd>{money(totalLiabilities)}</dd>
          </div>
        </dl>
        <div className="asset-equation" aria-hidden="true">
          <span>
            <Banknote />
            <small>{m.totalAssets}</small>
          </span>
          <Minus className="eq-op" />
          <span>
            <Wallet />
            <small>{m.totalLiabilities}</small>
          </span>
          <Equal className="eq-op" />
          <span>
            <Landmark />
            <small>{m.netWorth}</small>
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
                {m.dueInDays(Math.max(customer.dueDay - day, 0))},{" "}
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
                  : `${m.dueInDays(Math.max(lender.dueDay - day, 0))}, ${m.repaymentDue(money(lender.amount * (1 + lender.rate / 100)))}`}
              </small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
