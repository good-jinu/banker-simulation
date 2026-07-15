import { balanceOf, reputationOf } from "./domain/state.ts";
import type { WorldState } from "./domain/types.ts";

export function worldReport(state: WorldState): string {
  const lines = [`World time: ${state.time}`, "", "Entities:"];
  for (const entity of state.entities.values()) {
    const holdings = [...state.assets.keys()]
      .map((asset) => [asset, balanceOf(state, entity.id, asset)] as const)
      .filter(([, amount]) => amount !== 0)
      .map(([asset, amount]) => `${amount} ${asset}`)
      .join(", ");
    const reputation = reputationOf(state, entity.id);
    const trust = reputation.score === null ? "unproven" : `${Math.round(reputation.score * 100)}%`;
    lines.push(`- ${entity.id} (${entity.controller}): ${holdings || "nothing"}; trust ${trust}`);
  }

  lines.push("", "Agreements:");
  if (state.agreements.size === 0) lines.push("- none");
  for (const agreement of state.agreements.values()) {
    lines.push(`- ${agreement.id}: ${agreement.status} — ${agreement.memo}`);
    for (const obligation of agreement.obligations) {
      lines.push(
        `  ${obligation.from} -> ${obligation.to}: ${obligation.amount} ${obligation.asset} at ${obligation.dueAt} [${agreement.obligationStatuses.get(obligation.id)}]`,
      );
    }
  }
  return lines.join("\n");
}

