import { balanceOf, reputationOf } from "./state.ts";
import type { EconomicEngine } from "./engine.ts";

export interface RuleBasedAgent {
  readonly entityId: string;
  act(engine: EconomicEngine): boolean;
}

export interface InputSeekingAgentOptions {
  entityId: string;
  inputAsset: string;
  inputAmount: number;
  paymentAsset: string;
  paymentAmount: number;
  repaymentDelay: number;
  counterparties: string[];
}

export class InputSeekingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: InputSeekingAgentOptions;

  constructor(options: InputSeekingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    if (balanceOf(state, this.entityId, this.options.inputAsset) >= this.options.inputAmount) {
      return false;
    }

    const alreadyWaiting = [...state.agreements.values()].some(
      (agreement) =>
        (agreement.status === "proposed" || agreement.status === "active") &&
        agreement.obligations.some(
          (obligation) =>
            obligation.to === this.entityId &&
            obligation.asset === this.options.inputAsset &&
            agreement.obligationStatuses.get(obligation.id) === "pending",
        ),
    );
    if (alreadyWaiting) return false;

    const counterparty = this.options.counterparties.find(
      (candidate) =>
        balanceOf(state, candidate, this.options.inputAsset) >= this.options.inputAmount,
    );
    if (!counterparty) return false;

    engine.proposeAgreement({
      proposer: this.entityId,
      parties: [this.entityId, counterparty],
      memo: "Exchange an input now for output delivered later",
      obligations: [
        {
          from: counterparty,
          to: this.entityId,
          asset: this.options.inputAsset,
          amount: this.options.inputAmount,
          dueAt: state.time,
        },
        {
          from: this.entityId,
          to: counterparty,
          asset: this.options.paymentAsset,
          amount: this.options.paymentAmount,
          dueAt: state.time + this.options.repaymentDelay,
        },
      ],
    });
    return true;
  }
}

export interface ValueSeekingAgentOptions {
  entityId: string;
  valuations: Record<string, number>;
  discountPerTick: number;
  minimumProfit: number;
  minimumKnownReputation: number;
}

export class ValueSeekingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: ValueSeekingAgentOptions;

  constructor(options: ValueSeekingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const candidates = [...state.agreements.values()].filter(
      (agreement) =>
        agreement.status === "proposed" &&
        agreement.parties.includes(this.entityId) &&
        !agreement.signatures.has(this.entityId),
    );

    for (const agreement of candidates) {
      const otherParties = agreement.parties.filter((party) => party !== this.entityId);
      const unacceptableReputation = otherParties.some((party) => {
        const reputation = reputationOf(state, party);
        return (
          reputation.score !== null && reputation.score < this.options.minimumKnownReputation
        );
      });
      if (unacceptableReputation) continue;

      let presentValue = 0;
      for (const obligation of agreement.obligations) {
        const unitValue = this.options.valuations[obligation.asset];
        if (unitValue === undefined) {
          presentValue = Number.NEGATIVE_INFINITY;
          break;
        }
        const delay = Math.max(0, obligation.dueAt - state.time);
        const discountedValue =
          (unitValue * obligation.amount) / (1 + this.options.discountPerTick) ** delay;
        if (obligation.to === this.entityId) presentValue += discountedValue;
        if (obligation.from === this.entityId) presentValue -= discountedValue;
      }

      if (presentValue >= this.options.minimumProfit) {
        engine.acceptAgreement(agreement.id, this.entityId);
        return true;
      }
    }
    return false;
  }
}

export function runAgents(
  engine: EconomicEngine,
  agents: RuleBasedAgent[],
  maxRounds = 20,
): number {
  let actions = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;
    for (const agent of agents) {
      if (agent.act(engine)) {
        actions += 1;
        changed = true;
      }
    }
    if (!changed) return actions;
  }
  throw new Error(`Agents did not stabilize within ${maxRounds} rounds`);
}
