import { ArrowLeft, Check, Info, Landmark, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../i18n/locale.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import "./market.css";

const DAY_MS = 1_500;

type CustomerStatus = "waiting" | "accepted" | "rejected" | "repaid";
type Customer = {
  id: string;
  name: string;
  job: string;
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
  name: string;
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
    name: "미나 김",
    job: "동네 베이커리 직원",
    income: 2_400,
    amount: 100,
    rate: 10,
    term: 12,
    dueDay: 12,
    appears: 0,
    x: 23,
    y: 29,
    avatar: "/assets/avatars/mina-request.webp",
    status: "waiting",
  },
  {
    id: "jun",
    name: "준 박",
    job: "택배 기사",
    income: 3_100,
    amount: 240,
    rate: 12,
    term: 14,
    dueDay: 17,
    appears: 3,
    x: 76,
    y: 24,
    avatar: "/assets/avatars/jun-neutral.webp",
    status: "waiting",
  },
  {
    id: "seo",
    name: "서연 이",
    job: "프리랜서 디자이너",
    income: 2_800,
    amount: 330,
    rate: 14,
    term: 16,
    dueDay: 22,
    appears: 6,
    x: 80,
    y: 69,
    avatar: "/assets/avatars/auditor-neutral.webp",
    status: "waiting",
  },
  {
    id: "han",
    name: "도윤 한",
    job: "카페 운영자",
    income: 4_200,
    amount: 180,
    rate: 11,
    term: 12,
    dueDay: 22,
    appears: 10,
    x: 24,
    y: 73,
    avatar: "/assets/avatars/fund-manager-neutral.webp",
    status: "waiting",
  },
];

