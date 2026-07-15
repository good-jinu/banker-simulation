import { DomainError } from "./errors.ts";
import type {
  AgreementDefinition,
  AgreementState,
  AssetAmount,
  AssetDefinition,
  AuditReport,
  CollateralLock,
  DomainEvent,
  Entity,
  FinancialProduct,
  OfferSide,
  ProductApplication,
  ProductFunding,
  ProductionRule,
  RepaymentClaim,
  Reputation,
  StandingOffer,
  StoredEvent,
  WorldState,
} from "./types.ts";

export function emptyWorld(): WorldState {
  return {
    version: 0,
    time: 0,
    entities: new Map(),
    assets: new Map(),
    balances: new Map(),
    agreements: new Map(),
    productionRules: new Map(),
    offers: new Map(),
    products: new Map(),
    applications: new Map(),
    productFundings: new Map(),
    repaymentClaims: new Map(),
    collateralLocks: new Map(),
    audits: new Map(),
  };
}

function mutableBalance(state: WorldState, entity: string): Map<string, number> {
  let balances = state.balances.get(entity);
  if (!balances) {
    balances = new Map();
    state.balances.set(entity, balances);
  }
  return balances;
}

function changeBalance(state: WorldState, entity: string, asset: string, delta: number): void {
  const balances = mutableBalance(state, entity);
  const next = (balances.get(asset) ?? 0) + delta;
  if (next < 0) {
    throw new DomainError(`Event stream would overdraw ${entity}'s ${asset} balance`);
  }
  balances.set(asset, next);
}

function refreshAgreementStatus(agreement: AgreementState): void {
  const statuses = [...agreement.obligationStatuses.values()];
  if (statuses.includes("defaulted")) {
    agreement.status = "defaulted";
  } else if (statuses.length > 0 && statuses.every((status) => status === "settled")) {
    agreement.status = "completed";
  }
}

export function applyEvent(state: WorldState, event: DomainEvent | StoredEvent): void {
  switch (event.type) {
    case "EntityRegistered": {
      const { entity } = event.data as { entity: Entity };
      state.entities.set(entity.id, structuredClone(entity));
      mutableBalance(state, entity.id);
      break;
    }
    case "AssetDefined": {
      const { asset } = event.data as { asset: AssetDefinition };
      state.assets.set(asset.id, structuredClone(asset));
      break;
    }
    case "AssetIssued": {
      const { to, asset, amount } = event.data as {
        to: string;
        asset: string;
        amount: number;
      };
      changeBalance(state, to, asset, amount);
      break;
    }
    case "AssetTransferred": {
      const { from, to, asset, amount } = event.data as {
        from: string;
        to: string;
        asset: string;
        amount: number;
      };
      changeBalance(state, from, asset, -amount);
      changeBalance(state, to, asset, amount);
      break;
    }
    case "AgreementProposed": {
      const { agreement } = event.data as { agreement: AgreementDefinition };
      state.agreements.set(agreement.id, {
        ...structuredClone(agreement),
        signatures: new Set([agreement.proposer]),
        status: "proposed",
        obligationStatuses: new Map(
          agreement.obligations.map((obligation) => [obligation.id, "pending"] as const),
        ),
      });
      break;
    }
    case "AgreementSigned": {
      const { agreementId, signer } = event.data as { agreementId: string; signer: string };
      state.agreements.get(agreementId)?.signatures.add(signer);
      break;
    }
    case "AgreementDeclined": {
      const { agreementId, decliner } = event.data as { agreementId: string; decliner: string };
      const agreement = state.agreements.get(agreementId);
      if (agreement && agreement.status === "proposed") {
        agreement.status = "declined";
        agreement.declinedBy = decliner;
      }
      break;
    }
    case "AgreementActivated": {
      const { agreementId } = event.data as { agreementId: string };
      const agreement = state.agreements.get(agreementId);
      if (agreement) agreement.status = "active";
      break;
    }
    case "ObligationSettled": {
      const { agreementId, obligationId } = event.data as {
        agreementId: string;
        obligationId: string;
      };
      const agreement = state.agreements.get(agreementId);
      if (agreement) {
        agreement.obligationStatuses.set(obligationId, "settled");
        refreshAgreementStatus(agreement);
      }
      for (const claim of state.repaymentClaims.values()) {
        if (claim.agreementId === agreementId && claim.obligationId === obligationId) {
          claim.status = "settled";
        }
      }
      break;
    }
    case "ObligationDefaulted": {
      const { agreementId, obligationId } = event.data as {
        agreementId: string;
        obligationId: string;
      };
      const agreement = state.agreements.get(agreementId);
      if (agreement) {
        agreement.obligationStatuses.set(obligationId, "defaulted");
        refreshAgreementStatus(agreement);
      }
      for (const claim of state.repaymentClaims.values()) {
        if (claim.agreementId === agreementId && claim.obligationId === obligationId) {
          claim.status = "defaulted";
        }
      }
      break;
    }
    case "TimeAdvanced": {
      const { to } = event.data as { to: number };
      state.time = to;
      break;
    }
    case "ProductionRuleRegistered": {
      const { rule } = event.data as { rule: ProductionRule };
      state.productionRules.set(rule.id, structuredClone(rule));
      break;
    }
    case "ProductionCompleted": {
      const { owner, consumed, produced } = event.data as {
        owner: string;
        consumed: AssetAmount[];
        produced: AssetAmount[];
      };
      for (const item of consumed) changeBalance(state, owner, item.asset, -item.amount);
      for (const item of produced) changeBalance(state, owner, item.asset, item.amount);
      break;
    }
    case "ProductionSkipped":
      break;
    case "OfferPosted": {
      const { offer } = event.data as { offer: StandingOffer };
      state.offers.set(offer.id, structuredClone(offer));
      break;
    }
    case "OfferFilled": {
      const { offerId, amount } = event.data as {
        offerId: string;
        filler: string;
        amount: number;
        cost: number;
      };
      const offer = state.offers.get(offerId);
      if (offer) {
        offer.remaining -= amount;
        if (offer.remaining <= 0) offer.status = "filled";
      }
      break;
    }
    case "OfferWithdrawn": {
      const { offerId } = event.data as { offerId: string };
      const offer = state.offers.get(offerId);
      if (offer && offer.status === "open") offer.status = "withdrawn";
      break;
    }
    case "ProductPublished": {
      const { product } = event.data as { product: FinancialProduct };
      state.products.set(product.id, structuredClone(product));
      break;
    }
    case "ProductApplicationSubmitted": {
      const { application } = event.data as { application: ProductApplication };
      state.applications.set(application.id, structuredClone(application));
      break;
    }
    case "ProductApplicationWithdrawn": {
      const { applicationId } = event.data as { applicationId: string };
      const application = state.applications.get(applicationId);
      if (application && application.status === "open") application.status = "withdrawn";
      break;
    }
    case "ProductFunded": {
      const { funding } = event.data as { funding: ProductFunding };
      state.productFundings.set(funding.id, structuredClone(funding));
      const application = state.applications.get(funding.applicationId);
      if (application) application.status = "funded";
      break;
    }
    case "RepaymentClaimCreated": {
      const { claim } = event.data as { claim: RepaymentClaim };
      state.repaymentClaims.set(claim.id, structuredClone(claim));
      break;
    }
    case "RepaymentClaimTransferred": {
      const { claimId, to } = event.data as { claimId: string; to: string };
      const claim = state.repaymentClaims.get(claimId);
      if (claim) claim.holder = to;
      break;
    }
    case "CollateralLocked": {
      const { lock } = event.data as { lock: CollateralLock };
      state.collateralLocks.set(lock.id, structuredClone(lock));
      break;
    }
    case "CollateralReleased": {
      const { lockId } = event.data as { lockId: string };
      const lock = state.collateralLocks.get(lockId);
      if (lock) lock.status = "released";
      break;
    }
    case "CollateralLiquidated": {
      const { lockId, to } = event.data as { lockId: string; to: string };
      const lock = state.collateralLocks.get(lockId);
      if (lock && lock.status === "locked") {
        changeBalance(state, lock.owner, lock.asset, -lock.amount);
        changeBalance(state, to, lock.asset, lock.amount);
        lock.status = "liquidated";
      }
      break;
    }
    case "ObligationRescheduled": {
      const { agreementId, obligationId, newDueAt } = event.data as {
        agreementId: string;
        obligationId: string;
        previousDueAt: number;
        newDueAt: number;
      };
      const agreement = state.agreements.get(agreementId);
      const obligation = agreement?.obligations.find((candidate) => candidate.id === obligationId);
      if (obligation) obligation.dueAt = newDueAt;
      for (const claim of state.repaymentClaims.values()) {
        if (claim.agreementId === agreementId && claim.obligationId === obligationId) {
          claim.dueAt = newDueAt;
        }
      }
      break;
    }
    case "AuditPublished": {
      const { audit } = event.data as { audit: AuditReport };
      state.audits.set(audit.id, structuredClone(audit));
      break;
    }
  }

  if ("sequence" in event) state.version = event.sequence;
}

