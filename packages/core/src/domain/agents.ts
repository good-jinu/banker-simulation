import { balanceOf, lockedAmount, openOffers, reputationOf } from "./state.ts";
import type { EconomicEngine } from "./engine.ts";
import type { AssetAmount, OfferSide, WorldState } from "./types.ts";

export interface RuleBasedAgent {
  readonly entityId: string;
  act(engine: EconomicEngine): boolean;
}

function availableOf(state: WorldState, entity: string, asset: string): number {
  return balanceOf(state, entity, asset) - lockedAmount(state, entity, asset);
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

/** Barter fallback: trade future output for an input now, remembering who said no. */
export class InputSeekingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: InputSeekingAgentOptions;

  constructor(options: InputSeekingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const ownOpenProposals = [...state.agreements.values()].filter(
      (agreement) =>
        agreement.status === "proposed" &&
        agreement.proposer === this.entityId &&
        agreement.obligations.some(
          (obligation) =>
            obligation.to === this.entityId && obligation.asset === this.options.inputAsset,
        ),
    );

    if (balanceOf(state, this.entityId, this.options.inputAsset) >= this.options.inputAmount) {
      const stale = ownOpenProposals[0];
      if (stale) {
        engine.declineAgreement(stale.id, this.entityId);
        return true;
      }
      return false;
    }

    const alreadyWaiting =
      ownOpenProposals.length > 0 ||
      [...state.agreements.values()].some(
        (agreement) =>
          agreement.status === "active" &&
          agreement.obligations.some(
            (obligation) =>
              obligation.to === this.entityId &&
              obligation.asset === this.options.inputAsset &&
              agreement.obligationStatuses.get(obligation.id) === "pending",
          ),
      );
    if (alreadyWaiting) return false;

    // Prefer waiting on an open funding application over piling barter on top of a loan.
    const applicationOpen = [...state.applications.values()].some(
      (application) => application.borrower === this.entityId && application.status === "open",
    );
    if (applicationOpen) return false;

    const declinedBy = new Set(
      [...state.agreements.values()]
        .filter(
          (agreement) =>
            agreement.status === "declined" &&
            agreement.proposer === this.entityId &&
            agreement.declinedBy !== this.entityId &&
            agreement.obligations.some(
              (obligation) =>
                obligation.to === this.entityId && obligation.asset === this.options.inputAsset,
            ),
        )
        .map((agreement) => agreement.declinedBy),
    );

    const counterparty = this.options.counterparties.find(
      (candidate) =>
        !declinedBy.has(candidate) &&
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

/** Accepts profitable proposals and explicitly declines the rest. */
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

      if (!unacceptableReputation && presentValue >= this.options.minimumProfit) {
        engine.acceptAgreement(agreement.id, this.entityId);
      } else {
        engine.declineAgreement(agreement.id, this.entityId);
      }
      return true;
    }
    return false;
  }
}

export interface MarketMakerOfferConfig {
  side: OfferSide;
  asset: string;
  priceAsset: string;
  pricePerUnit: number;
  amount: number;
}

export interface MarketMakerAgentOptions {
  entityId: string;
  offers: MarketMakerOfferConfig[];
}

export interface InventoryPriceBand {
  /** Use this price while inventory is strictly below this amount. */
  below: number;
  pricePerUnit: number;
}

export interface InventoryPricingAgentOptions {
  entityId: string;
  side: OfferSide;
  asset: string;
  priceAsset: string;
  amount: number;
  priceBands: InventoryPriceBand[];
}

/** Requotes one market from a deterministic inventory-to-price schedule. */
export class InventoryPricingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: InventoryPricingAgentOptions;

  constructor(options: InventoryPricingAgentOptions) {
    if (options.priceBands.length === 0) throw new Error("Inventory pricing needs a price band");
    this.options = {
      ...options,
      priceBands: [...options.priceBands].sort((left, right) => left.below - right.below),
    };
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const inventory = balanceOf(state, this.entityId, this.options.asset);
    const desired =
      this.options.priceBands.find((band) => inventory < band.below) ??
      this.options.priceBands[this.options.priceBands.length - 1]!;
    const current = openOffers(state, {
      poster: this.entityId,
      side: this.options.side,
      asset: this.options.asset,
      priceAsset: this.options.priceAsset,
    })[0];

    if (current && current.pricePerUnit !== desired.pricePerUnit) {
      engine.withdrawOffer({ actor: this.entityId, offerId: current.id });
      return true;
    }
    if (current) return false;

    const capacity =
      this.options.side === "sell"
        ? Math.min(this.options.amount, availableOf(state, this.entityId, this.options.asset))
        : Math.min(
          this.options.amount,
          Math.floor(availableOf(state, this.entityId, this.options.priceAsset) / desired.pricePerUnit),
        );
    if (capacity < 1) return false;

    engine.postOffer({
      actor: this.entityId,
      side: this.options.side,
      asset: this.options.asset,
      amount: capacity,
      priceAsset: this.options.priceAsset,
      pricePerUnit: desired.pricePerUnit,
    });
    return true;
  }
}

