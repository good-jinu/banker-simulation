import { Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { playerLabel } from "../../i18n/local-text.ts";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import {
  descendantCount,
  findBuilderNodeContext,
  makeNode,
  SAMPLE_REQUESTER,
  validateDraft,
  type BuilderAddableNode,
} from "../builder-draft.ts";
import { humanizeValue, recipeLabel } from "../market-recipe.ts";
import {
  evaluateTermsWithVariables,
  type MarketBuilderNode,
} from "../market-world.ts";
import {
  MarketBuilderCanvas,
  type BuilderInsertTarget,
} from "./MarketBuilderCanvas.tsx";
import { MarketNodeInspector } from "./MarketNodeInspector.tsx";

export function MarketBuilder({
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
  const [dismissedIssue, setDismissedIssue] = useState<string | null>(null);
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

  useEffect(() => {
    if (!issue) setDismissedIssue(null);
  }, [issue]);

  function insertNode(
    target: BuilderInsertTarget,
    kind: BuilderAddableNode,
  ): void {
    const node = makeNode(kind);
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

  function outcomeName(outcome: MarketBuilderNode["outcome"]): string {
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
    if (node.kind === "decision") return outcomeName(node.outcome);
    return `${partyName(node.senderId)} → ${partyName(node.recipientId)} · ${recipeLabel(node.amount)}`;
  }

  return (
    <section className="cs-builder mk-builder-page">
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
          overlay={
            selectedContext && selectedContext.node.kind !== "start" ? (
              <MarketNodeInspector
                node={selectedContext.node}
                names={selectedContext.names}
                locale={locale}
                onUpdate={updateNode}
                onDelete={() => requestDelete(selectedContext.node)}
              />
            ) : null
          }
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
            merge: t.conditionMerge,
            fit: t.fitGraph,
          }}
          nodeLabel={nodeLabel}
          onSelectNode={onSelectNode}
          onRequestInsert={(target, position) =>
            setInsertMenu({ target, ...position })
          }
        />
        {issue && dismissedIssue !== issue && (
          <aside className="mk-canvas-tip" role="status">
            <p>{issue}</p>
            <button
              type="button"
              onClick={() => setDismissedIssue(issue)}
              aria-label={m.builder.dismissTip}
            >
              <X aria-hidden="true" />
            </button>
          </aside>
        )}
        {!issue && (
          <p className="cs-builder-feedback ready mk-canvas-ready">
            {t.builderReady}
          </p>
        )}
        {insertMenu && (
          <div
            className="mk-node-picker"
            style={{ left: insertMenu.x, top: insertMenu.y }}
            role="dialog"
            aria-label={t.addNodeTitle}
          >
            <header>
              <strong>{t.addNodeTitle}</strong>
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
        {onWithdraw && (
          <button className="mk-withdraw-button" onClick={onWithdraw}>
            {t.withdrawContract}
          </button>
        )}
      </div>

      <button className="cs-offer-button" onClick={onSubmit}>
        <Send aria-hidden="true" /> {editing ? t.saveChanges : t.postToMarket}
      </button>
      {pendingDelete && (
        <div className="cs-dialog-backdrop">
          <article role="alertdialog" aria-modal="true">
            <Trash2 className="failure" aria-hidden="true" />
            <h2>{t.removeBranchTitle}</h2>
            <p>
              {t.removeBranchBody(
                m.nodes[pendingDelete.kind].title,
                descendantCount(pendingDelete),
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                deleteNode(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {t.removeBranchConfirm}
            </button>
            <button
              type="button"
              className="mk-dialog-cancel"
              onClick={() => setPendingDelete(null)}
            >
              {t.cancel}
            </button>
          </article>
        </div>
      )}
    </section>
  );
}
