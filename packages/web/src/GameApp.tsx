import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Banknote,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Copy,
  GitBranch,
  HandCoins,
  Home,
  Landmark,
  LayoutList,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  compileContract,
  countContractSteps,
  createDefaultCollateralAction,
  createDefaultStep,
  flattenContractSteps,
  formatMoney,
  hasValidationErrors,
  projectCashFlows,
  projectOutcomeCashFlows,
  summarizeProgram,
  validateProgram,
  type ContractProgram,
  type ContractStep,
  type ContractStepType,
  type IfStep,
  type OutcomeCashFlowProjection,
} from "@banker-simulation/contracts";
import {
  firstYieldStage,
  getStage,
  scoreRun,
  stageCatalog,
  type StageDefinition,
  type StageScore,
} from "@banker-simulation/content";
import {
  PLAYER_ID,
  StageEngine,
  type StageEvent,
  type StageRunState,
} from "@banker-simulation/core";
import {
  emptySave,
  loadGame,
  saveGame,
  type ActiveRunSave,
  type CampaignProgress,
  type PlayerSettings,
} from "./persistence.ts";
import "./game.css";

type Screen = "home" | "stage" | "play";
type MobilePanel = "portfolio" | "market" | "workshop";
type FeedbackTone = "info" | "success" | "warning" | "danger";

interface Feedback {
  tone: FeedbackTone;
  message: string;
}

interface PickerState {
  path: SequencePath;
  insertAt: number;
}

type BranchName = "then" | "else";
type SequencePath = Array<{ ifId: string; branch: BranchName }>;

const blockCatalog: Record<
  ContractStepType,
  { title: string; purpose: string; icon: LucideIcon }
> = {
  lend: {
    title: "Lend",
    purpose: "Move money to a borrower now",
    icon: HandCoins,
  },
  wait: { title: "Wait", purpose: "Advance the contract clock", icon: Clock3 },
  collect: {
    title: "Collect",
    purpose: "Request a future payment",
    icon: CircleDollarSign,
  },
  close: {
    title: "Close",
    purpose: "Finish after obligations resolve",
    icon: Check,
  },
  collateral: {
    title: "Collateral",
    purpose: "Pledge, release, or recover a named asset",
    icon: Shield,
  },
  if: {
    title: "If / Else",
    purpose: "Choose a bounded path from a visible fact",
    icon: GitBranch,
  },
};

function createEmptyDraft(
  stage: StageDefinition = firstYieldStage,
  contractNumber = 1,
): ContractProgram {
  return {
    schemaVersion: 1,
    id: `player-contract-${contractNumber}`,
    name: `${stage.simulation.borrower.name} contract`,
    steps: [],
  };
}

function nextBlockId(program: ContractProgram, type: ContractStepType): string {
  const number = flattenContractSteps(program.steps).reduce((largest, step) => {
    const parsed = Number(step.id.split("-").at(-1));
    return Number.isFinite(parsed) ? Math.max(largest, parsed) : largest;
  }, 0);
  return `${type}-${number + 1}`;
}

function sequenceAtPath(
  steps: readonly ContractStep[],
  path: SequencePath,
): readonly ContractStep[] {
  let sequence = steps;
  for (const segment of path) {
    const branch = sequence.find(
      (step): step is IfStep => step.type === "if" && step.id === segment.ifId,
    );
    if (!branch) return [];
    sequence = segment.branch === "then" ? branch.thenSteps : branch.elseSteps;
  }
  return sequence;
}

function transformSequence(
  steps: readonly ContractStep[],
  path: SequencePath,
  transform: (steps: ContractStep[]) => ContractStep[],
): ContractStep[] {
  if (path.length === 0) return transform([...steps]);
  const [segment, ...rest] = path;
  if (!segment) return [...steps];
  return steps.map((step) => {
    if (step.type !== "if" || step.id !== segment.ifId) return step;
    if (segment.branch === "then")
      return {
        ...step,
        thenSteps: transformSequence(step.thenSteps, rest, transform),
      };
    return {
      ...step,
      elseSteps: transformSequence(step.elseSteps, rest, transform),
    };
  });
}

function updateStepInSequence(
  steps: readonly ContractStep[],
  updated: ContractStep,
): ContractStep[] {
  return steps.map((step) => {
    if (step.id === updated.id) return updated;
    if (step.type !== "if") return step;
    return {
      ...step,
      thenSteps: updateStepInSequence(step.thenSteps, updated),
      elseSteps: updateStepInSequence(step.elseSteps, updated),
    };
  });
}

function deleteStepInSequence(
  steps: readonly ContractStep[],
  blockId: string,
): ContractStep[] {
  return steps
    .filter((step) => step.id !== blockId)
    .map((step) =>
      step.type === "if"
        ? {
            ...step,
            thenSteps: deleteStepInSequence(step.thenSteps, blockId),
            elseSteps: deleteStepInSequence(step.elseSteps, blockId),
          }
        : step,
    );
}

function retargetStep(step: ContractStep, borrowerId: string): ContractStep {
  if (step.type === "lend") return { ...step, borrowerId };
  if (step.type === "collect") return { ...step, fromId: borrowerId };
  if (step.type === "collateral" && step.action === "require")
    return { ...step, borrowerId };
  if (step.type === "if")
    return {
      ...step,
      thenSteps: step.thenSteps.map((child) => retargetStep(child, borrowerId)),
      elseSteps: step.elseSteps.map((child) => retargetStep(child, borrowerId)),
    };
  return step;
}

function usd(amount: number): string {
  return formatMoney(amount, "USD");
}

function factLabel(fact: string): string {
  if (fact === "payment-outcome") return "Payment outcome";
  if (fact === "borrower-risk-rating") return "Public risk rating";
  return "Revenue certainty";
}