/** Keeps standing buy/sell offers alive so the world always has posted prices. */
export class MarketMakerAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: MarketMakerAgentOptions;

  constructor(options: MarketMakerAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    for (const config of this.options.offers) {
      const alreadyPosted = openOffers(state, {
        poster: this.entityId,
        side: config.side,
        asset: config.asset,
        priceAsset: config.priceAsset,
      }).length > 0;
      if (alreadyPosted) continue;

      const capacity =
        config.side === "sell"
          ? Math.min(config.amount, availableOf(state, this.entityId, config.asset))
          : config.amount;
      const canPay =
        config.side === "buy"
          ? balanceOf(state, this.entityId, config.priceAsset) >= config.pricePerUnit
          : true;
      if (capacity < 1 || !canPay) continue;

      engine.postOffer({
        actor: this.entityId,
        side: config.side,
        asset: config.asset,
        amount: capacity,
        priceAsset: config.priceAsset,
        pricePerUnit: config.pricePerUnit,
      });
      return true;
    }
    return false;
  }
}

export interface InputPurchasingAgentOptions {
  entityId: string;
  inputAsset: string;
  inputAmount: number;
  priceAsset: string;
  maxPricePerUnit: number;
}

/** Buys a missing production input from the cheapest acceptable standing offer. */
export class InputPurchasingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: InputPurchasingAgentOptions;

  constructor(options: InputPurchasingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const held = balanceOf(state, this.entityId, this.options.inputAsset);
    if (held >= this.options.inputAmount) return false;
    const needed = this.options.inputAmount - held;
    const cash = availableOf(state, this.entityId, this.options.priceAsset);

    for (const offer of openOffers(state, {
      side: "sell",
      asset: this.options.inputAsset,
      priceAsset: this.options.priceAsset,
    })) {
      if (offer.pricePerUnit > this.options.maxPricePerUnit) break;
      const affordable = Math.floor(cash / offer.pricePerUnit);
      const amount = Math.min(
        needed,
        offer.remaining,
        affordable,
        availableOf(state, offer.poster, this.options.inputAsset),
      );
      if (amount < 1) continue;
      engine.fillOffer({ actor: this.entityId, offerId: offer.id, amount });
      return true;
    }
    return false;
  }
}

export interface FundingSeekingAgentOptions {
  entityId: string;
  fundingAsset: string;
  neededBalance: number;
  wantAsset?: AssetAmount;
  maxInterestRate: number;
  minTerm: number;
  collateralBudget?: Record<string, number>;
}

