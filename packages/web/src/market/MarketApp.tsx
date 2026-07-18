import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  Info,
  Landmark,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  Settings,
  SkipForward,
  Target,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor, type Messages } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import { formatGameDate } from "../lib/game-date.ts";
import {
  defaultDraftNodes,
  validateDraft,
  withoutEndNodes,
} from "./builder-draft.ts";
import { ContractDetail } from "./components/ContractDetail.tsx";
import { DemandDetail } from "./components/DemandDetail.tsx";
import { MarketBuilder } from "./components/MarketBuilder.tsx";
import { MarketStageView } from "./components/MarketStageView.tsx";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  acceptRequest,
  advanceWorldDay,
  contractFitsDemand,
  decideRequestOutcome,
  emptyWorld,
  fileRequest,
  MARKET_START_DATE,
  outstandingPrincipal,
  postContract,
  rejectRequest,
  updateContract,
  withdrawContract,
  type ContractOffer,
  type Demand,
  type MarketBuilderNode,
  type MarketWorld,
  type WorldEvent,
} from "./market-world.ts";
import "./campaign-stage.css";
import "./market.css";

const MARKET_MS_PER_DAY = 1_200;

type View = "map" | "demand" | "contract" | "builder";

function newWorldSeed(): string {
  return Math.random().toString(36).slice(2);
}

function eventText(event: WorldEvent, m: Messages): string {
  const t = m.marketSim.events;
  switch (event.kind) {
    case "demand-appeared":
      return t.demandAppeared(event.actorName);
    case "demand-expired":
      return t.demandExpired(event.actorName);
    case "request-filed":
      return t.requestFiled(event.actorName);
    case "loan-signed":
      return t.loanSigned(event.actorName, event.amount);
    case "loan-repaid":
      return t.loanRepaid(event.actorName, event.amount);
    case "loan-defaulted":
      return t.loanDefaulted(event.actorName, event.amount);
  }
}

