import {
  CalendarDays,
  Check,
  CircleDollarSign,
  GripVertical,
  Info,
  Landmark,
  LogOut,
  Menu,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Settings,
  SkipForward,
  Trash2,
  Target,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatGameDate } from "./campaign-run.ts";
import { localize, playerLabel } from "./campaign-stages.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "./game-clock.ts";
import type { Locale } from "./i18n.tsx";
import {
  MarketBuilderCanvas,
  type BuilderInsertTarget,
} from "./MarketBuilderCanvas.tsx";
import {
  constant,
  humanizeValue,
  operation,
  recipeAtPath,
  recipeLabel,
  replaceRecipeAtPath,
  value,
  VARIABLE_NAME_CARDS,
  type RecipeOperator,
  type RecipePath,
  type ValueRecipe,
} from "./market-recipe.ts";
import {
  acceptRequest,
  advanceWorldDay,
  BUILDER_VARIABLES,
  contractFitsDemand,
  decideRequestOutcome,
  emptyWorld,
  evaluateTermsWithVariables,
  fileRequest,
  MARKET_START_DATE,
  outstandingPrincipal,
  pendingRequestCount,
  postContract,
  rejectRequest,
  staticContractTerms,
  updateContract,
  withdrawContract,
  type ComparatorOp,
  type ContractOffer,
  type DecisionOutcome,
  type Demand,
  type MarketBuilderNode,
  type MarketWorld,
  type WorldEvent,
} from "./market-world.ts";
import { messagesFor, type Messages } from "./messages/index.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import "./campaign-stage.css";
import "./market.css";

const MARKET_MS_PER_DAY = 1_200;

type View = "map" | "demand" | "contract" | "builder";
type BuilderAddableNode =
  "transfer" | "wait" | "variable" | "condition" | "decision";

const NODE_IMAGES = {
  start: "/assets/stage-one/nodes/start.webp",
  transfer: "/assets/stage-one/nodes/transfer.webp",
  wait: "/assets/stage-one/nodes/wait.webp",
  condition: "/assets/campaign/nodes/condition.webp",
  variable: "/assets/campaign/nodes/reserve.webp",
  decision: "/assets/campaign/nodes/settle.webp",
  end: "/assets/stage-one/nodes/end.webp",
} as const;

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

/** The requester every builder preview is evaluated against. */
const SAMPLE_REQUESTER: Record<string, number> = {
  amount: 100,
  days: 90,
  income: 3000,
  age: 40,
  cash: 1000,
};

/** Formulas each summary column shows, joined across the stack. */
function draftExpressions(nodes: readonly MarketBuilderNode[]): {
  lend: string;
  term: string;
  repay: string;
} {
  const collect = (
    filter: (node: MarketBuilderNode) => boolean,
    read: (node: MarketBuilderNode) => ValueRecipe | undefined,
  ): string =>
    nodes
      .filter(filter)
      .map((node) => recipeLabel(read(node)))
      .join(" + ");
  return {
    lend: collect(
      (node) => node.kind === "transfer" && node.senderId === "player",
      (node) => node.amount,
    ),
    term: collect(
      (node) => node.kind === "wait",
      (node) => node.days,
    ),
    repay: collect(
      (node) => node.kind === "transfer" && node.recipientId === "player",
      (node) => node.amount,
    ),
  };
}

/** Variable names available to a node at `index` in the stack. */
function namesBeforeIndex(
  nodes: readonly MarketBuilderNode[],
  index: number,
): string[] {
  const names: string[] = [...BUILDER_VARIABLES];
  for (const node of nodes.slice(0, index))
    if (node.kind === "variable" && node.variableName)
      names.push(node.variableName);
  return names;
}

function validateDraft(
  nodes: readonly MarketBuilderNode[],
  m: Messages,
): string | null {
  const t = m.marketSim;
  const hasNode = (
    path: readonly MarketBuilderNode[],
    predicate: (node: MarketBuilderNode) => boolean,
  ): boolean =>
    path.some(
      (node) =>
        predicate(node) ||
        (node.kind === "condition" &&
          (hasNode(node.thenSteps ?? [], predicate) ||
            hasNode(node.elseSteps ?? [], predicate))),
    );
  if (
    !hasNode(
      nodes,
      (node) => node.kind === "transfer" && node.senderId === "player",
    )
  )
    return t.needOutgoing;
  if (!hasNode(nodes, (node) => node.kind === "wait")) return t.needWait;
  if (
    !hasNode(
      nodes,
      (node) => node.kind === "transfer" && node.recipientId === "player",
    )
  )
    return t.needIncoming;

  const validateRecipe = (
    recipe: ValueRecipe | undefined,
    names: readonly string[],
  ): string | null => {
    if (!recipe) return "Complete every value slot.";
    if (recipe.kind === "value")
      return names.includes(recipe.value)
        ? null
        : `"${recipe.value}" is not available on this path.`;
    if (recipe.kind === "constant") return null;
    return (
      validateRecipe(recipe.left, names) ?? validateRecipe(recipe.right, names)
    );
  };
  const validatePath = (
    path: readonly MarketBuilderNode[],
    scope: readonly string[],
  ): string | null => {
    const names = [...scope];
    for (const node of path) {
      if (node.kind === "transfer") {
        const issue = validateRecipe(node.amount, names);
        if (issue) return m.builder.nodeIssue(m.nodes.transfer.title, issue);
      } else if (node.kind === "wait") {
        const issue = validateRecipe(node.days, names);
        if (issue) return m.builder.nodeIssue(m.nodes.wait.title, issue);
      } else if (node.kind === "variable") {
        const name = node.variableName ?? "";
        if (
          !VARIABLE_NAME_CARDS.includes(
            name as (typeof VARIABLE_NAME_CARDS)[number],
          )
        )
          return t.conditionNeedsVariable;
        if (names.includes(name)) return t.variableReserved(name);
        const issue = validateRecipe(node.amount, names);
        if (issue) return m.builder.nodeIssue(m.nodes.variable.title, issue);
        names.push(name);
      } else if (node.kind === "condition" || node.kind === "decision") {
        const issue =
          validateRecipe(node.left, names) ?? validateRecipe(node.right, names);
        if (issue) return m.builder.nodeIssue(m.nodes[node.kind].title, issue);
        if (node.kind === "condition") {
          const thenIssue = validatePath(node.thenSteps ?? [], names);
          const elseIssue = validatePath(node.elseSteps ?? [], names);
          if (thenIssue ?? elseIssue) return thenIssue ?? elseIssue;
        }
      }
    }
    return null;
  };
  const recipeIssue = validatePath(nodes, BUILDER_VARIABLES);
  if (recipeIssue) return recipeIssue;
  if (!evaluateTermsWithVariables(nodes, SAMPLE_REQUESTER))
    return t.brokenPreview;
  return null;
}

