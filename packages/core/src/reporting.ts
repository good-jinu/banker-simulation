import { balanceOf, openOffers, reputationOf } from "./domain/state.ts";
import type { OfferSide, StoredEvent, WorldState } from "./domain/types.ts";

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

  const offers = [...state.offers.values()].filter((offer) => offer.status === "open");
  lines.push("", "Open offers:");
  if (offers.length === 0) lines.push("- none");
  for (const offer of offers) {
    lines.push(
      `- ${offer.id}: ${offer.poster} ${offer.side}s ${offer.remaining} ${offer.asset} at ${offer.pricePerUnit} ${offer.priceAsset} each`,
    );
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

export interface PriceMove {
  asset: string;
  side: OfferSide;
  from: number | null;
  to: number | null;
}

export interface TickDigest {
  ticksAdvanced: number;
  settlements: number;
  defaults: number;
  productionSuccesses: number;
  productionFailures: number;
  priceMoves: PriceMove[];
  capitalDeployments: Array<{ funder: string; borrower: string; productId: string }>;
  headline: string;
}

/** Summarizes what happened during a time skip: cause and effect visible without reading raw events. */
export function summarizeTicks(
  before: WorldState,
  after: WorldState,
  newEvents: StoredEvent[],
): TickDigest {
  const ticksAdvanced = newEvents.filter((event) => event.type === "TimeAdvanced").length;
  const settlements = newEvents.filter((event) => event.type === "ObligationSettled").length;
  const defaults = newEvents.filter((event) => event.type === "ObligationDefaulted").length;
  const productionEvents = newEvents.filter((event) => event.type === "ProductionCompleted");
  const productionSuccesses = productionEvents.filter(
    (event) => (event.data as { successful: boolean }).successful,
  ).length;
  const productionFailures =
    productionEvents.length -
    productionSuccesses +
    newEvents.filter((event) => event.type === "ProductionSkipped").length;
  const capitalDeployments = newEvents
    .filter((event) => event.type === "ProductFunded")
    .map((event) => {
      const { funding } = event.data as {
        funding: { funder: string; borrower: string; productId: string };
      };
      return {
        funder: funding.funder,
        borrower: funding.borrower,
        productId: funding.productId,
      };
    });

  const pairs = new Set<string>();
  for (const state of [before, after]) {
    for (const offer of state.offers.values()) pairs.add(`${offer.asset}::${offer.side}`);
  }
  const priceMoves: PriceMove[] = [];
  for (const pair of pairs) {
    const [asset, side] = pair.split("::") as [string, OfferSide];
    const from = openOffers(before, { asset, side })[0]?.pricePerUnit ?? null;
    const to = openOffers(after, { asset, side })[0]?.pricePerUnit ?? null;
    if (from !== to) priceMoves.push({ asset, side, from, to });
  }

  let headline: string;
  if (defaults > 0) {
    headline = `${defaults} repayment${defaults === 1 ? "" : "s"} missed`;
  } else if (productionFailures > 0 && productionSuccesses === 0) {
    headline = "Production shock";
  } else if (productionSuccesses > 0) {
    headline = "Production completed";
  } else if (settlements > 0) {
    headline = `${settlements} settlement${settlements === 1 ? "" : "s"}`;
  } else if (capitalDeployments.length > 0) {
    headline = "Capital deployed";
  } else {
    headline = `Advanced ${ticksAdvanced} tick${ticksAdvanced === 1 ? "" : "s"}`;
  }

  return {
    ticksAdvanced,
    settlements,
    defaults,
    productionSuccesses,
    productionFailures,
    priceMoves,
    capitalDeployments,
    headline,
  };
}
