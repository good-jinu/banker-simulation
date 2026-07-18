import type { Messages } from "../i18n/messages/index.ts";
import {
  constant,
  humanizeValue,
  operation,
  recipeLabel,
  value,
  VARIABLE_NAME_CARDS,
  type ValueRecipe,
} from "./market-recipe.ts";
import {
  BUILDER_VARIABLES,
  evaluateTermsWithVariables,
  type Demand,
  type MarketBuilderNode,
} from "./market-world.ts";

/**
 * Pure helpers behind the contract builder: the seed stacks a draft starts
 * from, draft validation, the formula summaries, and node construction.
 */

export type BuilderAddableNode =
  "transfer" | "wait" | "variable" | "condition" | "decision";

export const SAMPLE_REQUESTER: Record<string, number> = {
  amount: 100,
  days: 90,
  income: 3000,
  age: 40,
  cash: 1000,
};

/**
 * Formulas each summary column shows, joined across the stack.  Conditions
 * contribute both lanes: identical lanes collapse to one formula, different
 * lanes read as alternatives.
 */
export function draftExpressions(nodes: readonly MarketBuilderNode[]): {
  lend: string;
  term: string;
  repay: string;
} {
  const collect = (
    path: readonly MarketBuilderNode[],
    filter: (node: MarketBuilderNode) => boolean,
    read: (node: MarketBuilderNode) => ValueRecipe | undefined,
  ): string[] =>
    path.flatMap((node) => {
      if (node.kind === "condition") {
        const thenPart = collect(node.thenSteps ?? [], filter, read).join(
          " + ",
        );
        const elsePart = collect(node.elseSteps ?? [], filter, read).join(
          " + ",
        );
        if (!thenPart && !elsePart) return [];
        if (thenPart === elsePart || !elsePart) return [thenPart];
        if (!thenPart) return [elsePart];
        return [`${thenPart} | ${elsePart}`];
      }
      return filter(node) ? [recipeLabel(read(node))] : [];
    });
  const joined = (
    filter: (node: MarketBuilderNode) => boolean,
    read: (node: MarketBuilderNode) => ValueRecipe | undefined,
  ): string => collect(nodes, filter, read).join(" + ");
  return {
    lend: joined(
      (node) => node.kind === "transfer" && node.senderId === "player",
      (node) => node.amount,
    ),
    term: joined(
      (node) => node.kind === "wait",
      (node) => node.days,
    ),
    repay: joined(
      (node) => node.kind === "transfer" && node.recipientId === "player",
      (node) => node.amount,
    ),
  };
}

export function validateDraft(
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
    if (!recipe) return t.slotEmpty;
    if (recipe.kind === "value")
      return names.includes(recipe.value)
        ? null
        : t.valueUnavailable(humanizeValue(recipe.value));
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

export function defaultDraftNodes(demand?: Demand): MarketBuilderNode[] {
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

export function withoutEndNodes(
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
export interface BuilderNodeContext {
  node: MarketBuilderNode;
  names: string[];
}

/** Monotonic id salt: `Date.now()` alone can collide within a millisecond. */
let nodeSerial = 0;

export function findBuilderNodeContext(
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

export function descendantCount(node: MarketBuilderNode): number {
  if (node.kind !== "condition") return 0;
  const countPath = (path: readonly MarketBuilderNode[]): number =>
    path.reduce((total, child) => total + 1 + descendantCount(child), 0);
  return countPath(node.thenSteps ?? []) + countPath(node.elseSteps ?? []);
}

export function makeNode(kind: BuilderAddableNode): MarketBuilderNode {
  nodeSerial += 1;
  const id = `${kind}-${Date.now().toString(36)}-${nodeSerial.toString(36)}`;
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
