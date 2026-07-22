import {
  ArrowLeft,
  Banknote,
  Check,
  Clock,
  Coins,
  Equal,
  Landmark,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
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
import { CustomerConsultation } from "./CustomerConsultation.tsx";
import { InterbankConversation } from "./InterbankConversation.tsx";
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
  avatarFor,
  goalsFor,
  marketReducer,
  summarize,
  type Customer,
  type Funding,
  type MarketEvent,
  type LoanProduct,
  type LoanProductRules,
  type OccupationRule,
  type Product,
} from "./market-world.ts";
import "./market.css";

const DAY_MS = 1_500;

type MapPoint = { x: number; y: number };
type FlowKind =
  | "loan-out"
  | "funding-in"
  | "customer-repayment"
  | "funding-repayment"
  | "funding-settlement"
  | "default"
  | "product-cash-in";
type FlowAnimation = {
  id: number;
  from: MapPoint;
  to: MapPoint;
  stampAt: MapPoint;
  amount: number;
  kind: FlowKind;
  label: string;
};

type FlowLabels = {
  funded: string;
  cashIn: string;
  repaid: string;
  paid: string;
  settled: string;
  defaulted: string;
  automated: string;
  retrieved: string;
};

function pointForId(
  id: string,
  customers: Customer[],
  funding: Funding[],
  products: Product[],
): MapPoint {
  if (id === "banker") return { x: 50, y: 49 };
  return (
    customers.find((customer) => customer.id === id) ??
    funding.find((lender) => lender.id === id) ??
    products.find((product) => product.id === id) ?? { x: 50, y: 50 }
  );
}