export function MarketApp({
  locale,
  onBack,
  stage,
  onComplete,
}: {
  locale: Locale;
  onBack: () => void;
  stage?: MarketCampaignStage;
  onComplete?: () => void;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const [world, setWorld] = useState<MarketWorld>(() =>
    emptyWorld(stage?.seed ?? newWorldSeed(), stage?.startingCash),
  );
  const [view, setView] = useState<View>("map");
  const [selectedDemandId, setSelectedDemandId] = useState<string | null>(null);
  const [demandOrigin, setDemandOrigin] = useState<"map" | "contract">("map");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [builderNodes, setBuilderNodes] = useState<MarketBuilderNode[]>(() =>
    defaultDraftNodes(),
  );
  const [editingContractId, setEditingContractId] = useState<string | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<"menu" | "objective" | null>(null);
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: true, speed: 1 });
  const clockRef = useRef<GameClock | null>(null);

  useEffect(() => {
    const clock = new GameClock(() => {
      setWorld((current) => advanceWorldDay(current));
      return true;
    }, MARKET_MS_PER_DAY);
    clockRef.current = clock;
    clock.start();
    const pauseWhenHidden = () => {
      if (document.hidden) {
        clock.pause();
        setClockView((current) => ({ ...current, paused: true }));
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      clock.dispose();
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const handle = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(handle);
  }, [notice]);

  function togglePaused(): void {
    const clock = clockRef.current;
    if (!clock) return;
    if (clock.paused) clock.play();
    else clock.pause();
    setClockView((current) => ({ ...current, paused: clock.paused }));
  }

  function chooseSpeed(speed: ClockSpeed): void {
    clockRef.current?.setSpeed(speed);
    setClockView((current) => ({ ...current, speed }));
  }

  function skipToNextDue(): void {
    setWorld((current) => {
      const dueDays = current.loans
        .filter((loan) => loan.status === "active")
        .map((loan) => loan.dueDay);
      if (dueDays.length === 0) return current;
      const target = Math.min(...dueDays);
      let next = current;
      while (next.day < target) next = advanceWorldDay(next);
      return next;
    });
  }

  const selectedDemand =
    world.demands.find((demand) => demand.id === selectedDemandId) ?? null;
  const selectedContract =
    world.contracts.find((contract) => contract.id === selectedContractId) ??
    null;
  const deployed = outstandingPrincipal(world);
  const ticker = world.log[world.log.length - 1] ?? null;
  const nextDueExists = world.loans.some((loan) => loan.status === "active");
  const repaidLoans = world.loans.filter(
    (loan) => loan.status === "repaid",
  ).length;
  const stageComplete = Boolean(
    stage && repaidLoans >= stage.repaidLoans && world.cash >= stage.cashTarget,
  );

  // Surface the win the moment the objective is reached: pause the clock and
  // open the objective panel, which holds the complete-stage button.  Guarded
  // so a cash dip and recovery does not replay the celebration.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (!stageComplete || celebratedRef.current) return;
    celebratedRef.current = true;
    clockRef.current?.pause();
    setClockView((current) => ({ ...current, paused: true }));
    setHudPanel("objective");
  }, [stageComplete]);

  const openDemandDetail = useCallback(
    (demandId: string, origin: "map" | "contract") => {
      setSelectedDemandId(demandId);
      setDemandOrigin(origin);
      setView("demand");
    },
    [],
  );

  const openContractDetail = useCallback((contractId: string) => {
    setSelectedContractId(contractId);
    setView("contract");
  }, []);

  function openBuilder(demand?: Demand): void {
    setBuilderNodes(defaultDraftNodes(demand));
    setEditingContractId(null);
    setSelectedNodeId(null);
    setView("builder");
  }

  function openBuilderForContract(contract: ContractOffer): void {
    setBuilderNodes(withoutEndNodes(contract.builderNodes));
    setEditingContractId(contract.id);
    setSelectedNodeId(null);
    setView("builder");
  }

  function submitDraft(): void {
    const issue = validateDraft(builderNodes, m);
    if (issue) {
      setNotice(issue);
      return;
    }
    if (editingContractId) {
      setWorld((current) =>
        updateContract(current, editingContractId, builderNodes),
      );
      setNotice(t.updated);
      setView("contract");
    } else {
      setWorld((current) => postContract(current, builderNodes));
      setNotice(t.posted);
      setView("map");
    }
  }

  function removeContract(): void {
    if (!editingContractId) return;
    setWorld((current) => withdrawContract(current, editingContractId));
    setEditingContractId(null);
    setSelectedContractId(null);
    setNotice(t.withdrawn);
    setView("map");
  }

  /** Step back out of the current overlay towards the map. */
  function closeOverlay(): void {
    if (view === "builder" && editingContractId && selectedContract) {
      setView("contract");
      return;
    }
    if (view === "demand" && demandOrigin === "contract" && selectedContract) {
      setView("contract");
      return;
    }
    setView("map");
  }

  /**
   * A demand node was dropped on a contract square.  The synchronous
   * verdict drives the stage's success or reject animation; the request
   * itself lands through the world update.
   */
  function dropDemand(demandId: string, contractId: string): boolean {
    const demand = world.demands.find((candidate) => candidate.id === demandId);
    const contract = world.contracts.find(
      (candidate) => candidate.id === contractId,
    );
    if (!demand || !contract || demand.status !== "open") return false;
    if (!contractFitsDemand(contract, demand, world.cash)) return false;
    const outcome = decideRequestOutcome(
      contract.builderNodes,
      demand,
      world.cash,
    );
    setWorld((current) => fileRequest(current, demandId, contractId));
    // An automated rejection reads as a mismatch to the player: same X.
    return outcome !== "reject";
  }

  function decideRequest(requestId: string, accept: boolean): void {
    if (!selectedContract) return;
    const contractId = selectedContract.id;
    if (!accept) {
      setWorld((current) => rejectRequest(current, contractId, requestId));
      return;
    }
    // Notices come from the render-time snapshot so the updater stays pure;
    // the updater re-checks against the current world and no-ops on failure.
    const request = selectedContract.requests.find(
      (candidate) => candidate.id === requestId,
    );
    if (!request || request.status !== "pending") {
      setNotice(t.requestGone);
      return;
    }
    if (world.cash < request.principal) {
      setNotice(t.insufficientCash(request.principal));
      return;
    }
    setWorld((current) => {
      const result = acceptRequest(current, contractId, requestId);
      return result.failure ? current : result.world;
    });
  }

  return (
    <main className="cs-shell mk-shell">
      <div className="mk-hud">
        <div className="mk-hud-actions">
          <button
            className="mk-hud-icon"
            onClick={() =>
              setHudPanel((current) => (current === "menu" ? null : "menu"))
            }
            aria-label="Menu"
          >
            <Menu aria-hidden="true" />
          </button>
          <button
            className="mk-hud-icon"
            onClick={() =>
              setHudPanel((current) =>
                current === "objective" ? null : "objective",
              )
            }
            aria-label="Objective"
          >
            <Target aria-hidden="true" />
          </button>
        </div>
        <div className="mk-mini-balance" aria-label={m.balance.assetValues}>
          <span title={m.balance.cash}>
            <CircleDollarSign aria-hidden="true" />$
            {world.cash.toLocaleString()}
          </span>
          <span title={m.balance.totalAssets}>
            <Landmark aria-hidden="true" />$
            {(world.cash + deployed).toLocaleString()}
          </span>
        </div>
      </div>

      {hudPanel === "menu" && (
        <div
          className="mk-hud-panel mk-menu-panel"
          role="menu"
          aria-label="Menu"
        >
          <button onClick={onBack} aria-label="Quit" role="menuitem">
            <LogOut aria-hidden="true" />
          </button>
          <button
            onClick={() => setHudPanel("objective")}
            aria-label="Information"
            role="menuitem"
          >
            <Info aria-hidden="true" />
          </button>
          <button
            onClick={() => setHudPanel(null)}
            aria-label="Settings"
            role="menuitem"
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      )}

      {hudPanel === "objective" && stage && (
        <section className="mk-objective-panel" aria-label="Stage objective">
          <button
            className="mk-objective-close"
            onClick={() => setHudPanel(null)}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
          <strong>{localize(stage.subtitle, locale)}</strong>
          <p>{localize(stage.briefing, locale)}</p>
          <small>
            {localize(stage.focus, locale)} · {repaidLoans}/{stage.repaidLoans}
          </small>
          {stageComplete && onComplete && (
            <button className="mk-stage-complete" onClick={onComplete}>
              <Check aria-hidden="true" />{" "}
              {m.mine.completeStage(String(stage.number).padStart(2, "0"))}
            </button>
          )}
        </section>
      )}

      <section className="cs-timebar" aria-label={m.timebar.gameCalendar}>
        <div className="cs-timebar-date">
          <CalendarDays aria-hidden="true" />
          <div>
            <strong>
              {formatGameDate(MARKET_START_DATE, world.day, locale)}
            </strong>
            <small>
              {m.timebar.dayN(world.day)}
              {ticker ? ` · ${eventText(ticker, m)}` : ""}
            </small>
          </div>
        </div>
        <div className="cs-timebar-controls">
          <button
            className="cs-clock-toggle"
            onClick={togglePaused}
            aria-label={clockView.paused ? m.timebar.resume : m.timebar.pause}
          >
            {clockView.paused ? (
              <Play aria-hidden="true" fill="currentColor" />
            ) : (
              <Pause aria-hidden="true" fill="currentColor" />
            )}
          </button>
          {CLOCK_SPEEDS.map((speed) => (
            <button
              key={speed}
              className={`cs-clock-speed${clockView.speed === speed ? " active" : ""}`}
              onClick={() => chooseSpeed(speed)}
              aria-pressed={clockView.speed === speed}
            >
              {speed}x
            </button>
          ))}
          <button
            className="cs-clock-skip"
            onClick={skipToNextDue}
            disabled={!nextDueExists}
            aria-label={m.timebar.skip}
          >
            <SkipForward aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* The map (and its Pixi Application) stays mounted for the whole
          session; detail pages cover it as opaque overlays.  Destroying and
          recreating the Pixi renderer per navigation corrupts pixi's global
          texture pool. */}
      <div className="mk-content">
        <div className="mk-map">
          <MarketStageView
            world={world}
            suspended={view !== "map"}
            onTapDemand={(id) => openDemandDetail(id, "map")}
            onTapContract={openContractDetail}
            onDropDemand={dropDemand}
          />
          <button
            className="mk-fab"
            onClick={() => openBuilder()}
            aria-label={t.postContract}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>

        {view === "demand" && selectedDemand && (
          <div className="mk-overlay">
            <button
              className="mk-overlay-back"
              onClick={closeOverlay}
              aria-label={t.backToMap}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <DemandDetail
              demand={selectedDemand}
              locale={locale}
              onDraft={
                demandOrigin === "map"
                  ? () => openBuilder(selectedDemand)
                  : undefined
              }
            />
          </div>
        )}

        {view === "contract" && selectedContract && (
          <div className="mk-overlay">
            <button
              className="mk-overlay-back"
              onClick={closeOverlay}
              aria-label={t.backToMap}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <ContractDetail
              contract={selectedContract}
              locale={locale}
              onDecide={decideRequest}
              onOpenActor={(demandId) => openDemandDetail(demandId, "contract")}
              onEdit={() => openBuilderForContract(selectedContract)}
            />
          </div>
        )}

        {view === "builder" && (
          <div className="mk-overlay">
            <button
              className="mk-overlay-back"
              onClick={closeOverlay}
              aria-label={t.backToMap}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <MarketBuilder
              nodes={builderNodes}
              locale={locale}
              selectedNodeId={selectedNodeId}
              editing={Boolean(editingContractId)}
              onSelectNode={setSelectedNodeId}
              onChangeNodes={setBuilderNodes}
              onSubmit={submitDraft}
              onWithdraw={editingContractId ? removeContract : undefined}
            />
          </div>
        )}
      </div>

      {notice && (
        <p className="mk-toast" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
