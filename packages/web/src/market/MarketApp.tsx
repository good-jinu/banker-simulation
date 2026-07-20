import { ArrowLeft, Check, Info, Landmark, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { localize, type LocalText } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import "./market.css";

const DAY_MS = 1_500;

type CustomerStatus = "waiting" | "accepted";
type Customer = {
  id: string;
  name: LocalText;
  job: LocalText;
  income: number;
  amount: number;
  rate: number;
  term: number;
  dueDay: number;
  appears: number;
  x: number;
  y: number;
  avatar: string;
  status: CustomerStatus;
};

type Funding = {
  id: string;
  name: LocalText;
  amount: number;
  rate: number;
  dueDay: number;
  x: number;
  y: number;
  accepted: boolean;
};

type Transfer = { id: number; from: string; to: string; amount: number };

const CUSTOMER_SEEDS: Customer[] = [
  {
    id: "mina",
    name: { en: "Mina Kim", ko: "미나 김" },
    job: { en: "Neighborhood bakery employee", ko: "동네 베이커리 직원" },
    income: 2_400,
    amount: 100,
    rate: 10,
    term: 12,
    dueDay: 12,
    appears: 0,
    x: 19,
    y: 21,
    avatar: "/assets/avatars/mina-request.webp",
    status: "waiting",
  },
];

const RANDOM_NAMES: LocalText[] = [
  { en: "Jun Park", ko: "준 박" },
  { en: "Seoyeon Lee", ko: "서연 이" },
  { en: "Doyoon Han", ko: "도윤 한" },
  { en: "Jiwoo Choi", ko: "지우 최" },
  { en: "Hajun Song", ko: "하준 송" },
  { en: "Yuna Jung", ko: "유나 정" },
  { en: "Hyunwoo Kang", ko: "현우 강" },
  { en: "Subin Oh", ko: "수빈 오" },
];
const RANDOM_JOBS: LocalText[] = [
  { en: "Delivery driver", ko: "택배 기사" },
  { en: "Freelance designer", ko: "프리랜서 디자이너" },
  { en: "Café owner", ko: "카페 운영자" },
  { en: "Nurse", ko: "간호사" },
  { en: "Academy instructor", ko: "학원 강사" },
  { en: "Restaurant owner", ko: "식당 운영자" },
  { en: "Software developer", ko: "소프트웨어 개발자" },
  { en: "Craft studio owner", ko: "공방 운영자" },
];
const RANDOM_AVATARS = [
  "/assets/avatars/jun-neutral.webp",
  "/assets/avatars/auditor-neutral.webp",
  "/assets/avatars/fund-manager-neutral.webp",
  "/assets/avatars/mina-neutral.webp",
  "/assets/avatars/regulator-neutral.webp",
  "/assets/avatars/jun-evaluating.webp",
];
const MAX_VISIBLE_CUSTOMERS = 5;
const CUSTOMER_POSITIONS = [
  { x: 19, y: 21 },
  { x: 81, y: 21 },
  { x: 84, y: 76 },
  { x: 18, y: 76 },
  { x: 49, y: 14 },
  { x: 67, y: 83 },
  { x: 32, y: 83 },
];

function nextAvailablePosition(
  customers: Customer[],
): { x: number; y: number } | null {
  const occupied = new Set(
    customers.map((customer) => `${customer.x},${customer.y}`),
  );
  const available = CUSTOMER_POSITIONS.filter(
    (position) => !occupied.has(`${position.x},${position.y}`),
  );

  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)]!;
}

function randomCustomer(
  day: number,
  position: { x: number; y: number },
): Customer {
  const nameIndex = Math.floor(Math.random() * RANDOM_NAMES.length);
  const jobIndex = Math.floor(Math.random() * RANDOM_JOBS.length);
  const amount = 80 + Math.floor(Math.random() * 38) * 10;
  const term = 9 + Math.floor(Math.random() * 10);
  return {
    id: `customer-${day}-${Math.random().toString(36).slice(2, 7)}`,
    name: RANDOM_NAMES[nameIndex]!,
    job: RANDOM_JOBS[jobIndex]!,
    income: 1_800 + Math.floor(Math.random() * 22) * 200,
    amount,
    rate: 7 + Math.floor(Math.random() * 10),
    term,
    dueDay: day + term,
    appears: day,
    x: position.x,
    y: position.y,
    avatar: RANDOM_AVATARS[Math.floor(Math.random() * RANDOM_AVATARS.length)]!,
    status: "waiting",
  };
}

