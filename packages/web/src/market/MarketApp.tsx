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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import {
  MarketStageView,
  type DemandAbsorption,
} from "./components/MarketStageView.tsx";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  acceptRequest,
  activeAssets,
  advanceWorldDay,
  availableCash,
  contractFitsDemand,
  emptyWorld,
  fileRequest,
  isZoneUnlocked,
  loanReceivables,
  MARKET_START_DATE,
  matchingOpenDemandIds,
  moveContract,
  postContract,
  rejectRequest,
  totalAssetValue,
  totalLiabilityValue,
  zoneAtPosition,
  updateContract,
  withdrawContract,
  type ContractOffer,
  type Demand,
  type MarketBuilderNode,
  type MarketWorld,
  type WorldEvent,
} from "./market-world.ts";
import {
  deriveFirstYieldTutorialStep,
  type FirstYieldTutorialStep,
} from "./tutorial-flow.ts";
import "./campaign-stage.css";
import "./market.css";

const MARKET_MS_PER_DAY = 1_200;

type View = "map" | "demand" | "contract" | "builder";

function newWorldSeed(): string {
  return Math.random().toString(36).slice(2);
}

function tutorialPromptDetails(
  step: FirstYieldTutorialStep,
  tutorial: Messages["marketSim"]["tutorial"],
): { step: number; body: string } {
  switch (step) {
    case "inspect-request":
      return {
        step: 1,
        body: tutorial.inspectRequest,
      };
    case "open-builder":
      return {
        step: 2,
        body: tutorial.openBuilder,
      };
    case "build-contract":
      return { step: 3, body: tutorial.buildContract };
    case "post-contract":
      return { step: 3, body: tutorial.postContract };
    case "await-request":
      return { step: 4, body: tutorial.awaitRequest };
    case "approve-request":
      return {
        step: 5,
        body: tutorial.approveRequest,
      };
    case "collect-repayment":
      return { step: 6, body: tutorial.collectRepayment };
    case "inspect-deposit":
      return { step: 7, body: tutorial.inspectDeposit };
    case "build-deposit":
      return { step: 8, body: tutorial.buildDeposit };
    case "post-deposit":
      return { step: 8, body: tutorial.postDeposit };
    case "grow-assets":
      return { step: 9, body: tutorial.growAssets };
    case "claim-reward":
      return { step: 10, body: "" };
  }
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
    case "deposit-signed":
      return t.depositSigned(event.actorName, event.amount);
    case "deposit-matured":
      return t.depositMatured(event.actorName, event.amount);
    case "zone-unlocked":
      return t.zoneUnlocked;
    case "special-event":
      return event.specialEventId === "first-yield-tutorial"
        ? m.marketSim.specialEvents.firstYieldTitle
        : m.marketSim.specialEvents.tutorialTag;
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
  const tutorial = stage?.tutorial;
  const [world, setWorld] = useState<MarketWorld>(() =>
    emptyWorld(
      stage?.seed ?? newWorldSeed(),
      stage?.startingCash,
      stage?.market,
    ),
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
  const [builderTargetDemandId, setBuilderTargetDemandId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hudPanel, setHudPanel] = useState<"menu" | "objective" | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [boardPanelOpen, setBoardPanelOpen] = useState(false);
  const [boardMessageIndex, setBoardMessageIndex] = useState(0);
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: Boolean(tutorial), speed: 1 });
  const [rewardOverlayOpen, setRewardOverlayOpen] = useState(false);
  const [pendingAbsorptions, setPendingAbsorptions] = useState<
    DemandAbsorption[]
  >([]);
  const clockRef = useRef<GameClock | null>(null);

  useEffect(() => {
    const clock = new GameClock(() => {
      setWorld((current) => advanceWorldDay(current));
      return true;
    }, MARKET_MS_PER_DAY);
    clockRef.current = clock;
    if (tutorial) clock.pause();
    else clock.play();
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
  const activeLiabilities = world.balanceSheet.liabilities.filter(
    (liability) => liability.status === "active",
  );
  const totalLiabilities = totalLiabilityValue(world);
  const builderTargetDemand =
    world.demands.find((demand) => demand.id === builderTargetDemandId) ?? null;
  const repaidLoans = loanAssets.filter(
    (asset) => asset.status === "settled",
  ).length;
  const assetTarget = stage?.assetTarget ?? stage?.cashTarget ?? 0;
  const inAssetObjective = Boolean(stage && repaidLoans >= stage.repaidLoans);
  const objectiveText = inAssetObjective
    ? t.objectiveAssets(totalAssets, assetTarget)
    : t.objectiveFirstRepayment(repaidLoans, stage?.repaidLoans ?? 1);
  const stageComplete = Boolean(
    stage &&
    repaidLoans >= stage.repaidLoans &&
    cash >= stage.cashTarget &&
    totalAssets >= assetTarget,
  );
  const targetDemand = tutorial
    ? (world.demands.find((demand) => demand.id === tutorial.targetDemandId) ??
      null)
    : null;
  const targetRequestContract = tutorial
    ? (world.contracts.find((contract) =>
        contract.requests.some(
          (request) => request.demandId === tutorial.targetDemandId,
        ),
      ) ?? null)
    : null;
  const targetRequest = targetRequestContract?.requests.find(
    (request) => request.demandId === tutorial?.targetDemandId,
  );
  const hasActiveTargetLoan = loanAssets.some(
    (asset) =>
      asset.status === "active" &&
      asset.loan?.actor.id === targetDemand?.actor.id,
  );
  const depositDemand = world.demands.find(
    (demand) => demand.kind === "deposit" && demand.status === "open",
  );
  const hasDepositContract = Boolean(
    tutorial &&
    world.contracts.some(
      (contract) =>
        zoneAtPosition(world.market, contract.x, contract.y)?.id ===
        tutorial.depositZoneId,
    ),
  );
  const signedDeals = world.contracts.reduce(
    (count, contract) =>
      count +
      contract.requests.filter((request) => request.status === "accepted")
        .length,
    0,
  );
  const tutorialStep =
    tutorial?.kind === "first-yield"
      ? deriveFirstYieldTutorialStep({
          view,
          hasPostedContract: world.contracts.length > 0,
          targetRequestStatus:
            targetRequest?.status === "pending" ||
            targetRequest?.status === "accepted"
              ? targetRequest.status
              : null,
          hasActiveTargetLoan,
          repaidLoans,
          totalAssets,
          assetTarget,
          selectedDemandKind: selectedDemand?.kind ?? null,
          hasDepositContract,
          draftIsReady:
            validateDraft(builderNodes, m) === null &&
            (!builderTargetDemand ||
              contractFitsDemand(
                {
                  id: "draft-preview",
                  x: 0,
                  y: 0,
                  postedDay: world.day,
                  requests: [],
                  builderNodes,
                },
                builderTargetDemand,
                cash,
              )),
        })
      : null;
  const boardMessages = useMemo(() => {
    const recentEvents = world.log
      .filter(
        (event) =>
          event.day >= Math.max(0, world.day - 1) &&
          event.kind !== "demand-appeared" &&
          event.kind !== "demand-expired",
      )
      .map((event) => ({ id: event.id, text: eventText(event, m) }));
    const messages = [
      ...(stage
        ? [
            {
              id: `objective-${repaidLoans}`,
              text: objectiveText,
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
  }, [m, objectiveText, repaidLoans, stage, world.day, world.log]);
  const boardMessageSignature = boardMessages
    .map((message) => message.id)
    .join(",");
  const boardMessage =
    boardMessages[boardMessageIndex % boardMessages.length] ??
    boardMessages[0]!;
  const boardHistoryEvents = [...world.log]
    .filter(
      (event) =>
        event.kind !== "demand-appeared" && event.kind !== "demand-expired",
    )
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

  // Surface the win once. Tutorial stages use their reward screen; all other
  // stages retain the existing objective-panel completion flow.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (!stageComplete || celebratedRef.current) return;
    celebratedRef.current = true;
    clockRef.current?.pause();
    setClockView((current) => ({ ...current, paused: true }));
    if (tutorial) setRewardOverlayOpen(true);
    else setHudPanel("objective");
  }, [stageComplete, tutorial]);

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

  function openBuilder(targetDemandId: string | null = null): void {
    setBuilderNodes(emptyDraftNodes());
    setEditingContractId(null);
    setBuilderTargetDemandId(targetDemandId);
    setView("builder");
  }

  function openBuilderForContract(contract: ContractOffer): void {
    setBuilderNodes(withoutEndNodes(contract.builderNodes));
    setEditingContractId(contract.id);
    setBuilderTargetDemandId(null);
    setView("builder");
  }

  function submitDraft(): void {
    const issue = validateDraft(builderNodes, m);
    if (issue) {
      setNotice(issue);
      return;
    }
    if (
      builderTargetDemand &&
      !contractFitsDemand(
        {
          id: "draft-preview",
          x: 0,
          y: 0,
          postedDay: world.day,
          requests: [],
          builderNodes,
        },
        builderTargetDemand,
        cash,
      )
    ) {
      setNotice(t.contractDoesNotFit);
      return;
    }
    if (editingContractId) {
      setWorld((current) =>
        updateContract(current, editingContractId, builderNodes),
      );
      setNotice(t.updated);
      setView("contract");
    } else {
      const targetZoneId = builderTargetDemand?.zoneId;
      const postedWorld = postContract(world, builderNodes, targetZoneId);
      const postedContract = postedWorld.contracts.at(-1);
      const demandIds = postedContract
        ? matchingOpenDemandIds(postedWorld, postedContract.id)
        : [];
      setWorld(postedWorld);
      if (postedContract) {
        setPendingAbsorptions(
          demandIds.map((demandId) => ({
            id: `${postedContract.id}:${demandId}`,
            demandId,
            contractId: postedContract.id,
          })),
        );
      }
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

  const completeAbsorption = useCallback((absorption: DemandAbsorption) => {
    setWorld((current) =>
      fileRequest(current, absorption.demandId, absorption.contractId),
    );
    setPendingAbsorptions((current) =>
      current.filter((candidate) => candidate.id !== absorption.id),
    );
  }, []);

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
      if (request.kind === "deposit") {
        setWorld((current) => {
          const result = acceptRequest(current, contractId, requestId);
          return result.failure ? current : result.world;
        });
        return;
      }
      setNotice(t.insufficientCash(request.principal));
      return;
    }
    setWorld((current) => {
      const result = acceptRequest(current, contractId, requestId);
      return result.failure ? current : result.world;
    });
  }

  function repositionContract(contractId: string, x: number, y: number): void {
    const zone = zoneAtPosition(world.market, x, y);
    if (!zone || !isZoneUnlocked(world, zone)) setNotice(t.outsideActiveZone);
    setWorld((current) => moveContract(current, contractId, x, y));
  }

  const tutorialPrompt =
    tutorialStep && tutorialStep !== "claim-reward"
      ? tutorialPromptDetails(tutorialStep, t.tutorial)
      : null;

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
            {activeLiabilities.length > 0 && (
              <>
                <h2>{m.balance.liabilities}</h2>
                <ul className="mk-asset-list">
                  {activeLiabilities.map((liability) => (
                    <li key={liability.id} className="mk-asset-list-item">
                      <div>
                        <strong>
                          {liability.deposit
                            ? m.balance.depositFrom(
                                liability.deposit.actor.name,
                              )
                            : liability.kind}
                        </strong>
                        {liability.deposit && (
                          <small>
                            {m.balance.dueDay(liability.deposit.dueDay)}
                          </small>
                        )}
                      </div>
                      <span>−${liability.value.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <p className="mk-asset-valuation-note">
                  {m.balance.totalLiabilities}: $
                  {totalLiabilities.toLocaleString()}
                </p>
              </>
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
                    <small>{objectiveText}</small>
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
          <small>{objectiveText}</small>
          {stageComplete && onComplete && (
            <button className="mk-stage-complete" onClick={onComplete}>
              <Check aria-hidden="true" />{" "}
              {m.mine.completeStage(String(stage.number).padStart(2, "0"))}
            </button>
          )}
        </section>
      )}

      {tutorialPrompt && (
        <aside className="mk-tutorial-callout" aria-live="polite">
          <small>{t.tutorial.label(tutorialPrompt.step, 10)}</small>
          <p>{tutorialPrompt.body}</p>
        </aside>
      )}

      {tutorial && rewardOverlayOpen && stageComplete && onComplete && (
        <div className="mk-reward-backdrop">
          <div className="mk-celebration-burst" aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => (
              <i key={index} style={{ "--spark": index } as CSSProperties} />
            ))}
          </div>
          <section
            className="mk-reward-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mk-reward-title"
          >
            <div className="mk-reward-mark" aria-hidden="true">
              <Landmark />
              <Check />
            </div>
            <small>{t.tutorial.rewardEyebrow}</small>
            <h2 id="mk-reward-title">{t.tutorial.rewardTitle}</h2>
            <p>{t.tutorial.rewardBody(totalAssets)}</p>
            <div className="mk-success-stats">
              <div>
                <span>{t.tutorial.statTotalAssets}</span>
                <strong>${totalAssets.toLocaleString()}</strong>
              </div>
              <div>
                <span>{t.tutorial.statCash}</span>
                <strong>${cash.toLocaleString()}</strong>
              </div>
              <div>
                <span>{t.tutorial.statDeals}</span>
                <strong>{signedDeals}</strong>
              </div>
              <div>
                <span>{t.tutorial.statDays}</span>
                <strong>{world.day}</strong>
              </div>
            </div>
            <button type="button" onClick={onComplete} autoFocus>
              {t.tutorial.rewardAction}
            </button>
          </section>
        </div>
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
            onClick={togglePaused}
            className={`cs-clock-toggle${
              tutorialStep === "collect-repayment" && clockView.paused
                ? " mk-tutorial-target"
                : ""
            }`}
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
            locale={locale}
            suspended={view !== "map"}
            timeFlowing={!clockView.paused}
            highlightedDemandId={
              tutorial && tutorialStep !== "claim-reward"
                ? tutorialStep === "inspect-deposit"
                  ? (depositDemand?.id ?? null)
                  : targetDemand?.status === "open"
                    ? tutorial.targetDemandId
                    : null
                : null
            }
            highlightedContractId={
              tutorialStep === "await-request" ||
              tutorialStep === "approve-request"
                ? (targetRequestContract?.id ??
                  (tutorialStep === "await-request"
                    ? (world.contracts[0]?.id ?? null)
                    : null))
                : null
            }
            onTapDemand={(id) => openDemandDetail(id, "map")}
            onTapContract={openContractDetail}
            pendingAbsorptions={pendingAbsorptions}
            onAbsorptionComplete={completeAbsorption}
            onMoveContract={repositionContract}
          />
          <button
            className="mk-fab"
            onClick={() => openBuilder(null)}
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
              highlightDraftAction={tutorialStep === "open-builder"}
              onDraft={
                demandOrigin === "map"
                  ? () => openBuilder(selectedDemand.id)
                  : undefined
              }
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
              highlightAcceptRequestId={
                tutorialStep === "approve-request"
                  ? targetRequest?.id
                  : undefined
              }
            />
          </div>
        )}

        {view === "builder" && (
          <div className="mk-overlay">
            <MarketBuilder
              nodes={builderNodes}
              locale={locale}
              editing={Boolean(editingContractId)}
              onChangeNodes={setBuilderNodes}
              onSubmit={submitDraft}
              onWithdraw={editingContractId ? removeContract : undefined}
              tutorialStep={tutorialStep}
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
