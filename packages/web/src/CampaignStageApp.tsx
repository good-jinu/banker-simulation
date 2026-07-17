import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  GripVertical,
  Info,
  Link2,
  Pause,
  Play,
  Plus,
  Send,
  SkipForward,
  Store,
  Trash2,
  UserRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceOneDay,
  compileContractFlows,
  emptyRun,
  formatGameDate,
  nextFlowDay,
  playerCash,
  signProduct,
  type CampaignRun,
  type RunEvent,
  type RunProduct,
} from "./campaign-run.ts";
import {
  localize,
  playerLabel,
  recipeFor,
  type CampaignStage,
  type CaseTrigger,
  type ContractNodeSpec,
  type MarketCustomer,
  type NodeParameters,
  type StageNodeKind,
} from "./campaign-stages.ts";
import { evaluateExpression, expressionIssue } from "./expression.ts";
import { messagesFor } from "./messages/index.ts";
import { CLOCK_SPEEDS, GameClock, type ClockSpeed } from "./game-clock.ts";
import type { Locale } from "./i18n.tsx";
import "./campaign-stage.css";

type BoardNodeKind = "start" | StageNodeKind | "end";
type ToolKind = StageNodeKind;
type View = "market" | "customer" | "builder" | "mine";

const DEFAULT_STARTING_CASH = 1_000;

function newRunSeed(): string {
  return Math.random().toString(36).slice(2);
}

interface BuilderNode extends NodeParameters {
  id: string;
  kind: BoardNodeKind;
}

interface Proposal {
  accepted: boolean;
  message: string;
}

function eventText(event: RunEvent, locale: Locale): string {
  const kind = messagesFor(locale).flowKinds[event.kind];
  const money =
    event.amount === 0
      ? ""
      : ` · ${event.amount > 0 ? "+" : "−"}$${Math.abs(event.amount).toLocaleString()}`;
  return `${kind} · ${event.counterparty}${money}`;
}

interface NodeMeta {
  width: number;
  height: number;
  image: string;
}

const NODE_META: Record<BoardNodeKind, NodeMeta> = {
  start: {
    width: 3,
    height: 2,
    image: "/assets/stage-one/nodes/start.webp",
  },
  transfer: {
    width: 10,
    height: 6,
    image: "/assets/stage-one/nodes/transfer.webp",
  },
  wait: {
    width: 5,
    height: 4,
    image: "/assets/stage-one/nodes/wait.webp",
  },
  asset: {
    width: 6,
    height: 5,
    image: "/assets/campaign/nodes/asset.webp",
  },
  condition: {
    width: 7,
    height: 5,
    image: "/assets/campaign/nodes/condition.webp",
  },
  repeat: {
    width: 6,
    height: 5,
    image: "/assets/campaign/nodes/repeat.webp",
  },
  intake: {
    width: 7,
    height: 5,
    image: "/assets/campaign/nodes/intake.webp",
  },
  settle: {
    width: 7,
    height: 5,
    image: "/assets/campaign/nodes/settle.webp",
  },
  loop: {
    width: 6,
    height: 5,
    image: "/assets/campaign/nodes/repeat.webp",
  },
  variable: {
    width: 7,
    height: 5,
    image: "/assets/campaign/nodes/reserve.webp",
  },
  case: {
    width: 7,
    height: 5,
    image: "/assets/campaign/nodes/condition.webp",
  },
  end: {
    width: 3,
    height: 2,
    image: "/assets/stage-one/nodes/end.webp",
  },
};

function nodeTitle(kind: BoardNodeKind, locale: Locale): string {
  return messagesFor(locale).nodes[kind].title;
}