const FUNDING_SEEDS: Funding[] = [
  {
    id: "civic",
    name: { en: "Civic Credit Union", ko: "시민 신용금고" },
    amount: 500,
    rate: 5,
    dueDay: 30,
    x: 9,
    y: 50,
    accepted: false,
  },
  {
    id: "metro",
    name: { en: "Metro Bank", ko: "메트로 은행" },
    amount: 800,
    rate: 8,
    dueDay: 35,
    x: 50,
    y: 88,
    accepted: false,
  },
  {
    id: "capital",
    name: { en: "Capital Partners", ko: "캐피탈 파트너스" },
    amount: 1_200,
    rate: 12,
    dueDay: 40,
    x: 91,
    y: 50,
    accepted: false,
  },
];

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
  const [phase, setPhase] = useState<"intro" | "map">("intro");
  const [askedJob, setAskedJob] = useState(false);
  const [askedIncome, setAskedIncome] = useState(false);
  const [cash, setCash] = useState(700);
  const [day, setDay] = useState(0);
  const [customers, setCustomers] = useState(CUSTOMER_SEEDS);
  const [funding, setFunding] = useState(FUNDING_SEEDS);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [loanCount, setLoanCount] = useState(0);
  const [cumulativeLent, setCumulativeLent] = useState(0);
  const [thirdLoanDay, setThirdLoanDay] = useState<number | null>(null);
  const [fundingPromptShown, setFundingPromptShown] = useState(false);
  const [missionClear, setMissionClear] = useState(false);
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
      setDay((currentDay) => {
        const nextDay = currentDay + 1;
        setCustomers((current) => {
          let repayment = 0;
          const updated = current.flatMap((customer) => {
            if (customer.status === "accepted" && customer.dueDay === nextDay) {
              repayment += customer.amount * (1 + customer.rate / 100);
              return [];
            }
            return [customer];
          });
          if (repayment > 0) {
            setCash((value) => value + repayment);
            setNotice(m.noticeRepayment(money(repayment)));
          }
          const position = nextAvailablePosition(updated);
          if (
            nextDay % 3 === 0 &&
            updated.length < MAX_VISIBLE_CUSTOMERS &&
            position
          ) {
            const newcomer = randomCustomer(nextDay, position);
            setNotice(
              m.noticeLoanRequest(
                localize(newcomer.name, locale),
                money(newcomer.amount),
              ),
            );
            return [...updated, newcomer];
          }
          return updated;
        });
        return nextDay;
      });
      return true;
    }, DAY_MS);
    clockRef.current = clock;
    clock.start();
    return () => clock.dispose();
  }, []);

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

  const loanReceivables = customers
    .filter((customer) => customer.status === "accepted")
    .reduce(
      (total, customer) => total + customer.amount * (1 + customer.rate / 100),
      0,
    );
  const fundingLiabilities = funding
    .filter((lender) => lender.accepted)
    .reduce(
      (total, lender) => total + lender.amount * (1 + lender.rate / 100),
      0,
    );
  const totalAssets = cash + loanReceivables;
  const netWorth = totalAssets - fundingLiabilities;
  const netCash = cash - fundingLiabilities;
  const hasFunding = funding.some((item) => item.accepted);
  const fundingEligible =
    thirdLoanDay !== null && day >= thirdLoanDay + 3 && !hasFunding;

  useEffect(() => {
    if (
      phase !== "map" ||
      missionClear ||
      loanCount < 1 ||
      cumulativeLent < 500 ||
      netCash < 2_000
    )
      return;
    setMissionClear(true);
  }, [cumulativeLent, loanCount, missionClear, netCash, phase]);

  useEffect(() => {
    if (
      phase !== "map" ||
      !fundingEligible ||
      fundingPromptShown ||
      fundingOpen
    )
      return;
    setFundingPromptShown(true);
    setFundingOpen(true);
    setNotice(m.fundingArrived);
  }, [fundingEligible, fundingOpen, fundingPromptShown, phase]);

  function animate(from: string, to: string, amount: number): void {
    transferId.current += 1;
    setTransfer({ id: transferId.current, from, to, amount });
  }

  function beginMap(): void {
    setCash((value) => value - 100);
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === "mina" ? { ...customer, status: "accepted" } : customer,
      ),
    );
    setLoanCount(1);
    setCumulativeLent(100);
    setPhase("map");
    window.setTimeout(() => animate("banker", "mina", 100), 180);
  }

  function approve(customer: Customer): void {
    if (cash < customer.amount) {
      setSelected(null);
      if (fundingEligible) setFundingOpen(true);
      setNotice(
        fundingEligible
          ? `${m.insufficientCash} ${m.viewFunding}`
          : `${m.insufficientCash} ${m.fundingUnavailable}`,
      );
      return;
    }
    setCash((value) => value - customer.amount);
    setCustomers((current) =>
      current.map((item) =>
        item.id === customer.id
          ? { ...item, status: "accepted", dueDay: day + item.term }
          : item,
      ),
    );
    const nextLoanCount = loanCount + 1;
    setLoanCount(nextLoanCount);
    setCumulativeLent((value) => value + customer.amount);
    if (nextLoanCount === 3) setThirdLoanDay(day);
    setSelected(null);
    animate("banker", customer.id, customer.amount);
  }

  function reject(customer: Customer): void {
    setCustomers((current) =>
      current.filter((item) => item.id !== customer.id),
    );
    setSelected(null);
  }

  function borrow(lender: Funding): void {
    setFunding((current) =>
      current.map((item) =>
        item.id === lender.id
          ? { ...item, accepted: true, dueDay: day + item.dueDay }
          : item,
      ),
    );
    setCash((value) => value + lender.amount);
    setFundingOpen(false);
    animate(lender.id, "banker", lender.amount);
    setNotice(m.borrowed(localize(lender.name, locale), money(lender.amount)));
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
              src="/assets/avatars/mina-request.webp"
              alt={m.customerAlt(localize(CUSTOMER_SEEDS[0]!.name, locale))}
            />
            <div className="speech-bubble">
              <small>{localize(CUSTOMER_SEEDS[0]!.name, locale)}</small>
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
      progress: `${m.loanProgress(Math.min(loanCount, 1))} / ${m.loanProgress(1)}`,
      completed: loanCount >= 1,
    },
    {
      label: m.goalCumulativeLoans,
      progress: `${money(Math.min(cumulativeLent, 500))} / $500`,
      completed: cumulativeLent >= 500,
    },
    {
      label: m.goalNetCash,
      progress: `${money(netCash)} / $2,000`,
      completed: netCash >= 2_000,
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