function defaultDraftNodes(demand?: Demand): MarketBuilderNode[] {
  if (demand)
    // Drafted from a specific person: fixed terms that fit them exactly.
    return [
      { id: "start-fixed", kind: "start" },
      {
        id: "out-seed",
        kind: "transfer",
        senderId: "player",
        recipientId: "customer",
        amount: constant(demand.amount),
      },
      {
        id: "wait-seed",
        kind: "wait",
        days: constant(demand.payableAfterDays),
      },
      {
        id: "in-seed",
        kind: "transfer",
        senderId: "customer",
        recipientId: "player",
        amount: constant(demand.maxRepayment),
      },
    ];
  // A fresh contract showcases dynamic terms: lend whatever is asked and
  // price the margin by how long the requester needs.
  return [
    { id: "start-fixed", kind: "start" },
    {
      id: "out-seed",
      kind: "transfer",
      senderId: "player",
      recipientId: "customer",
      amount: value("amount"),
    },
    { id: "wait-seed", kind: "wait", days: value("days") },
    {
      id: "cond-seed",
      kind: "condition",
      left: value("days"),
      comparator: ">",
      right: constant(180),
      thenSteps: [
        {
          id: "rate-long",
          kind: "variable",
          variableName: "rate",
          amount: constant(1.1),
        },
        {
          id: "in-long",
          kind: "transfer",
          senderId: "customer",
          recipientId: "player",
          amount: operation("multiply", value("amount"), value("rate")),
        },
      ],
      elseSteps: [
        {
          id: "rate-short",
          kind: "variable",
          variableName: "rate",
          amount: constant(1.05),
        },
        {
          id: "in-short",
          kind: "transfer",
          senderId: "customer",
          recipientId: "player",
          amount: operation("multiply", value("amount"), value("rate")),
        },
      ],
    },
  ];
}