export function rebuildWorld(events: StoredEvent[]): WorldState {
  const state = emptyWorld();
  for (const event of events) applyEvent(state, event);
  return state;
}

export function balanceOf(state: WorldState, entity: string, asset: string): number {
  return state.balances.get(entity)?.get(asset) ?? 0;
}

export function hasAmounts(state: WorldState, entity: string, amounts: AssetAmount[]): boolean {
  return amounts.every((item) => balanceOf(state, entity, item.asset) >= item.amount);
}

export function lockedAmount(state: WorldState, entity: string, asset: string): number {
  return [...state.collateralLocks.values()]
    .filter((lock) => lock.status === "locked" && lock.owner === entity && lock.asset === asset)
    .reduce((total, lock) => total + lock.amount, 0);
}

/** Open offers matching the filter, best price first (highest bid / lowest ask). */
export function openOffers(
  state: WorldState,
  filter: { side?: OfferSide; asset?: string; priceAsset?: string; poster?: string } = {},
): StandingOffer[] {
  return [...state.offers.values()]
    .filter(
      (offer) =>
        offer.status === "open" &&
        offer.remaining > 0 &&
        (filter.side === undefined || offer.side === filter.side) &&
        (filter.asset === undefined || offer.asset === filter.asset) &&
        (filter.priceAsset === undefined || offer.priceAsset === filter.priceAsset) &&
        (filter.poster === undefined || offer.poster === filter.poster),
    )
    .sort((left, right) =>
      left.side === "buy"
        ? right.pricePerUnit - left.pricePerUnit || left.id.localeCompare(right.id)
        : left.pricePerUnit - right.pricePerUnit || left.id.localeCompare(right.id),
    );
}

export function reputationOf(state: WorldState, entity: string): Reputation {
  let settled = 0;
  let defaulted = 0;

  for (const agreement of state.agreements.values()) {
    for (const obligation of agreement.obligations) {
      if (obligation.from !== entity) continue;
      // A same-tick exchange establishes ownership, not repayment reliability.
      if (obligation.dueAt <= agreement.proposedAt) continue;
      const status = agreement.obligationStatuses.get(obligation.id);
      if (status === "settled") settled += 1;
      if (status === "defaulted") defaulted += 1;
    }
  }

  const observations = settled + defaulted;
  return {
    settled,
    defaulted,
    score: observations === 0 ? null : settled / observations,
  };
}
