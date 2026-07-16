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
  createDefaultStep,
  formatMoney,
  hasValidationErrors,
  projectCashFlows,
  summarizeProgram,
  validateProgram,
  type ContractProgram,
  type ContractStep,
  type ContractStepType,
} from "@banker-simulation/contracts";
import {
  firstYieldStage,
  getStage,
  scoreRun,
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
  insertAt: number;
}

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
};

function createEmptyDraft(contractNumber = 1): ContractProgram {
  return {
    schemaVersion: 1,
    id: `player-contract-${contractNumber}`,
    name: "Mina working-capital contract",
    steps: [],
  };
}

function nextBlockId(program: ContractProgram, type: ContractStepType): string {
  const number = program.steps.reduce((largest, step) => {
    const parsed = Number(step.id.split("-").at(-1));
    return Number.isFinite(parsed) ? Math.max(largest, parsed) : largest;
  }, 0);
  return `${type}-${number + 1}`;
}

function usd(amount: number): string {
  return formatMoney(amount, "USD");
}

function eventExplanation(event: StageEvent): string {
  if (event.type === "RunStarted")
    return `Treasury opened with ${usd(event.data.playerCash)}.`;
  if (event.type === "ContractPublished")
    return `Published “${event.data.contract.name}” for Mina to review.`;
  if (event.type === "ContractRejected") return event.data.reasons.join(" ");
  if (event.type === "ContractFunded")
    return "Mina accepted the terms and the contract became active.";
  if (event.type === "CashTransferred") {
    if (event.data.reason === "contract-funding") {
      return `Lend moved ${usd(event.data.amount)} from your treasury to Mina.`;
    }
    if (event.data.reason === "business-expense") {
      return `Mina used ${usd(event.data.amount)} to buy materials for the confirmed order.`;
    }
    if (event.data.reason === "business-revenue") {
      return `Mina's completed order produced ${usd(event.data.amount)} of payment capacity.`;
    }
    return `Collect moved ${usd(event.data.amount)} from Mina back to your treasury.`;
  }
  if (event.type === "TimeAdvanced")
    return `The calendar advanced to month ${event.data.to}.`;
  if (event.type === "BorrowerRevenueRealized") return event.data.rule;
  if (event.type === "PaymentRequested")
    return `Collect requested ${usd(event.data.amount)} from Mina.`;
  if (event.type === "PaymentSettled")
    return `Mina paid ${usd(event.data.amount)} in full.`;
  if (event.type === "PaymentDefaulted") {
    return `Mina defaulted: the payment was ${usd(event.data.shortfall)} above her available cash.`;
  }
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
        setDraft(save.draft ?? createEmptyDraft());
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

  const stage = run ? getStage(run.stageId) : firstYieldStage;
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
  const assessment = previewAssessment(draft, state);

  function beginStage(): void {
    const freshEngine = new StageEngine(firstYieldStage.simulation);
    setRun({
      schemaVersion: 1,
      stageId: firstYieldStage.id,
      events: freshEngine.events(),
    });
    setDraft(createEmptyDraft());
    setDraftHistory([]);
    setCampaign((current) => ({
      ...current,
      mostRecentStageId: firstYieldStage.id,
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
    const step = createDefaultStep(type, nextBlockId(draft, type));
    const steps = [...draft.steps];
    steps.splice(picker.insertAt, 0, step);
    replaceDraft({ ...draft, steps });
    setPicker(null);
    setEditingBlockId(step.id);
  }

  function updateBlock(updated: ContractStep): void {
    replaceDraft({
      ...draft,
      steps: draft.steps.map((step) =>
        step.id === updated.id ? updated : step,
      ),
    });
  }

  function deleteBlock(blockId: string): void {
    replaceDraft({
      ...draft,
      steps: draft.steps.filter((step) => step.id !== blockId),
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
              message: "Mina accepted. Your Lend block funded the contract.",
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
        const score = scoreRun(nextState, draft.steps.length);
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
          message: "Objective complete. The Founder's Contract Stamp is yours.",
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
    replaceDraft({ ...createEmptyDraft(), id: draft.id });
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
    setDraft(createEmptyDraft());
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
        campaign={campaign}
        canContinue={Boolean(run)}
        onBack={() => setScreen("home")}
        onPlay={run ? continueStage : beginStage}
        onRestart={beginStage}
      />
    );
  }

  if (!run || !state || !engine) {
    return (
      <main className="loading-screen">
        <h1>No active run</h1>
        <button className="primary-button" onClick={beginStage}>
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
    draft.steps.find((step) => step.id === editingBlockId) ?? null;
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
          <span className="eyebrow">Stage 01 · {stage.title}</span>
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
                  <p>{eventExplanation(event)}</p>
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
            title="One visible need"
          />
          <article className="borrower-card">
            <div className="borrower-topline">
              <div className="borrower-avatar">
                <img src="/assets/avatars/mina-neutral.webp" alt="" />
                <span className="online-dot" />
              </div>
              <div>
                <span className="eyebrow">Verified business</span>
                <h3>{stage.simulation.borrower.name}</h3>
                <p>Municipal furniture order</p>
              </div>
            </div>
            <blockquote>
              “Fund the materials now. My invoice clears at month 24.”
            </blockquote>
            <dl className="need-grid">
              <div>
                <dt>Needs now</dt>
                <dd>{usd(stage.simulation.borrower.needAmount)}</dd>
              </div>
              <div>
                <dt>Invoice at M24</dt>
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
            </dl>
          </article>

          <div className="market-note">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>What you know</strong>
              <p>
                The order is confirmed. Mina will consider up to $1,250, but the
                visible invoice only provides $1,200. A larger promise can
                default.
              </p>
            </div>
          </div>

          <div className="preview-outcome">
            <div className="section-heading">
              <h3>Draft outcome</h3>
              <span className={`status-pill ${assessment.tone}`}>
                {assessment.label}
              </span>
            </div>
            <p>{assessment.detail}</p>
            <div className="capacity-bar">
              <span className="capacity-label">Mina's M24 capacity</span>
              <div>
                <i
                  style={{
                    width: `${Math.min(100, (assessment.repayment / stage.simulation.borrower.expectedRevenue) * 100)}%`,
                  }}
                />
              </div>
              <strong>
                {usd(assessment.repayment)} /{" "}
                {usd(stage.simulation.borrower.expectedRevenue)}
              </strong>
            </div>
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
              score={scoreRun(state, draft.steps.length)}
              onReplay={beginStage}
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
            {draft.steps.map((step, index) => {
              const stepIssues = issues.filter(
                (candidate) => candidate.blockId === step.id,
              );
              return (
                <Fragment key={step.id}>
                  <InsertButton
                    disabled={activeLocked}
                    onClick={() => setPicker({ insertAt: index })}
                  />
                  <ContractBlock
                    step={step}
                    issues={stepIssues}
                    onClick={() => !activeLocked && setEditingBlockId(step.id)}
                  />
                </Fragment>
              );
            })}
            <InsertButton
              disabled={activeLocked}
              onClick={() => setPicker({ insertAt: draft.steps.length })}
            />
          </div>

          <div className="contract-preview">
            <div className="section-heading">
              <h3>Readable contract</h3>
              <span>{draft.steps.length}/4 blocks</span>
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
            {stage.availableBlocks.map((type) => {
              const definition = blockCatalog[type];
              const Icon = definition.icon;
              const alreadyUsed = draft.steps.some(
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
  const earned = campaign.rewards.includes(firstYieldStage.reward.id);
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
          <strong>
            {earned ? firstYieldStage.reward.name : "No object earned yet"}
          </strong>
        </div>
        {earned ? (
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
  campaign,
  canContinue,
  onBack,
  onPlay,
  onRestart,
}: {
  campaign: CampaignProgress;
  canContinue: boolean;
  onBack: () => void;
  onPlay: () => void;
  onRestart: () => void;
}) {
  const complete = campaign.completedStageIds.includes(firstYieldStage.id);
  const score = campaign.bestScores[firstYieldStage.id];
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
        <strong>1 / 1</strong>
      </header>
      <section className="stage-layout">
        <div className="stage-story">
          <span className="stage-number">01</span>
          <p className="eyebrow">Foundations · available now</p>
          <h1>{firstYieldStage.title}</h1>
          <h2>{firstYieldStage.subtitle}</h2>
          <p className="stage-briefing">{firstYieldStage.briefing}</p>
          <div className="objective-card">
            <Target aria-hidden="true" />
            <div>
              <span>Primary objective</span>
              <strong>{firstYieldStage.primaryObjective.label}</strong>
              <small>Starting treasury: $1,000 · deterministic seed</small>
            </div>
          </div>
          <div className="stage-actions">
            <button className="primary-button hero-button" onClick={onPlay}>
              <Play aria-hidden="true" />{" "}
              {canContinue
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
              {firstYieldStage.availableBlocks.map((type) => {
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
                <strong>{firstYieldStage.reward.name}</strong>
                <p>{firstYieldStage.reward.description}</p>
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

function ContractBlock({
  step,
  issues,
  onClick,
}: {
  step: ContractStep;
  issues: ReturnType<typeof validateProgram>;
  onClick: () => void;
}) {
  const definition = blockCatalog[step.type];
  const Icon = definition.icon;
  let detail: string;
  if (step.type === "lend") detail = `${usd(step.amount)} → Mina`;
  else if (step.type === "wait") detail = `${step.months} months`;
  else if (step.type === "collect") detail = `${usd(step.amount)} ← Mina`;
  else detail = "After payment resolves";
  return (
    <button
      className={`contract-block ${step.type} ${issues.some((issue) => issue.severity === "error") ? "has-error" : ""}`}
      onClick={onClick}
    >
      <span className="block-index">
        {step.type === "lend"
          ? "01"
          : step.type === "wait"
            ? "02"
            : step.type === "collect"
              ? "03"
              : "04"}
      </span>
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
  onChange,
  onDelete,
}: {
  step: ContractStep;
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
  score,
  onReplay,
}: {
  state: StageRunState;
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
            ? "Founder's Contract Stamp earned"
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

function previewAssessment(
  program: ContractProgram,
  state: StageRunState | null,
): { tone: FeedbackTone; label: string; detail: string; repayment: number } {
  const errors = validateProgram(program).filter(
    (issue) => issue.severity === "error",
  );
  const collect = program.steps.find((step) => step.type === "collect");
  const repayment = collect?.type === "collect" ? collect.amount : 0;
  if (errors.length > 0)
    return {
      tone: "info",
      label: "Incomplete",
      detail: "Complete the four-block sequence to test Mina's response.",
      repayment,
    };
  const lend = program.steps.find((step) => step.type === "lend");
  const wait = program.steps.find((step) => step.type === "wait");
  if (
    lend?.type !== "lend" ||
    wait?.type !== "wait" ||
    collect?.type !== "collect"
  )
    return {
      tone: "info",
      label: "Incomplete",
      detail: "Add the missing financial instructions.",
      repayment,
    };
  const dueMonth = (state?.time ?? 0) + wait.months;
  const borrower = firstYieldStage.simulation.borrower;
  if (lend.amount < borrower.minimumFunding)
    return {
      tone: "danger",
      label: "Rejected",
      detail: "The amount cannot fund Mina's confirmed order.",
      repayment,
    };
  if (dueMonth < borrower.fundsAvailableAt)
    return {
      tone: "danger",
      label: "Rejected",
      detail: `Collection arrives before Mina has revenue in month ${borrower.fundsAvailableAt}.`,
      repayment,
    };
  if (repayment > borrower.maximumAcceptedRepayment)
    return {
      tone: "danger",
      label: "Rejected",
      detail: "The requested return is above Mina's published limit.",
      repayment,
    };
  if (repayment > borrower.expectedRevenue)
    return {
      tone: "danger",
      label: "Default risk",
      detail: `${usd(repayment - borrower.expectedRevenue)} is not covered by the visible invoice. Mina accepts, but cannot settle in this scenario.`,
      repayment,
    };
  if (repayment < firstYieldStage.primaryObjective.amount)
    return {
      tone: "warning",
      label: "Below target",
      detail:
        "Mina can settle this contract, but the ending cash misses the stage objective.",
      repayment,
    };
  return {
    tone: "success",
    label: "Viable",
    detail:
      "Mina can accept, the invoice covers payment, and your treasury reaches the objective.",
    repayment,
  };
}