const FUNDING_SEEDS: Funding[] = [
  {
    id: "civic",
    name: "시민 신용금고",
    amount: 500,
    rate: 5,
    dueDay: 30,
    x: 9,
    y: 50,
    accepted: false,
  },
  {
    id: "metro",
    name: "메트로 은행",
    amount: 800,
    rate: 8,
    dueDay: 35,
    x: 50,
    y: 88,
    accepted: false,
  },
  {
    id: "capital",
    name: "캐피탈 파트너스",
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
  locale: _locale,
  onBack,
  stage: _stage,
  onComplete: _onComplete,
}: {
  locale: Locale;
  onBack: () => void;
  stage?: MarketCampaignStage;
  onComplete?: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "map">("intro");
  const [askedJob, setAskedJob] = useState(false);
  const [askedIncome, setAskedIncome] = useState(false);
  const [cash, setCash] = useState(700);
  const [day, setDay] = useState(0);
  const [customers, setCustomers] = useState(CUSTOMER_SEEDS);
  const [funding, setFunding] = useState(FUNDING_SEEDS);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: true, speed: 1 });
  const clockRef = useRef<GameClock | null>(null);
  const transferId = useRef(0);

  useEffect(() => {
    const clock = new GameClock(() => {
      setDay((currentDay) => {
        const nextDay = currentDay + 1;
        setCustomers((current) => {
          let repayment = 0;
          const updated = current.map((customer) => {
            if (customer.status === "accepted" && customer.dueDay === nextDay) {
              repayment += customer.amount * (1 + customer.rate / 100);
              return { ...customer, status: "repaid" as const };
            }
            return customer;
          });
          if (repayment > 0) {
            setCash((value) => value + repayment);
            setNotice(`${money(repayment)}가 상환되었습니다.`);
          }
          const appearing = updated.find(
            (customer) => customer.appears === nextDay,
          );
          if (appearing)
            setNotice(`${appearing.name} 고객이 새 대출을 요청합니다.`);
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
    setPhase("map");
    window.setTimeout(() => animate("banker", "mina", 100), 180);
  }

  function approve(customer: Customer): void {
    if (cash < customer.amount) {
      setSelected(null);
      setFundingOpen(true);
      setNotice("현금이 부족합니다. 먼저 다른 은행에서 자금을 빌려보세요.");
      return;
    }
    setCash((value) => value - customer.amount);
    setCustomers((current) =>
      current.map((item) =>
        item.id === customer.id ? { ...item, status: "accepted" } : item,
      ),
    );
    setSelected(null);
    animate("banker", customer.id, customer.amount);
  }

  function reject(customer: Customer): void {
    setCustomers((current) =>
      current.map((item) =>
        item.id === customer.id ? { ...item, status: "rejected" } : item,
      ),
    );
    setSelected(null);
  }

  function borrow(lender: Funding): void {
    setFunding((current) =>
      current.map((item) =>
        item.id === lender.id ? { ...item, accepted: true } : item,
      ),
    );
    setCash((value) => value + lender.amount);
    setFundingOpen(false);
    animate(lender.id, "banker", lender.amount);
    setNotice(`${lender.name}에서 ${money(lender.amount)}를 빌렸습니다.`);
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
          <button onClick={onBack} aria-label="뒤로">
            <ArrowLeft />
          </button>
          <span>LEVEL 01</span>
          <strong>첫 번째 대출</strong>
        </header>
        <section className="conversation-card">
          <div className="conversation-scene">
            <span className="scene-label">오늘의 첫 고객</span>
            <img src="/assets/avatars/mina-request.webp" alt="고객 미나 김" />
            <div className="speech-bubble">
              <small>미나 김</small>
              <p>
                안녕하세요! 급하게 필요한 돈이 있어요.
                <br />
                <strong>$100을 빌릴 수 있을까요?</strong>
              </p>
            </div>
          </div>
          <div className="conversation-actions">
            <p className="action-guide">대출하기 전에 고객을 알아보세요.</p>
            <button
              className={askedJob ? "asked" : ""}
              onClick={() => setAskedJob(true)}
            >
              {askedJob ? <Check /> : <Info />} 직업을 물어본다
            </button>
            {askedJob && (
              <p className="answer-line">
                “동네 베이커리에서 3년째 일하고 있어요.”
              </p>
            )}
            <button
              className={askedIncome ? "asked" : ""}
              onClick={() => setAskedIncome(true)}
            >
              {askedIncome ? <Check /> : <Info />} 소득을 물어본다
            </button>
            {askedIncome && (
              <p className="answer-line">“월 소득은 약 $2,400입니다.”</p>
            )}
            {askedJob && askedIncome && (
              <div className="approve-reveal">
                <span>정보 확인 완료 · 12일 후 $110 상환</span>
                <button onClick={beginMap}>
                  <Landmark /> 이자 10%로 $100 빌려주기
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  const visibleCustomers = customers.filter(
    (customer) => customer.appears <= day && customer.status !== "rejected",
  );
  const showFundingHint = cash <= 100 && !funding.some((item) => item.accepted);
  const pointFor = (id: string): { x: number; y: number } => {
    if (id === "banker") return { x: 50, y: 49 };
    const customer = customers.find((item) => item.id === id);
    if (customer) return customer;
    return funding.find((item) => item.id === id) ?? { x: 50, y: 50 };
  };

  return (
    <main className="loan-game">
      <header className="map-header">
        <button className="round-button" onClick={onBack} aria-label="뒤로">
          <ArrowLeft />
        </button>
        <div className="brand">
          <Landmark />
          <span>
            <small>MY BANK</small>
            <strong>{money(cash)}</strong>
          </span>
        </div>
        <div className="day-display">
          <small>현재 날짜</small>
          <strong>DAY {day + 1}</strong>
        </div>
      </header>

      <section className="state-map" aria-label="대출 상태 지도">
        <div className="map-title">
          <small>STATE MAP</small>
          <strong>돈의 흐름을 한눈에 확인하세요</strong>
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
          <strong>나의 은행</strong>
          <small>보유 현금 {money(cash)}</small>
        </div>

        {visibleCustomers.map((customer) => (
          <div
            key={customer.id}
            className={`customer-node map-node ${customer.status}`}
            style={{ left: `${customer.x}%`, top: `${customer.y}%` }}
          >
            {customer.status === "waiting" && (
              <span className="request-tag">
                {money(customer.amount)} 필요!
              </span>
            )}
            <span className="portrait">
              <img src={customer.avatar} alt="" />
              {customer.status === "repaid" && <Check />}
            </span>
            <strong>{customer.name}</strong>
            <small>
              {customer.status === "waiting"
                ? "대출 요청"
                : customer.status === "accepted"
                  ? `DAY ${customer.dueDay + 1} 상환`
                  : "상환 완료"}
            </small>
            {customer.status === "waiting" && (
              <button onClick={() => setSelected(customer)}>상세보기</button>
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
              <strong>{lender.name}</strong>
              <small>
                {money(lender.amount)} · {lender.rate}%
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
              <strong>빌려줄 현금이 부족해요</strong>
              <p>다른 사람들로부터 돈을 빌리세요.</p>
            </div>
            <button onClick={() => setFundingOpen(true)}>대출 상품 보기</button>
          </aside>
        )}
      </section>

      <footer className="time-controller">
        <div>
          <span
            className={clockView.paused ? "status-dot paused" : "status-dot"}
          />
          <small>{clockView.paused ? "시간 멈춤" : "시간 진행 중"}</small>
        </div>
        <button
          className="play-time"
          onClick={toggleClock}
          aria-label={clockView.paused ? "시간 재생" : "일시정지"}
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
        <p>시간을 진행하면 새로운 고객이 나타나고 대출이 상환됩니다.</p>
      </footer>

      {notice && <div className="game-notice">{notice}</div>}

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="detail-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="닫기"
            >
              <X />
            </button>
            <img src={selected.avatar} alt="" />
            <small>NEW LOAN REQUEST</small>
            <h2>{selected.name}</h2>
            <p className="request-copy">
              “사업과 생활에 필요한 <strong>{money(selected.amount)}</strong>를
              빌리고 싶어요.”
            </p>
            <dl>
              <div>
                <dt>직업</dt>
                <dd>{selected.job}</dd>
              </div>
              <div>
                <dt>월 소득</dt>
                <dd>{money(selected.income)}</dd>
              </div>
              <div>
                <dt>대출 금액</dt>
                <dd>{money(selected.amount)}</dd>
              </div>
              <div>
                <dt>상환 조건</dt>
                <dd>
                  {selected.term}일 · 이자 {selected.rate}%
                </dd>
              </div>
            </dl>
            <div className="decision-row">
              <button
                className="reject-button"
                onClick={() => reject(selected)}
              >
                거절
              </button>
              <button
                className="accept-button"
                onClick={() => approve(selected)}
                disabled={cash < selected.amount}
              >
                대출하기 · {money(selected.amount)}
              </button>
            </div>
            {cash < selected.amount && (
              <button
                className="need-funding"
                onClick={() => {
                  setSelected(null);
                  setFundingOpen(true);
                }}
              >
                현금이 부족합니다 · 자금 빌리기
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
              aria-label="닫기"
            >
              <X />
            </button>
            <small>INTERBANK FUNDING</small>
            <h2>다른 은행에서 돈 빌리기</h2>
            <p>받은 돈은 현금이 되고, 갚을 의무는 맵에 점선으로 표시됩니다.</p>
            <div className="funding-options">
              {funding
                .filter((item) => !item.accepted)
                .map((lender) => (
                  <article key={lender.id}>
                    <span className="bank-icon small">
                      <Landmark />
                    </span>
                    <div>
                      <strong>{lender.name}</strong>
                      <small>{lender.dueDay}일 후 상환</small>
                    </div>
                    <div className="funding-rate">
                      <strong>{money(lender.amount)}</strong>
                      <small>연 {lender.rate}%</small>
                    </div>
                    <button onClick={() => borrow(lender)}>선택</button>
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