function eventExplanation(
  event: StageEvent,
  borrowerName = "the borrower",
): string {
  if (event.type === "RunStarted")
    return `Treasury opened with ${usd(event.data.playerCash)}.`;
  if (event.type === "ContractPublished")
    return `Published “${event.data.contract.name}” for ${borrowerName} to review.`;
  if (event.type === "ContractRejected") return event.data.reasons.join(" ");
  if (event.type === "ContractFunded")
    return `${borrowerName} accepted the terms and the contract became active.`;
  if (event.type === "CashTransferred") {
    if (event.data.reason === "contract-funding") {
      return `Lend moved ${usd(event.data.amount)} from your treasury to ${borrowerName}.`;
    }
    if (event.data.reason === "business-expense") {
      return `${borrowerName} used ${usd(event.data.amount)} for the financed work.`;
    }
    if (event.data.reason === "business-revenue") {
      return `${borrowerName}'s work produced ${usd(event.data.amount)} of payment capacity.`;
    }
    if (event.data.reason === "collateral-recovery")
      return `Liquidate recovered ${usd(event.data.amount)} from the pledged asset.`;
    if (event.data.reason === "default-payment")
      return `${borrowerName} paid ${usd(event.data.amount)} before the remaining shortfall defaulted.`;
    return `Collect moved ${usd(event.data.amount)} from ${borrowerName} back to your treasury.`;
  }
  if (event.type === "CollateralLocked")
    return `Collateral locked ${usd(event.data.amount)} of pledged asset value because block ${event.data.sourceBlockId} ran.`;
  if (event.type === "CollateralReleased")
    return `The settled branch released ${usd(event.data.amount)} of collateral.`;
  if (event.type === "CollateralLiquidated")
    return `The default branch liquidated collateral for ${usd(event.data.recoveredAmount)}; ${usd(event.data.shortfallRemaining)} remains unpaid.`;
  if (event.type === "TimeAdvanced")
    return `The calendar advanced to month ${event.data.to}.`;
  if (event.type === "BorrowerRevenueRealized")
    return `${borrowerName}'s revenue realized at ${usd(event.data.amount)}.`;
  if (event.type === "PaymentRequested")
    return `Collect requested ${usd(event.data.amount)} from ${borrowerName}.`;
  if (event.type === "PaymentPartiallySettled")
    return `${borrowerName} paid ${usd(event.data.paid)}; ${usd(event.data.shortfall)} remained.`;
  if (event.type === "PaymentSettled")
    return `${borrowerName} paid ${usd(event.data.amount)} in full.`;
  if (event.type === "PaymentDefaulted") {
    return `${borrowerName} defaulted with a ${usd(event.data.shortfall)} shortfall.`;
  }
  if (event.type === "ConditionEvaluated")
    return `${factLabel(event.data.fact)} was “${event.data.observed}”; block ${event.data.sourceBlockId} ${event.data.matched ? "matched" : "did not match"}.`;
  if (event.type === "BranchExecuted")
    return `${event.data.branch === "then" ? "Then" : "Else"} ran because ${event.data.reason}`;
  if (event.type === "ContractClosed")
    return "Close completed the contract after settlement.";
  if (event.type === "StageWon")
    return `Objective reached. ${usd(event.data.endingCash)} is now liquid.`;
  return event.data.reason;
}

function eventTone(event: StageEvent): FeedbackTone {
  if (
    event.type === "StageWon" ||
    event.type === "PaymentSettled" ||
    event.type === "CollateralReleased" ||
    event.type === "ContractClosed"
  ) {
    return "success";
  }
  if (
    event.type === "ContractRejected" ||
    event.type === "PaymentDefaulted" ||
    event.type === "StageLost"
  ) {
    return "danger";
  }
  if (
    event.type === "PaymentRequested" ||
    event.type === "PaymentPartiallySettled" ||
    event.type === "ConditionEvaluated" ||
    event.type === "BranchExecuted" ||
    event.type === "CollateralLiquidated" ||
    event.type === "BorrowerRevenueRealized"
  )
    return "warning";
  return "info";
}

function bestScore(
  previous: StageScore | undefined,
  next: StageScore,
): StageScore {
  if (!previous) return next;
  if (next.endingCash !== previous.endingCash)
    return next.endingCash > previous.endingCash ? next : previous;
  return next.timeUsed < previous.timeUsed ? next : previous;
}

