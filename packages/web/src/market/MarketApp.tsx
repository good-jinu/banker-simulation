import {
  ArrowLeft,
  Check,
  Info,
  Landmark,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor, type Messages } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "../lib/game-clock.ts";
import { formatGameDate } from "../lib/game-date.ts";
import {
  emptyDraftNodes,
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
  activeAssets,
  advanceWorldDay,
  availableCash,
  contractFitsDemand,
  decideRequestOutcome,
  emptyWorld,
  fileRequest,
  loanReceivables,
  MARKET_START_DATE,
  postContract,
  rejectRequest,
  totalAssetValue,
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

function boardOrder(id: string): number {
  let value = 0;
  for (let index = 0; index < id.length; index += 1)
    value = (value * 31 + id.charCodeAt(index)) >>> 0;
  return value;
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
    emptyDraftNodes(),
  );
  const [editingContractId, setEditingContractId] = useState<string | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<"menu" | "objective" | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [boardPanelOpen, setBoardPanelOpen] = useState(false);
  const [boardMessageIndex, setBoardMessageIndex] = useState(0);
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

  useEffect(() => {
    if (!assetPanelOpen && !boardPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAssetPanelOpen(false);
      setBoardPanelOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [assetPanelOpen, boardPanelOpen]);

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

  function openDisplayBoard(): void {
    setAssetPanelOpen(false);
    setBoardPanelOpen(true);
    setHudPanel(null);
  }

  const selectedDemand =
    world.demands.find((demand) => demand.id === selectedDemandId) ?? null;
  const selectedContract =
    world.contracts.find((contract) => contract.id === selectedContractId) ??
    null;
  const assets = activeAssets(world);
  const loanAssets = loanReceivables(world);
  const cash = availableCash(world);
  const totalAssets = totalAssetValue(world);
  const repaidLoans = loanAssets.filter(
    (asset) => asset.status === "settled",
  ).length;
  const stageComplete = Boolean(
    stage && repaidLoans >= stage.repaidLoans && cash >= stage.cashTarget,
  );
  const boardMessages = useMemo(() => {
    const recentEvents = world.log
      .filter(
        (event) =>
          event.day >= Math.max(0, world.day - 1) &&
          event.kind !== "demand-appeared",
      )
      .map((event) => ({ id: event.id, text: eventText(event, m) }));
    const messages = [
      ...(stage
        ? [
            {
              id: `objective-${repaidLoans}`,
              text: m.timebar.objective(
                localize(stage.focus, locale),
                repaidLoans,
                stage.repaidLoans,
              ),
            },
          ]
        : []),
      ...recentEvents,
    ];
    return messages.length > 0
      ? messages.sort(
          (left, right) => boardOrder(left.id) - boardOrder(right.id),
        )
      : [{ id: "no-recent-events", text: m.timebar.noRecentEvents }];
  }, [locale, m, repaidLoans, stage, world.day, world.log]);
  const boardMessageSignature = boardMessages
    .map((message) => message.id)
    .join(",");
  const boardMessage =
    boardMessages[boardMessageIndex % boardMessages.length] ??
    boardMessages[0]!;
  const boardHistoryEvents = [...world.log]
    .filter((event) => event.kind !== "demand-appeared")
    .reverse();

  useEffect(() => {
    setBoardMessageIndex(0);
    const interval = window.setInterval(
      () =>
        setBoardMessageIndex((current) => (current + 1) % boardMessages.length),
      4_200,
    );
    return () => window.clearInterval(interval);
  }, [boardMessageSignature, boardMessages.length]);

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

  function openBuilder(): void {
    setBuilderNodes(emptyDraftNodes());
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
    if (!contractFitsDemand(contract, demand, cash)) return false;
    const outcome = decideRequestOutcome(contract.builderNodes, demand, cash);
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
    if (cash < request.principal) {
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
      <div className={`mk-hud${view !== "map" ? " mk-hud-with-back" : ""}`}>
        {view !== "map" && (
          <button
            className="mk-hud-icon"
            onClick={closeOverlay}
            aria-label={t.backToMap}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <div className="mk-mini-balance" aria-label={m.balance.assetValues}>
          <button
            className="mk-total-assets-button"
            onClick={() => {
              setAssetPanelOpen((current) => !current);
              setBoardPanelOpen(false);
              setHudPanel(null);
            }}
            aria-expanded={assetPanelOpen}
            aria-haspopup="dialog"
            aria-controls="asset-values-dialog"
            aria-label={m.balance.openAssetValues}
            title={m.balance.openAssetValues}
          >
            <Landmark aria-hidden="true" />${totalAssets.toLocaleString()}
          </button>
          <button
            className="mk-hud-icon"
            onClick={() => {
              setAssetPanelOpen(false);
              setBoardPanelOpen(false);
              setHudPanel((current) => (current === "menu" ? null : "menu"));
            }}
            aria-label="Menu"
          >
            <Menu aria-hidden="true" />
          </button>
        </div>
      </div>

      {assetPanelOpen && (
        <div
          className="mk-asset-dialog-backdrop"
          onMouseDown={() => setAssetPanelOpen(false)}
        >
          <section
            id="asset-values-dialog"
            className="mk-asset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-values-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mk-asset-dialog-heading">
              <div>
                <small>{m.balance.totalAssets}</small>
                <strong>${totalAssets.toLocaleString()}</strong>
              </div>
              <button
                className="mk-asset-dialog-close"
                onClick={() => setAssetPanelOpen(false)}
                aria-label={m.balance.closeAssetValues}
                autoFocus
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <h2 id="asset-values-title">{m.balance.assetValues}</h2>
            <ul className="mk-asset-list">
              {assets.map((asset) => (
                <li key={asset.id} className="mk-asset-list-item">
                  <div>
                    <strong>
                      {asset.kind === "cash"
                        ? m.balance.cash
                        : asset.kind === "loan-receivable" && asset.loan
                          ? m.balance.loanTo(asset.loan.actor.name)
                          : asset.kind}
                    </strong>
                    {asset.kind === "loan-receivable" && asset.loan && (
                      <small>{m.balance.dueDay(asset.loan.dueDay)}</small>
                    )}
                  </div>
                  <span>${asset.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            {assets.some((asset) => asset.kind === "loan-receivable") && (
              <p className="mk-asset-valuation-note">
                {m.balance.loanValueBasis}
              </p>
            )}
          </section>
        </div>
      )}

      {boardPanelOpen && (
        <div
          className="mk-asset-dialog-backdrop"
          onMouseDown={() => setBoardPanelOpen(false)}
        >
          <section
            id="display-board-dialog"
            className="mk-info-board-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-board-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mk-asset-dialog-heading">
              <div>
                <small>{m.timebar.displayBoard}</small>
                <strong>
                  {formatGameDate(MARKET_START_DATE, world.day, locale)}
                </strong>
              </div>
              <button
                className="mk-asset-dialog-close"
                onClick={() => setBoardPanelOpen(false)}
                aria-label={m.timebar.closeDisplayBoard}
                autoFocus
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <h2 id="display-board-title">{m.timebar.displayBoard}</h2>
            <ul className="mk-asset-list">
              {stage && (
                <li className="mk-asset-list-item mk-info-board-objective">
                  <div>
                    <strong>{m.timebar.currentObjective}</strong>
                    <small>
                      {m.timebar.objective(
                        localize(stage.focus, locale),
                        repaidLoans,
                        stage.repaidLoans,
                      )}
                    </small>
                  </div>
                </li>
              )}
              {boardHistoryEvents.map((event) => (
                <li key={event.id} className="mk-asset-list-item">
                  <div>
                    <strong>{eventText(event, m)}</strong>
                    <small>
                      {formatGameDate(MARKET_START_DATE, event.day, locale)}
                    </small>
                  </div>
                </li>
              ))}
              {boardHistoryEvents.length === 0 && (
                <li className="mk-asset-list-item">
                  <strong>{m.timebar.noRecentEvents}</strong>
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

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

      <section className="mk-info-board" aria-label={m.timebar.gameCalendar}>
        <button
          className="mk-info-board-trigger"
          onClick={openDisplayBoard}
          aria-label={m.timebar.openDisplayBoard}
          aria-haspopup="dialog"
          aria-controls="display-board-dialog"
        >
          <strong className="mk-info-board-date">
            {formatGameDate(MARKET_START_DATE, world.day, locale)}
          </strong>
          <div className="mk-info-board-window" aria-live="polite">
            <p key={boardMessage.id} className="mk-info-board-message">
              {boardMessage.text}
            </p>
          </div>
        </button>
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
            <DemandDetail
              demand={selectedDemand}
              locale={locale}
              onDraft={demandOrigin === "map" ? () => openBuilder() : undefined}
            />
          </div>
        )}

        {view === "contract" && selectedContract && (
          <div className="mk-overlay">
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