function withoutEndNodes(
  nodes: readonly MarketBuilderNode[],
): MarketBuilderNode[] {
  return nodes
    .filter((node) => node.kind !== "end")
    .map((node) =>
      node.kind === "condition"
        ? {
            ...node,
            thenSteps: withoutEndNodes(node.thenSteps ?? []),
            elseSteps: withoutEndNodes(node.elseSteps ?? []),
          }
        : node,
    );
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
  const repaidLoans = world.loans.filter((loan) => loan.status === "repaid").length;
  const stageComplete = Boolean(
    stage && repaidLoans >= stage.repaidLoans && world.cash >= stage.cashTarget,
  );

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
    if (accept) {
      const principal =
        selectedContract.requests.find((request) => request.id === requestId)
          ?.principal ?? 0;
      setWorld((current) => {
        const result = acceptRequest(current, selectedContract.id, requestId);
        if (result.failure === "insufficient-cash") {
          setNotice(t.insufficientCash(principal));
          return current;
        }
        return result.world;
      });
    } else {
      setWorld((current) =>
        rejectRequest(current, selectedContract.id, requestId),
      );
    }
  }

  return (
    <main className="cs-shell mk-shell">
      <div className="mk-hud">
        <div className="mk-hud-actions">
          <button
            className="mk-hud-icon"
            onClick={() => setHudPanel((current) => current === "menu" ? null : "menu")}
            aria-label="Menu"
          >
            <Menu aria-hidden="true" />
          </button>
          <button
            className="mk-hud-icon"
            onClick={() => setHudPanel((current) => current === "objective" ? null : "objective")}
            aria-label="Objective"
          >
            <Target aria-hidden="true" />
          </button>
        </div>
        <div className="mk-mini-balance" aria-label={m.balance.assetValues}>
          <span title={m.balance.cash}><CircleDollarSign aria-hidden="true" />${world.cash.toLocaleString()}</span>
          <span title={m.balance.totalAssets}><Landmark aria-hidden="true" />${(world.cash + deployed).toLocaleString()}</span>
        </div>
      </div>

      {hudPanel === "menu" && (
        <div className="mk-hud-panel mk-menu-panel" role="menu" aria-label="Menu">
          <button onClick={onBack} aria-label="Quit" role="menuitem"><LogOut aria-hidden="true" /></button>
          <button onClick={() => setHudPanel("objective")} aria-label="Information" role="menuitem"><Info aria-hidden="true" /></button>
          <button onClick={() => setHudPanel(null)} aria-label="Settings" role="menuitem"><Settings aria-hidden="true" /></button>
        </div>
      )}

      {hudPanel === "objective" && stage && (
        <section className="mk-objective-panel" aria-label="Stage objective">
          <button className="mk-objective-close" onClick={() => setHudPanel(null)} aria-label="Close"><X aria-hidden="true" /></button>
          <strong>{localize(stage.subtitle, locale)}</strong>
          <p>{localize(stage.briefing, locale)}</p>
          <small>{localize(stage.focus, locale)} · {repaidLoans}/{stage.repaidLoans}</small>
          {stageComplete && onComplete && (
            <button className="mk-stage-complete" onClick={onComplete}>
              <Check aria-hidden="true" /> {m.mine.completeStage(String(stage.number).padStart(2, "0"))}
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
            onTapDemand={(id) => openDemandDetail(id, "map")}
            onTapContract={openContractDetail}
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

/* ------------------------------------------------------------------ */
/* Pixi market stage                                                   */
/* ------------------------------------------------------------------ */

function MarketStageView({
  world,
  onTapDemand,
  onTapContract,
}: {
  world: MarketWorld;
  onTapDemand: (demandId: string) => void;
  onTapContract: (contractId: string) => void;
}) {
  return (
    <div className="mk-market-map" aria-label="Market demands">
      {world.demands
        .filter((demand) => demand.status === "open")
        .map((demand) => (
          <button
            key={demand.id}
            className="mk-demand-pin"
            style={{ left: `${demand.x * 100}%`, top: `${demand.y * 100}%` }}
            onClick={() => onTapDemand(demand.id)}
          >
            <img src={demand.actor.image} alt="" />
            <small>${demand.amount}</small>
          </button>
        ))}
      {world.contracts.map((contract) => (
        <button
          key={contract.id}
          className="mk-contract-pin"
          style={{ left: `${contract.x * 100}%`, top: `${contract.y * 100}%` }}
          onClick={() => onTapContract(contract.id)}
          aria-label="Open contract"
        >
          <b>$</b>
          {pendingRequestCount(contract) > 0 && (
            <span className="mk-contract-request-count">
              {pendingRequestCount(contract) > 9
                ? "9+"
                : pendingRequestCount(contract)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Demand detail                                                       */
/* ------------------------------------------------------------------ */

function DemandDetail({
  demand,
  locale,
  onDraft,
}: {
  demand: Demand;
  locale: Locale;
  onDraft?: (() => void) | undefined;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const actor = demand.actor;
  return (
    <section className="cs-customer-detail mk-detail-scroll">
      <div className="cs-profile-hero">
        <img src={actor.image} alt="" />
        <div>
          <small>
            {actor.gender === "female" ? t.genderFemale : t.genderMale} ·{" "}
            {t.ageYears(actor.age)}
          </small>
          <h1>{actor.name}</h1>
          <p>
            {actor.occupation
              ? localize(actor.occupation, locale)
              : t.unemployed}
          </p>
        </div>
      </div>
      <dl className="cs-profile-facts">
        <div>
          <dt>{t.factGender}</dt>
          <dd>{actor.gender === "female" ? t.genderFemale : t.genderMale}</dd>
        </div>
        <div>
          <dt>{t.factAge}</dt>
          <dd>{t.ageYears(actor.age)}</dd>
        </div>
        <div>
          <dt>{t.factOccupation}</dt>
          <dd>
            {actor.occupation
              ? localize(actor.occupation, locale)
              : t.unemployed}
          </dd>
        </div>
        <div>
          <dt>{t.factIncome}</dt>
          <dd>
            {actor.monthlyIncome > 0 ? t.perMonth(actor.monthlyIncome) : "—"}
          </dd>
        </div>
      </dl>
      <article className="cs-need-card">
        <span>{t.demandBadge}</span>
        <h2>{t.demandNeedTitle}</h2>
        <div>
          <p>
            <small>{m.customer.neededNow}</small>
            <strong>{t.needsNow(demand.amount)}</strong>
          </p>
          <p>
            <small>{m.customer.returnLabel}</small>
            <strong>{t.payableAfter(demand.payableAfterDays)}</strong>
          </p>
          <p>
            <small>{m.customer.termsLabel}</small>
            <strong>{t.maxRepayment(demand.maxRepayment)}</strong>
          </p>
        </div>
      </article>
      {onDraft && (
        <button className="cs-build-button mk-demand-cta" onClick={onDraft}>
          <Send aria-hidden="true" /> {t.draftContract}
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Contract detail with the request grid                               */
/* ------------------------------------------------------------------ */

function ContractDetail({
  contract,
  locale,
  onDecide,
  onOpenActor,
  onEdit,
}: {
  contract: ContractOffer;
  locale: Locale;
  onDecide: (requestId: string, accept: boolean) => void;
  onOpenActor: (demandId: string) => void;
  onEdit: () => void;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const pending = contract.requests.filter(
    (request) => request.status === "pending",
  );
  const statics = staticContractTerms(contract.builderNodes);
  const formulas = draftExpressions(contract.builderNodes);
  return (
    <div className="mk-detail-scroll" style={{ position: "relative" }}>
      <article className="mk-contract-summary">
        <div>
          <small>{t.lends}</small>
          <strong className={statics ? "" : "formula"}>
            {statics ? `$${statics.principal.toLocaleString()}` : formulas.lend}
          </strong>
        </div>
        <div>
          <small>{t.termLabel}</small>
          <strong className={statics ? "" : "formula"}>
            {statics ? t.daysCount(statics.termDays) : formulas.term}
          </strong>
        </div>
        <div>
          <small>{t.asksBack}</small>
          <strong className={statics ? "" : "formula"}>
            {statics
              ? `$${statics.repayment.toLocaleString()}`
              : formulas.repay}
          </strong>
        </div>
      </article>
      <div className="mk-request-heading">
        <h2>{t.requestsTitle}</h2>
        <b>{t.pendingCount(pending.length)}</b>
      </div>
      {pending.length > 0 ? (
        <div className="mk-request-grid">
          {pending.map((request) => (
            <div className="mk-request-cell" key={request.id}>
              <button
                className="mk-request-portrait"
                onClick={() => onOpenActor(request.demandId)}
                aria-label={request.actor.name}
              >
                <img src={request.actor.image} alt="" />
              </button>
              <strong>{request.actor.name}</strong>
              <em>
                {t.requestTerms(
                  request.principal,
                  request.repayment,
                  request.termDays,
                )}
              </em>
              <span className="mk-request-actions">
                <button
                  className="accept"
                  onClick={() => onDecide(request.id, true)}
                  aria-label={`${t.accept} · ${request.actor.name}`}
                >
                  <Check aria-hidden="true" />
                </button>
                <button
                  className="reject"
                  onClick={() => onDecide(request.id, false)}
                  aria-label={`${t.reject} · ${request.actor.name}`}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mk-request-empty">{t.noRequests}</p>
      )}
      <button className="mk-fab" onClick={onEdit} aria-label={t.editContract}>
        <Pencil aria-hidden="true" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Node-graph contract builder for market offers                       */
/* ------------------------------------------------------------------ */

interface BuilderNodeContext {
  node: MarketBuilderNode;
  names: string[];
}

function findBuilderNodeContext(
  path: readonly MarketBuilderNode[],
  id: string | null,
  inherited: readonly string[] = BUILDER_VARIABLES,
): BuilderNodeContext | null {
  if (!id) return null;
  const names = [...inherited];
  for (const node of path) {
    if (node.id === id) return { node, names: [...names] };
    if (node.kind === "condition") {
      const thenMatch = findBuilderNodeContext(node.thenSteps ?? [], id, names);
      if (thenMatch) return thenMatch;
      const elseMatch = findBuilderNodeContext(node.elseSteps ?? [], id, names);
      if (elseMatch) return elseMatch;
    }
    if (node.kind === "variable" && node.variableName)
      names.push(node.variableName);
  }
  return null;
}

function descendantCount(node: MarketBuilderNode): number {
  if (node.kind !== "condition") return 0;
  const countPath = (path: readonly MarketBuilderNode[]): number =>
    path.reduce(
      (total, child) => total + 1 + descendantCount(child),
      0,
    );
  return countPath(node.thenSteps ?? []) + countPath(node.elseSteps ?? []);
}

function MarketBuilder({
  nodes,
  locale,
  selectedNodeId,
  editing,
  onSelectNode,
  onChangeNodes,
  onSubmit,
  onWithdraw,
}: {
  nodes: MarketBuilderNode[];
  locale: Locale;
  selectedNodeId: string | null;
  editing: boolean;
  onSelectNode: (id: string | null) => void;
  onChangeNodes: (nodes: MarketBuilderNode[]) => void;
  onSubmit: () => void;
  onWithdraw?: (() => void) | undefined;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const preview = useMemo(
    () => evaluateTermsWithVariables(nodes, SAMPLE_REQUESTER),
    [nodes],
  );
  const issue = validateDraft(nodes, m);
  const [insertMenu, setInsertMenu] = useState<{
    target: BuilderInsertTarget;
    x: number;
    y: number;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MarketBuilderNode | null>(
    null,
  );
  const selectedContext = findBuilderNodeContext(nodes, selectedNodeId);
  const partyName = (id: string | undefined): string =>
    id === "player" ? playerLabel(locale) : t.borrower;

  function makeNode(
    kind: BuilderAddableNode,
    suffix: string,
  ): MarketBuilderNode {
    const id = `${kind}-${Date.now()}-${suffix}`;
    if (kind === "wait") return { id, kind, days: value("days") };
    if (kind === "variable")
      return { id, kind, variableName: "rate", amount: constant(1.05) };
    if (kind === "condition")
      return {
        id,
        kind,
        left: value("income"),
        comparator: ">=",
        right: constant(3000),
        thenSteps: [],
        elseSteps: [],
      };
    if (kind === "decision")
      return {
        id,
        kind,
        left: value("income"),
        comparator: "<",
        right: constant(2000),
        thenOutcome: "reject",
        elseOutcome: "draft",
      };
    return {
      id,
      kind,
      senderId: "player",
      recipientId: "customer",
      amount: value("amount"),
    };
  }

  function insertNode(
    target: BuilderInsertTarget,
    kind: BuilderAddableNode,
  ): void {
    const node = makeNode(kind, `${target.ownerId ?? "root"}-${target.index}`);
    const insertAt = (
      path: readonly MarketBuilderNode[],
    ): MarketBuilderNode[] => {
      if (target.ownerId === null)
        return [
          ...path.slice(0, target.index),
          node,
          ...path.slice(target.index),
        ];
      return path.map((candidate) => {
        if (candidate.id === target.ownerId && candidate.kind === "condition") {
          const branch = target.branch ?? "thenSteps";
          const branchPath = candidate[branch] ?? [];
          return {
            ...candidate,
            [branch]: [
              ...branchPath.slice(0, target.index),
              node,
              ...branchPath.slice(target.index),
            ],
          };
        }
        if (candidate.kind !== "condition") return candidate;
        return {
          ...candidate,
          thenSteps: insertAt(candidate.thenSteps ?? []),
          elseSteps: insertAt(candidate.elseSteps ?? []),
        };
      });
    };
    onChangeNodes(insertAt(nodes));
    onSelectNode(node.id);
    setInsertMenu(null);
  }

  // Kept for the hidden semantic fallback while the canvas is mounted.
  function addNode(kind: BuilderAddableNode): void {
    insertNode(
      { ownerId: null, branch: null, index: nodes.length, terminal: true },
      kind,
    );
  }

  function updateNode(id: string, patch: Partial<MarketBuilderNode>): void {
    const updatePath = (
      path: readonly MarketBuilderNode[],
    ): MarketBuilderNode[] =>
      path.map((node) => {
        if (node.id === id) return { ...node, ...patch };
        if (node.kind !== "condition") return node;
        return {
          ...node,
          thenSteps: updatePath(node.thenSteps ?? []),
          elseSteps: updatePath(node.elseSteps ?? []),
        };
      });
    onChangeNodes(updatePath(nodes));
  }

  function deleteNode(id: string): void {
    const deleteFromPath = (
      path: readonly MarketBuilderNode[],
    ): MarketBuilderNode[] =>
      path
        .filter((node) => node.id !== id)
        .map((node) =>
          node.kind !== "condition"
            ? node
            : {
                ...node,
                thenSteps: deleteFromPath(node.thenSteps ?? []),
                elseSteps: deleteFromPath(node.elseSteps ?? []),
              },
        );
    onChangeNodes(deleteFromPath(nodes));
    onSelectNode(null);
  }

  function requestDelete(node: MarketBuilderNode): void {
    if (descendantCount(node) > 0) setPendingDelete(node);
    else deleteNode(node.id);
  }

  function addToBranch(
    conditionId: string,
    branch: "thenSteps" | "elseSteps",
    kind: BuilderAddableNode,
  ): void {
    const node = makeNode(kind, `${conditionId}-${branch}`);
    const append = (path: readonly MarketBuilderNode[]): MarketBuilderNode[] =>
      path.map((candidate) => {
        if (candidate.id === conditionId && candidate.kind === "condition")
          return {
            ...candidate,
            [branch]: [...(candidate[branch] ?? []), node],
          };
        if (candidate.kind !== "condition") return candidate;
        return {
          ...candidate,
          thenSteps: append(candidate.thenSteps ?? []),
          elseSteps: append(candidate.elseSteps ?? []),
        };
      });
    onChangeNodes(append(nodes));
    onSelectNode(node.id);
  }

  function outcomeName(outcome: DecisionOutcome | undefined): string {
    if (outcome === "accept") return t.accept;
    if (outcome === "reject") return t.reject;
    return t.outcomeDraft;
  }

  function nodeLabel(node: MarketBuilderNode): string {
    if (node.kind === "start") return m.nodeLabels.startActive;
    if (node.kind === "end") return m.nodeLabels.endResolved;
    if (node.kind === "wait") return `⏱ ${recipeLabel(node.days)}`;
    if (node.kind === "variable")
      return `${humanizeValue(node.variableName ?? "rate")} = ${recipeLabel(node.amount)}`;
    if (node.kind === "condition")
      return `if ${recipeLabel(node.left)} ${node.comparator ?? ">"} ${recipeLabel(node.right)}`;
    if (node.kind === "decision")
      return `if ${recipeLabel(node.left)} ${node.comparator ?? ">"} ${recipeLabel(node.right)} → ${outcomeName(node.thenOutcome)} / ${outcomeName(node.elseOutcome)}`;
    return `${partyName(node.senderId)} → ${partyName(node.recipientId)} · ${recipeLabel(node.amount)}`;
  }

  return (
    <section className="cs-builder mk-detail-scroll">
      <div className="cs-builder-guide">
        <div>
          <span>{t.builderSummary}</span>
          <p>
            {preview
              ? t.previewLine(
                  preview.principal,
                  preview.termDays,
                  preview.repayment,
                )
              : t.brokenPreview}
          </p>
        </div>
      </div>

      <div className="mk-graph-builder">
        <MarketBuilderCanvas
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          labels={{
            start: m.nodes.start.title,
            transfer: m.nodes.transfer.title,
            wait: m.nodes.wait.title,
            variable: m.nodes.variable.title,
            condition: m.nodes.condition.title,
            decision: m.nodes.decision.title,
            end: m.nodes.end.title,
            true: t.conditionThen,
            false: t.conditionElse,
            fit: "Fit graph",
          }}
          nodeLabel={nodeLabel}
          onSelectNode={onSelectNode}
          onRequestInsert={(target, position) =>
            setInsertMenu({ target, ...position })
          }
        />
        {insertMenu && (
          <div
            className="mk-node-picker"
            style={{ left: insertMenu.x, top: insertMenu.y }}
            role="dialog"
            aria-label="Choose a node to insert"
          >
            <header>
              <strong>Add node</strong>
              <button type="button" onClick={() => setInsertMenu(null)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <div>
              {(
                [
                  "transfer",
                  "wait",
                  "variable",
                  ...(insertMenu.target.terminal
                    ? (["condition", "decision"] as const)
                    : []),
                ] as BuilderAddableNode[]
              ).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => insertNode(insertMenu.target, kind)}
                >
                  <span aria-hidden="true">
                    {kind === "transfer"
                      ? "⇄"
                      : kind === "wait"
                        ? "◷"
                        : kind === "variable"
                          ? "ƒ"
                          : "◇"}
                  </span>
                  {m.nodes[kind].title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedContext && selectedContext.node.kind !== "start" && (
        <MarketNodeInspector
          node={selectedContext.node}
          names={selectedContext.names}
          locale={locale}
          onUpdate={updateNode}
          onDelete={() => requestDelete(selectedContext.node)}
        />
      )}

      <div
        className="cs-contract-stack mk-legacy-builder"
        role="application"
        aria-label={m.builder.blockStack}
      >
        {nodes.map((node, nodeIndex) => {
          const fixed = node.kind === "start" || node.kind === "end";
          const selected = selectedNodeId === node.id;
          return (
            <div className="cs-stack-entry" key={node.id}>
              {nodeIndex > 0 && (
                <div className="cs-snap-join" aria-hidden="true" />
              )}
              <article
                className={`cs-contract-block type-${node.kind}${selected ? " selected" : ""}`}
              >
                <div
                  className="cs-block-main"
                  onClick={() =>
                    !fixed && onSelectNode(selected ? null : node.id)
                  }
                  role={!fixed ? "button" : undefined}
                  tabIndex={!fixed ? 0 : undefined}
                  aria-expanded={!fixed ? selected : undefined}
                  onKeyDown={(event) => {
                    if (
                      !fixed &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onSelectNode(selected ? null : node.id);
                    }
                  }}
                >
                  <GripVertical aria-hidden="true" />
                  <span className="cs-block-image">
                    <img src={NODE_IMAGES[node.kind]} alt="" />
                  </span>
                  <span className="cs-block-copy">
                    <small>
                      {fixed
                        ? m.builder.contractBoundary
                        : `${m.builder.clause} ${nodeIndex}`}
                    </small>
                    <strong>{m.nodes[node.kind].title}</strong>
                    <i>{nodeLabel(node)}</i>
                  </span>
                </div>
                {selected && !fixed && (
                  <div className="cs-node-inspector">
                    <header>
                      <strong>{m.nodes[node.kind].title}</strong>
                      <button
                        onClick={() => deleteNode(node.id)}
                        aria-label={m.inspector.deleteNode}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </header>
                    {node.kind === "transfer" && (
                      <div className="cs-parameter-grid">
                        <label>
                          <span>{m.inspector.sender}</span>
                          <select
                            value={node.senderId}
                            onChange={(event) =>
                              updateNode(node.id, {
                                senderId: event.target.value,
                                recipientId:
                                  event.target.value === "player"
                                    ? "customer"
                                    : "player",
                              })
                            }
                          >
                            <option value="player">
                              {playerLabel(locale)}
                            </option>
                            <option value="customer">{t.borrower}</option>
                          </select>
                        </label>
                        <label>
                          <span>{m.inspector.transferRecipient}</span>
                          <select
                            value={node.recipientId}
                            onChange={(event) =>
                              updateNode(node.id, {
                                recipientId: event.target.value,
                                senderId:
                                  event.target.value === "player"
                                    ? "customer"
                                    : "player",
                              })
                            }
                          >
                            <option value="player">
                              {playerLabel(locale)}
                            </option>
                            <option value="customer">{t.borrower}</option>
                          </select>
                        </label>
                        <RecipeField
                          label={m.inspector.amount}
                          value={node.amount ?? value("amount")}
                          names={namesBeforeIndex(nodes, nodeIndex)}
                          onChange={(amount) => updateNode(node.id, { amount })}
                        />
                      </div>
                    )}
                    {node.kind === "wait" && (
                      <div className="cs-parameter-grid">
                        <RecipeField
                          label={m.inspector.waitDays}
                          value={node.days ?? value("days")}
                          names={namesBeforeIndex(nodes, nodeIndex)}
                          onChange={(days) => updateNode(node.id, { days })}
                        />
                      </div>
                    )}
                    {node.kind === "variable" && (
                      <div className="cs-parameter-grid">
                        <VariableNameCards
                          value={node.variableName ?? "rate"}
                          onChange={(variableName) =>
                            updateNode(node.id, { variableName })
                          }
                        />
                        <RecipeField
                          label="Set value"
                          value={node.amount ?? constant(1)}
                          names={namesBeforeIndex(nodes, nodeIndex)}
                          onChange={(amount) => updateNode(node.id, { amount })}
                        />
                      </div>
                    )}
                    {node.kind === "condition" && (
                      <div className="cs-parameter-grid">
                        <div className="mk-condition-row wide">
                          <RecipeField
                            label={t.conditionIf}
                            value={node.left ?? value("income")}
                            names={namesBeforeIndex(nodes, nodeIndex)}
                            onChange={(left) => updateNode(node.id, { left })}
                          />
                          <label className="mk-comparator">
                            <span aria-hidden="true">·</span>
                            <select
                              value={node.comparator ?? ">"}
                              aria-label={t.conditionIf}
                              onChange={(event) =>
                                updateNode(node.id, {
                                  comparator: event.target
                                    .value as ComparatorOp,
                                })
                              }
                            >
                              {[">", ">=", "<", "<=", "=="].map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                          </label>
                          <RecipeField
                            label="&nbsp;"
                            value={node.right ?? constant(1)}
                            names={namesBeforeIndex(nodes, nodeIndex)}
                            onChange={(right) => updateNode(node.id, { right })}
                          />
                        </div>
                        <BranchLane
                          title="✓ TRUE"
                          tone="true"
                          nodes={node.thenSteps ?? []}
                          names={namesBeforeIndex(nodes, nodeIndex)}
                          selectedNodeId={selectedNodeId}
                          onSelectNode={onSelectNode}
                          onUpdate={updateNode}
                          onDelete={deleteNode}
                          ownerId={node.id}
                          branch="thenSteps"
                          onAdd={addToBranch}
                        />
                        <BranchLane
                          title="! FALSE"
                          tone="false"
                          nodes={node.elseSteps ?? []}
                          names={namesBeforeIndex(nodes, nodeIndex)}
                          selectedNodeId={selectedNodeId}
                          onSelectNode={onSelectNode}
                          onUpdate={updateNode}
                          onDelete={deleteNode}
                          ownerId={node.id}
                          branch="elseSteps"
                          onAdd={addToBranch}
                        />
                      </div>
                    )}
                    {node.kind === "decision" && (
                      <div className="cs-parameter-grid">
                        <div className="mk-condition-row wide">
                          <RecipeField
                            label={t.conditionIf}
                            value={node.left ?? value("income")}
                            names={namesBeforeIndex(nodes, nodeIndex)}
                            onChange={(left) => updateNode(node.id, { left })}
                          />
                          <label className="mk-comparator">
                            <span aria-hidden="true">·</span>
                            <select
                              value={node.comparator ?? ">"}
                              aria-label={t.conditionIf}
                              onChange={(event) =>
                                updateNode(node.id, {
                                  comparator: event.target
                                    .value as ComparatorOp,
                                })
                              }
                            >
                              {[">", ">=", "<", "<=", "=="].map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                          </label>
                          <RecipeField
                            label="&nbsp;"
                            value={node.right ?? constant(1)}
                            names={namesBeforeIndex(nodes, nodeIndex)}
                            onChange={(right) => updateNode(node.id, { right })}
                          />
                        </div>
                        <label>
                          <span>{t.conditionThen}</span>
                          <select
                            value={node.thenOutcome ?? "draft"}
                            onChange={(event) =>
                              updateNode(node.id, {
                                thenOutcome: event.target
                                  .value as DecisionOutcome,
                              })
                            }
                          >
                            <option value="accept">{t.accept}</option>
                            <option value="reject">{t.reject}</option>
                            <option value="draft">{t.outcomeDraft}</option>
                          </select>
                        </label>
                        <label>
                          <span>{t.conditionElse}</span>
                          <select
                            value={node.elseOutcome ?? "draft"}
                            onChange={(event) =>
                              updateNode(node.id, {
                                elseOutcome: event.target
                                  .value as DecisionOutcome,
                              })
                            }
                          >
                            <option value="accept">{t.accept}</option>
                            <option value="reject">{t.reject}</option>
                            <option value="draft">{t.outcomeDraft}</option>
                          </select>
                        </label>
                        <p className="mk-decision-help wide">
                          {t.decisionHelp}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            </div>
          );
        })}
      </div>

      {issue && <p className="cs-builder-feedback issue">{issue}</p>}
      {!issue && <p className="cs-builder-feedback ready">{t.builderReady}</p>}

      <div className="cs-node-palette mk-legacy-builder">
        <header>
          <div>
            <small>{m.builder.clauseTray}</small>
            <strong>{m.builder.tapToSnap}</strong>
          </div>
        </header>
        <div>
          {(
            ["transfer", "wait", "variable", "condition", "decision"] as const
          ).map((tool) => (
            <span key={tool} className="cs-tool">
              <button className="cs-tool-main" onClick={() => addNode(tool)}>
                <img src={NODE_IMAGES[tool]} alt="" />
                <strong>{m.nodes[tool].title}</strong>
                <small>
                  <Plus aria-hidden="true" /> {m.builder.add}
                </small>
              </button>
              <button className="cs-tool-info" aria-hidden="true" tabIndex={-1}>
                <Info aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <button className="cs-offer-button" onClick={onSubmit}>
        <Send aria-hidden="true" /> {editing ? t.saveChanges : t.postToMarket}
      </button>
      {onWithdraw && (
        <button className="mk-withdraw-button" onClick={onWithdraw}>
          {t.withdrawContract}
        </button>
      )}
      {pendingDelete && (
        <div className="cs-dialog-backdrop">
          <article role="alertdialog" aria-modal="true">
            <Trash2 className="failure" aria-hidden="true" />
            <h2>Remove this entire branch?</h2>
            <p>
              This will remove {m.nodes[pendingDelete.kind].title} and all{" "}
              {descendantCount(pendingDelete)} connected nodes beneath it.
            </p>
            <button
              type="button"
              onClick={() => {
                deleteNode(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Remove node and branches
            </button>
            <button
              type="button"
              className="mk-dialog-cancel"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
          </article>
        </div>
      )}
    </section>
  );
}

function MarketNodeInspector({
  node,
  names,
  locale,
  onUpdate,
  onDelete,
}: {
  node: MarketBuilderNode;
  names: readonly string[];
  locale: Locale;
  onUpdate: (id: string, patch: Partial<MarketBuilderNode>) => void;
  onDelete: () => void;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  return (
    <aside className="cs-node-inspector mk-canvas-inspector">
      <header>
        <div>
          <small>{m.builder.clause}</small>
          <strong>{m.nodes[node.kind].title}</strong>
        </div>
        <button type="button" onClick={onDelete} aria-label={m.inspector.deleteNode}>
          <Trash2 aria-hidden="true" />
        </button>
      </header>
      {node.kind === "transfer" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.sender}</span>
            <select
              value={node.senderId}
              onChange={(event) =>
                onUpdate(node.id, {
                  senderId: event.target.value,
                  recipientId: event.target.value === "player" ? "customer" : "player",
                })
              }
            >
              <option value="player">{playerLabel(locale)}</option>
              <option value="customer">{t.borrower}</option>
            </select>
          </label>
          <label>
            <span>{m.inspector.transferRecipient}</span>
            <select
              value={node.recipientId}
              onChange={(event) =>
                onUpdate(node.id, {
                  recipientId: event.target.value,
                  senderId: event.target.value === "player" ? "customer" : "player",
                })
              }
            >
              <option value="player">{playerLabel(locale)}</option>
              <option value="customer">{t.borrower}</option>
            </select>
          </label>
          <RecipeField
            label={m.inspector.amount}
            value={node.amount ?? value("amount")}
            names={names}
            onChange={(amount) => onUpdate(node.id, { amount })}
          />
        </div>
      )}
      {node.kind === "wait" && (
        <div className="cs-parameter-grid">
          <RecipeField
            label={m.inspector.waitDays}
            value={node.days ?? value("days")}
            names={names}
            onChange={(days) => onUpdate(node.id, { days })}
          />
        </div>
      )}
      {node.kind === "variable" && (
        <div className="cs-parameter-grid">
          <VariableNameCards
            value={node.variableName ?? "rate"}
            onChange={(variableName) => onUpdate(node.id, { variableName })}
          />
          <RecipeField
            label="Set value"
            value={node.amount ?? constant(1)}
            names={names}
            onChange={(amount) => onUpdate(node.id, { amount })}
          />
        </div>
      )}
      {(node.kind === "condition" || node.kind === "decision") && (
        <div className="cs-parameter-grid">
          <div className="mk-condition-row wide">
            <RecipeField
              label={t.conditionIf}
              value={node.left ?? value("income")}
              names={names}
              onChange={(left) => onUpdate(node.id, { left })}
            />
            <label className="mk-comparator">
              <span aria-hidden="true">·</span>
              <select
                value={node.comparator ?? ">"}
                aria-label={t.conditionIf}
                onChange={(event) =>
                  onUpdate(node.id, { comparator: event.target.value as ComparatorOp })
                }
              >
                {[">", ">=", "<", "<=", "=="].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </label>
            <RecipeField
              label="&nbsp;"
              value={node.right ?? constant(1)}
              names={names}
              onChange={(right) => onUpdate(node.id, { right })}
            />
          </div>
          {node.kind === "condition" && (
            <p className="mk-decision-help wide">
              Use the + control on either branch in the canvas to extend it.
            </p>
          )}
          {node.kind === "decision" && (
            <>
              <label>
                <span>{t.conditionThen}</span>
                <select
                  value={node.thenOutcome ?? "draft"}
                  onChange={(event) =>
                    onUpdate(node.id, { thenOutcome: event.target.value as DecisionOutcome })
                  }
                >
                  <option value="accept">{t.accept}</option>
                  <option value="reject">{t.reject}</option>
                  <option value="draft">{t.outcomeDraft}</option>
                </select>
              </label>
              <label>
                <span>{t.conditionElse}</span>
                <select
                  value={node.elseOutcome ?? "draft"}
                  onChange={(event) =>
                    onUpdate(node.id, { elseOutcome: event.target.value as DecisionOutcome })
                  }
                >
                  <option value="accept">{t.accept}</option>
                  <option value="reject">{t.reject}</option>
                  <option value="draft">{t.outcomeDraft}</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

/** A compact, tap-only recipe editor. The highlighted card is the next slot. */
function RecipeField({
  label,
  value: recipe,
  names,
  onChange,
}: {
  label: string;
  value: ValueRecipe;
  names: readonly string[];
  onChange: (value: ValueRecipe) => void;
}) {
  const [selectedPath, setSelectedPath] = useState<RecipePath>([]);
  const [numberEntry, setNumberEntry] = useState<string | null>(null);
  const replaceSelected = (next: ValueRecipe): void =>
    onChange(replaceRecipeAtPath(recipe, selectedPath, next));
  const chooseOperator = (operatorName: RecipeOperator): void => {
    const selected = recipeAtPath(recipe, selectedPath);
    replaceSelected(
      selected.kind === "operation"
        ? { ...selected, operator: operatorName }
        : operation(operatorName, selected, constant(1)),
    );
    if (selected.kind !== "operation")
      setSelectedPath([...selectedPath, "right"]);
  };

  return (
    <div className="wide mk-recipe">
      <span className="mk-recipe-label">{label}</span>
      <RecipeSlots
        recipe={recipe}
        path={[]}
        selectedPath={selectedPath}
        onSelect={setSelectedPath}
      />
      <div className="mk-recipe-tray" aria-label="Value cards">
        <small>Value cards</small>
        <div>
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => replaceSelected(value(name))}
            >
              {humanizeValue(name)}
            </button>
          ))}
          <button
            type="button"
            className="mk-number-card"
            onClick={() => setNumberEntry("")}
          >
            # Number
          </button>
        </div>
        <small>Operator cards</small>
        <div>
          {(
            [
              ["add", "+"],
              ["subtract", "−"],
              ["multiply", "×"],
              ["divide", "÷"],
            ] as const
          ).map(([operatorName, labelText]) => (
            <button
              key={operatorName}
              type="button"
              onClick={() => chooseOperator(operatorName)}
            >
              {labelText}
            </button>
          ))}
        </div>
      </div>
      {numberEntry !== null && (
        <NumberKeypad
          value={numberEntry}
          onChange={setNumberEntry}
          onCancel={() => setNumberEntry(null)}
          onConfirm={() => {
            const number = Number(numberEntry);
            if (!Number.isFinite(number)) return;
            replaceSelected(constant(number));
            setNumberEntry(null);
          }}
        />
      )}
    </div>
  );
}

function NumberKeypad({
  value: entry,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const push = (key: string): void => {
    if (key === ".") {
      if (entry.includes(".")) return;
      onChange(entry ? `${entry}.` : "0.");
      return;
    }
    onChange(entry === "0" ? key : `${entry}${key}`);
  };
  return (
    <div className="mk-keypad" role="dialog" aria-label="Enter a number">
      <header>
        <strong>Number</strong>
        <output>{entry || "0"}</output>
      </header>
      <div className="mk-keypad-grid">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((key) => (
          <button key={key} type="button" onClick={() => push(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete digit"
          onClick={() => onChange(entry.slice(0, -1))}
        >
          ←
        </button>
      </div>
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="confirm"
          onClick={onConfirm}
          disabled={!entry || entry.endsWith(".")}
        >
          Done
        </button>
      </footer>
    </div>
  );
}

function RecipeSlots({
  recipe,
  path,
  selectedPath,
  onSelect,
}: {
  recipe: ValueRecipe;
  path: RecipePath;
  selectedPath: RecipePath;
  onSelect: (path: RecipePath) => void;
}) {
  const selected =
    path.length === selectedPath.length &&
    path.every((part, index) => part === selectedPath[index]);
  if (recipe.kind !== "operation")
    return (
      <button
        type="button"
        className={`mk-recipe-slot${selected ? " selected" : ""}`}
        onClick={() => onSelect(path)}
      >
        {recipeLabel(recipe)}
      </button>
    );
  return (
    <span className="mk-recipe-operation">
      <RecipeSlots
        recipe={recipe.left}
        path={[...path, "left"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
      <button
        type="button"
        className={`mk-recipe-operator${selected ? " selected" : ""}`}
        onClick={() => onSelect(path)}
      >
        {
          { add: "+", subtract: "−", multiply: "×", divide: "÷" }[
            recipe.operator
          ]
        }
      </button>
      <RecipeSlots
        recipe={recipe.right}
        path={[...path, "right"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </span>
  );
}

function VariableNameCards({
  value: selected,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="wide mk-variable-names">
      <span>Variable name</span>
      <div>
        {VARIABLE_NAME_CARDS.map((name) => (
          <button
            key={name}
            type="button"
            className={selected === name ? "selected" : ""}
            onClick={() => onChange(name)}
          >
            {humanizeValue(name)}
          </button>
        ))}
      </div>
    </div>
  );
}

function BranchLane({
  title,
  tone,
  nodes,
  names,
  ownerId,
  branch,
  selectedNodeId,
  onSelectNode,
  onUpdate,
  onDelete,
  onAdd,
}: {
  title: string;
  tone: "true" | "false";
  nodes: readonly MarketBuilderNode[];
  names: readonly string[];
  ownerId: string;
  branch: "thenSteps" | "elseSteps";
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<MarketBuilderNode>) => void;
  onDelete: (id: string) => void;
  onAdd: (
    conditionId: string,
    branch: "thenSteps" | "elseSteps",
    kind: BuilderAddableNode,
  ) => void;
}) {
  const scope = [...names];
  return (
    <section className={`mk-branch-lane ${tone}`}>
      <header>{title}</header>
      {nodes.map((node) => {
        const nodeNames = [...scope];
        if (node.kind === "variable" && node.variableName)
          scope.push(node.variableName);
        return (
          <BranchStep
            key={node.id}
            node={node}
            names={nodeNames}
            selected={selectedNodeId === node.id}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAdd={onAdd}
          />
        );
      })}
      {nodes.length === 0 && <p>Drop an action into this path.</p>}
      <div className="mk-branch-add">
        {(["variable", "transfer", "wait", "condition"] as const).map(
          (kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => onAdd(ownerId, branch, kind)}
            >
              <Plus aria-hidden="true" />{" "}
              {kind === "variable" ? "Set value" : kind}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function BranchStep({
  node,
  names,
  selected,
  selectedNodeId,
  onSelectNode,
  onUpdate,
  onDelete,
  onAdd,
}: {
  node: MarketBuilderNode;
  names: readonly string[];
  selected: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<MarketBuilderNode>) => void;
  onDelete: (id: string) => void;
  onAdd: (
    conditionId: string,
    branch: "thenSteps" | "elseSteps",
    kind: BuilderAddableNode,
  ) => void;
}) {
  if (node.kind === "start" || node.kind === "end" || node.kind === "decision")
    return null;
  const label =
    node.kind === "variable"
      ? `Set ${humanizeValue(node.variableName ?? "rate")} = ${recipeLabel(node.amount)}`
      : node.kind === "condition"
        ? `If ${recipeLabel(node.left)} ${node.comparator ?? ">"} ${recipeLabel(node.right)}`
        : node.kind === "wait"
          ? `Wait ${recipeLabel(node.days)} days`
          : `${node.senderId === "player" ? "Lend" : "Collect"} ${recipeLabel(node.amount)}`;
  return (
    <article className={`mk-branch-step${selected ? " selected" : ""}`}>
      <button
        type="button"
        className="mk-branch-step-title"
        onClick={() => onSelectNode(selected ? null : node.id)}
      >
        {label}
      </button>
      {selected && (
        <div className="mk-branch-inspector">
          <button
            type="button"
            className="mk-branch-delete"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
          >
            <Trash2 aria-hidden="true" />
          </button>
          {node.kind === "variable" && (
            <>
              <VariableNameCards
                value={node.variableName ?? "rate"}
                onChange={(variableName) => onUpdate(node.id, { variableName })}
              />
              <RecipeField
                label="Set value"
                value={node.amount ?? constant(1)}
                names={names}
                onChange={(amount) => onUpdate(node.id, { amount })}
              />
            </>
          )}
          {node.kind === "transfer" && (
            <>
              <div className="mk-transfer-toggle">
                <button
                  type="button"
                  className={node.senderId === "player" ? "selected" : ""}
                  onClick={() =>
                    onUpdate(node.id, {
                      senderId: "player",
                      recipientId: "customer",
                    })
                  }
                >
                  You lend
                </button>
                <button
                  type="button"
                  className={node.recipientId === "player" ? "selected" : ""}
                  onClick={() =>
                    onUpdate(node.id, {
                      senderId: "customer",
                      recipientId: "player",
                    })
                  }
                >
                  You collect
                </button>
              </div>
              <RecipeField
                label="Amount"
                value={node.amount ?? value("amount")}
                names={names}
                onChange={(amount) => onUpdate(node.id, { amount })}
              />
            </>
          )}
          {node.kind === "wait" && (
            <RecipeField
              label="Wait days"
              value={node.days ?? value("days")}
              names={names}
              onChange={(days) => onUpdate(node.id, { days })}
            />
          )}
          {node.kind === "condition" && (
            <>
              <BranchConditionTest
                node={node}
                names={names}
                onUpdate={onUpdate}
              />
              <BranchLane
                title="✓ TRUE"
                tone="true"
                nodes={node.thenSteps ?? []}
                names={names}
                ownerId={node.id}
                branch="thenSteps"
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
              <BranchLane
                title="! FALSE"
                tone="false"
                nodes={node.elseSteps ?? []}
                names={names}
                ownerId={node.id}
                branch="elseSteps"
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            </>
          )}
        </div>
      )}
    </article>
  );
}

function BranchConditionTest({
  node,
  names,
  onUpdate,
}: {
  node: MarketBuilderNode;
  names: readonly string[];
  onUpdate: (id: string, patch: Partial<MarketBuilderNode>) => void;
}) {
  return (
    <div className="mk-branch-test">
      <RecipeField
        label="If"
        value={node.left ?? value("income")}
        names={names}
        onChange={(left) => onUpdate(node.id, { left })}
      />
      <div className="mk-comparator-cards">
        {[">", ">=", "<", "<=", "=="].map((comparator) => (
          <button
            key={comparator}
            type="button"
            className={node.comparator === comparator ? "selected" : ""}
            onClick={() =>
              onUpdate(node.id, { comparator: comparator as ComparatorOp })
            }
          >
            {comparator}
          </button>
        ))}
      </div>
      <RecipeField
        label="Compared with"
        value={node.right ?? constant(1)}
        names={names}
        onChange={(right) => onUpdate(node.id, { right })}
      />
    </div>
  );
}
