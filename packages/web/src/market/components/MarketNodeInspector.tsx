import { Trash2 } from "lucide-react";
import { playerLabel } from "../../i18n/local-text.ts";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import { constant, value } from "../market-recipe.ts";
import type {
  ComparatorOp,
  DecisionOutcome,
  MarketBuilderNode,
} from "../market-world.ts";
import { RecipeField } from "./RecipeField.tsx";
import { VariableNameCards } from "./VariableNameCards.tsx";

export function MarketNodeInspector({
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
        <button
          type="button"
          onClick={onDelete}
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
                onUpdate(node.id, {
                  senderId: event.target.value,
                  recipientId:
                    event.target.value === "player" ? "customer" : "player",
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
                  senderId:
                    event.target.value === "player" ? "customer" : "player",
                })
              }
            >
              <option value="player">{playerLabel(locale)}</option>
              <option value="customer">{t.borrower}</option>
            </select>
          </label>
          <RecipeField
            m={m}
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
            m={m}
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
            label={t.conditionVariableLabel}
            value={node.variableName ?? "rate"}
            onChange={(variableName) => onUpdate(node.id, { variableName })}
          />
          <RecipeField
            m={m}
            label={m.inspector.amount}
            value={node.amount ?? constant(1)}
            names={names}
            onChange={(amount) => onUpdate(node.id, { amount })}
          />
        </div>
      )}
      {node.kind === "condition" && (
        <div className="cs-parameter-grid">
          <div className="mk-condition-row wide">
            <RecipeField
              m={m}
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
                  onUpdate(node.id, {
                    comparator: event.target.value as ComparatorOp,
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
              m={m}
              label="&nbsp;"
              value={node.right ?? constant(1)}
              names={names}
              onChange={(right) => onUpdate(node.id, { right })}
            />
          </div>
          <p className="mk-decision-help wide">{t.conditionCanvasHelp}</p>
        </div>
      )}
      {node.kind === "decision" && (
        <div className="cs-parameter-grid">
          <label>
            <span>{m.nodes.decision.title}</span>
            <select
              value={node.outcome ?? "draft"}
              onChange={(event) =>
                onUpdate(node.id, {
                  outcome: event.target.value as DecisionOutcome,
                })
              }
            >
              <option value="draft">{t.outcomeDraft}</option>
              <option value="reject">{t.reject}</option>
            </select>
          </label>
        </div>
      )}
    </aside>
  );
}