function flowForEvent(
  event: MarketEvent,
  pointFor: (id: string) => MapPoint,
  labels: FlowLabels,
): Omit<FlowAnimation, "id"> | null {
  const customerPoint = (customer: Customer): MapPoint => customer;
  const lenderPoint = (lender: Funding): MapPoint => lender;
  switch (event.type) {
    case "transfer": {
      const fundingIn = event.to === "banker";
      const automated = event.from !== "banker" && event.to !== "banker";
      const from = pointFor(event.from);
      const to = pointFor(event.to);
      return {
        from,
        to,
        stampAt: to,
        amount: event.amount,
        kind: fundingIn ? "funding-in" : "loan-out",
        label: fundingIn
          ? labels.cashIn
          : automated
            ? labels.automated
            : labels.funded,
      };
    }
    case "customer-repayment":
      if (event.customer.productId) return null;
      return {
        from: customerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: pointFor("banker"),
        amount: event.amount,
        kind: "customer-repayment",
        label: labels.repaid,
      };
    case "product-cash-in":
      return {
        from: customerPoint(event.customer),
        to: pointFor(event.product.id),
        stampAt: pointFor(event.product.id),
        amount: event.amount,
        kind: "product-cash-in",
        label: labels.retrieved,
      };
    case "funding-repayment":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "funding-repayment",
        label: labels.paid,
      };
    case "funding-settlement":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "funding-settlement",
        label: labels.settled,
      };
    case "default":
      return {
        from: customerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: customerPoint(event.customer),
        amount: event.customer.amount,
        kind: "default",
        label: labels.defaulted,
      };
    case "funding-default":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "default",
        label: labels.defaulted,
      };
    default:
      return null;
  }
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
  // Stage-flavored behavior is driven by each stage's own goal config, not a
  // hardcoded "which level is this" flag — so a new stage opts in just by
  // setting its goals, no code branch required.
  const hasProductGoal = world.config.goals.productCount > 0;
  const [sessionReady, setSessionReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [productBuilderOpen, setProductBuilderOpen] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [flowQueue, setFlowQueue] = useState<FlowAnimation[]>([]);
  const [activeFlow, setActiveFlow] = useState<FlowAnimation | null>(null);
  const [trustPulse, setTrustPulse] = useState<"up" | "down" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: true, speed: 1 });
  const clockRef = useRef<GameClock | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const flowId = useRef(0);
  const modalWasOpenRef = useRef(false);
  const resumeAfterModalRef = useRef(false);
  const createMarketSessionSnapshot = useCallback(
    (): MarketSessionSave => ({
      schemaVersion: 2,
      stageId: stage.id,
      phase: "map",
      world: { ...world, events: [] },
      consultation: { asked: [], lastQuestion: null, expression: "requesting" },
      clock: clockView,
      savedAt: Date.now(),
    }),
    [clockView, stage.id, world],
  );

  useEffect(() => {
    let cancelled = false;
    loadMarketSession(stage.id, stage.config)
      .then((session) => {
        if (cancelled) return;
        if (session && !(devMode && devFresh)) {
          dispatch({ type: "restore", world: session.world });
          setClockView(session.clock);
        } else if (devMode && devPhase === "map") {
          const freshWorld = createWorld(Date.now() >>> 0, stage.config);
          dispatch({ type: "restore", world: freshWorld });
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
          if (hasProductGoal && world.products.length === 0)
            setProductBuilderOpen(true);
          break;
        case "loan-request":
          setNotice(
            m.noticeLoanRequest(
              localize(event.customer.name, locale),
              money(event.customer.amount),
            ),
          );
          break;
        case "customer-repayment":
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
              event.trustDelta,
            ),
          );
          break;
        case "funding-default":
          setNotice(
            m.noticeFundingDefault(
              localize(event.lender.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "funding-settlement":
          setNotice(
            m.noticeFundingSettlement(
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
          setNotice(
            world.failureReason === "trust"
              ? m.trustFailureTitle
              : m.noticeInsolvent,
          );
          break;
      }
    }
  }, [
    hasProductGoal,
    locale,
    m,
    world.events,
    world.failureReason,
    world.products.length,
  ]);

  useEffect(() => {
    const pointFor = (id: string) =>
      pointForId(id, world.customers, world.funding, world.products);
    const labels: FlowLabels = {
      funded: m.flowFunded,
      cashIn: m.flowCashIn,
      repaid: m.flowRepaid,
      paid: m.flowPaid,
      settled: m.flowSettled,
      defaulted: m.flowDefaulted,
      automated: m.flowAutomated,
      retrieved: m.flowRetrieved,
    };
    const flows = world.events
      .map((event) => flowForEvent(event, pointFor, labels))
      .filter((flow): flow is Omit<FlowAnimation, "id"> => flow !== null)
      .map((flow) => ({ ...flow, id: ++flowId.current }));
    if (flows.length > 0) {
      setFlowQueue((pending) => [...pending, ...flows]);
    }

    const fundingTrustEvent = world.events.find(
      (event) =>
        event.type === "funding-repayment" || event.type === "funding-default",
    );
    if (fundingTrustEvent) {
      setTrustPulse(
        fundingTrustEvent.type === "funding-repayment" ? "up" : "down",
      );
    }
  }, [m, world.events, world.funding, world.customers, world.products]);

  useEffect(() => {
    if (activeFlow || flowQueue.length === 0) return;
    const [next, ...rest] = flowQueue;
    setFlowQueue(rest);
    setActiveFlow(next ?? null);
  }, [activeFlow, flowQueue]);

  useEffect(() => {
    if (!activeFlow) return;
    const handle = window.setTimeout(
      () => setActiveFlow(null),
      activeFlow.kind === "default" ? 1_250 : 1_100,
    );
    return () => window.clearTimeout(handle);
  }, [activeFlow]);

  useEffect(() => {
    if (!trustPulse) return;
    const handle = window.setTimeout(() => setTrustPulse(null), 900);
    return () => window.clearTimeout(handle);
  }, [trustPulse]);

  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 3_200);
    return () => window.clearTimeout(handle);
  }, [notice]);

  const missionClear = world.missionCleared;

  useEffect(() => {
    const modalOpen = Boolean(
      selected ||
      productBuilderOpen ||
      fundingOpen ||
      assetsOpen ||
      missionClear ||
      world.insolvent,
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
  }, [
    assetsOpen,
    fundingOpen,
    missionClear,
    productBuilderOpen,
    selected,
    world.insolvent,
  ]);

  const { loanReceivables, totalAssets, netWorth, fundingEligible, trustBand } =
    summarize(world);
  const levelGoals = goalsFor(world);
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

  function trustLabel(): string {
    switch (trustBand) {
      case "strong":
        return m.trustStrong;
      case "steady":
        return m.trustSteady;
      case "at-risk":
        return m.trustAtRisk;
      default:
        return m.trustBlocked;
    }
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
    if (hasProductGoal && world.products.length === 0)
      setProductBuilderOpen(true);
  }

  function createLoanProduct(rules: LoanProductRules): void {
    if (cash < world.config.productCreationCost) {
      setNotice(
        m.productInsufficientCash(money(world.config.productCreationCost)),
      );
      return;
    }
    const product: LoanProduct = {
      id: `loan-product-${world.products.filter((item) => item.kind === "loan").length + 1}`,
      kind: "loan",
      name: m.loanProductName,
      x: 50,
      y: 26,
      rules,
    };
    dispatch({ type: "create-product", product });
    setProductBuilderOpen(false);
    setNotice(m.productActivated);
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
    setClockView(session.clock);
    clockRef.current?.setSpeed(session.clock.speed);
    if (session.clock.paused) clockRef.current?.pause();
    else clockRef.current?.play();
    setSaveStatus("Loaded");
  }

  async function resetDevRun(): Promise<void> {
    await deleteMarketSession(stage.id);
    const freshWorld = createWorld(Date.now() >>> 0, stage.config);
    dispatch({ type: "restore", world: freshWorld });
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

  const visibleCustomers = customers.filter(
    (customer) => customer.appears <= day,
  );
  const introCustomer = customers.find(
    (customer) => customer.id === world.config.introCustomerId,
  );
  const productLessonReady =
    hasProductGoal && introCustomer?.status !== "waiting";
  const highlightProductButton = productLessonReady && products.length === 0;
  const showFundingHint = fundingEligible && !fundingOpen;
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
        {hasProductGoal && (
          <div className="product-launcher-wrap">
            {highlightProductButton && (
              <span className="product-tutorial-callout">
                {m.productTutorialClick}
              </span>
            )}
            <button
              className={`product-launcher${highlightProductButton ? " tutorial-highlight" : ""}`}
              onClick={() => setProductBuilderOpen(true)}
              aria-label={m.openProducts}
              disabled={!productLessonReady && products.length === 0}
            >
              <Plus aria-hidden="true" />
              <span>{m.addProduct}</span>
            </button>
          </div>
        )}
        <div className="day-display">
          <Clock aria-hidden="true" />
          <strong>DAY {day + 1}</strong>
        </div>
      </header>

      <section className="state-map" aria-label={m.loanStatusMap}>
        <div className="map-caption" aria-hidden="true">
          <span>{localize(stage.config.copy.districtLabel, locale)}</span>
        </div>
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
          className={`goal-overlay ${activeGoalIndex >= 0 ? "has-active" : "all-complete"}`}
        >
          <button
            className="goal-toggle"
            onClick={() => setGoalsOpen((value) => !value)}
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
            .filter((product) => product.kind === "loan")
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
              className="product-node map-node"
              style={{ left: `${product.x}%`, top: `${product.y}%` }}
            >
              <span className="product-icon">
                <SlidersHorizontal aria-hidden="true" />
              </span>
              <strong>{m.productAutoLending}</strong>
              <small>
                {m.productRuleSummary(
                  money(product.rules.minimumIncome),
                  money(product.rules.minimumAmount),
                  money(product.rules.maximumAmount),
                )}
              </small>
            </div>
          ))}

        {visibleCustomers.map((customer) => (
          <div
            key={customer.id}
            className={`customer-node map-node ${customer.status}${
              customer.id === world.config.introCustomerId &&
              customer.status === "waiting"
                ? " intro-customer"
                : ""
            }`}
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
              <span className="term-symbol" aria-hidden="true">
                {customer.status === "waiting" ? "%" : <Banknote />}
              </span>
              {customer.status === "waiting"
                ? `${customer.rate}%`
                : m.repaymentDue(
                    money(customer.amount * (1 + customer.rate / 100)),
                  )}
            </small>
            {customer.status === "waiting" && (
              <button onClick={() => setSelected(customer)}>
                {customer.id === world.config.introCustomerId
                  ? m.reviewRequest
                  : m.details}
              </button>
            )}
          </div>
        ))}

        {funding
          .filter((lender) => lender.accepted)
          .map((lender) => (
            <div
              key={lender.id}
              className={`lender-node map-node${lender.defaulted ? " defaulted" : ""}`}
              style={{ left: `${lender.x}%`, top: `${lender.y}%` }}
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
            <p>{localize(stage.config.copy.missionCompleteLabel, locale)}</p>
            <div className="result-grid">
              <div>
                <span>{m.elapsedTime}</span>
                <strong>DAY {day + 1}</strong>
              </div>
              {hasSurvivalGoal && (
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
            <div className={`trust-card trust-${trustBand}`}>
              <div>
                <span>{m.trust}</span>
                <strong>{m.trustScore(trust)}</strong>
              </div>
              <div className="trust-meter" aria-hidden="true">
                <span style={{ width: `${trust}%` }} />
              </div>
              <small>{trustLabel()}</small>
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
              showRiskEstimate={world.config.randomizeDefaultRisk}
              learnCustomerHint={localize(
                stage.config.copy.learnCustomerHint,
                locale,
              )}
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

      {productBuilderOpen && (
        <div className="modal-backdrop">
          <ProductBuilder
            locale={locale}
            creationCost={world.config.productCreationCost}
            onCreate={createLoanProduct}
            onClose={() => setProductBuilderOpen(false)}
          />
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
            <InterbankConversation
              funding={funding}
              locale={locale}
              showRiskWarning={world.config.randomizeDefaultRisk}
              currentCash={cash}
              onBorrow={borrow}
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

function ProductBuilder({
  locale,
  creationCost,
  onCreate,
  onClose,
}: {
  locale: Locale;
  creationCost: number;
  onCreate: (rules: LoanProductRules) => void;
  onClose: () => void;
}) {
  const m = messagesFor(locale).market;
  const [rules, setRules] = useState<LoanProductRules>({
    minimumIncome: 1_500,
    occupation: "employed",
    minimumAmount: 300,
    maximumAmount: 1_000,
    minimumTerm: 6,
    maximumTerm: 12,
  });
  const setNumber =
    (key: Exclude<keyof LoanProductRules, "occupation">) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setRules((current) => ({
        ...current,
        [key]: Number(event.target.value),
      }));
  const setRange =
    (range: "amount" | "term", boundary: "minimum" | "maximum") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setRules((current) => {
        const minimumKey = range === "amount" ? "minimumAmount" : "minimumTerm";
        const maximumKey = range === "amount" ? "maximumAmount" : "maximumTerm";
        return {
          ...current,
          [minimumKey]:
            boundary === "minimum"
              ? Math.min(value, current[maximumKey])
              : current[minimumKey],
          [maximumKey]:
            boundary === "maximum"
              ? Math.max(value, current[minimumKey])
              : current[maximumKey],
        };
      });
    };
  const rangeStyle = (minimum: number, maximum: number, ceiling: number) =>
    ({
      "--range-start": `${(minimum / ceiling) * 100}%`,
      "--range-end": `${(maximum / ceiling) * 100}%`,
    }) as React.CSSProperties;

  return (
    <section className="product-builder" role="dialog" aria-modal="true">
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <span className="product-builder-icon">
        <SlidersHorizontal aria-hidden="true" />
      </span>
      <small>{m.productLessonEyebrow}</small>
      <h2>{m.productBuilderTitle}</h2>
      <p>{m.productBuilderCopy}</p>
      <div className="product-cost">
        <Coins aria-hidden="true" />
        <span>{m.productSetupCost(money(creationCost))}</span>
      </div>
      <div className="product-rule-grid">
        <label>
          <span>{m.productMinimumIncome}</span>
          <input
            type="number"
            min="0"
            step="100"
            value={rules.minimumIncome}
            onChange={setNumber("minimumIncome")}
          />
        </label>
        <label>
          <span>{m.productOccupation}</span>
          <select
            value={rules.occupation}
            onChange={(event) =>
              setRules((current) => ({
                ...current,
                occupation: event.target.value as OccupationRule,
              }))
            }
          >
            <option value="any">{m.productOccupationAny}</option>
            <option value="employed">{m.productOccupationEmployed}</option>
            <option value="self-employed">
              {m.productOccupationSelfEmployed}
            </option>
          </select>
        </label>
        <label>
          <span>{m.productLoanRange}</span>
          <div
            className="product-range-slider"
            style={rangeStyle(rules.minimumAmount, rules.maximumAmount, 2_500)}
          >
            <input
              className="range-thumb range-minimum"
              type="range"
              min="0"
              max="2500"
              step="100"
              value={rules.minimumAmount}
              onChange={setRange("amount", "minimum")}
              aria-label={m.rangeMinimum(m.productLoanRange)}
            />
            <input
              className="range-thumb range-maximum"
              type="range"
              min="0"
              max="2500"
              step="100"
              value={rules.maximumAmount}
              onChange={setRange("amount", "maximum")}
              aria-label={m.rangeMaximum(m.productLoanRange)}
            />
            <output>
              {money(rules.minimumAmount)} – {money(rules.maximumAmount)}
            </output>
          </div>
        </label>
        <label>
          <span>{m.productDueRange}</span>
          <div
            className="product-range-slider"
            style={rangeStyle(rules.minimumTerm, rules.maximumTerm, 20)}
          >
            <input
              className="range-thumb range-minimum"
              type="range"
              min="1"
              max="20"
              value={rules.minimumTerm}
              onChange={setRange("term", "minimum")}
              aria-label={m.rangeMinimum(m.productDueRange)}
            />
            <input
              className="range-thumb range-maximum"
              type="range"
              min="1"
              max="20"
              value={rules.maximumTerm}
              onChange={setRange("term", "maximum")}
              aria-label={m.rangeMaximum(m.productDueRange)}
            />
            <output>
              {m.rangeDays(rules.minimumTerm)} –{" "}
              {m.rangeDays(rules.maximumTerm)}
            </output>
          </div>
        </label>
      </div>
      <div className="product-preview">
        <strong>{m.productPreview}</strong>
        <span>
          {m.productRuleSummary(
            money(rules.minimumIncome),
            money(rules.minimumAmount),
            money(rules.maximumAmount),
          )}
        </span>
      </div>
      <button className="create-product-button" onClick={() => onCreate(rules)}>
        <SlidersHorizontal /> {m.createLoanProduct(money(creationCost))}
      </button>
    </section>
  );
}
