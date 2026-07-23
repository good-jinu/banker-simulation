import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Banknote,
  Check,
  Clock,
  Coins,
  Landmark,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { ClockView } from "./hooks/useMarketModalClock.ts";
import { money } from "./market-format.ts";
import type { FlowAnimation } from "./market-flow.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  avatarFor,
  goalsFor,
  summarize,
  upcomingRepayment,
  type Customer,
  type LoanProduct,
  type MarketWorld,
} from "./market-world.ts";

type MarketGameViewProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  activeFlow: FlowAnimation | null;
  loanRequestNotice: Customer | null;
  trustPulse: "up" | "down" | null;
  clockView: ClockView;
  goalsOpen: boolean;
  onBack: () => void;
  onOpenAssets: () => void;
  onOpenProductBuilder: () => void;
  onToggleGoals: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onSelectProduct: (product: LoanProduct) => void;
  onOpenFunding: () => void;
  onToggleClock: () => void;
  onCycleSpeed: () => void;
};

export function MarketGameView({
  stage,
  locale,
  world,
  activeFlow,
  loanRequestNotice,
  trustPulse,
  clockView,
  goalsOpen,
  onBack,
  onOpenAssets,
  onOpenProductBuilder,
  onToggleGoals,
  onSelectCustomer,
  onSelectProduct,
  onOpenFunding,
  onToggleClock,
  onCycleSpeed,
}: MarketGameViewProps) {
  const m = messagesFor(locale).market;
  const { netWorth, fundingEligible, trustBand } = summarize(world);
  const nextRepayment = upcomingRepayment(world);
  const levelGoals = goalsFor(world);
  const hasProductGoal = levelGoals.productCount > 0;
  const hasSurvivalGoal = levelGoals.survivalDay !== null;
  const survivalDay = levelGoals.survivalDay ?? 0;
  const {
    cash,
    day,
    customers,
    funding,
    products,
    loanCount,
    cumulativeLent,
    trust,
  } = world;
  const visibleCustomers = customers.filter(
    (customer) => customer.appears <= day,
  );
  const introCustomer = customers.find(
    (customer) => customer.id === world.config.introCustomerId,
  );
  const productLessonReady =
    hasProductGoal && introCustomer?.status !== "waiting";
  const highlightProductButton = productLessonReady && products.length === 0;
  const showFundingHint = fundingEligible;
  const goals = [
    ...(hasProductGoal
      ? [
          {
            icon: SlidersHorizontal,
            label: localize(stage.config.copy.goalProductLabel, locale),
            progress: `${Math.min(products.length, levelGoals.productCount)} / ${levelGoals.productCount}`,
            completed: products.length >= levelGoals.productCount,
          },
        ]
      : []),
    {
      icon: Users,
      label: localize(stage.config.copy.goalLoansLabel, locale),
      progress: `${m.loanProgress(Math.min(loanCount, levelGoals.loanCount))} / ${m.loanProgress(levelGoals.loanCount)}`,
      completed: loanCount >= levelGoals.loanCount,
    },
    {
      icon: Coins,
      label: localize(stage.config.copy.goalCumulativeLentLabel, locale),
      progress: `${money(Math.min(cumulativeLent, levelGoals.cumulativeLent))} / ${money(levelGoals.cumulativeLent)}`,
      completed: cumulativeLent >= levelGoals.cumulativeLent,
    },
    {
      icon: Wallet,
      label: localize(stage.config.copy.goalNetWorthLabel, locale),
      progress: `${money(netWorth)} / ${money(levelGoals.netWorth)}`,
      completed: netWorth >= levelGoals.netWorth,
    },
    ...(hasSurvivalGoal
      ? [
          {
            icon: ShieldCheck,
            label: m.goalSurvive(survivalDay),
            progress: `${m.dayProgress(Math.min(day + 1, survivalDay))} / ${m.dayProgress(survivalDay)}`,
            completed: day + 1 >= survivalDay,
          },
        ]
      : []),
  ];
  const activeGoalIndex = goals.findIndex((goal) => !goal.completed);
  const flowStyle = activeFlow
    ? ({
        "--from-x": `${activeFlow.from.x}%`,
        "--from-y": `${activeFlow.from.y}%`,
        "--to-x": `${activeFlow.to.x}%`,
        "--to-y": `${activeFlow.to.y}%`,
        "--mid-x": `${(activeFlow.from.x + activeFlow.to.x) / 2}%`,
        "--mid-y": `${(activeFlow.from.y + activeFlow.to.y) / 2}%`,
        "--stamp-x": `${activeFlow.stampAt.x}%`,
        "--stamp-y": `${activeFlow.stampAt.y}%`,
      } as React.CSSProperties)
    : undefined;

  return (
    <main className={`loan-game stage-${stage.id}`}>
      <header className="map-header">
        <button className="round-button" onClick={onBack} aria-label={m.back}>
          <ArrowLeft />
        </button>
        <div className="market-status">
          <button
            className="brand"
            onClick={onOpenAssets}
            aria-label={m.bankAssets}
          >
            <Landmark />
            <span>
              <small>MY BANK</small>
              <strong>{money(cash)}</strong>
            </span>
          </button>
          {nextRepayment && (
            <aside
              className="upcoming-repayment"
              aria-live="polite"
              aria-label={`${m.nextCashMovement}: ${m.repaymentDueIn(nextRepayment.dueDay - day)}`}
            >
              {nextRepayment.incomingAmount > 0 && (
                <span
                  className="incoming"
                  aria-label={m.incomingRepayment(
                    money(nextRepayment.incomingAmount),
                  )}
                >
                  <ArrowDownToLine aria-hidden="true" />
                  <strong>{money(nextRepayment.incomingAmount)}</strong>
                </span>
              )}
              {nextRepayment.outgoingAmount > 0 && (
                <span
                  className="outgoing"
                  aria-label={m.outgoingRepayment(
                    money(nextRepayment.outgoingAmount),
                  )}
                >
                  <ArrowUpFromLine aria-hidden="true" />
                  <strong>{money(nextRepayment.outgoingAmount)}</strong>
                </span>
              )}
              <small>{nextRepayment.dueDay - day}d</small>
            </aside>
          )}
        </div>
        {hasProductGoal && (
          <div className="product-launcher-wrap">
            <button
              className={`product-launcher${highlightProductButton ? " tutorial-highlight" : ""}`}
              onClick={onOpenProductBuilder}
              aria-label={m.openProducts}
              disabled={!productLessonReady && products.length === 0}
            >
              <Plus aria-hidden="true" />
              <span className="sr-only">{m.addProduct}</span>
            </button>
          </div>
        )}
      </header>

      <section className="state-map" aria-label={m.loanStatusMap}>
        <aside
          className={`trust-rail trust-${trustBand}${trustPulse ? ` trust-pulse-${trustPulse}` : ""}`}
          aria-label={`${m.trust} ${m.trustScore(trust)}`}
        >
          <div className="trust-rail-header">
            <span>{m.trust}</span>
            <strong>{m.trustScore(trust)}</strong>
          </div>
          <div className="trust-rail-gauge">
            <div className="trust-rail-meter" aria-hidden="true">
              <span style={{ height: `${trust}%` }} />
              <i style={{ bottom: "80%" }} />
              <i style={{ bottom: "60%" }} />
              <i style={{ bottom: "30%" }} />
            </div>
            <div className="trust-rail-scale" aria-hidden="true">
              <small>100</small>
              <small>0</small>
            </div>
          </div>
        </aside>
        <div
          className={`goal-overlay ${activeGoalIndex >= 0 ? "has-active" : "all-complete"}${goalsOpen ? " open" : ""}`}
        >
          <button
            className="goal-toggle"
            onClick={onToggleGoals}
            aria-expanded={goalsOpen}
          >
            <span>
              {activeGoalIndex >= 0
                ? m.goalsPanelTitle(String(stage.number).padStart(2, "0"))
                : m.allGoalsComplete}
            </span>
            <strong>
              {goals.filter((goal) => goal.completed).length} / {goals.length}
            </strong>
            <b>{goalsOpen ? "−" : "+"}</b>
          </button>
          {goalsOpen && (
            <div className="goal-list">
              {goals.map((goal, index) => {
                const GoalIcon = goal.icon;
                return (
                  <div
                    key={goal.label}
                    className={
                      goal.completed
                        ? "completed"
                        : index === activeGoalIndex
                          ? "active"
                          : "locked"
                    }
                  >
                    <span className="goal-check">
                      {goal.completed ? <Check /> : <GoalIcon />}
                    </span>
                    <p>
                      <strong>{goal.label}</strong>
                      <small>{goal.progress}</small>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <svg
          className="connection-layer"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow-in"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {visibleCustomers
            .filter((customer) => customer.status === "accepted")
            .map((customer) => (
              <line
                key={customer.id}
                className="future-edge customer-edge"
                x1={customer.x}
                y1={customer.y}
                x2="50"
                y2="49"
                markerEnd="url(#arrow-in)"
              />
            ))}
          {products
            .filter(
              (product): product is LoanProduct => product.kind === "loan",
            )
            .flatMap((product) =>
              visibleCustomers
                .filter(
                  (customer) =>
                    customer.status === "accepted" &&
                    customer.productId === product.id,
                )
                .map((customer) => (
                  <line
                    key={`${product.id}-${customer.id}`}
                    className="future-edge product-edge"
                    x1={product.x}
                    y1={product.y}
                    x2={customer.x}
                    y2={customer.y}
                    markerEnd="url(#arrow-in)"
                  />
                )),
            )}
          {funding
            .filter((lender) => lender.accepted)
            .map((lender) => (
              <line
                key={lender.id}
                className="future-edge debt-edge"
                x1="50"
                y1="49"
                x2={lender.x}
                y2={lender.y}
                markerEnd="url(#arrow-in)"
              />
            ))}
          {activeFlow && (
            <line
              className={`event-edge event-edge-${activeFlow.kind}`}
              x1={activeFlow.from.x}
              y1={activeFlow.from.y}
              x2={activeFlow.to.x}
              y2={activeFlow.to.y}
            />
          )}
        </svg>
        <div
          className="banker-node map-node"
          style={{ left: "50%", top: "49%" }}
        >
          <span className="node-orbit" />
          <span className="bank-icon">
            <img src="/assets/pop-art/atoms/bank-hub-marker.svg" alt="" />
          </span>
          <strong>{money(cash)}</strong>
        </div>
        {products
          .filter((product): product is LoanProduct => product.kind === "loan")
          .map((product) => (
            <div
              key={product.id}
              className={`product-node map-node${product.active ? "" : " paused"}`}
              style={{ left: `${product.x}%`, top: `${product.y}%` }}
              role="button"
              tabIndex={0}
              aria-label={`${product.name} · ${product.active ? m.productActive : m.productPaused}`}
              onClick={() => onSelectProduct(product)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectProduct(product);
                }
              }}
            >
              <span className="product-icon">
                <SlidersHorizontal aria-hidden="true" />
              </span>
            </div>
          ))}
        {visibleCustomers.map((customer) => {
          const isWaiting = customer.status === "waiting";
          return (
            <div
              key={customer.id}
              className={`customer-node map-node ${customer.status}${isWaiting ? " interactive" : ""}${customer.id === world.config.introCustomerId && isWaiting ? " intro-customer" : ""}`}
              style={{ left: `${customer.x}%`, top: `${customer.y}%` }}
              role={isWaiting ? "button" : undefined}
              tabIndex={isWaiting ? 0 : undefined}
              aria-label={
                isWaiting
                  ? m.noticeLoanRequest(
                      localize(customer.name, locale),
                      money(customer.amount),
                    )
                  : undefined
              }
              onClick={() => {
                if (isWaiting) onSelectCustomer(customer);
              }}
              onKeyDown={(event) => {
                if (isWaiting && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectCustomer(customer);
                }
              }}
            >
              {isWaiting && loanRequestNotice?.id === customer.id && (
                <span className="node-event-popup" role="status">
                  {m.noticeLoanRequest(
                    localize(customer.name, locale),
                    money(customer.amount),
                  )}
                </span>
              )}
              <span className="portrait">
                <img
                  src={avatarFor(
                    customer,
                    customer.status === "waiting" ? "requesting" : "relieved",
                  )}
                  alt={m.customerAlt(
                    localize(customer.name, locale),
                    m.mapMarker,
                  )}
                />
              </span>
              <img
                className="node-marker"
                src={`/assets/pop-art/atoms/${customer.status === "waiting" ? "customer-marker" : "repayment-marker"}.svg`}
                alt=""
              />
              <strong>
                {customer.status === "waiting"
                  ? money(customer.amount)
                  : m.repaymentIn(Math.max(customer.dueDay - day, 0))}
              </strong>
              <small>
                <span className="term-symbol" aria-hidden="true">
                  {customer.status === "waiting" ? "%" : <Banknote />}
                </span>
                {customer.status === "waiting"
                  ? `${customer.rate}%`
                  : m.repaymentDue(
                      money(customer.amount * (1 + customer.rate / 100)),
                    )}
              </small>
            </div>
          );
        })}
        {funding
          .filter((lender) => lender.accepted)
          .map((lender) => (
            <div
              key={lender.id}
              className={`lender-node map-node${lender.defaulted ? " defaulted" : ""}`}
              style={{ left: `${lender.x}%`, top: `${lender.y}%` }}
              aria-label={
                lender.defaulted
                  ? `${m.defaulted} ${money(lender.amount * (1 + lender.rate / 100))}`
                  : undefined
              }
            >
              <span className="bank-icon small">
                <img
                  src={`/assets/pop-art/atoms/${lender.defaulted ? "rejection-stamp" : "funding-badge"}.svg`}
                  alt=""
                />
              </span>
              <strong>
                {lender.defaulted
                  ? m.defaulted
                  : m.repaymentIn(Math.max(lender.dueDay - day, 0))}
              </strong>
              <small>
                <span className="term-symbol" aria-hidden="true">
                  <Banknote />
                </span>
                {lender.defaulted
                  ? m.defaultedDebt(
                      money(lender.amount * (1 + lender.rate / 100)),
                    )
                  : m.repaymentDue(
                      money(lender.amount * (1 + lender.rate / 100)),
                    )}
              </small>
            </div>
          ))}
        {activeFlow && (
          <div className="flow-layer" aria-hidden="true">
            <div
              key={activeFlow.id}
              className={`flow-token flow-${activeFlow.kind}`}
              style={flowStyle}
            >
              <img src="/assets/pop-art/atoms/cash-symbol.svg" alt="" />
              <span>{money(activeFlow.amount)}</span>
            </div>
            <span
              className={`flow-stamp flow-stamp-${activeFlow.kind}`}
              style={flowStyle}
            >
              {activeFlow.label}
            </span>
          </div>
        )}
        {showFundingHint && (
          <button
            className="funding-hint"
            onClick={onOpenFunding}
            aria-label={m.viewFunding}
          >
            <Landmark />
            <Plus className="funding-plus" aria-hidden="true" />
            <span className="sr-only">{m.newFunding}</span>
          </button>
        )}
      </section>
      <footer className="time-controller">
        <div>
          <span
            className={clockView.paused ? "status-dot paused" : "status-dot"}
          />
          <strong>{m.dayStatus(day + 1, clockView.paused)}</strong>
        </div>
        <button
          className="play-time"
          onClick={onToggleClock}
          aria-label={clockView.paused ? m.playTime : m.pause}
        >
          {clockView.paused ? (
            <Play fill="currentColor" />
          ) : (
            <Pause fill="currentColor" />
          )}
        </button>
        <button className="speed-time" onClick={onCycleSpeed}>
          {clockView.speed}×
        </button>
        <p className="time-hint">
          <Clock aria-hidden="true" />
          <span>{m.timeHint}</span>
        </p>
      </footer>
    </main>
  );
}