function factValue(value: string, locale: Locale): string {
  return messagesFor(locale).factValues[value] ?? value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

export function CampaignStageApp({
  stage,
  locale,
  onBack,
  onComplete,
}: {
  stage: CampaignStage;
  locale: Locale;
  onBack: () => void;
  onComplete: () => void;
}) {
  const m = messagesFor(locale);
  const [view, setView] = useState<View>("market");
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    stage.customers[0]?.id ?? "",
  );
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [explanation, setExplanation] = useState<BoardNodeKind | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const startingCash = stage.startingCash ?? DEFAULT_STARTING_CASH;
  const [run, setRun] = useState<CampaignRun>(() =>
    emptyRun(startingCash, newRunSeed()),
  );
  const [clockView, setClockView] = useState<{
    paused: boolean;
    speed: ClockSpeed;
  }>({ paused: true, speed: 1 });
  const [news, setNews] = useState<RunEvent | null>(null);
  const clockRef = useRef<GameClock | null>(null);
  const seenLogRef = useRef(0);

  useEffect(() => {
    const clock = new GameClock(() => {
      setRun((current) => advanceOneDay(current));
      return true;
    });
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
    const fresh = run.log.slice(seenLogRef.current);
    seenLogRef.current = run.log.length;
    const finalEvent = fresh.find((event) => event.final);
    if (finalEvent) {
      clockRef.current?.pause();
      setClockView((current) => ({ ...current, paused: true }));
      setNews(finalEvent);
    }
  }, [run]);

  useEffect(() => {
    if (run.failure) {
      clockRef.current?.pause();
      setClockView((current) => ({ ...current, paused: true }));
    }
  }, [run.failure]);

  function restartStage(): void {
    clockRef.current?.pause();
    setClockView((current) => ({ ...current, paused: true }));
    seenLogRef.current = 0;
    setRun(emptyRun(startingCash, newRunSeed()));
    setNews(null);
    setProposal(null);
    setSelectedNodeId(null);
    setNodes([
      { id: "start-fixed", kind: "start" },
      { id: "end-fixed", kind: "end" },
    ]);
    setView("market");
  }

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

  function skipToNextEvent(): void {
    setRun((current) => {
      const target = nextFlowDay(current);
      if (target === null) return current;
      let next = current;
      while (next.day < target) next = advanceOneDay(next);
      return next;
    });
  }

  const products = run.products;
  const ticker = run.log[run.log.length - 1] ?? null;

  const selectedCustomer =
    stage.customers.find((customer) => customer.id === selectedCustomerId) ??
    stage.customers[0]!;
  const recipe = useMemo(
    () => recipeFor(stage, selectedCustomer),
    [selectedCustomer, stage],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const executableNodes = nodes.filter(
    (node): node is BuilderNode & { kind: StageNodeKind } =>
      node.kind !== "start" && node.kind !== "end",
  );
  const soldCustomerIds = new Set(
    products.map((product) => product.customerId),
  );
  const settledCount = products.filter(
    (product) => product.status === "settled",
  ).length;
  const complete = settledCount >= stage.targetSales;
  const nonCashValue = products
    .filter((product) => product.status === "active")
    .reduce((sum, product) => sum + product.principal, 0);
  const cash = playerCash(run);
  const totalAssets = cash + nonCashValue;
  const liabilities = products.reduce(
    (sum, product) =>
      sum + (product.status === "active" ? product.fundingOwed : 0),
    0,
  );
  const stakeholders = [
    { id: "player", label: playerLabel(locale), image: null as string | null },
    ...products.flatMap((product) =>
      product.stakeholders.map((stakeholder) => ({
        ...stakeholder,
        image:
          stage.customers.find(
            (customer) =>
              customer.id === product.customerId &&
              stakeholder.id === "customer",
          )?.image ?? null,
      })),
    ),
  ].filter(
    (stakeholder, index, all) =>
      all.findIndex((candidate) => candidate.label === stakeholder.label) ===
      index,
  );
  const availableTools = useMemo(() => {
    const recipeTools = recipe.map((spec) => spec.kind);
    return [...new Set<ToolKind>(recipeTools)];
  }, [recipe]);

  function resetBuilder(customer: MarketCustomer): void {
    setNodes([
      {
        id: "start-fixed",
        kind: "start",
      },
      {
        id: "end-fixed",
        kind: "end",
      },
    ]);
    setSelectedNodeId(null);
    setFeedback("");
  }

  function openCustomer(customer: MarketCustomer): void {
    setSelectedCustomerId(customer.id);
    setView("customer");
    resetBuilder(customer);
  }

  function chooseTab(next: "market" | "mine"): void {
    setView(next);
  }

  function addNode(kind: ToolKind): void {
    const sameKindCount = executableNodes.filter(
      (node) => node.kind === kind,
    ).length;
    const matchingSpecs = recipe.filter((spec) => spec.kind === kind);
    const spec = matchingSpecs[sameKindCount] ?? matchingSpecs[0];
    const nextNode: BuilderNode = {
      id: `${kind}-${Date.now()}-${nodes.length}`,
      kind,
      ...(spec?.kind === kind ? spec.defaults : {}),
    };
    setNodes((current) => {
      const endIndex = current.findIndex((node) => node.kind === "end");
      const selectedIndex = current.findIndex(
        (node) => node.id === selectedNodeId,
      );
      const insertAt =
        selectedIndex > 0 && current[selectedIndex]?.kind !== "end"
          ? selectedIndex + 1
          : endIndex >= 0
            ? endIndex
            : current.length;
      return [
        ...current.slice(0, insertAt),
        nextNode,
        ...current.slice(insertAt),
      ];
    });
    setSelectedNodeId(nextNode.id);
    setFeedback(m.builder.snapped(nodeTitle(kind, locale)));
  }

  function updateNode(id: string, patch: Partial<BuilderNode>): void {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    );
  }

  function deleteNode(id: string): void {
    setNodes((current) => current.filter((node) => node.id !== id));
    setSelectedNodeId(null);
  }

  function moveNode(id: string, direction: -1 | 1): void {
    setNodes((current) => {
      const index = current.findIndex((node) => node.id === id);
      const target = index + direction;
      if (
        index <= 0 ||
        target <= 0 ||
        target >= current.length - 1 ||
        current[target]?.kind === "start" ||
        current[target]?.kind === "end"
      )
        return current;
      const next = [...current];
      const moving = next[index];
      const displaced = next[target];
      if (!moving || !displaced) return current;
      next[index] = displaced;
      next[target] = moving;
      return next;
    });
    setFeedback("");
  }

  function validateContract(): string | null {
    if (executableNodes.length !== recipe.length)
      return m.builder.needsBlocks(recipe.length, executableNodes.length);
    for (let index = 0; index < recipe.length; index += 1) {
      const spec = recipe[index];
      const node = executableNodes[index];
      if (!node || !spec || node.kind !== spec.kind)
        return m.builder.blockShouldBe(
          index + 1,
          spec ? nodeTitle(spec.kind, locale) : null,
        );
      const playerAuthored = node.kind === "variable" || node.kind === "case";
      const mismatch = Object.entries(spec.defaults).find(
        ([key, value]) =>
          !(
            playerAuthored &&
            (key === "amountExpression" || key === "variableName")
          ) && !sameValue(node[key as keyof BuilderNode], value),
      );
      if (mismatch)
        return m.builder.termsMismatch(nodeTitle(node.kind, locale));
    }
    return validateExpressions();
  }

  /**
   * Player-authored formulas are free-form, so they are checked for syntax
   * and then against the saver's demand: at least the demanded growth at
   * term, and never below the principal on an early withdrawal.
   */
  function validateExpressions(): string | null {
    const names = ["principal", "day"];
    for (const node of executableNodes) {
      if (node.kind === "variable") {
        if (!node.variableName?.trim()) return m.builder.variableNeedsName;
        const issue = expressionIssue(node.amountExpression ?? "", names);
        if (issue)
          return m.builder.nodeIssue(nodeTitle("variable", locale), issue);
        names.push(node.variableName.trim());
      }
      if (node.kind === "case") {
        const issue = expressionIssue(node.amountExpression ?? "", names);
        if (issue) return m.builder.nodeIssue(nodeTitle("case", locale), issue);
      }
    }

    const terms = selectedCustomer.terms;
    if (terms.depositTermDays === undefined) return null;
    const principalAmount = terms.incomingAmount ?? 0;
    const termDays = terms.depositTermDays;
    const payoutAt = (day: number, trigger: CaseTrigger): number | null => {
      const variables: Record<string, number> = {
        principal: principalAmount,
        day,
      };
      for (const node of executableNodes) {
        if (node.kind === "variable" && node.variableName?.trim())
          variables[node.variableName.trim()] = evaluateExpression(
            node.amountExpression ?? "0",
            variables,
          );
        if (node.kind === "case" && node.trigger === trigger)
          return evaluateExpression(
            node.amountExpression ?? "principal",
            variables,
          );
      }
      return null;
    };
    try {
      const required = evaluateExpression(
        terms.maturityExpression ?? "principal",
        { principal: principalAmount, day: termDays },
      );
      const offeredAtTerm = payoutAt(termDays, "term-ended");
      if (offeredAtTerm === null || offeredAtTerm < required)
        return m.builder.demandsAtLeast(
          selectedCustomer.name,
          required,
          termDays,
        );
      for (let day = 1; day < termDays; day += 1) {
        const early = payoutAt(day, "withdraw-requested");
        if (early === null || early < principalAmount)
          return m.builder.noLessThanPrincipal(
            selectedCustomer.name,
            principalAmount,
          );
      }
    } catch (error) {
      return String(error instanceof Error ? error.message : error);
    }
    return null;
  }

  function offerContract(): void {
    const issue = validateContract();
    if (issue) {
      setProposal({ accepted: false, message: issue });
      return;
    }
    if (soldCustomerIds.has(selectedCustomer.id)) {
      setProposal({
        accepted: false,
        message: m.builder.alreadySold,
      });
      return;
    }
    const record: RunProduct = {
      id: `${stage.id}-${selectedCustomer.id}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      headline: selectedCustomer.need.badge,
      flow: recipe.map((spec, index) =>
        flowLabel(spec, nodes, index, selectedCustomer, locale),
      ),
      principal: selectedCustomer.terms.outgoingAmount ?? 0,
      repayment: selectedCustomer.terms.incomingAmount ?? 0,
      fundingOwed:
        selectedCustomer.terms.depositTermDays !== undefined
          ? (selectedCustomer.terms.incomingAmount ?? 0)
          : (selectedCustomer.terms.providerReturn ??
            selectedCustomer.terms.providerAmount ??
            0),
      stakeholders: selectedCustomer.parties
        .filter((party) => party.id !== "player")
        .map((party) => ({ id: party.id, label: party.label })),
      signedDay: run.day,
      status: "active",
      flows: compileContractFlows(executableNodes, selectedCustomer, run.day),
    };
    const loopIndex = executableNodes.findIndex((node) => node.kind === "loop");
    if (loopIndex >= 0)
      record.loop = {
        bodyNodes: executableNodes
          .slice(loopIndex + 1)
          .map((node) => ({ ...node })),
        principal: selectedCustomer.terms.incomingAmount ?? 0,
        termDays: selectedCustomer.terms.depositTermDays ?? 0,
        withdrawDailyChanceBp:
          selectedCustomer.terms.withdrawDailyChanceBp ?? 0,
      };
    setRun((current) => signProduct(current, record));
    setProposal({
      accepted: true,
      message: m.builder.accepted(
        selectedCustomer.name,
        formatGameDate(stage.startDate, run.day, locale),
      ),
    });
  }

  const targetPath = [
    "start" as const,
    ...recipe.map((spec) => spec.kind),
    "end" as const,
  ]
    .map((kind) => nodeTitle(kind, locale))
    .join(" → ");
  const liveIssue = validateContract();
  const demandTokens = [
    selectedCustomer.terms.outgoingAmount === undefined
      ? null
      : `$${selectedCustomer.terms.outgoingAmount}`,
    selectedCustomer.terms.incomingAmount === undefined
      ? null
      : `$${selectedCustomer.terms.incomingAmount}`,
    selectedCustomer.terms.waitDays === undefined
      ? null
      : `${selectedCustomer.terms.waitDays} ${m.common.days}`,
    selectedCustomer.terms.assetName ?? null,
    selectedCustomer.terms.depositTermDays === undefined
      ? null
      : `${selectedCustomer.terms.depositTermDays} ${m.common.days}`,
  ].filter((token): token is string => Boolean(token));

  return (
    <main className="cs-shell">
      <header className="cs-header">
        <button
          className="cs-icon-button"
          onClick={() => {
            if (view === "builder") setView("customer");
            else if (view === "customer") setView("market");
            else onBack();
          }}
          aria-label={m.header.back}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <small>
            {m.header.stage} {String(stage.number).padStart(2, "0")}
          </small>
          <strong>
            {view === "builder"
              ? m.header.contractBuilder
              : view === "mine"
                ? m.header.mine
                : localize(stage.deskTitle, locale)}
          </strong>
        </div>
        <span className="cs-stage-chip">
          {stage.number === 1
            ? m.header.tutorial
            : `${settledCount}/${stage.targetSales}`}
        </span>
      </header>

      {view !== "builder" && (
        <nav className="cs-tabs" aria-label={m.header.stageSections}>
          <button
            className={view === "market" || view === "customer" ? "active" : ""}
            onClick={() => chooseTab("market")}
          >
            <Store aria-hidden="true" /> {m.market.openMarket}
          </button>
          <button
            className={`cs-mine-tab${view === "mine" ? " active" : ""}`}
            onClick={() => chooseTab("mine")}
            aria-label={`${m.header.mine} · ${products.length} ${m.header.contractsWord}`}
            title={m.header.mine}
          >
            <WalletCards aria-hidden="true" />
            {products.length > 0 && <i aria-hidden="true">{products.length}</i>}
          </button>
        </nav>
      )}

      <section
        className={`cs-balance-strip${view === "builder" ? " builder" : ""}`}
        aria-label={m.balance.assetValues}
      >
        <div>
          <small>{m.balance.cash}</small>
          <strong>${cash.toLocaleString()}</strong>
        </div>
        <div>
          <small>{m.balance.nonCash}</small>
          <strong>${nonCashValue.toLocaleString()}</strong>
        </div>
        <div className="total">
          <small>{m.balance.totalAssets}</small>
          <strong>${totalAssets.toLocaleString()}</strong>
        </div>
      </section>

      <section className="cs-timebar" aria-label={m.timebar.gameCalendar}>
        <div className="cs-timebar-date">
          <CalendarDays aria-hidden="true" />
          <div>
            <strong>{formatGameDate(stage.startDate, run.day, locale)}</strong>
            <small>
              {m.timebar.dayN(run.day)}
              {ticker ? ` · ${eventText(ticker, locale)}` : ""}
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
            onClick={skipToNextEvent}
            disabled={nextFlowDay(run) === null}
            aria-label={m.timebar.skip}
          >
            <SkipForward aria-hidden="true" />
          </button>
        </div>
      </section>

      {view === "market" && (
        <section className="cs-market">
          <div className="cs-section-heading">
            <p>{localize(stage.marketLabel, locale)}</p>
            <h1>{m.market.chooseDemand}</h1>
          </div>
          <div className="cs-customer-grid">
            {stage.customers.map((customer) => {
              const sold = soldCustomerIds.has(customer.id);
              return (
                <button
                  key={customer.id}
                  className="cs-customer-card"
                  onClick={() => openCustomer(customer)}
                  aria-label={`${localize(customer.kind, locale)} ${customer.name} ${sold ? m.market.contractActive : customer.need.badge}`}
                >
                  <img src={customer.image} alt="" />
                  <span>
                    <small>
                      <UserRound aria-hidden="true" />{" "}
                      {localize(customer.kind, locale)}
                    </small>
                    <strong>{customer.name}</strong>
                    <em>
                      {sold
                        ? m.market.contractActive
                        : `${m.market.needs} ${customer.need.badge}`}
                    </em>
                  </span>
                </button>
              );
            })}
          </div>
          <aside className="cs-tutorial-note">
            <Info aria-hidden="true" />
            <p>{localize(stage.lesson, locale)}</p>
          </aside>
        </section>
      )}

      {view === "customer" && (
        <section className="cs-customer-detail">
          <button className="cs-inline-back" onClick={() => setView("market")}>
            ‹ {m.market.openMarket}
          </button>
          <div className="cs-profile-hero">
            <img src={selectedCustomer.image} alt="" />
            <div>
              <small>{localize(selectedCustomer.kind, locale)}</small>
              <h1>{selectedCustomer.name}</h1>
              <p>
                {selectedCustomer.gender
                  ? localize(selectedCustomer.gender, locale)
                  : localize(stage.subtitle, locale)}
              </p>
            </div>
          </div>
          <dl className="cs-profile-facts">
            {selectedCustomer.facts.map((fact) => (
              <div
                key={`${fact.label.en}-${fact.value}`}
                className={fact.visible ? "" : "hidden"}
              >
                <dt>{localize(fact.label, locale)}</dt>
                <dd>{fact.visible ? factValue(fact.value, locale) : "?"}</dd>
              </div>
            ))}
          </dl>
          <article className="cs-need-card">
            <span>{m.customer.alwaysVisible}</span>
            <h2>{m.customer.customerNeed}</h2>
            <div>
              <p>
                <small>{m.customer.neededNow}</small>
                <strong>{localize(selectedCustomer.need.now, locale)}</strong>
              </p>
              <p>
                <small>{m.customer.returnLabel}</small>
                <strong>{localize(selectedCustomer.need.later, locale)}</strong>
              </p>
              <p>
                <small>{m.customer.termsLabel}</small>
                <strong>{localize(selectedCustomer.need.price, locale)}</strong>
              </p>
            </div>
          </article>
          <button
            className="cs-build-button"
            disabled={soldCustomerIds.has(selectedCustomer.id)}
            onClick={() => setView("builder")}
          >
            <Workflow aria-hidden="true" />{" "}
            {soldCustomerIds.has(selectedCustomer.id)
              ? m.market.contractActive
              : m.customer.buildContract}
          </button>
        </section>
      )}

      {view === "builder" && (
        <section className="cs-builder">
          <div className="cs-builder-guide">
            <div>
              <span>{m.builder.contractGoal}</span>
              <p>{targetPath}</p>
            </div>
            <strong>
              {executableNodes.length}/{recipe.length}
            </strong>
          </div>

          <div className="cs-variable-rack">
            <header>
              <small>{m.builder.demandVariables}</small>
              <strong>{selectedCustomer.name}</strong>
            </header>
            <div>
              <span className="party">{playerLabel(locale)}</span>
              <span className="party">
                {selectedCustomer.name.split(" ")[0]}
              </span>
              {demandTokens.map((token, index) => (
                <span className="value" key={`${token}-${index}`}>
                  {token}
                </span>
              ))}
            </div>
          </div>

          <div
            className="cs-contract-stack"
            role="application"
            aria-label={m.builder.blockStack}
          >
            {nodes.map((node, nodeIndex) => {
              const fixed = node.kind === "start" || node.kind === "end";
              const selected = selectedNodeId === node.id;
              const executableIndex = nodes
                .slice(0, nodeIndex)
                .filter(
                  (candidate) =>
                    candidate.kind !== "start" && candidate.kind !== "end",
                ).length;
              const expected = !fixed ? recipe[executableIndex] : undefined;
              const wrongKind = Boolean(
                expected && expected.kind !== node.kind,
              );
              return (
                <div className="cs-stack-entry" key={node.id}>
                  {nodeIndex > 0 && (
                    <div className="cs-snap-join" aria-hidden="true">
                      <Link2 />
                    </div>
                  )}
                  <article
                    className={`cs-contract-block type-${node.kind}${selected ? " selected" : ""}${wrongKind ? " mismatch" : ""}`}
                  >
                    <div
                      className="cs-block-main"
                      onClick={() =>
                        !fixed && setSelectedNodeId(selected ? null : node.id)
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
                          setSelectedNodeId(selected ? null : node.id);
                        }
                      }}
                    >
                      <GripVertical aria-hidden="true" />
                      <span className="cs-block-image">
                        <img src={NODE_META[node.kind].image} alt="" />
                      </span>
                      <span className="cs-block-copy">
                        <small>
                          {fixed
                            ? m.builder.contractBoundary
                            : `${m.builder.clause} ${executableIndex + 1}`}
                        </small>
                        <strong>{nodeTitle(node.kind, locale)}</strong>
                        <i>
                          {builderNodeLabel(node, selectedCustomer, locale)}
                        </i>
                      </span>
                      {!fixed && (
                        <span className="cs-block-controls">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              moveNode(node.id, -1);
                            }}
                            disabled={nodeIndex <= 1}
                            aria-label={m.builder.moveUp}
                          >
                            <ArrowUp aria-hidden="true" />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              moveNode(node.id, 1);
                            }}
                            disabled={nodeIndex >= nodes.length - 2}
                            aria-label={m.builder.moveDown}
                          >
                            <ArrowDown aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </div>
                    {selected && !fixed && selectedNode?.id === node.id && (
                      <NodeInspector
                        node={selectedNode}
                        customer={selectedCustomer}
                        locale={locale}
                        onUpdate={(patch) => updateNode(selectedNode.id, patch)}
                        onDelete={() => deleteNode(selectedNode.id)}
                      />
                    )}
                  </article>
                </div>
              );
            })}
            {executableNodes.length === 0 && (
              <p className="cs-stack-empty">{m.builder.emptyStack}</p>
            )}
          </div>

          {(feedback || liveIssue) && (
            <p
              className={`cs-builder-feedback${liveIssue ? " issue" : " ready"}`}
            >
              {liveIssue || feedback}
            </p>
          )}

          <div className="cs-node-palette">
            <header>
              <div>
                <small>{m.builder.clauseTray}</small>
                <strong>{m.builder.tapToSnap}</strong>
              </div>
            </header>
            <div>
              {availableTools.map((tool) => (
                <span key={tool} className="cs-tool">
                  <button
                    className="cs-tool-main"
                    onClick={() => addNode(tool)}
                  >
                    <img src={NODE_META[tool].image} alt="" />
                    <strong>{nodeTitle(tool, locale)}</strong>
                    <small>
                      <Plus aria-hidden="true" /> {m.builder.add}
                    </small>
                  </button>
                  <button
                    className="cs-tool-info"
                    onClick={() => setExplanation(tool)}
                    aria-label={`${nodeTitle(tool, locale)} info`}
                  >
                    <Info aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button className="cs-offer-button" onClick={offerContract}>
            <Send aria-hidden="true" /> {m.builder.offerContract}
          </button>
        </section>
      )}

      {view === "mine" && (
        <section className="cs-mine">
          <div className="cs-section-heading">
            <p>{m.mine.subtitle}</p>
            <h1>{m.header.mine}</h1>
          </div>

          <article className="cs-balance-sheet">
            <header>
              <div>
                <small>{m.mine.totalAssetValue}</small>
                <strong>${totalAssets.toLocaleString()}</strong>
              </div>
              <WalletCards aria-hidden="true" />
            </header>
            <div className="cs-balance-breakdown">
              <span>
                <small>{m.balance.cash}</small>
                <strong>${cash.toLocaleString()}</strong>
              </span>
              <span>
                <small>{m.mine.nonCashValue}</small>
                <strong>${nonCashValue.toLocaleString()}</strong>
              </span>
            </div>
            <footer>
              <span>{m.mine.liabilities}</span>
              <strong>${liabilities.toLocaleString()}</strong>
            </footer>
          </article>

          <section className="cs-mine-group">
            <header>
              <div>
                <small>{m.mine.agreements}</small>
                <h2>{m.mine.myContracts}</h2>
              </div>
              <b>{products.length}</b>
            </header>
            {products.length > 0 ? (
              <div className="cs-contract-list">
                {products.map((product) => (
                  <article className="cs-product-card" key={product.id}>
                    <header>
                      <span>
                        <Workflow aria-hidden="true" />
                      </span>
                      <div>
                        <small>{m.mine.nonCashAsset}</small>
                        <strong>
                          {product.customerName} · {product.headline}
                        </strong>
                      </div>
                      <i>${product.principal}</i>
                    </header>
                    <div className="cs-product-flow">
                      {product.flow.map((item, index) => (
                        <span key={`${item}-${index}`}>
                          {item}
                          {index < product.flow.length - 1 && <b>→</b>}
                        </span>
                      ))}
                    </div>
                    <dl>
                      <div>
                        <dt>{m.mine.principal}</dt>
                        <dd>${product.principal}</dd>
                      </div>
                      <div>
                        <dt>{m.mine.promisedReturn}</dt>
                        <dd>${product.repayment}</dd>
                      </div>
                      <div>
                        <dt>{m.mine.status}</dt>
                        <dd>
                          {product.status === "settled"
                            ? m.mine.settled
                            : m.mine.active}
                        </dd>
                      </div>
                    </dl>
                    <p>
                      <Check aria-hidden="true" />{" "}
                      {(() => {
                        const nextFlow = product.flows.find(
                          (flow) => !flow.executed,
                        );
                        if (!nextFlow) return m.mine.allResolved;
                        const dueDate = formatGameDate(
                          stage.startDate,
                          nextFlow.day,
                          locale,
                        );
                        return m.mine.nextEvent(
                          dueDate,
                          eventText(
                            {
                              ...nextFlow,
                              productId: product.id,
                              customerName: product.customerName,
                              final: false,
                              id: nextFlow.id,
                            },
                            locale,
                          ),
                        );
                      })()}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="cs-empty-mine">
                <Workflow aria-hidden="true" />
                <h2>{m.mine.noContracts}</h2>
                <p>{m.mine.noContractsHint}</p>
                <button onClick={() => setView("market")}>
                  {m.mine.openMarketButton}
                </button>
              </div>
            )}
          </section>

          <section className="cs-mine-group stakeholders">
            <header>
              <div>
                <small>{m.mine.network}</small>
                <h2>{m.mine.stakeholders}</h2>
              </div>
              <b>{stakeholders.length}</b>
            </header>
            <div className="cs-stakeholder-list">
              {stakeholders.map((stakeholder) => (
                <article key={`${stakeholder.id}-${stakeholder.label}`}>
                  {stakeholder.image ? (
                    <img src={stakeholder.image} alt="" />
                  ) : (
                    <span>
                      <UserRound aria-hidden="true" />
                    </span>
                  )}
                  <div>
                    <strong>{stakeholder.label}</strong>
                    <small>
                      {stakeholder.id === "player"
                        ? m.mine.bankerRole
                        : m.mine.stakeholderRole}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {products.length > 0 && !complete && (
            <button
              className="cs-build-button"
              onClick={() => setView("market")}
            >
              {m.mine.buildMore(stage.targetSales - products.length)}
            </button>
          )}
          {complete && (
            <button className="cs-complete-button" onClick={onComplete}>
              <CircleCheck aria-hidden="true" />{" "}
              {m.mine.completeStage(String(stage.number).padStart(2, "0"))}
            </button>
          )}
        </section>
      )}

      {explanation && (
        <div
          className="cs-dialog-backdrop"
          role="presentation"
          onClick={() => setExplanation(null)}
        >
          <article
            role="dialog"
            aria-modal="true"
            aria-label={`${nodeTitle(explanation, locale)} info`}
            onClick={(event) => event.stopPropagation()}
          >
            <img src={NODE_META[explanation].image} alt="" />
            <h2>{nodeTitle(explanation, locale)}</h2>
            <p>{m.nodes[explanation].explanation}</p>
            <button onClick={() => setExplanation(null)}>
              {m.dialogs.gotIt}
            </button>
          </article>
        </div>
      )}
      {run.failure && (
        <div className="cs-dialog-backdrop">
          <article
            role="dialog"
            aria-modal="true"
            aria-label={m.dialogs.liquidityFailure}
          >
            <CircleX className="failure" aria-hidden="true" />
            <h2>{m.dialogs.liquidityFailure}</h2>
            <p>
              {formatGameDate(stage.startDate, run.failure.day, locale)} ·{" "}
              {m.dialogs.liquidityDetail(
                run.failure.customerName,
                run.failure.amountDue,
                run.failure.cashAvailable,
              )}
            </p>
            <button onClick={restartStage}>{m.dialogs.restartStage}</button>
          </article>
        </div>
      )}
      {news && !proposal && !run.failure && (
        <div className="cs-dialog-backdrop">
          <article
            role="dialog"
            aria-modal="true"
            aria-label={m.dialogs.contractSettled}
          >
            <CircleCheck className="success" aria-hidden="true" />
            <h2>
              {complete
                ? m.dialogs.objectiveReached
                : m.dialogs.contractSettled}
            </h2>
            <p>
              {formatGameDate(stage.startDate, news.day, locale)} ·{" "}
              {eventText(news, locale)}
            </p>
            <button
              onClick={() => {
                setNews(null);
                setView("mine");
              }}
            >
              {m.dialogs.viewMine}
            </button>
          </article>
        </div>
      )}
      {proposal && (
        <div className="cs-dialog-backdrop">
          <article
            role="dialog"
            aria-modal="true"
            aria-label={proposal.accepted ? "Accepted" : "Rejected"}
          >
            {proposal.accepted ? (
              <CircleCheck className="success" aria-hidden="true" />
            ) : (
              <CircleX className="failure" aria-hidden="true" />
            )}
            <h2>
              {proposal.accepted
                ? m.dialogs.offerAccepted
                : m.dialogs.offerRejected}
            </h2>
            <p>{proposal.message}</p>
            <button
              onClick={() => {
                const accepted = proposal.accepted;
                setProposal(null);
                if (accepted) setView("mine");
              }}
            >
              {proposal.accepted
                ? m.dialogs.viewMine
                : m.dialogs.reviseContract}
            </button>
          </article>
        </div>
      )}
    </main>
  );
}

function NodeInspector({
  node,
  customer,
  locale,
  onUpdate,
  onDelete,
}: {
  node: BuilderNode;
  customer: MarketCustomer;
  locale: Locale;
  onUpdate: (patch: Partial<BuilderNode>) => void;
  onDelete: () => void;
}) {
  const m = messagesFor(locale);
  const partyName = (id: string | undefined) =>
    customer.parties.find((party) => party.id === id)?.label ??
    (id === "player" ? playerLabel(locale) : "?");
  return (
    <div className="cs-node-inspector">
      <header>
        <strong>{nodeTitle(node.kind, locale)}</strong>
        <button onClick={onDelete} aria-label={m.inspector.deleteNode}>
          <Trash2 aria-hidden="true" />
        </button>
      </header>
      {node.kind === "transfer" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.sender}</span>
            <select
              value={node.senderId}
              onChange={(event) => onUpdate({ senderId: event.target.value })}
            >
              {customer.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.id === "player" ? playerLabel(locale) : party.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{m.inspector.transferRecipient}</span>
            <select
              value={node.recipientId}
              onChange={(event) =>
                onUpdate({ recipientId: event.target.value })
              }
            >
              {customer.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.id === "player" ? playerLabel(locale) : party.label}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label={m.inspector.amount}
            value={node.amount}
            onChange={(amount) => onUpdate({ amount })}
            wide
          />
        </div>
      )}
      {node.kind === "wait" && (
        <NumberField
          label={m.inspector.waitDays}
          value={node.days}
          onChange={(days) => onUpdate({ days })}
        />
      )}
      {node.kind === "asset" && (
        <label className="cs-single-parameter">
          <span>{m.inspector.assetHeld}</span>
          <input
            value={node.assetName ?? ""}
            onChange={(event) => onUpdate({ assetName: event.target.value })}
          />
        </label>
      )}
      {node.kind === "condition" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.ifSettled}</span>
            <select
              value={node.successAction}
              onChange={(event) =>
                onUpdate({
                  successAction: event.target.value as "release" | "collect",
                })
              }
            >
              <option value="release">{m.inspector.collectRelease}</option>
              <option value="collect">{m.inspector.collectKeep}</option>
            </select>
          </label>
          <label>
            <span>{m.inspector.ifDefaulted}</span>
            <select
              value={node.failureAction}
              onChange={(event) =>
                onUpdate({
                  failureAction: event.target.value as "recover" | "waive",
                })
              }
            >
              <option value="recover">{m.inspector.recoverFromAsset}</option>
              <option value="waive">{m.inspector.waiveObligation}</option>
            </select>
          </label>
        </div>
      )}
      {node.kind === "repeat" && (
        <div className="cs-parameter-grid">
          <NumberField
            label={m.inspector.repeatCount}
            value={node.repeatCount}
            onChange={(repeatCount) => onUpdate({ repeatCount })}
          />
          <NumberField
            label={m.inspector.everyDays}
            value={node.intervalDays}
            onChange={(intervalDays) => onUpdate({ intervalDays })}
          />
        </div>
      )}
      {node.kind === "intake" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.provider}</span>
            <select
              value={node.senderId}
              onChange={(event) => onUpdate({ senderId: event.target.value })}
            >
              {customer.parties
                .filter((party) => party.id !== "player")
                .map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.label}
                  </option>
                ))}
            </select>
          </label>
          <NumberField
            label={m.inspector.receive}
            value={node.amount}
            onChange={(amount) => onUpdate({ amount })}
          />
          <NumberField
            label={m.inspector.intakeTermDays}
            value={node.days}
            onChange={(days) => onUpdate({ days })}
          />
          <NumberField
            label={m.inspector.returnAmount}
            value={node.returnAmount}
            onChange={(returnAmount) => onUpdate({ returnAmount })}
          />
        </div>
      )}
      {node.kind === "settle" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.settleRecipient}</span>
            <select
              value={node.recipientId}
              onChange={(event) =>
                onUpdate({ recipientId: event.target.value })
              }
            >
              {customer.parties
                .filter((party) => party.id !== "player")
                .map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.label}
                  </option>
                ))}
            </select>
          </label>
          <NumberField
            label={m.inspector.amount}
            value={node.amount}
            onChange={(amount) => onUpdate({ amount })}
          />
          <NumberField
            label={m.inspector.afterDays}
            value={node.dueDays}
            onChange={(dueDays) => onUpdate({ dueDays })}
          />
        </div>
      )}
      {node.kind === "loop" && (
        <p className="cs-single-parameter">{m.inspector.loopHelp}</p>
      )}
      {node.kind === "variable" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.variableName}</span>
            <input
              value={node.variableName ?? ""}
              onChange={(event) =>
                onUpdate({ variableName: event.target.value })
              }
            />
          </label>
          <label className="wide">
            <span>{m.inspector.formula}</span>
            <input
              value={node.amountExpression ?? ""}
              onChange={(event) =>
                onUpdate({ amountExpression: event.target.value })
              }
            />
          </label>
        </div>
      )}
      {node.kind === "case" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.inspector.trigger}</span>
            <select
              value={node.trigger}
              onChange={(event) =>
                onUpdate({ trigger: event.target.value as CaseTrigger })
              }
            >
              <option value="term-ended">{m.inspector.termEnded}</option>
              <option value="withdraw-requested">
                {m.inspector.withdrawRequested}
              </option>
            </select>
          </label>
          {node.trigger === "term-ended" && (
            <NumberField
              label={m.inspector.caseTermDays}
              value={node.days}
              onChange={(days) => onUpdate({ days })}
            />
          )}
          <label>
            <span>{m.inspector.payTo}</span>
            <select
              value={node.recipientId}
              onChange={(event) =>
                onUpdate({ recipientId: event.target.value })
              }
            >
              {customer.parties
                .filter((party) => party.id !== "player")
                .map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="wide">
            <span>{m.inspector.amountFormula}</span>
            <input
              value={node.amountExpression ?? ""}
              onChange={(event) =>
                onUpdate({ amountExpression: event.target.value })
              }
            />
          </label>
        </div>
      )}
      {node.kind === "end" && (
        <p className="cs-single-parameter">{m.inspector.endHelp}</p>
      )}
      {(node.kind === "intake" || node.kind === "settle") && (
        <small className="cs-party-note">
          {m.inspector.currentParty}:{" "}
          {partyName(node.senderId ?? node.recipientId)}
        </small>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        value={value ?? 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function builderNodeLabel(
  node: BuilderNode,
  customer: MarketCustomer,
  locale: Locale,
): string {
  const m = messagesFor(locale);
  if (node.kind === "start") return m.nodeLabels.startActive;
  if (node.kind === "end") return m.nodeLabels.endResolved;
  if (node.kind === "transfer") {
    const sender =
      customer.parties.find((party) => party.id === node.senderId)?.label ??
      "?";
    const recipient =
      customer.parties.find((party) => party.id === node.recipientId)?.label ??
      "?";
    return `${sender.split(" ")[0]} → ${recipient.split(" ")[0]} · $${node.amount ?? 0}`;
  }
  if (node.kind === "wait") return m.nodeLabels.waitAdvance(node.days ?? 0);
  if (node.kind === "asset") return node.assetName ?? m.nodeLabels.chooseAsset;
  if (node.kind === "condition") return m.nodeLabels.conditionOutcomes;
  if (node.kind === "repeat")
    return m.nodeLabels.repeatEvery(
      node.repeatCount ?? 0,
      node.intervalDays ?? 0,
    );
  if (node.kind === "intake") return m.nodeLabels.receiveNow(node.amount ?? 0);
  if (node.kind === "loop") return m.nodeLabels.loopUntilCase;
  if (node.kind === "variable")
    return `${node.variableName ?? "?"} = ${node.amountExpression ?? "?"}`;
  if (node.kind === "case")
    return node.trigger === "term-ended"
      ? m.nodeLabels.caseTermPay(node.days ?? 0, node.amountExpression ?? "?")
      : m.nodeLabels.caseRequestPay(node.amountExpression ?? "?");
  return m.nodeLabels.settleAmount(node.amount ?? 0);
}

function flowLabel(
  spec: ContractNodeSpec,
  nodes: BuilderNode[],
  index: number,
  customer: MarketCustomer,
  locale: Locale,
): string {
  const m = messagesFor(locale);
  const node = nodes.find((candidate, candidateIndex) => {
    if (candidate.kind === "start" || candidate.kind === "end") return false;
    const executableIndex = nodes
      .slice(0, candidateIndex)
      .filter((item) => item.kind !== "start" && item.kind !== "end").length;
    return executableIndex === index && candidate.kind === spec.kind;
  });
  if (!node) return nodeTitle(spec.kind, locale);
  if (node.kind === "transfer") {
    const sender =
      customer.parties.find((party) => party.id === node.senderId)?.label ??
      playerLabel(locale);
    const recipient =
      customer.parties.find((party) => party.id === node.recipientId)?.label ??
      playerLabel(locale);
    return `$${node.amount} ${sender.split(" ")[0]}→${recipient.split(" ")[0]}`;
  }
  if (node.kind === "wait") return `${node.days} d`;
  if (node.kind === "asset")
    return node.assetName ?? nodeTitle(node.kind, locale);
  if (node.kind === "condition") return m.nodeLabels.twoOutcomes;
  if (node.kind === "repeat")
    return `${node.repeatCount}× / ${node.intervalDays}d`;
  if (node.kind === "intake") return `+$${node.amount} / ${node.days}d`;
  if (node.kind === "settle") return `$${node.amount} +${node.dueDays}d`;
  if (node.kind === "loop") return m.nodeLabels.dailyLoop;
  if (node.kind === "variable") return `${node.variableName ?? "?"}=…`;
  if (node.kind === "case")
    return node.trigger === "term-ended"
      ? `@${node.days ?? 0}d`
      : m.nodeLabels.onDemand;
  return nodeTitle(node.kind, locale);
}