/** Applies to the cheapest published product whose terms it can live with — and only then. */
export class FundingSeekingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: FundingSeekingAgentOptions;

  constructor(options: FundingSeekingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const openApplication = [...state.applications.values()].find(
      (application) => application.borrower === this.entityId && application.status === "open",
    );
    const satisfied = this.options.wantAsset
      ? balanceOf(state, this.entityId, this.options.wantAsset.asset) >=
        this.options.wantAsset.amount
      : balanceOf(state, this.entityId, this.options.fundingAsset) >= this.options.neededBalance;

    if (satisfied) {
      if (openApplication) {
        engine.withdrawApplication({ actor: this.entityId, applicationId: openApplication.id });
        return true;
      }
      return false;
    }

    const balance = balanceOf(state, this.entityId, this.options.fundingAsset);
    if (balance >= this.options.neededBalance) return false;
    if (openApplication) return false;

    const fundingIncoming = [...state.agreements.values()].some(
      (agreement) =>
        (agreement.status === "proposed" || agreement.status === "active") &&
        agreement.obligations.some(
          (obligation) =>
            obligation.to === this.entityId &&
            obligation.asset === this.options.fundingAsset &&
            agreement.obligationStatuses.get(obligation.id) === "pending",
        ),
    );
    if (fundingIncoming) return false;

    const reputation = reputationOf(state, this.entityId).score ?? 0.5;
    const candidates = [...state.products.values()]
      .filter((product) => {
        if (product.fundingAsset !== this.options.fundingAsset) return false;
        if (product.fixedInterestRate > this.options.maxInterestRate) return false;
        if (product.term < this.options.minTerm) return false;
        if (product.principalAmount + balance < this.options.neededBalance) return false;
        if (reputation < product.minimumRepaymentReputation) return false;
        if (product.collateral) {
          const budget = this.options.collateralBudget?.[product.collateral.asset] ?? 0;
          if (product.collateral.amount > budget) return false;
          if (
            availableOf(state, this.entityId, product.collateral.asset) <
            product.collateral.amount
          ) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (left, right) =>
          left.fixedInterestRate - right.fixedInterestRate ||
          left.principalAmount - right.principalAmount ||
          left.publishedAt - right.publishedAt ||
          left.id.localeCompare(right.id),
      );

    const chosen = candidates[0];
    if (!chosen) return false;
    engine.applyForProduct({ productId: chosen.id, borrower: this.entityId });
    return true;
  }
}

export interface RivalLenderAgentOptions {
  entityId: string;
  waitTicks: number;
  fundingAsset: string;
  minimumInterestRate: number;
  maximumPrincipal: number;
}

/** Deploys scarce rival capital into the best public application after a fair waiting period. */
export class RivalLenderAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: RivalLenderAgentOptions;

  constructor(options: RivalLenderAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const cash = availableOf(state, this.entityId, this.options.fundingAsset);
    const candidates = [...state.applications.values()]
      .filter((application) => {
        if (application.status !== "open") return false;
        if (state.time - application.appliedAt < this.options.waitTicks) return false;
        const product = state.products.get(application.productId);
        if (!product || product.fundingAsset !== this.options.fundingAsset) return false;
        if (product.principalAmount > this.options.maximumPrincipal) return false;
        if (product.principalAmount > cash) return false;
        return product.fixedInterestRate >= this.options.minimumInterestRate;
      })
      .sort((left, right) => {
        const leftProduct = state.products.get(left.productId)!;
        const rightProduct = state.products.get(right.productId)!;
        const collateralPreference = Number(Boolean(rightProduct.collateral)) - Number(Boolean(leftProduct.collateral));
        return (
          collateralPreference ||
          rightProduct.fixedInterestRate - leftProduct.fixedInterestRate ||
          left.appliedAt - right.appliedAt ||
          left.id.localeCompare(right.id)
        );
      });

    const chosen = candidates[0];
    if (!chosen) return false;
    engine.fundProduct({
      productId: chosen.productId,
      funder: this.entityId,
      borrower: chosen.borrower,
    });
    return true;
  }
}

export interface LiquiditySeekingAgentOptions {
  entityId: string;
  cashAsset: string;
  horizon: number;
  sellAssets: string[];
}

/** Sells output into the best standing bids to cover cash obligations coming due. */
export class LiquiditySeekingAgent implements RuleBasedAgent {
  readonly entityId: string;
  private readonly options: LiquiditySeekingAgentOptions;

  constructor(options: LiquiditySeekingAgentOptions) {
    this.options = options;
    this.entityId = options.entityId;
  }

  act(engine: EconomicEngine): boolean {
    const state = engine.inspect();
    const dueSoon = [...state.agreements.values()]
      .filter((agreement) => agreement.status === "active" || agreement.status === "defaulted")
      .flatMap((agreement) =>
        agreement.obligations.filter(
          (obligation) =>
            obligation.from === this.entityId &&
            obligation.asset === this.options.cashAsset &&
            obligation.dueAt <= state.time + this.options.horizon &&
            agreement.obligationStatuses.get(obligation.id) === "pending",
        ),
      )
      .reduce((total, obligation) => total + obligation.amount, 0);

    const shortfall = dueSoon - balanceOf(state, this.entityId, this.options.cashAsset);
    if (shortfall <= 0) return false;

    for (const sellAsset of this.options.sellAssets) {
      const held = availableOf(state, this.entityId, sellAsset);
      if (held < 1) continue;
      for (const offer of openOffers(state, {
        side: "buy",
        asset: sellAsset,
        priceAsset: this.options.cashAsset,
      })) {
        const posterCanPay = Math.floor(
          balanceOf(state, offer.poster, this.options.cashAsset) / offer.pricePerUnit,
        );
        const amount = Math.min(
          Math.ceil(shortfall / offer.pricePerUnit),
          offer.remaining,
          held,
          posterCanPay,
        );
        if (amount < 1) continue;
        engine.fillOffer({ actor: this.entityId, offerId: offer.id, amount });
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

/** Advance one tick at a time so rule-based actors can react inside a time skip. */
export function advanceWithAgents(
  engine: EconomicEngine,
  agents: RuleBasedAgent[],
  ticks: number,
): number {
  let actions = 0;
  for (let step = 0; step < ticks; step += 1) {
    engine.advanceTo(engine.inspect().time + 1);
    actions += runAgents(engine, agents);
  }
  return actions;
}