export function GameApp() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedStageId, setSelectedStageId] = useState(firstYieldStage.id);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("workshop");
  const [campaign, setCampaign] = useState<CampaignProgress>(
    () => emptySave().campaign,
  );
  const [settings, setSettings] = useState<PlayerSettings>(
    () => emptySave().settings,
  );
  const [run, setRun] = useState<ActiveRunSave | null>(null);
  const [draft, setDraft] = useState<ContractProgram>(() => createEmptyDraft());
  const [draftHistory, setDraftHistory] = useState<ContractProgram[]>([]);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "info",
    message: "Build a contract from four simple blocks.",
  });
  const [saveStatus, setSaveStatus] = useState<
    "loading" | "saving" | "saved" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    loadGame()
      .then((save) => {
        if (cancelled) return;
        if (save.activeRun) {
          const stage = getStage(save.activeRun.stageId);
          new StageEngine(stage.simulation, save.activeRun.events);
        }
        setCampaign(save.campaign);
        setSettings(save.settings);
        setRun(save.activeRun);
        const restoredStageId =
          save.activeRun?.stageId ??
          save.campaign.mostRecentStageId ??
          firstYieldStage.id;
        setSelectedStageId(restoredStageId);
        setDraft(save.draft ?? createEmptyDraft(getStage(restoredStageId)));
        setSaveStatus("saved");
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = emptySave();
        setCampaign(fallback.campaign);
        setSettings(fallback.settings);
        setRun(null);
        setDraft(createEmptyDraft());
        setSaveStatus("error");
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setSaveStatus("saving");
    saveGame({ schemaVersion: 1, campaign, activeRun: run, draft, settings })
      .then(() => {
        if (!cancelled) setSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [campaign, draft, hydrated, run, settings]);

  const selectedStage = getStage(selectedStageId);
  const stage = run ? getStage(run.stageId) : selectedStage;
  const engine = useMemo(
    () => (run ? new StageEngine(stage.simulation, run.events) : null),
    [run, stage.simulation],
  );
  const state = engine?.inspect() ?? null;
  const publishedAt =
    state?.contract && state.contract.status !== "rejected"
      ? (run?.events.findLast(
          (event) =>
            event.type === "ContractPublished" &&
            event.data.contract.id === state.contract?.id,
        )?.at ?? state.time)
      : (state?.time ?? 0);
  const issues = useMemo(() => validateProgram(draft), [draft]);
  const projection = useMemo(
    () => projectCashFlows(draft, publishedAt),
    [draft, publishedAt],
  );
  const summary = useMemo(
    () =>
      summarizeProgram(draft, {
        [stage.simulation.borrower.id]: stage.simulation.borrower.name,
      }),
    [draft, stage.simulation.borrower.id, stage.simulation.borrower.name],
  );
  const outcomeProjection = useMemo<OutcomeCashFlowProjection | null>(() => {
    if (hasValidationErrors(issues)) return null;
    const borrower = stage.simulation.borrower;
    return projectOutcomeCashFlows(draft, {
      startMonth: publishedAt,
      startingCash:
        state?.balances[PLAYER_ID] ?? stage.simulation.startingPlayerCash,
      borrowerId: borrower.id,
      borrowerRiskRating: borrower.riskRating ?? "low",
      revenueCertainty: borrower.revenueCertainty ?? "confirmed",
      bestRevenue: borrower.bestCaseRevenue ?? borrower.expectedRevenue,
      expectedRevenue: borrower.expectedRevenue,
      adverseRevenue: borrower.adverseCaseRevenue ?? borrower.expectedRevenue,
      ...(borrower.collateral
        ? { collateralLiquidationValue: borrower.collateral.liquidationValue }
        : {}),
      ...(stage.simulation.partialPaymentOnDefault === undefined
        ? {}
        : {
            partialPaymentOnDefault: stage.simulation.partialPaymentOnDefault,
          }),
    });
  }, [draft, issues, publishedAt, stage, state?.balances]);

  function beginStage(stageToStart: StageDefinition = selectedStage): void {
    const freshEngine = new StageEngine(stageToStart.simulation);
    setRun({
      schemaVersion: 1,
      stageId: stageToStart.id,
      events: freshEngine.events(),
    });
    setSelectedStageId(stageToStart.id);
    setDraft(createEmptyDraft(stageToStart));
    setDraftHistory([]);
    setCampaign((current) => ({
      ...current,
      mostRecentStageId: stageToStart.id,
    }));
    setFeedback({ tone: "info", message: "Tap + to place the first block." });
    setMobilePanel("workshop");
    setScreen("play");
  }

  function continueStage(): void {
    if (!run) return;
    setScreen("play");
  }

  function replaceDraft(next: ContractProgram): void {
    setDraftHistory((history) =>
      [structuredClone(draft), ...history].slice(0, 30),
    );
    setDraft(next);
  }

  function insertBlock(type: ContractStepType): void {
    if (!picker) return;
    const id = nextBlockId(draft, type);
    let step: ContractStep;
    if (type === "collateral" && picker.path.length > 0) {
      const finalSegment = picker.path.at(-1);
      const parent = flattenContractSteps(draft.steps).find(
        (candidate): candidate is IfStep =>
          candidate.type === "if" && candidate.id === finalSegment?.ifId,
      );
      const defaultBranch =
        parent?.condition.fact === "payment-outcome" &&
        ((parent.condition.equals === "defaulted" &&
          finalSegment?.branch === "then") ||
          (parent.condition.equals === "settled" &&
            finalSegment?.branch === "else"));
      step = createDefaultCollateralAction(
        defaultBranch ? "liquidate" : "release",
        id,
      );
    } else {
      step = retargetStep(
        createDefaultStep(type, id),
        stage.simulation.borrower.id,
      );
    }
    const steps = transformSequence(draft.steps, picker.path, (sequence) => {
      const next = [...sequence];
      next.splice(picker.insertAt, 0, step);
      return next;
    });
    replaceDraft({ ...draft, steps });
    setPicker(null);
    setEditingBlockId(step.id);
  }

  function updateBlock(updated: ContractStep): void {
    replaceDraft({
      ...draft,
      steps: updateStepInSequence(draft.steps, updated),
    });
  }

  function deleteBlock(blockId: string): void {
    replaceDraft({
      ...draft,
      steps: deleteStepInSequence(draft.steps, blockId),
    });
    setEditingBlockId(null);
    setFeedback({
      tone: "info",
      message: "Block removed. The draft was saved automatically.",
    });
  }

  function undoDraft(): void {
    const previous = draftHistory[0];
    if (!previous) return;
    setDraft(structuredClone(previous));
    setDraftHistory((history) => history.slice(1));
    setFeedback({ tone: "info", message: "Last workshop edit undone." });
  }

  function publish(): void {
    if (!engine || !state) return;
    try {
      const compiled = compileContract(draft, state.time);
      const result = engine.publishAndFund(compiled.terms);
      setRun({ schemaVersion: 1, stageId: stage.id, events: engine.events() });
      setFeedback(
        result.accepted
          ? {
              tone: "success",
              message: `${stage.simulation.borrower.name} accepted. Your Lend block funded the contract.`,
            }
          : { tone: "danger", message: result.reasons.join(" ") },
      );
      setMobilePanel(result.accepted ? "portfolio" : "workshop");
    } catch (caught) {
      setFeedback({
        tone: "danger",
        message:
          caught instanceof Error
            ? caught.message
            : "The contract could not be published.",
      });
    }
  }

  function advance(mode: "one" | "next"): void {
    if (!engine) return;
    try {
      if (mode === "one") engine.advanceOneMonth();
      else engine.advanceToNextEvent();
      const nextState = engine.inspect();
      setRun({ schemaVersion: 1, stageId: stage.id, events: engine.events() });
      if (nextState.status === "won") {
        const score = scoreRun(nextState, countContractSteps(draft));
        setCampaign((current) => ({
          ...current,
          completedStageIds: current.completedStageIds.includes(stage.id)
            ? current.completedStageIds
            : [...current.completedStageIds, stage.id],
          rewards: current.rewards.includes(stage.reward.id)
            ? current.rewards
            : [...current.rewards, stage.reward.id],
          bestScores: {
            ...current.bestScores,
            [stage.id]: bestScore(current.bestScores[stage.id], score),
          },
          mostRecentStageId: stage.id,
        }));
        setFeedback({
          tone: "success",
          message: `Objective complete. ${stage.reward.name} is yours.`,
        });
      } else if (nextState.status === "lost") {
        const loss = engine
          .events()
          .findLast((event) => event.type === "StageLost");
        setFeedback({
          tone: "danger",
          message: loss
            ? eventExplanation(loss)
            : "The stage was not completed.",
        });
      } else {
        setFeedback({
          tone: "info",
          message: `The calendar is now at month ${nextState.time}.`,
        });
      }
    } catch (caught) {
      setFeedback({
        tone: "danger",
        message:
          caught instanceof Error ? caught.message : "Time could not advance.",
      });
    }
  }

  function duplicateDraft(): void {
    const contractNumber = Number(draft.id.split("-").at(-1)) + 1 || 2;
    replaceDraft({
      ...structuredClone(draft),
      id: `player-contract-${contractNumber}`,
      name: `${draft.name} copy`,
    });
    setFeedback({
      tone: "success",
      message: "A new editable copy was created and saved.",
    });
  }

  function discardDraft(): void {
    if (!window.confirm("Discard every block in this draft?")) return;
    replaceDraft({ ...createEmptyDraft(stage), id: draft.id });
    setFeedback({ tone: "info", message: "Draft cleared." });
  }

  function resetCampaign(): void {
    if (
      !window.confirm(
        "Start a new campaign? This clears the active run and earned reward.",
      )
    )
      return;
    const fresh = emptySave();
    setCampaign(fresh.campaign);
    setSettings(fresh.settings);
    setRun(null);
    setSelectedStageId(firstYieldStage.id);
    setDraft(createEmptyDraft(firstYieldStage));
    setDraftHistory([]);
    setScreen("stage");
  }

  if (!hydrated) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="brand-mark">
          <Landmark aria-hidden="true" />
        </div>
        <p className="eyebrow">Banker Simulation</p>
        <h1>Rebuilding your ledger…</h1>
      </main>
    );
  }

  if (screen === "home") {
    return (
      <HomeScreen
        campaign={campaign}
        canContinue={Boolean(run)}
        onContinue={continueStage}
        onNewCampaign={resetCampaign}
        onStages={() => setScreen("stage")}
      />
    );
  }

  if (screen === "stage") {
    return (
      <StageScreen
        selectedStage={selectedStage}
        campaign={campaign}
        canContinue={run?.stageId === selectedStage.id}
        onBack={() => setScreen("home")}
        onSelect={setSelectedStageId}
        onPlay={() =>
          run?.stageId === selectedStage.id
            ? continueStage()
            : beginStage(selectedStage)
        }
        onRestart={() => beginStage(selectedStage)}
      />
    );
  }

  if (!run || !state || !engine) {
    return (
      <main className="loading-screen">
        <h1>No active run</h1>
        <button className="primary-button" onClick={() => beginStage()}>
          Start Stage 1
        </button>
      </main>
    );
  }

  const importantEvents = run.events
    .filter((event) => event.type !== "TimeAdvanced")
    .slice(-8)
    .reverse();
  const activeLocked =
    state.contract?.status === "active" || state.status !== "playing";
  const editingStep =
    flattenContractSteps(draft.steps).find(
      (step) => step.id === editingBlockId,
    ) ?? null;
  const progress = Math.min(
    100,
    ((state.balances[PLAYER_ID] ?? 0) / stage.primaryObjective.amount) * 100,
  );

  return (
    <div
      className={`game-shell ${settings.reducedMotion ? "reduce-motion" : ""}`}
    >
      <header className="status-bar">
        <button
          className="icon-button"
          onClick={() => setScreen("stage")}
          aria-label="Back to stage briefing"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="status-goal">
          <span className="eyebrow">
            Stage {String(stage.number).padStart(2, "0")} · {stage.title}
          </span>
          <strong>
            {usd(state.balances[PLAYER_ID] ?? 0)} /{" "}
            {usd(stage.primaryObjective.amount)}
          </strong>
          <div
            className="progress-track"
            aria-label={`${Math.round(progress)} percent of cash target`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="status-stat">
          <CalendarClock aria-hidden="true" />
          <span>
            <small>Month</small>
            <strong>
              {state.time} / {stage.primaryObjective.deadline}
            </strong>
          </span>
        </div>
        <div className="status-stat liquidity-stat">
          <WalletCards aria-hidden="true" />
          <span>
            <small>Available</small>
            <strong>{usd(state.balances[PLAYER_ID] ?? 0)}</strong>
          </span>
        </div>
        <div className={`save-state ${saveStatus}`} aria-live="polite">
          <Save aria-hidden="true" />{" "}
          {saveStatus === "saved"
            ? "Saved"
            : saveStatus === "error"
              ? "Save unavailable"
              : "Saving"}
        </div>
      </header>

      <div
        className={`feedback-banner ${feedback.tone}`}
        role="status"
        aria-live="polite"
      >
        {feedback.tone === "danger" ? (
          <AlertTriangle aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        <span>{feedback.message}</span>
      </div>

      <main className="game-grid">
        <section
          className={`game-panel portfolio-panel ${mobilePanel === "portfolio" ? "mobile-active" : ""}`}
        >
          <PanelHeader
            icon={WalletCards}
            eyebrow="Your position"
            title="Portfolio"
          />
          <div className="metric-card primary-metric">
            <span>Cash</span>
            <strong>{usd(state.balances[PLAYER_ID] ?? 0)}</strong>
            <small>
              {state.contract?.status === "active"
                ? `${usd(state.contract.principal)} deployed`
                : "Ready to deploy"}
            </small>
          </div>

          <div className="section-heading">
            <h3>Active agreement</h3>
            <span
              className={`status-pill ${state.contract?.status ?? "draft"}`}
            >
              {state.contract?.status ?? "none"}
            </span>
          </div>
          {state.contract ? (
            <article className="agreement-card">
              <div className="agreement-icon">
                <Banknote aria-hidden="true" />
              </div>
              <div>
                <strong>{state.contract.name}</strong>
                <p>
                  {usd(state.contract.principal)} out ·{" "}
                  {usd(state.contract.repayment)} due M{state.contract.dueMonth}
                </p>
                {state.collateral && (
                  <small>
                    {usd(state.collateral.amount)} collateral ·{" "}
                    {state.collateral.status}
                  </small>
                )}
                {state.contract.rejectionReasons.map((reason) => (
                  <small key={reason}>{reason}</small>
                ))}
              </div>
            </article>
          ) : (
            <div className="empty-card">
              No capital is committed. Build and publish a contract.
            </div>
          )}

          <div className="section-heading">
            <h3>Recent changes</h3>
            <span>{importantEvents.length}</span>
          </div>
          <ol className="event-list">
            {importantEvents.map((event) => (
              <li key={event.sequence} className={eventTone(event)}>
                <span className="event-dot" />
                <div>
                  <small>
                    M{event.at} · {event.type.replace(/([A-Z])/g, " $1").trim()}
                  </small>
                  <p>
                    {eventExplanation(event, stage.simulation.borrower.name)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={`game-panel market-panel ${mobilePanel === "market" ? "mobile-active" : ""}`}
        >
          <PanelHeader
            icon={Landmark}
            eyebrow="Open market"
            title="Visible need & facts"
          />
          <article className="borrower-card">
            <div className="borrower-topline">
              <div className="borrower-avatar">
                <img
                  src={`/assets/avatars/${stage.simulation.borrower.id}-neutral.webp`}
                  alt=""
                />
                <span className="online-dot" />
              </div>
              <div>
                <span className="eyebrow">Verified business</span>
                <h3>{stage.simulation.borrower.name}</h3>
                <p>
                  {stage.simulation.borrower.revenueCertainty === "variable"
                    ? "Variable-revenue business order"
                    : "Confirmed business order"}
                </p>
              </div>
            </div>
            <blockquote>
              “Fund the work now. I can pay when revenue arrives in month{" "}
              {stage.simulation.borrower.fundsAvailableAt}.”
            </blockquote>
            <dl className="need-grid">
              <div>
                <dt>Needs now</dt>
                <dd>{usd(stage.simulation.borrower.needAmount)}</dd>
              </div>
              <div>
                <dt>Expected revenue</dt>
                <dd>{usd(stage.simulation.borrower.expectedRevenue)}</dd>
              </div>
              <div>
                <dt>Earliest pay</dt>
                <dd>Month {stage.simulation.borrower.fundsAvailableAt}</dd>
              </div>
              <div>
                <dt>Term limit</dt>
                <dd>
                  {usd(stage.simulation.borrower.maximumAcceptedRepayment)}
                </dd>
              </div>
              <div>
                <dt>Risk rating</dt>
                <dd>{stage.simulation.borrower.riskRating ?? "low"}</dd>
              </div>
              <div>
                <dt>Revenue</dt>
                <dd>
                  {stage.simulation.borrower.revenueCertainty ?? "confirmed"}
                </dd>
              </div>
            </dl>
          </article>

          <div className="market-note">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>What you know</strong>
              <p>
                Best{" "}
                {usd(
                  stage.simulation.borrower.bestCaseRevenue ??
                    stage.simulation.borrower.expectedRevenue,
                )}
                , expected {usd(stage.simulation.borrower.expectedRevenue)},
                adverse{" "}
                {usd(
                  stage.simulation.borrower.adverseCaseRevenue ??
                    stage.simulation.borrower.expectedRevenue,
                )}
                .
                {stage.simulation.borrower.collateral
                  ? ` ${stage.simulation.borrower.collateral.label} is appraised at ${usd(stage.simulation.borrower.collateral.appraisedValue)} and can liquidate for ${usd(stage.simulation.borrower.collateral.liquidationValue)}.`
                  : " No eligible collateral is listed."}
              </p>
            </div>
          </div>

          <div className="preview-outcome scenario-preview">
            <div className="section-heading">
              <h3>Three-case preview</h3>
              <span>public facts</span>
            </div>
            {outcomeProjection ? (
              <div className="scenario-grid">
                {(["best", "expected", "adverse"] as const).map((key) => (
                  <ScenarioCard key={key} projection={outcomeProjection[key]} />
                ))}
              </div>
            ) : (
              <p>
                Complete every path to compare best, expected, and adverse cash
                flows.
              </p>
            )}
          </div>
        </section>

        <section
          className={`game-panel workshop-panel ${mobilePanel === "workshop" ? "mobile-active" : ""}`}
        >
          <div className="workshop-heading">
            <PanelHeader
              icon={LayoutList}
              eyebrow="Contract workshop"
              title={draft.name}
            />
            <div className="workshop-tools">
              <button
                className="icon-button"
                onClick={undoDraft}
                disabled={!draftHistory.length || activeLocked}
                aria-label="Undo last draft edit"
              >
                <Undo2 aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                onClick={duplicateDraft}
                disabled={activeLocked}
                aria-label="Duplicate draft"
              >
                <Copy aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                onClick={discardDraft}
                disabled={activeLocked}
                aria-label="Discard draft"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>

          {state.status !== "playing" && (
            <OutcomeCard
              state={state}
              stage={stage}
              score={scoreRun(state, countContractSteps(draft))}
              onReplay={() => beginStage(stage)}
            />
          )}

          <div
            className={`program-canvas ${activeLocked ? "locked" : ""}`}
            aria-label="Contract block sequence"
          >
            {draft.steps.length === 0 && (
              <div className="program-hint">
                <Plus aria-hidden="true" />
                <strong>Start the machine</strong>
                <span>Add Lend, then follow the flow.</span>
              </div>
            )}
            <ProgramSequence
              steps={draft.steps}
              path={[]}
              issues={issues}
              disabled={activeLocked}
              partyName={stage.simulation.borrower.name}
              onInsert={(path, insertAt) => setPicker({ path, insertAt })}
              onEdit={(blockId) => setEditingBlockId(blockId)}
            />
          </div>

          <div className="contract-preview">
            <div className="section-heading">
              <h3>Readable contract</h3>
              <span>{countContractSteps(draft)} executable blocks</span>
            </div>
            <p className="plain-summary">{summary}</p>
            {issues.length > 0 && (
              <ul className="validation-list">
                {issues.slice(0, 4).map((issue, index) => (
                  <li className={issue.severity} key={`${issue.code}-${index}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="cashflow-strip">
              {projection.entries.length === 0 ? (
                <span>No cash flow yet</span>
              ) : (
                projection.entries.map((entry) => (
                  <div
                    key={entry.blockId}
                    className={entry.amount < 0 ? "outflow" : "inflow"}
                  >
                    <small>M{entry.month}</small>
                    <strong>
                      {entry.amount < 0 ? "−" : "+"}
                      {usd(Math.abs(entry.amount))}
                    </strong>
                    <span>{entry.label}</span>
                  </div>
                ))
              )}
              {projection.entries.length > 1 && (
                <ArrowRight className="flow-arrow" aria-hidden="true" />
              )}
            </div>
          </div>

          <div className="workshop-actions">
            <button
              className="secondary-button"
              onClick={() =>
                setFeedback({
                  tone: "success",
                  message: "Draft saved on this device.",
                })
              }
            >
              <Save aria-hidden="true" /> Save draft
            </button>
            <button
              className="primary-button publish-button"
              onClick={publish}
              disabled={hasValidationErrors(issues) || activeLocked}
            >
              <Landmark aria-hidden="true" /> Publish & fund{" "}
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <div className="time-controls" aria-label="Simulation time controls">
        <button
          onClick={() => advance("one")}
          disabled={
            state.status !== "playing" ||
            state.time >= stage.primaryObjective.deadline
          }
        >
          <Play aria-hidden="true" /> Advance 1 month
        </button>
        <button
          onClick={() => advance("next")}
          disabled={
            state.status !== "playing" ||
            state.time >= stage.primaryObjective.deadline
          }
        >
          <RefreshCcw aria-hidden="true" /> Next event
        </button>
      </div>

      <nav className="mobile-nav" aria-label="Gameplay areas">
        <MobileNavButton
          icon={WalletCards}
          label="Portfolio"
          active={mobilePanel === "portfolio"}
          onClick={() => setMobilePanel("portfolio")}
        />
        <MobileNavButton
          icon={Landmark}
          label="Market"
          active={mobilePanel === "market"}
          onClick={() => setMobilePanel("market")}
        />
        <MobileNavButton
          icon={LayoutList}
          label="Workshop"
          active={mobilePanel === "workshop"}
          onClick={() => setMobilePanel("workshop")}
        />
      </nav>

      {picker && (
        <BottomSheet
          title="Choose the next block"
          onClose={() => setPicker(null)}
        >
          <div className="block-picker">
            {(picker.path.length > 0
              ? stage.availableBlocks.filter((type) =>
                  ["collateral", "close"].includes(type),
                )
              : stage.availableBlocks
            ).map((type) => {
              const definition = blockCatalog[type];
              const Icon = definition.icon;
              const currentSequence = sequenceAtPath(draft.steps, picker.path);
              const alreadyUsed = currentSequence.some(
                (step) => step.type === type,
              );
              return (
                <button
                  key={type}
                  onClick={() => insertBlock(type)}
                  disabled={alreadyUsed}
                >
                  <span>
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{definition.title}</strong>
                    <small>
                      {alreadyUsed
                        ? "Already in this contract"
                        : definition.purpose}
                    </small>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}

      {editingStep && (
        <BottomSheet
          title={`Configure ${blockCatalog[editingStep.type].title}`}
          onClose={() => setEditingBlockId(null)}
        >
          <BlockEditor
            step={editingStep}
            borrowerName={stage.simulation.borrower.name}
            collateralMaximum={
              stage.simulation.borrower.collateral?.appraisedValue
            }
            onChange={updateBlock}
            onDelete={() => deleteBlock(editingStep.id)}
          />
        </BottomSheet>
      )}
    </div>
  );
}

function HomeScreen({
  campaign,
  canContinue,
  onContinue,
  onNewCampaign,
  onStages,
}: {
  campaign: CampaignProgress;
  canContinue: boolean;
  onContinue: () => void;
  onNewCampaign: () => void;
  onStages: () => void;
}) {
  const latestReward = [...stageCatalog]
    .reverse()
    .find((stage) => campaign.rewards.includes(stage.reward.id))?.reward;
  return (
    <main className="home-screen">
      <div className="home-orb orb-one" />
      <div className="home-orb orb-two" />
      <header className="home-brand">
        <span className="brand-mark">
          <Landmark aria-hidden="true" />
        </span>
        <span>Banker Simulation</span>
      </header>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles aria-hidden="true" /> Financial automation puzzle
          </span>
          <h1>
            Build contracts.
            <br />
            <em>Move the market.</em>
          </h1>
          <p>
            Compose a financial machine from readable blocks, fund real needs,
            and watch every promise play out through time.
          </p>
          <div className="home-actions">
            {canContinue && (
              <button
                className="primary-button hero-button"
                onClick={onContinue}
              >
                <Play aria-hidden="true" /> Continue run{" "}
                <ArrowRight aria-hidden="true" />
              </button>
            )}
            <button
              className={
                canContinue ? "secondary-button" : "primary-button hero-button"
              }
              onClick={onStages}
            >
              <BookOpen aria-hidden="true" /> Stage selection
            </button>
            {canContinue && (
              <button className="text-button" onClick={onNewCampaign}>
                <RotateCcw aria-hidden="true" /> New campaign
              </button>
            )}
          </div>
        </div>
        <div
          className="hero-machine"
          aria-label="Lend, wait, collect contract example"
        >
          <div className="machine-glow" />
          <MachineNode
            icon={HandCoins}
            label="Lend"
            value="$1,000 now"
            index="01"
          />
          <span className="machine-connector" />
          <MachineNode
            icon={Clock3}
            label="Wait"
            value="24 months"
            index="02"
          />
          <span className="machine-connector" />
          <MachineNode
            icon={CircleDollarSign}
            label="Collect"
            value="$1,200 later"
            index="03"
          />
        </div>
      </section>
      <footer className="home-footer">
        <div>
          <small>Latest stage object</small>
          <strong>{latestReward?.name ?? "No object earned yet"}</strong>
        </div>
        {latestReward ? (
          <span className="reward-mini">
            <Award aria-hidden="true" />
          </span>
        ) : (
          <span className="reward-mini locked">
            <Target aria-hidden="true" />
          </span>
        )}
      </footer>
    </main>
  );
}

function StageScreen({
  selectedStage,
  campaign,
  canContinue,
  onBack,
  onSelect,
  onPlay,
  onRestart,
}: {
  selectedStage: StageDefinition;
  campaign: CampaignProgress;
  canContinue: boolean;
  onBack: () => void;
  onSelect: (stageId: string) => void;
  onPlay: () => void;
  onRestart: () => void;
}) {
  const complete = campaign.completedStageIds.includes(selectedStage.id);
  const score = campaign.bestScores[selectedStage.id];
  const unlocked =
    selectedStage.number === 1 ||
    campaign.completedStageIds.includes(
      stageCatalog[selectedStage.number - 2]?.id ?? "",
    );
  return (
    <main className="stage-screen">
      <header className="stage-header">
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="Back to main menu"
        >
          <ArrowLeft />
        </button>
        <span>Stage selection</span>
        <strong>
          {selectedStage.number} / {stageCatalog.length}
        </strong>
      </header>
      <nav className="stage-rail" aria-label="Campaign stages">
        {stageCatalog.map((stage) => {
          const stageUnlocked =
            stage.number === 1 ||
            campaign.completedStageIds.includes(
              stageCatalog[stage.number - 2]?.id ?? "",
            );
          const stageComplete = campaign.completedStageIds.includes(stage.id);
          return (
            <button
              key={stage.id}
              className={stage.id === selectedStage.id ? "selected" : ""}
              onClick={() => onSelect(stage.id)}
              aria-current={stage.id === selectedStage.id ? "step" : undefined}
            >
              <span>
                {stageComplete ? (
                  <Check aria-hidden="true" />
                ) : (
                  String(stage.number).padStart(2, "0")
                )}
              </span>
              <div>
                <strong>{stage.title}</strong>
                <small>
                  {stageUnlocked ? stage.subtitle : "Complete the prior lesson"}
                </small>
              </div>
              {!stageUnlocked && <Shield aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
      <section className="stage-layout">
        <div className="stage-story">
          <span className="stage-number">
            {String(selectedStage.number).padStart(2, "0")}
          </span>
          <p className="eyebrow">
            {selectedStage.number === 1 ? "Foundations" : "Risk desk"} ·{" "}
            {unlocked ? "available now" : "locked"}
          </p>
          <h1>{selectedStage.title}</h1>
          <h2>{selectedStage.subtitle}</h2>
          <p className="stage-briefing">{selectedStage.briefing}</p>
          <div className="objective-card">
            <Target aria-hidden="true" />
            <div>
              <span>Primary objective</span>
              <strong>{selectedStage.primaryObjective.label}</strong>
              <small>
                Starting treasury:{" "}
                {usd(selectedStage.simulation.startingPlayerCash)} ·
                deterministic seed
              </small>
            </div>
          </div>
          <div className="stage-actions">
            <button
              className="primary-button hero-button"
              onClick={onPlay}
              disabled={!unlocked}
            >
              <Play aria-hidden="true" />{" "}
              {!unlocked
                ? "Complete prior stage"
                : canContinue
                  ? "Continue stage"
                  : complete
                    ? "Play again"
                    : "Enter workshop"}
            </button>
            {canContinue && (
              <button className="secondary-button" onClick={onRestart}>
                <RotateCcw aria-hidden="true" /> Restart stage
              </button>
            )}
          </div>
        </div>
        <aside className="stage-details">
          <div className="detail-section">
            <span className="eyebrow">Available blocks</span>
            <div className="available-blocks">
              {selectedStage.availableBlocks.map((type) => {
                const Icon = blockCatalog[type].icon;
                return (
                  <span key={type}>
                    <Icon aria-hidden="true" />
                    {blockCatalog[type].title}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="detail-section">
            <span className="eyebrow">Stage object</span>
            <div className={`reward-object ${complete ? "earned" : ""}`}>
              <span>
                <Award aria-hidden="true" />
              </span>
              <div>
                <strong>{selectedStage.reward.name}</strong>
                <p>{selectedStage.reward.description}</p>
              </div>
            </div>
          </div>
          <div className="detail-section">
            <span className="eyebrow">Best result</span>
            {score ? (
              <dl className="score-grid">
                <div>
                  <dt>Ending cash</dt>
                  <dd>{usd(score.endingCash)}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{score.timeUsed} months</dd>
                </div>
                <div>
                  <dt>Liquidity floor</dt>
                  <dd>{usd(score.minimumLiquidity)}</dd>
                </div>
                <div>
                  <dt>Blocks</dt>
                  <dd>{score.contractComplexity}</dd>
                </div>
              </dl>
            ) : (
              <div className="empty-score">
                Complete the stage to record a score.
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="panel-header">
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
      </div>
    </header>
  );
}

function InsertButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="insert-button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Insert a contract block here"
    >
      <span>
        <Plus aria-hidden="true" />
      </span>
    </button>
  );
}

function ProgramSequence({
  steps,
  path,
  issues,
  disabled,
  partyName,
  onInsert,
  onEdit,
}: {
  steps: readonly ContractStep[];
  path: SequencePath;
  issues: ReturnType<typeof validateProgram>;
  disabled: boolean;
  partyName: string;
  onInsert: (path: SequencePath, insertAt: number) => void;
  onEdit: (blockId: string) => void;
}) {
  return (
    <div className={path.length > 0 ? "nested-sequence" : "root-sequence"}>
      {steps.map((step, index) => {
        const stepIssues = issues.filter(
          (candidate) => candidate.blockId === step.id,
        );
        return (
          <Fragment key={step.id}>
            <InsertButton
              disabled={disabled}
              onClick={() => onInsert(path, index)}
            />
            <ContractBlock
              step={step}
              issues={stepIssues}
              partyName={partyName}
              onClick={() => !disabled && onEdit(step.id)}
            />
            {step.type === "if" && (
              <div className="branch-grid">
                {(["then", "else"] as const).map((branch) => {
                  const branchPath = [...path, { ifId: step.id, branch }];
                  return (
                    <section className={`branch-lane ${branch}`} key={branch}>
                      <header>
                        <span>{branch === "then" ? "Then" : "Else"}</span>
                        <small>
                          {branch === "then" ? "fact matches" : "otherwise"}
                        </small>
                      </header>
                      <ProgramSequence
                        steps={
                          branch === "then" ? step.thenSteps : step.elseSteps
                        }
                        path={branchPath}
                        issues={issues}
                        disabled={disabled}
                        partyName={partyName}
                        onInsert={onInsert}
                        onEdit={onEdit}
                      />
                    </section>
                  );
                })}
              </div>
            )}
          </Fragment>
        );
      })}
      <InsertButton
        disabled={disabled}
        onClick={() => onInsert(path, steps.length)}
      />
    </div>
  );
}

function ContractBlock({
  step,
  issues,
  partyName,
  onClick,
}: {
  step: ContractStep;
  issues: ReturnType<typeof validateProgram>;
  partyName: string;
  onClick: () => void;
}) {
  const definition = blockCatalog[step.type];
  const Icon = definition.icon;
  let detail: string;
  if (step.type === "lend") detail = `${usd(step.amount)} → ${partyName}`;
  else if (step.type === "wait") detail = `${step.months} months`;
  else if (step.type === "collect")
    detail = `${usd(step.amount)} ← ${partyName}`;
  else if (step.type === "collateral")
    detail =
      step.action === "require"
        ? `Require ${usd(step.amount)}`
        : step.action === "release"
          ? "Return pledged asset"
          : "Sell asset for recovery";
  else if (step.type === "if")
    detail = `${factLabel(step.condition.fact)} = ${step.condition.equals}`;
  else detail = "After obligations resolve";
  return (
    <button
      className={`contract-block ${step.type} ${issues.some((issue) => issue.severity === "error") ? "has-error" : ""}`}
      onClick={onClick}
    >
      <span className="block-index">{step.id.split("-").at(-1)}</span>
      <span className="block-icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="block-copy">
        <strong>{definition.title}</strong>
        <small>{detail}</small>
        {issues[0] && <em>{issues[0].message}</em>}
      </span>
      <Pencil className="edit-icon" aria-hidden="true" />
    </button>
  );
}

function BlockEditor({
  step,
  borrowerName,
  collateralMaximum,
  onChange,
  onDelete,
}: {
  step: ContractStep;
  borrowerName: string;
  collateralMaximum?: number | undefined;
  onChange: (step: ContractStep) => void;
  onDelete: () => void;
}) {
  let controls: ReactNode;
  if (step.type === "lend") {
    controls = (
      <ChoiceGroup
        label="Amount to fund"
        value={step.amount}
        choices={[80_000, 100_000]}
        format={usd}
        onChange={(amount) => onChange({ ...step, amount })}
      />
    );
  } else if (step.type === "wait") {
    controls = (
      <ChoiceGroup
        label="Time before collection"
        value={step.months}
        choices={[12, 18, 24, 30]}
        format={(value) => `${value} months`}
        onChange={(months) => onChange({ ...step, months })}
      />
    );
  } else if (step.type === "collect") {
    controls = (
      <ChoiceGroup
        label="Payment to request"
        value={step.amount}
        choices={[110_000, 120_000, 125_000, 130_000]}
        format={usd}
        onChange={(amount) => onChange({ ...step, amount })}
      />
    );
  } else if (step.type === "collateral") {
    controls =
      step.action === "require" ? (
        <ChoiceGroup
          label={`${borrowerName} pledge value`}
          value={step.amount}
          choices={Array.from(
            new Set(
              [25_000, 35_000, collateralMaximum ?? 45_000].filter(
                (amount) => !collateralMaximum || amount <= collateralMaximum,
              ),
            ),
          )}
          format={usd}
          onChange={(amount) => onChange({ ...step, amount })}
        />
      ) : (
        <div className="close-explainer">
          <Shield aria-hidden="true" />
          <p>
            {step.action === "liquidate"
              ? "This runs only on the default path and recovery is capped by the pledge, appraisal, and unpaid shortfall."
              : "This returns the pledged asset after full settlement; it creates no cash."}
          </p>
        </div>
      );
  } else if (step.type === "if") {
    controls = (
      <ConditionEditor
        step={step}
        onChange={(condition) => onChange({ ...step, condition })}
      />
    );
  } else {
    controls = (
      <div className="close-explainer">
        <Check aria-hidden="true" />
        <p>
          Close runs after the payment settles. If payment defaults, the
          contract remains defaulted so the cause stays visible.
        </p>
      </div>
    );
  }
  return (
    <div className="block-editor">
      <p>{blockCatalog[step.type].purpose}.</p>
      {controls}
      <button className="danger-button" onClick={onDelete}>
        <Trash2 aria-hidden="true" /> Delete block
      </button>
    </div>
  );
}

function ConditionEditor({
  step,
  onChange,
}: {
  step: IfStep;
  onChange: (condition: IfStep["condition"]) => void;
}) {
  const choices: Array<{
    label: string;
    condition: IfStep["condition"];
    detail: string;
  }> = [
    {
      label: "Payment defaulted",
      condition: { fact: "payment-outcome", equals: "defaulted" },
      detail: "Known after Collect runs",
    },
    {
      label: "Payment settled",
      condition: { fact: "payment-outcome", equals: "settled" },
      detail: "Known after Collect runs",
    },
    {
      label: "Risk is medium",
      condition: { fact: "borrower-risk-rating", equals: "medium" },
      detail: "Public before publishing",
    },
    {
      label: "Revenue is variable",
      condition: { fact: "revenue-certainty", equals: "variable" },
      detail: "Public before publishing",
    },
  ];
  return (
    <fieldset className="choice-group condition-picker">
      <legend>Condition picker</legend>
      <div>
        {choices.map((choice) => {
          const selected =
            choice.condition.fact === step.condition.fact &&
            choice.condition.equals === step.condition.equals;
          return (
            <button
              type="button"
              className={selected ? "selected" : ""}
              key={`${choice.condition.fact}-${choice.condition.equals}`}
              onClick={() => onChange(choice.condition)}
            >
              <span>
                <strong>{choice.label}</strong>
                <small>{choice.detail}</small>
              </span>
              {selected && <Check aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ChoiceGroup({
  label,
  value,
  choices,
  format,
  onChange,
}: {
  label: string;
  value: number;
  choices: number[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      <div>
        {choices.map((choice) => (
          <button
            type="button"
            className={choice === value ? "selected" : ""}
            key={choice}
            onClick={() => onChange(choice)}
          >
            {format(choice)}
            {choice === value && <Check aria-hidden="true" />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MobileNavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function OutcomeCard({
  state,
  stage,
  score,
  onReplay,
}: {
  state: StageRunState;
  stage: StageDefinition;
  score: StageScore;
  onReplay: () => void;
}) {
  const won = state.status === "won";
  return (
    <article className={`outcome-card ${won ? "won" : "lost"}`}>
      <span>
        {won ? (
          <Award aria-hidden="true" />
        ) : (
          <AlertTriangle aria-hidden="true" />
        )}
      </span>
      <div>
        <small>{won ? "Stage complete" : "Run ended"}</small>
        <h3>
          {won
            ? `${stage.reward.name} earned`
            : "The machine missed its objective"}
        </h3>
        <p>
          Ending cash {usd(score.endingCash)} · {score.timeUsed} months ·{" "}
          {score.contractComplexity} blocks
        </p>
      </div>
      <button onClick={onReplay}>
        <RotateCcw aria-hidden="true" /> Replay
      </button>
    </article>
  );
}

function ScenarioCard({
  projection,
}: {
  projection: OutcomeCashFlowProjection["best"];
}) {
  const tone =
    projection.paymentOutcome === "settled"
      ? "success"
      : projection.collateralRecovery > 0
        ? "warning"
        : "danger";
  return (
    <article className={`scenario-card ${tone}`}>
      <header>
        <span>{projection.scenario}</span>
        <strong>{usd(projection.endingCash)}</strong>
      </header>
      <p>
        Revenue {usd(projection.borrowerRevenue)} · {projection.paymentOutcome}
      </p>
      <small>
        {projection.branch
          ? `${projection.branch === "then" ? "Then" : "Else"} branch`
          : "Linear path"}
        {projection.collateralRecovery > 0
          ? ` · ${usd(projection.collateralRecovery)} recovered`
          : ""}
      </small>
    </article>
  );
}

function MachineNode({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  index: string;
}) {
  return (
    <div className="machine-node">
      <span className="machine-index">{index}</span>
      <span className="machine-icon">
        <Icon aria-hidden="true" />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
