import type { Messages } from "../i18n/messages/index.ts";
import {
  constant,
  humanizeValue,
  isVariableName,
  operation,
  recipeLabel,
  value,
  type ValueRecipe,
} from "./market-recipe.ts";
import {
  BUILDER_VARIABLES,
  evaluateTermsWithVariables,
  type MarketBuilderNode,
} from "./market-world.ts";

/**
 * Pure helpers behind the contract builder: the required start node, draft
 * validation, formula summaries, and node construction.
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

/** A new graph has no configurable nodes, but every graph starts here. */
export function emptyDraftNodes(): MarketBuilderNode[] {
  return [{ id: "start-fixed", kind: "start" }];
}

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
        if (!isVariableName(name)) return t.conditionNeedsVariable;
        if (names.includes(name)) return t.variableReserved(name);
        const issue = validateRecipe(node.amount, names);
        if (issue) return m.builder.nodeIssue(m.nodes.variable.title, issue);
        names.push(name);
      } else if (node.kind === "condition") {
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

export function withoutEndNodes(
  nodes: readonly MarketBuilderNode[],
): MarketBuilderNode[] {
  const stripEndNodes = (
    path: readonly MarketBuilderNode[],
  ): MarketBuilderNode[] =>
    path
      .filter((node) => node.kind !== "end")
      .map((node) =>
        node.kind === "condition"
          ? {
              ...node,
              thenSteps: stripEndNodes(node.thenSteps ?? []),
              elseSteps: stripEndNodes(node.elseSteps ?? []),
            }
          : node,
      );
  const withoutEnds = stripEndNodes(nodes);
  return withoutEnds.some((node) => node.kind === "start")
    ? withoutEnds
    : [emptyDraftNodes()[0]!, ...withoutEnds];
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
    const variableName = node.variableName;
    if (
      node.kind === "variable" &&
      variableName &&
      isVariableName(variableName)
    )
      names.push(variableName);
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
    return { id, kind, variableName: "", amount: constant(1.05) };
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
      outcome: "draft",
    };
  return {
    id,
    kind,
    senderId: "player",
    recipientId: "customer",
    amount: value("amount"),
  };
}

export type GuidedContractFlow = "loan" | "deposit";

/**
 * Keep the guided run focused on graph structure while still producing an
 * economically meaningful first contract. Players can edit every preset.
 */
export function makeGuidedNode(
  kind: BuilderAddableNode,
  flow: GuidedContractFlow | null,
  nodes: readonly MarketBuilderNode[],
): MarketBuilderNode {
  const node = makeNode(kind);
  if (node.kind !== "transfer" || !flow) return node;

  const hasTransfer = (
    path: readonly MarketBuilderNode[],
    predicate: (candidate: MarketBuilderNode) => boolean,
  ): boolean =>
    path.some(
      (candidate) =>
        predicate(candidate) ||
        (candidate.kind === "condition" &&
          (hasTransfer(candidate.thenSteps ?? [], predicate) ||
            hasTransfer(candidate.elseSteps ?? [], predicate))),
    );
  const hasIncoming = hasTransfer(
    nodes,
    (candidate) =>
      candidate.kind === "transfer" && candidate.recipientId === "player",
  );
  const hasOutgoing = hasTransfer(
    nodes,
    (candidate) =>
      candidate.kind === "transfer" && candidate.senderId === "player",
  );

  if (flow === "loan" && hasOutgoing && !hasIncoming)
    return {
      ...node,
      senderId: "customer",
      recipientId: "player",
      amount: operation("multiply", value("amount"), constant(1.1)),
    };
  if (flow === "deposit" && !hasIncoming)
    return {
      ...node,
      senderId: "customer",
      recipientId: "player",
    };
  if (flow === "deposit" && hasIncoming && !hasOutgoing)
    return {
      ...node,
      senderId: "player",
      recipientId: "customer",
      amount: operation("multiply", value("amount"), constant(1.06)),
    };
  return node;
}
