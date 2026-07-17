import type { MarketCustomer, NodeParameters } from "./campaign-stages.ts";
import { evaluateExpression } from "./expression.ts";
import type { Locale } from "./i18n.tsx";

export type FlowKind =
  | "fund"
  | "intake"
  | "installment"
  | "repayment"
  | "settle"
  | "resolve"
  | "maturity"
  | "withdrawal";

/** One dated movement of player cash produced by a signed contract. */
export interface ScheduledFlow {
  id: string;
  /** Absolute in-game day the flow executes on. */
  day: number;
  /** Signed change to the player's cash. Zero for pure milestones. */
  amount: number;
  kind: FlowKind;
  counterparty: string;
  executed: boolean;
}

export type RunProductStatus = "active" | "settled";

export interface ExecutableNode extends NodeParameters {
  id: string;
  kind: string;
}

/**
 * A contract whose tail is a daily loop.  The body cannot be precompiled to
 * dated flows because an exit case (early withdrawal) is only known at
 * runtime, so the body nodes are re-evaluated every day until a case fires.
 */
export interface LoopProgram {
  bodyNodes: ExecutableNode[];
  principal: number;
  termDays: number;
  withdrawDailyChanceBp: number;
}

export interface RunProduct {
  id: string;
  customerId: string;
  customerName: string;
  headline: string;
  flow: string[];
  principal: number;
  repayment: number;
  fundingOwed: number;
  stakeholders: Array<{ id: string; label: string }>;
  signedDay: number;
  status: RunProductStatus;
  flows: ScheduledFlow[];
  loop?: LoopProgram;
}

export interface RunEvent {
  id: string;
  day: number;
  productId: string;
  customerName: string;
  counterparty: string;
  amount: number;
  kind: FlowKind;
  /** True when this event settled the whole contract. */
  final: boolean;
}

export interface RunFailure {
  day: number;
  productId: string;
  customerName: string;
  amountDue: number;
  cashAvailable: number;
}

export interface CampaignRun {
  day: number;
  startingCash: number;
  /** Salts the deterministic daily withdrawal rolls for this run. */
  seed: string;
  products: RunProduct[];
  log: RunEvent[];
  failure: RunFailure | null;
}

export function emptyRun(startingCash: number, seed: string): CampaignRun {
  return { day: 0, startingCash, seed, products: [], log: [], failure: null };
}

export function playerCash(run: CampaignRun): number {
  return run.startingCash + executedCashDelta(run);
}

/** Deterministic daily roll in [0, 1) derived from the run seed. */
function seededRoll(seed: string, day: number): number {
  const input = `${seed}:${day}`;
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 8) / 0x1000000;
}

/**
 * Compile the builder's node stack into dated cash flows.  The stack walks a
 * running day offset: transfers execute at the current offset, waits push it
 * forward, and a repeat fans the following transfer out across its schedule.
 * Campaign outcomes are deterministic for now, so a condition node resolves
 * on its success path (collect, then release any held asset).
 */
export function compileContractFlows(
  nodes: readonly ExecutableNode[],
  customer: MarketCustomer,
  signedDay: number,
): ScheduledFlow[] {
  const flows: ScheduledFlow[] = [];
  let offset = 0;
  let pendingRepeat: { count: number; intervalDays: number } | null = null;
  const partyLabel = (id: string | undefined): string =>
    customer.parties.find((party) => party.id === id)?.label ?? customer.name;
  const push = (
    day: number,
    amount: number,
    kind: FlowKind,
    counterparty: string,
  ): void => {
    flows.push({
      id: `${customer.id}-flow-${flows.length + 1}`,
      day,
      amount,
      kind,
      counterparty,
      executed: false,
    });
  };

  const hasLoop = nodes.some((node) => node.kind === "loop");
  for (const node of nodes) {
    if (node.kind === "loop") break;
    if (node.kind === "wait") {
      offset += node.days ?? 0;
    } else if (node.kind === "transfer") {
      const amount = node.amount ?? 0;
      if (node.senderId === "player") {
        push(signedDay + offset, -amount, "fund", partyLabel(node.recipientId));
      } else if (node.recipientId === "player") {
        if (hasLoop) {
          push(signedDay + offset, amount, "intake", partyLabel(node.senderId));
        } else if (pendingRepeat) {
          for (let index = 1; index <= pendingRepeat.count; index += 1)
            push(
              signedDay + offset + index * pendingRepeat.intervalDays,
              amount,
              "installment",
              partyLabel(node.senderId),
            );
          offset += pendingRepeat.count * pendingRepeat.intervalDays;
          pendingRepeat = null;
        } else {
          push(
            signedDay + offset,
            amount,
            "repayment",
            partyLabel(node.senderId),
          );
        }
      }
    } else if (node.kind === "repeat") {
      pendingRepeat = {
        count: node.repeatCount ?? 1,
        intervalDays: node.intervalDays ?? 30,
      };
    } else if (node.kind === "intake") {
      push(
        signedDay + offset,
        node.amount ?? 0,
        "intake",
        partyLabel(node.senderId),
      );
    } else if (node.kind === "settle") {
      offset += node.dueDays ?? 0;
      push(
        signedDay + offset,
        -(node.amount ?? 0),
        "settle",
        partyLabel(node.recipientId),
      );
    } else if (node.kind === "condition") {
      push(
        signedDay + offset,
        customer.terms.incomingAmount ?? 0,
        "resolve",
        customer.name,
      );
    }
  }
  return flows;
}

