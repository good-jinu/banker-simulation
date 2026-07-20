import { ArrowLeft, Check, Info, Landmark, Pause, Play, X } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  createWorld,
  FIRST_CUSTOMER,
  GOALS,
  marketReducer,
  summarize,
  type Customer,
  type Funding,
} from "./market-world.ts";
import "./market.css";

const DAY_MS = 1_500;

type Transfer = { id: number; from: string; to: string; amount: number };

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function MarketApp({
  locale,
  onBack,
  stage: _stage,
  onComplete,
}: {
  locale: Locale;
  onBack: () => void;
  stage?: MarketCampaignStage;
  onComplete?: () => void;
}) {
  const m = messagesFor(locale).market;
  const [world, dispatch] = useReducer(marketReducer, undefined, () =>
    createWorld(Date.now() >>> 0),
  );
  const [phase, setPhase] = useState<"intro" | "map">("intro");
  const [askedJob, setAskedJob] = useState(false);
  const [askedIncome, setAskedIncome] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: true, speed: 1 });
  const clockRef = useRef<GameClock | null>(null);
  const transferId = useRef(0);
  const modalWasOpenRef = useRef(false);
  const resumeAfterModalRef = useRef(false);

  useEffect(() => {
    const clock = new GameClock(() => {
      dispatch({ type: "advance-day" });
      return true;
    }, DAY_MS);
    clockRef.current = clock;
    clock.start();
    return () => clock.dispose();
  }, []);

  useEffect(() => {
    for (const event of world.events) {
      switch (event.type) {
        case "repayment":
          setNotice(m.noticeRepayment(money(event.amount)));
          break;
        case "loan-request":
          setNotice(
            m.noticeLoanRequest(
              localize(event.customer.name, locale),
              money(event.customer.amount),
            ),
          );
          break;
        case "transfer":
          transferId.current += 1;
          setTransfer({
            id: transferId.current,
            from: event.from,
            to: event.to,
            amount: event.amount,
          });
          break;
        case "borrowed":
          setNotice(
            m.borrowed(
              localize(event.lender.name, locale),
              money(event.lender.amount),
            ),
          );
          break;
        case "funding-unlocked":
          setFundingOpen(true);
          setNotice(m.fundingArrived);
          break;
        case "mission-clear":
          break;
      }
    }
  }, [locale, m, world.events]);

  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 3_200);
    return () => window.clearTimeout(handle);
  }, [notice]);

  useEffect(() => {
    if (!transfer) return;
    const handle = window.setTimeout(() => setTransfer(null), 1_100);
    return () => window.clearTimeout(handle);
  }, [transfer]);

  const missionClear = world.missionCleared;

  useEffect(() => {
    const modalOpen = Boolean(
      selected || fundingOpen || assetsOpen || missionClear,
    );
    const clock = clockRef.current;
    if (!clock) return;

    if (modalOpen && !modalWasOpenRef.current) {
      modalWasOpenRef.current = true;
      resumeAfterModalRef.current = !clock.paused;
      if (clock.paused) return;
      clock.pause();
      setClockView((current) => ({ ...current, paused: true }));
      return;
    }

    if (!modalOpen && modalWasOpenRef.current) {
      modalWasOpenRef.current = false;
      if (resumeAfterModalRef.current) {
        clock.play();
        setClockView((current) => ({ ...current, paused: false }));
      }
      resumeAfterModalRef.current = false;
    }
  }, [assetsOpen, fundingOpen, missionClear, selected]);

  const {
    loanReceivables,
    fundingLiabilities,
    totalAssets,
    netWorth,
    netCash,
    fundingEligible,
  } = summarize(world);
  const { cash, day, customers, funding, loanCount, cumulativeLent } = world;

  function beginMap(): void {
    dispatch({ type: "begin" });
    setPhase("map");
  }

  function approve(customer: Customer): void {
    setSelected(null);
    if (cash < customer.amount) {
      if (fundingEligible) setFundingOpen(true);
      setNotice(
        fundingEligible
          ? `${m.insufficientCash} ${m.viewFunding}`
          : `${m.insufficientCash} ${m.fundingUnavailable}`,
      );
      return;
    }
    dispatch({ type: "approve", customerId: customer.id });
  }

  function reject(customer: Customer): void {
    dispatch({ type: "reject", customerId: customer.id });
    setSelected(null);
  }

  function borrow(lender: Funding): void {
    dispatch({ type: "borrow", lenderId: lender.id });
    setFundingOpen(false);
  }

  function toggleClock(): void {
    const clock = clockRef.current;
    if (!clock) return;
    if (clock.paused) clock.play();
    else clock.pause();
    setClockView((current) => ({ ...current, paused: clock.paused }));
  }

  function cycleSpeed(): void {
    const index = CLOCK_SPEEDS.indexOf(clockView.speed);
    const speed = CLOCK_SPEEDS[(index + 1) % CLOCK_SPEEDS.length]!;
    clockRef.current?.setSpeed(speed);
    setClockView((current) => ({ ...current, speed }));
  }

  if (phase === "intro") {
    return (
      <main className="loan-intro">
        <header className="loan-simple-header">
          <button onClick={onBack} aria-label={m.back}>
            <ArrowLeft />
          </button>
          <span>LEVEL 01</span>
          <strong>{m.introTitle}</strong>
        </header>
        <section className="conversation-card">
          <div className="conversation-scene">
            <span className="scene-label">{m.firstCustomer}</span>
            <img
              src={FIRST_CUSTOMER.avatar}
              alt={m.customerAlt(localize(FIRST_CUSTOMER.name, locale))}
            />
            <div className="speech-bubble">
              <small>{localize(FIRST_CUSTOMER.name, locale)}</small>
              <p>
                {m.greeting}
                <br />
                <strong>{m.loanQuestion}</strong>
              </p>
            </div>
          </div>
          <div className="conversation-actions">
            <p className="action-guide">{m.learnCustomer}</p>
            <button
              className={askedJob ? "asked" : ""}
              onClick={() => setAskedJob(true)}
            >
              {askedJob ? <Check /> : <Info />} {m.askJob}
            </button>
            {askedJob && <p className="answer-line">“{m.jobAnswer}”</p>}
            <button
              className={askedIncome ? "asked" : ""}
              onClick={() => setAskedIncome(true)}
            >
              {askedIncome ? <Check /> : <Info />} {m.askIncome}
            </button>
            {askedIncome && <p className="answer-line">“{m.incomeAnswer}”</p>}
            {askedJob && askedIncome && (
              <div className="approve-reveal">
                <span>{m.informationComplete}</span>
                <button onClick={beginMap}>
                  <Landmark /> {m.lendAtRate}
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  const visibleCustomers = customers.filter(
    (customer) => customer.appears <= day,
  );
  const showFundingHint = fundingEligible && !fundingOpen;
  const goals = [
    {
      label: m.goalFirstLoan,
      progress: `${m.loanProgress(Math.min(loanCount, GOALS.loanCount))} / ${m.loanProgress(GOALS.loanCount)}`,
      completed: loanCount >= GOALS.loanCount,
    },
    {
      label: m.goalCumulativeLoans,
      progress: `${money(Math.min(cumulativeLent, GOALS.cumulativeLent))} / ${money(GOALS.cumulativeLent)}`,
      completed: cumulativeLent >= GOALS.cumulativeLent,
    },
    {
      label: m.goalNetCash,
      progress: `${money(netCash)} / ${money(GOALS.netCash)}`,
      completed: netCash >= GOALS.netCash,
    },
  ];
  const activeGoalIndex = goals.findIndex((goal) => !goal.completed);
  const pointFor = (id: string): { x: number; y: number } => {
    if (id === "banker") return { x: 50, y: 49 };
    const customer = customers.find((item) => item.id === id);
    if (customer) return customer;
    return funding.find((item) => item.id === id) ?? { x: 50, y: 50 };
  };

  return (
    <main className="loan-game">
      <header className="map-header">
        <button className="round-button" onClick={onBack} aria-label={m.back}>
          <ArrowLeft />
        </button>
        <button
          className="brand"
          onClick={() => setAssetsOpen(true)}
          aria-label={m.bankAssets}
        >
          <Landmark />
          <span>
            <small>MY BANK</small>
            <strong>{money(cash)}</strong>
          </span>
        </button>
        <div className="day-display">
          <small>{m.currentDate}</small>
          <strong>DAY {day + 1}</strong>
        </div>
      </header>

      <section className="state-map" aria-label={m.loanStatusMap}>
        <div
          className={`goal-overlay ${activeGoalIndex >= 0 ? "has-active" : "all-complete"}`}
        >
          <button
            className="goal-toggle"
            onClick={() => setGoalsOpen((value) => !value)}
            aria-expanded={goalsOpen}
          >
            <span>
              {activeGoalIndex >= 0 ? m.levelCompleteGoal : m.allGoalsComplete}
            </span>
            <strong>
              {goals.filter((goal) => goal.completed).length} / {goals.length}
            </strong>
            <b>{goalsOpen ? "−" : "+"}</b>
          </button>
          {goalsOpen && (
            <div className="goal-list">
              {goals.map((goal, index) => (
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
                    {goal.completed ? <Check /> : index + 1}
                  </span>
                  <p>
                    <strong>{goal.label}</strong>
                    <small>{goal.progress}</small>
                  </p>
                </div>
              ))}
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
        </svg>

        <div
          className="banker-node map-node"
          style={{ left: "50%", top: "49%" }}
        >
          <span className="node-orbit" />
          <span className="bank-icon">
            <Landmark />
          </span>
          <strong>{money(cash)}</strong>
          <small>{m.currentCash}</small>
        </div>

        {visibleCustomers.map((customer) => (
          <div
            key={customer.id}
            className={`customer-node map-node ${customer.status}`}
            style={{ left: `${customer.x}%`, top: `${customer.y}%` }}
          >
            {customer.status === "waiting" && (
              <span className="request-tag">
                {m.waiting(Math.max(day - customer.appears, 0))}
              </span>
            )}
            <span className="portrait">
              <img src={customer.avatar} alt="" />
            </span>
            <strong>
              {customer.status === "waiting"
                ? money(customer.amount)
                : m.repaymentIn(Math.max(customer.dueDay - day, 0))}
            </strong>
            <small>
              {customer.status === "waiting"
                ? m.loanRequest(customer.rate)
                : m.repaymentDue(
                    money(customer.amount * (1 + customer.rate / 100)),
                  )}
            </small>
            {customer.status === "waiting" && (
              <button onClick={() => setSelected(customer)}>{m.details}</button>
            )}
          </div>
        ))}

        {funding
          .filter((lender) => lender.accepted)
          .map((lender) => (
            <div
              key={lender.id}
              className="lender-node map-node"
              style={{ left: `${lender.x}%`, top: `${lender.y}%` }}
            >
              <span className="bank-icon small">
                <Landmark />
              </span>
              <strong>{m.repaymentIn(Math.max(lender.dueDay - day, 0))}</strong>
              <small>
                {m.repaymentDue(money(lender.amount * (1 + lender.rate / 100)))}
              </small>
            </div>
          ))}

        {transfer &&
          (() => {
            const from = pointFor(transfer.from);
            const to = pointFor(transfer.to);
            return (
              <div
                key={transfer.id}
                className="flying-money"
                style={
                  {
                    "--from-x": `${from.x}vw`,
                    "--from-y": `${from.y}vh`,
                    "--to-x": `${to.x}vw`,
                    "--to-y": `${to.y}vh`,
                  } as React.CSSProperties
                }
              >
                {money(transfer.amount)}
              </div>
            );
          })()}

        {showFundingHint && (
          <aside className="funding-hint">
            <Landmark />
            <div>
              <strong>{m.newFunding}</strong>
              <p>{m.fundingHint}</p>
            </div>
            <button onClick={() => setFundingOpen(true)}>
              {m.viewLoanProducts}
            </button>
          </aside>
        )}
      </section>

      <footer className="time-controller">
        <div>
          <span
            className={clockView.paused ? "status-dot paused" : "status-dot"}
          />
          <small>{clockView.paused ? m.timePaused : m.timeRunning}</small>
        </div>
        <button
          className="play-time"
          onClick={toggleClock}
          aria-label={clockView.paused ? m.playTime : m.pause}
        >
          {clockView.paused ? (
            <Play fill="currentColor" />
          ) : (
            <Pause fill="currentColor" />
          )}
        </button>
        <button className="speed-time" onClick={cycleSpeed}>
          {clockView.speed}×
        </button>
        <p>{m.timeHint}</p>
      </footer>

      {notice && <div className="game-notice">{notice}</div>}

      {missionClear && (
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
              <Check />
            </span>
            <small>LEVEL 01 COMPLETE</small>
            <h2 id="mission-clear-title">MISSION CLEAR!</h2>
            <p>{m.missionComplete}</p>
            <div className="result-grid">
              <div>
                <span>{m.elapsedTime}</span>
                <strong>DAY {day + 1}</strong>
              </div>
              <div>
                <span>{m.loansIssued}</span>
                <strong>{m.loanProgress(loanCount)}</strong>
              </div>
              <div>
                <span>{m.cumulativeLoans}</span>
                <strong>{money(cumulativeLent)}</strong>
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
            <button onClick={() => (onComplete ? onComplete() : onBack())}>
              {m.checkResult}
            </button>
          </section>
        </div>
      )}

      {assetsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setAssetsOpen(false)}
        >
          <section
            className="assets-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setAssetsOpen(false)}
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
                <dt>{m.bankRepaymentObligation}</dt>
                <dd>{money(fundingLiabilities)}</dd>
              </div>
              <div className="net-cash">
                <dt>{m.netCash}</dt>
                <dd>{money(netCash)}</dd>
              </div>
            </dl>
            <p className="asset-note">{m.assetNote}</p>
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="detail-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label={m.close}
            >
              <X />
            </button>
            <img src={selected.avatar} alt="" />
            <small>{m.loanRequestTitle}</small>
            <h2>{localize(selected.name, locale)}</h2>
            <p className="request-copy">
              “{m.requestCopy(money(selected.amount))}”
            </p>
            <dl>
              <div>
                <dt>{m.job}</dt>
                <dd>{localize(selected.job, locale)}</dd>
              </div>
              <div>
                <dt>{m.monthlyIncome}</dt>
                <dd>{money(selected.income)}</dd>
              </div>
              <div>
                <dt>{m.loanAmount}</dt>
                <dd>{money(selected.amount)}</dd>
              </div>
              <div>
                <dt>{m.repaymentTerms}</dt>
                <dd>{m.loanTerms(selected.term, selected.rate)}</dd>
              </div>
            </dl>
            <div className="decision-row">
              <button
                className="reject-button"
                onClick={() => reject(selected)}
              >
                {m.reject}
              </button>
              <button
                className="accept-button"
                onClick={() => approve(selected)}
                disabled={cash < selected.amount}
              >
                {m.lend(money(selected.amount))}
              </button>
            </div>
            {cash < selected.amount && fundingEligible && (
              <button
                className="need-funding"
                onClick={() => {
                  setSelected(null);
                  setFundingOpen(true);
                }}
              >
                {m.fundingNeeded}
              </button>
            )}
          </section>
        </div>
      )}

      {fundingOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setFundingOpen(false)}
        >
          <section
            className="funding-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setFundingOpen(false)}
              aria-label={m.close}
            >
              <X />
            </button>
            <small>INTERBANK FUNDING</small>
            <h2>{m.borrowFromBank}</h2>
            <p>{m.fundingDescription}</p>
            <div className="funding-options">
              {funding
                .filter((item) => !item.accepted)
                .map((lender) => (
                  <article key={lender.id}>
                    <span className="bank-icon small">
                      <Landmark />
                    </span>
                    <div>
                      <strong>{localize(lender.name, locale)}</strong>
                      <small>{m.dueInDays(lender.dueDay)}</small>
                    </div>
                    <div className="funding-rate">
                      <strong>{money(lender.amount)}</strong>
                      <small>{m.annualRate(lender.rate)}</small>
                    </div>
                    <button onClick={() => borrow(lender)}>{m.select}</button>
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
