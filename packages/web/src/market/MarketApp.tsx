import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  CalendarClock,
  Check,
  Clock,
  Coins,
  Equal,
  Landmark,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import {
  CustomerConsultation,
  type ConsultationProgress,
} from "./CustomerConsultation.tsx";
import {
  deleteMarketSession,
  loadMarketSession,
  saveMarketSession,
  type MarketSessionSave,
} from "../app/persistence.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { money } from "./market-format.ts";
import {
  createWorld,
  FIRST_CUSTOMER,
  avatarFor,
  goalsFor,
  marketReducer,
  summarize,
  type Customer,
  type Funding,
} from "./market-world.ts";
import "./market.css";

const DAY_MS = 1_500;

type Transfer = { id: number; from: string; to: string; amount: number };

function emptyConsultationProgress(): ConsultationProgress {
  return { asked: [], lastQuestion: null, expression: "requesting" };
}

export function MarketApp({
  locale,
  onBack,
  stage,
  onComplete,
  devMode = false,
  devPhase = "intro",
  devFresh = false,
}: {
  locale: Locale;
  onBack: () => void;
  stage: MarketCampaignStage;
  onComplete?: () => void;
  devMode?: boolean;
  devPhase?: "intro" | "map";
  devFresh?: boolean;
}) {
  const m = messagesFor(locale).market;
  const [world, dispatch] = useReducer(marketReducer, undefined, () =>
    createWorld(Date.now() >>> 0, stage.config),
  );
  const isChallenge = world.level === "credit-under-pressure";
  const introCustomer = world.customers[0] ?? FIRST_CUSTOMER;
  const [phase, setPhase] = useState<"intro" | "map">("intro");
  const [sessionReady, setSessionReady] = useState(false);
  const [consultationProgress, setConsultationProgress] =
    useState<ConsultationProgress>(emptyConsultationProgress);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
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
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const transferId = useRef(0);
  const modalWasOpenRef = useRef(false);
  const resumeAfterModalRef = useRef(false);
  const createMarketSessionSnapshot = useCallback(
    (): MarketSessionSave => ({
      schemaVersion: 1,
      stageId: stage.id,
      phase,
      world: { ...world, events: [] },
      consultation:
        phase === "intro" ? consultationProgress : emptyConsultationProgress(),
      clock: clockView,
      savedAt: Date.now(),
    }),
    [clockView, consultationProgress, phase, stage.id, world],
  );

  useEffect(() => {
    let cancelled = false;
    loadMarketSession(stage.id, stage.config)
      .then((session) => {
        if (cancelled) return;
        if (session && !(devMode && devFresh)) {
          dispatch({ type: "restore", world: session.world });
          setPhase(session.phase);
          setConsultationProgress(session.consultation);
          setClockView(session.clock);
        } else if (devMode && devPhase === "map") {
          const freshWorld = createWorld(Date.now() >>> 0, stage.config);
          dispatch({
            type: "restore",
            world: marketReducer(freshWorld, { type: "begin" }),
          });
          setPhase("map");
        }
        setSessionReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSessionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [devFresh, devMode, devPhase, stage.config, stage.id]);

  useEffect(() => {
    if (!sessionReady) return;
    const clock = new GameClock(() => {
      dispatchRef.current({ type: "advance-day" });
      return true;
    }, DAY_MS);
    clockRef.current = clock;
    clock.start();
    return () => clock.dispose();
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    const handle = window.setTimeout(() => {
      void saveMarketSession(createMarketSessionSnapshot()).catch(() => {
        if (devMode) setSaveStatus("Save unavailable");
      });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [createMarketSessionSnapshot, devMode, sessionReady]);

  useEffect(() => {
    for (const event of world.events) {
      switch (event.type) {
        case "repayment":
          setNotice(m.noticeRepayment(money(event.amount)));
          break;
        case "default":
          setNotice(
            m.noticeDefault(
              localize(event.customer.name, locale),
              money(event.customer.amount),
            ),
          );
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
        case "funding-repayment":
          setNotice(
            m.noticeFundingRepayment(
              localize(event.lender.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "funding-unlocked":
          setFundingOpen(true);
          setNotice(m.fundingArrived);
          break;
        case "mission-clear":
          break;
        case "insolvent":
          setNotice(m.noticeInsolvent);
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
      selected || fundingOpen || assetsOpen || missionClear || world.insolvent,
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
  }, [assetsOpen, fundingOpen, missionClear, selected, world.insolvent]);

  const { loanReceivables, totalAssets, netWorth, fundingEligible } =
    summarize(world);
  const levelGoals = goalsFor(world);
  const survivalDay = levelGoals.survivalDay ?? 0;
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

  async function saveSnapshot(): Promise<void> {
    await saveMarketSession(createMarketSessionSnapshot());
    setSaveStatus("Saved");
  }

  async function loadSnapshot(): Promise<void> {
    const session = await loadMarketSession(stage.id, stage.config);
    if (!session) {
      setSaveStatus("No saved session");
      return;
    }
    dispatch({ type: "restore", world: session.world });
    setPhase(session.phase);
    setConsultationProgress(session.consultation);
    setClockView(session.clock);
    clockRef.current?.setSpeed(session.clock.speed);
    if (session.clock.paused) clockRef.current?.pause();
    else clockRef.current?.play();
    setSaveStatus("Loaded");
  }

  async function resetDevRun(): Promise<void> {
    await deleteMarketSession(stage.id);
    const freshWorld = createWorld(Date.now() >>> 0, stage.config);
    const nextWorld =
      devPhase === "map"
        ? marketReducer(freshWorld, { type: "begin" })
        : freshWorld;
    dispatch({ type: "restore", world: nextWorld });
    setPhase(devPhase);
    setConsultationProgress(emptyConsultationProgress());
    setClockView({ paused: true, speed: 1 });
    clockRef.current?.pause();
    clockRef.current?.setSpeed(1);
    setSaveStatus("Reset");
  }

  function exportSnapshot(): void {
    const blob = new Blob(
      [JSON.stringify(createMarketSessionSnapshot(), null, 2)],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `banker-${stage.id}-snapshot.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaveStatus("Exported");
  }

  if (!sessionReady) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="brand-mark">
          <Landmark aria-hidden="true" />
        </div>
        <p className="eyebrow">Banker Simulation</p>
        <h1>{m.loadingMarket}</h1>
      </main>
    );
  }

  if (phase === "intro") {
    return (
      <main className="loan-intro">
        <header className="loan-simple-header">
          <button onClick={onBack} aria-label={m.back}>
            <ArrowLeft />
          </button>
          <span>LEVEL {String(stage.number).padStart(2, "0")}</span>
          <strong>{isChallenge ? m.challengeIntroTitle : m.introTitle}</strong>
        </header>
        <CustomerConsultation
          customer={introCustomer}
          locale={locale}
          isChallenge={isChallenge}
          mode="intro"
          sceneLabel={isChallenge ? m.firstAssessment : m.firstCustomer}
          onProceed={beginMap}
          initialProgress={consultationProgress}
          onProgressChange={setConsultationProgress}
        />
        {devMode && (
          <DevTestPanel
            onSave={() => void saveSnapshot()}
            onLoad={() => void loadSnapshot()}
            onReset={() => void resetDevRun()}
            onExport={exportSnapshot}
            status={saveStatus}
          />
        )}
      </main>
    );
  }

  const visibleCustomers = customers.filter(
    (customer) => customer.appears <= day,
  );
  const showFundingHint = fundingEligible && !fundingOpen;
  const goals = [
    {
      icon: Users,
      label: isChallenge ? m.challengeGoalLoans : m.goalFirstLoan,
      progress: `${m.loanProgress(Math.min(loanCount, levelGoals.loanCount))} / ${m.loanProgress(levelGoals.loanCount)}`,
      completed: loanCount >= levelGoals.loanCount,
    },
    {
      icon: Coins,
      label: isChallenge
        ? m.challengeGoalCumulativeLoans
        : m.goalCumulativeLoans,
      progress: `${money(Math.min(cumulativeLent, levelGoals.cumulativeLent))} / ${money(levelGoals.cumulativeLent)}`,
      completed: cumulativeLent >= levelGoals.cumulativeLent,
    },
    {
      icon: Wallet,
      label: isChallenge ? m.challengeGoalNetWorth : m.goalNetWorth,
      progress: `${money(netWorth)} / ${money(levelGoals.netWorth)}`,
      completed: netWorth >= levelGoals.netWorth,
    },
    ...(isChallenge
      ? [
          {
            icon: ShieldCheck,
            label: m.goalSurvive,
            progress: `${m.dayProgress(Math.min(day, survivalDay))} / ${m.dayProgress(survivalDay)}`,
            completed: day >= survivalDay,
          },
        ]
      : []),
  ];
  const activeGoalIndex = goals.findIndex((goal) => !goal.completed);
  const pointFor = (id: string): { x: number; y: number } => {
    if (id === "banker") return { x: 50, y: 49 };
    const customer = customers.find((item) => item.id === id);
    if (customer) return customer;
    return funding.find((item) => item.id === id) ?? { x: 50, y: 50 };
  };

  return (
    <main className={`loan-game stage-${stage.id}`}>
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
        <div className="map-caption" aria-hidden="true">
          <span>
            {stage.number === 1 ? m.districtMarket : m.districtPressure}
          </span>
          <strong>
            {stage.number === 1 ? m.mapMotifGrowth : m.mapMotifRisk}
          </strong>
        </div>
        <div
          className={`goal-overlay ${activeGoalIndex >= 0 ? "has-active" : "all-complete"}`}
        >
          <button
            className="goal-toggle"
            onClick={() => setGoalsOpen((value) => !value)}
            aria-expanded={goalsOpen}
          >
            <span>
              {activeGoalIndex >= 0
                ? isChallenge
                  ? m.challengeGoals
                  : m.levelCompleteGoal
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
            <img src="/assets/pop-art/atoms/bank-hub-marker.svg" alt="" />
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
                <img src="/assets/pop-art/atoms/funding-badge.svg" alt="" />
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
        <p className="time-hint">
          <Clock />
          <span>{m.timeHint}</span>
        </p>
      </footer>

      {notice && (
        <div className="game-notice" role="status" aria-live="polite">
          <img src="/assets/pop-art/atoms/speech-bubble.svg" alt="" />
          <span>{notice}</span>
        </div>
      )}

      {devMode && (
        <DevTestPanel
          onSave={() => void saveSnapshot()}
          onLoad={() => void loadSnapshot()}
          onReset={() => void resetDevRun()}
          onExport={exportSnapshot}
          status={saveStatus}
        />
      )}

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
              <img src="/assets/pop-art/atoms/approval-stamp.svg" alt="" />
            </span>
            <small>
              LEVEL {String(stage.number).padStart(2, "0")} COMPLETE
            </small>
            <h2 id="mission-clear-title">MISSION CLEAR!</h2>
            <p>
              {isChallenge ? m.challengeMissionComplete : m.missionComplete}
            </p>
            <div className="result-grid">
              <div>
                <span>{m.elapsedTime}</span>
                <strong>DAY {day + 1}</strong>
              </div>
              {isChallenge && (
                <div>
                  <span>{m.defaults}</span>
                  <strong>{m.survived}</strong>
                </div>
              )}
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
            <div className="portfolio-details">
              <h3>{m.loanBook}</h3>
              {customers.filter((customer) => customer.status === "accepted")
                .length === 0 ? (
                <p className="portfolio-empty">{m.noOutstandingLoans}</p>
              ) : (
                <div className="portfolio-list">
                  {customers
                    .filter((customer) => customer.status === "accepted")
                    .map((customer) => (
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
              {funding.filter((lender) => lender.accepted).length === 0 ? (
                <p className="portfolio-empty">{m.noFundingObligations}</p>
              ) : (
                <div className="portfolio-list">
                  {funding
                    .filter((lender) => lender.accepted)
                    .map((lender) => (
                      <article key={lender.id}>
                        <strong>{localize(lender.name, locale)}</strong>
                        <span>{money(lender.amount)}</span>
                        <small>
                          {m.dueInDays(Math.max(lender.dueDay - day, 0))} ·{" "}
                          {m.repaymentDue(
                            money(lender.amount * (1 + lender.rate / 100)),
                          )}
                        </small>
                      </article>
                    ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="consultation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label={m.close}
            >
              <X />
            </button>
            <CustomerConsultation
              customer={selected}
              locale={locale}
              isChallenge={isChallenge}
              mode="request"
              sceneLabel={m.loanRequestTitle}
              onApprove={() => approve(selected)}
              onReject={() => reject(selected)}
              onNeedFunding={() => {
                setSelected(null);
                setFundingOpen(true);
              }}
              canApprove={cash >= selected.amount}
            />
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
            <div className="funding-info-strip">
              <span>
                <ArrowRightLeft />
                <small>{m.fundingCashNow}</small>
              </span>
              <span>
                <CalendarClock />
                <small>{m.fundingRepayInterest}</small>
              </span>
              {isChallenge && (
                <span className="risk">
                  <AlertTriangle />
                  <small>{m.fundingRiskInsolvency}</small>
                </span>
              )}
            </div>
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
            <h2 id="loss-title">{m.insolventTitle}</h2>
            <p>{m.insolventDescription}</p>
            <button onClick={onBack}>{m.returnToStages}</button>
          </section>
        </div>
      )}
    </main>
  );
}

function DevTestPanel({
  onSave,
  onLoad,
  onReset,
  onExport,
  status,
}: {
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  onExport: () => void;
  status: string | null;
}) {
  return (
    <aside className="dev-test-panel" aria-label="Manual test controls">
      <strong>DEV TEST</strong>
      <div>
        <button onClick={onSave}>Save</button>
        <button onClick={onLoad}>Load</button>
        <button onClick={onReset}>Reset</button>
        <button onClick={onExport}>Export JSON</button>
      </div>
      {status && <small>{status}</small>}
    </aside>
  );
}