/** Sign a contract and immediately execute its day-zero flows. */
export function signProduct(
  run: CampaignRun,
  product: RunProduct,
): CampaignRun {
  const next: CampaignRun = {
    ...run,
    products: [...run.products, product],
  };
  return executeDueFlows(next, run.day);
}

/** Advance the calendar one day and execute every flow that comes due. */
export function advanceOneDay(run: CampaignRun): CampaignRun {
  if (run.failure) return run;
  const nextDay = run.day + 1;
  return evaluateLoopContracts(
    executeDueFlows({ ...run, day: nextDay }, nextDay),
    nextDay,
  );
}

/** The next future day on which any pending flow executes, if one exists. */
export function nextFlowDay(run: CampaignRun): number | null {
  const days = run.products
    .flatMap((product) => product.flows)
    .filter((flow) => !flow.executed && flow.day > run.day)
    .map((flow) => flow.day);
  for (const product of run.products)
    if (product.status === "active" && product.loop)
      days.push(product.signedDay + product.loop.termDays);
  return days.length > 0 ? Math.min(...days) : null;
}

/**
 * Run every active loop contract's daily evaluation: the first exit case
 * whose trigger holds pays the giver and settles the contract; otherwise the
 * contract waits a day.  A payout the banker cannot cover fails the run.
 */
function evaluateLoopContracts(run: CampaignRun, day: number): CampaignRun {
  let next = run;
  for (const product of run.products) {
    if (next.failure) return next;
    if (product.status !== "active" || !product.loop) continue;
    const loop = product.loop;
    const variables: Record<string, number> = {
      principal: loop.principal,
      day: day - product.signedDay,
    };
    for (const node of loop.bodyNodes) {
      if (node.kind === "variable") {
        if (node.variableName && node.amountExpression)
          variables[node.variableName] = evaluateExpression(
            node.amountExpression,
            variables,
          );
        continue;
      }
      if (node.kind !== "case") continue;
      const matched =
        node.trigger === "term-ended"
          ? day - product.signedDay >= (node.days ?? loop.termDays)
          : day > product.signedDay &&
            seededRoll(`${next.seed}:${product.id}`, day) <
              loop.withdrawDailyChanceBp / 10_000;
      if (!matched) continue;
      const amount = evaluateExpression(
        node.amountExpression ?? "principal",
        variables,
      );
      const kind: FlowKind =
        node.trigger === "term-ended" ? "maturity" : "withdrawal";
      const cashAvailable = playerCash(next);
      if (cashAvailable < amount) {
        next = {
          ...next,
          failure: {
            day,
            productId: product.id,
            customerName: product.customerName,
            amountDue: amount,
            cashAvailable,
          },
        };
        break;
      }
      next = payOutLoopContract(next, product.id, day, amount, kind);
      break;
    }
  }
  return next;
}

function payOutLoopContract(
  run: CampaignRun,
  productId: string,
  day: number,
  amount: number,
  kind: FlowKind,
): CampaignRun {
  const log = [...run.log];
  const products = run.products.map((product) => {
    if (product.id !== productId) return product;
    const payout: ScheduledFlow = {
      id: `${product.id}-payout`,
      day,
      amount: -amount,
      kind,
      counterparty: product.customerName,
      executed: true,
    };
    log.push({
      id: `${payout.id}-event`,
      day,
      productId: product.id,
      customerName: product.customerName,
      counterparty: product.customerName,
      amount: payout.amount,
      kind,
      final: true,
    });
    return {
      ...product,
      flows: [...product.flows, payout],
      status: "settled" as const,
    };
  });
  return { ...run, products, log };
}

function executeDueFlows(run: CampaignRun, day: number): CampaignRun {
  const log = [...run.log];
  const products = run.products.map((product) => {
    if (product.status !== "active") return product;
    const due = product.flows.filter(
      (flow) => !flow.executed && flow.day <= day,
    );
    if (due.length === 0) return product;
    const flows = product.flows.map((flow) =>
      flow.executed || flow.day > day ? flow : { ...flow, executed: true },
    );
    // A loop contract never settles through its fixed flows: only a firing
    // exit case can end it.
    const settled = !product.loop && flows.every((flow) => flow.executed);
    for (const [index, flow] of due.entries()) {
      log.push({
        id: `${flow.id}-event`,
        day,
        productId: product.id,
        customerName: product.customerName,
        counterparty: flow.counterparty,
        amount: flow.amount,
        kind: flow.kind,
        final: settled && index === due.length - 1,
      });
    }
    return {
      ...product,
      flows,
      status: settled ? ("settled" as const) : ("active" as const),
    };
  });
  return { ...run, products, log };
}

/** Total signed cash movement already executed across every contract. */
export function executedCashDelta(run: CampaignRun): number {
  return run.products
    .flatMap((product) => product.flows)
    .filter((flow) => flow.executed)
    .reduce((sum, flow) => sum + flow.amount, 0);
}

export function formatGameDate(
  startDate: string,
  day: number,
  locale: Locale,
): string {
  const date = new Date(
    Date.parse(`${startDate}T00:00:00Z`) + day * 86_400_000,
  );
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
