import { DomainError } from "./errors.ts";
import {
  applyEvent,
  balanceOf,
  hasAmounts,
  lockedAmount,
  rebuildWorld,
  reputationOf,
} from "./state.ts";
import type {
  AgreementDefinition,
  AgreementState,
  AssetAmount,
  AssetDefinition,
  AuditReport,
  CollateralLock,
  ControllerKind,
  DomainEvent,
  EventStore,
  EventType,
  FinancialProduct,
  IdGenerator,
  OfferSide,
  ProductApplication,
  ProductFunding,
  ProductionRule,
  RandomSource,
  RepaymentClaim,
  Reputation,
  StandingOffer,
  TransferObligation,
  WorldState,
} from "./types.ts";

export interface AgreementProposal {
  proposer: string;
  parties: string[];
  obligations: Array<Omit<TransferObligation, "id">>;
  memo?: string;
}

export interface ProductionRuleInput extends Omit<ProductionRule, "id"> {
  id?: string;
}

export interface FinancialProductInput {
  creator: string;
  name: string;
  fundingAsset: string;
  principalAmount: number;
  term: number;
  fixedInterestRate: number;
  creatorFeeRate: number;
  minimumRepaymentReputation: number;
  collateral?: AssetAmount;
  sourceProductId?: string;
}

export interface ProductFundingInput {
  productId: string;
  funder: string;
  borrower: string;
}

export interface OfferInput {
  actor: string;
  side: OfferSide;
  asset: string;
  amount: number;
  priceAsset: string;
  pricePerUnit: number;
}

export interface OfferFillInput {
  actor: string;
  offerId: string;
  amount: number;
}

export interface ProductApplicationInput {
  productId: string;
  borrower: string;
}

export interface ProductFundingResult {
  fundingId: string;
  agreementId: string;
  repaymentClaimId: string;
}

export interface AuditInput {
  auditor: string;
  subjectType: "product" | "actor";
  subjectId: string;
  assessment: "transparent" | "caution";
  note: string;
}

export class EconomicEngine {
  private readonly store: EventStore;
  private readonly ids: IdGenerator;
  private readonly random: RandomSource;

  constructor(
    store: EventStore,
    ids: IdGenerator,
    random: RandomSource,
  ) {
    this.store = store;
    this.ids = ids;
    this.random = random;
  }

  inspect(): WorldState {
    return rebuildWorld(this.store.load());
  }

  events() {
    return this.store.load();
  }

  balance(entity: string, asset: string): number {
    return balanceOf(this.inspect(), entity, asset);
  }

  reputation(entity: string): Reputation {
    return reputationOf(this.inspect(), entity);
  }

  registerEntity(id: string, name: string, controller: ControllerKind): void {
    const state = this.inspect();
    this.require(!state.entities.has(id), `Entity ${id} already exists`);
    this.commit(state, [this.event("EntityRegistered", state.time, { entity: { id, name, controller } })]);
  }

  defineAsset(asset: AssetDefinition): void {
    const state = this.inspect();
    this.require(!state.assets.has(asset.id), `Asset ${asset.id} already exists`);
    this.commit(state, [this.event("AssetDefined", state.time, { asset })]);
  }

  issue(to: string, asset: string, amount: number): void {
    const state = this.inspect();
    this.requireEntity(state, to);
    this.requireAsset(state, asset);
    this.requireAmount(amount);
    this.commit(state, [this.event("AssetIssued", state.time, { to, asset, amount })]);
  }

  transfer(input: {
    actor: string;
    from: string;
    to: string;
    asset: string;
    amount: number;
  }): void {
    const state = this.inspect();
    this.require(input.actor === input.from, "Only an asset owner may authorize a direct transfer");
    this.requireEntity(state, input.from);
    this.requireEntity(state, input.to);
    this.requireAsset(state, input.asset);
    this.requireAmount(input.amount);
    this.require(
      this.availableBalance(state, input.from, input.asset) >= input.amount,
      `${input.from} has insufficient ${input.asset}`,
    );
    this.commit(state, [
      this.event("AssetTransferred", state.time, {
        from: input.from,
        to: input.to,
        asset: input.asset,
        amount: input.amount,
        reason: "direct",
      }),
    ]);
  }

  postOffer(input: OfferInput): string {
    const state = this.inspect();
    this.requireEntity(state, input.actor);
    this.requireAsset(state, input.asset);
    this.requireAsset(state, input.priceAsset);
    this.require(input.asset !== input.priceAsset, "An offer must trade two different assets");
    this.requireAmount(input.amount);
    this.require(
      Number.isFinite(input.pricePerUnit) && input.pricePerUnit > 0,
      "Offer price must be positive and finite",
    );
    const offer: StandingOffer = {
      id: this.ids.next("offer"),
      poster: input.actor,
      side: input.side,
      asset: input.asset,
      priceAsset: input.priceAsset,
      pricePerUnit: input.pricePerUnit,
      remaining: input.amount,
      status: "open",
      postedAt: state.time,
    };
    this.commit(state, [this.event("OfferPosted", state.time, { offer })]);
    return offer.id;
  }

  fillOffer(input: OfferFillInput): void {
    const state = this.inspect();
    const offer = state.offers.get(input.offerId);
    this.require(offer !== undefined, `Offer ${input.offerId} does not exist`);
    this.require(offer.status === "open", `Offer ${input.offerId} is not open`);
    this.requireEntity(state, input.actor);
    this.require(input.actor !== offer.poster, "An offer cannot be filled by its poster");
    this.requireAmount(input.amount);
    this.require(input.amount <= offer.remaining, `Offer ${input.offerId} has only ${offer.remaining} left`);

    const seller = offer.side === "buy" ? input.actor : offer.poster;
    const buyer = offer.side === "buy" ? offer.poster : input.actor;
    const cost = this.roundMoney(input.amount * offer.pricePerUnit);
    this.require(cost > 0, "Fill amount is too small to price");
    this.require(
      this.availableBalance(state, seller, offer.asset) >= input.amount,
      `${seller} has insufficient ${offer.asset} to fill this offer`,
    );
    this.require(
      this.availableBalance(state, buyer, offer.priceAsset) >= cost,
      `${buyer} has insufficient ${offer.priceAsset} to fill this offer`,
    );

    this.commit(state, [
      this.event("AssetTransferred", state.time, {
        from: seller,
        to: buyer,
        asset: offer.asset,
        amount: input.amount,
        reason: "offer",
        offerId: offer.id,
      }),
      this.event("AssetTransferred", state.time, {
        from: buyer,
        to: seller,
        asset: offer.priceAsset,
        amount: cost,
        reason: "offer",
        offerId: offer.id,
      }),
      this.event("OfferFilled", state.time, {
        offerId: offer.id,
        filler: input.actor,
        amount: input.amount,
        cost,
      }),
    ]);
  }

  withdrawOffer(input: { actor: string; offerId: string }): void {
    const state = this.inspect();
    const offer = state.offers.get(input.offerId);
    this.require(offer !== undefined, `Offer ${input.offerId} does not exist`);
    this.require(offer.status === "open", `Offer ${input.offerId} is not open`);
    this.require(input.actor === offer.poster, "Only the poster may withdraw an offer");
    this.commit(state, [this.event("OfferWithdrawn", state.time, { offerId: offer.id })]);
  }

  registerProductionRule(input: ProductionRuleInput): string {
    const state = this.inspect();
    const rule: ProductionRule = { ...structuredClone(input), id: input.id ?? this.ids.next("production") };
    this.require(!state.productionRules.has(rule.id), `Production rule ${rule.id} already exists`);
    this.requireEntity(state, rule.owner);
    this.require(Number.isInteger(rule.every) && rule.every > 0, "Production interval must be positive");
    this.require(
      Number.isInteger(rule.startsAt) && rule.startsAt > state.time,
      "Production start must be in the future",
    );
    this.require(
      rule.successChance >= 0 && rule.successChance <= 1,
      "Production success chance must be between 0 and 1",
    );
    for (const item of [...rule.inputs, ...rule.successOutputs, ...rule.failureOutputs]) {
      this.requireAsset(state, item.asset);
      this.requireAmount(item.amount);
    }
    this.commit(state, [this.event("ProductionRuleRegistered", state.time, { rule })]);
    return rule.id;
  }

  publishProduct(input: FinancialProductInput): string {
    const state = this.inspect();
    this.requireEntity(state, input.creator);
    this.require(input.name.trim().length > 0, "A product needs a name");
    this.requireAsset(state, input.fundingAsset);
    this.requireAmount(input.principalAmount);
    this.require(Number.isInteger(input.term) && input.term > 0, "Product term must be a positive integer");
    this.requireRate(input.fixedInterestRate, "Fixed interest rate");
    this.requireRate(input.creatorFeeRate, "Creator fee rate");
    this.require(
      input.minimumRepaymentReputation >= 0 && input.minimumRepaymentReputation <= 1,
      "Minimum repayment reputation must be between 0 and 1",
    );
    if (input.collateral) {
      this.requireAsset(state, input.collateral.asset);
      this.requireAmount(input.collateral.amount);
    }
    if (input.sourceProductId) {
      this.require(state.products.has(input.sourceProductId), `Product ${input.sourceProductId} does not exist`);
    }

    const product: FinancialProduct = {
      id: this.ids.next("product"),
      creator: input.creator,
      name: input.name.trim(),
      fundingAsset: input.fundingAsset,
      principalAmount: input.principalAmount,
      term: input.term,
      fixedInterestRate: input.fixedInterestRate,
      creatorFeeRate: input.creatorFeeRate,
      minimumRepaymentReputation: input.minimumRepaymentReputation,
      ...(input.collateral ? { collateral: structuredClone(input.collateral) } : {}),
      ...(input.sourceProductId ? { sourceProductId: input.sourceProductId } : {}),
      publishedAt: state.time,
    };
    this.commit(state, [this.event("ProductPublished", state.time, { product })]);
    return product.id;
  }

  forkProduct(productId: string, creator: string, name?: string): string {
    const state = this.inspect();
    const source = state.products.get(productId);
    this.require(source !== undefined, `Product ${productId} does not exist`);
    this.requireEntity(state, creator);
    const forkId = this.publishProduct({
      creator,
      name: name?.trim() || `Fork of ${source.name}`,
      fundingAsset: source.fundingAsset,
      principalAmount: source.principalAmount,
      term: source.term,
      fixedInterestRate: source.fixedInterestRate,
      creatorFeeRate: source.creatorFeeRate,
      minimumRepaymentReputation: source.minimumRepaymentReputation,
      ...(source.collateral ? { collateral: source.collateral } : {}),
      sourceProductId: source.id,
    });
    return forkId;
  }

  applyForProduct(input: ProductApplicationInput): string {
    const state = this.inspect();
    const product = state.products.get(input.productId);
    this.require(product !== undefined, `Product ${input.productId} does not exist`);
    this.requireEntity(state, input.borrower);
    const duplicate = [...state.applications.values()].some(
      (application) =>
        application.productId === input.productId &&
        application.borrower === input.borrower &&
        application.status === "open",
    );
    this.require(!duplicate, `${input.borrower} already has an open application for this product`);
    this.requireBorrowerEligible(state, product, input.borrower);

    const application: ProductApplication = {
      id: this.ids.next("application"),
      productId: input.productId,
      borrower: input.borrower,
      status: "open",
      appliedAt: state.time,
    };
    this.commit(state, [
      this.event("ProductApplicationSubmitted", state.time, { application }),
    ]);
    return application.id;
  }

  withdrawApplication(input: { actor: string; applicationId: string }): void {
    const state = this.inspect();
    const application = state.applications.get(input.applicationId);
    this.require(application !== undefined, `Application ${input.applicationId} does not exist`);
    this.require(application.status === "open", `Application ${input.applicationId} is not open`);
    this.require(input.actor === application.borrower, "Only the applicant may withdraw an application");
    this.commit(state, [
      this.event("ProductApplicationWithdrawn", state.time, { applicationId: application.id }),
    ]);
  }

  fundProduct(input: ProductFundingInput): ProductFundingResult {
    const state = this.inspect();
    const product = state.products.get(input.productId);
    this.require(product !== undefined, `Product ${input.productId} does not exist`);
    this.requireEntity(state, input.funder);
    this.requireEntity(state, input.borrower);
    this.require(input.funder !== input.borrower, "A product needs distinct funder and borrower");
    const application = [...state.applications.values()].find(
      (candidate) =>
        candidate.productId === input.productId &&
        candidate.borrower === input.borrower &&
        candidate.status === "open",
    );
    this.require(
      application !== undefined,
      `${input.borrower} has not applied for this product; a borrower must consent before funding`,
    );
    this.require(
      this.availableBalance(state, input.funder, product.fundingAsset) >= product.principalAmount,
      `${input.funder} has insufficient ${product.fundingAsset} to fund this product`,
    );
    this.requireBorrowerEligible(state, product, input.borrower);

    const totalRepayment = this.roundMoney(
      product.principalAmount * (1 + product.fixedInterestRate),
    );
    const creatorFee = this.roundMoney(totalRepayment * product.creatorFeeRate);
    const claimAmount = this.roundMoney(totalRepayment - creatorFee);
    this.require(claimAmount > 0, "Creator fee leaves no transferable repayment claim");

    const agreementId = this.proposeAgreement({
      proposer: input.funder,
      parties: [input.funder, input.borrower, product.creator],
      memo: `Product: ${product.name}`,
      obligations: [
        {
          from: input.funder,
          to: input.borrower,
          asset: product.fundingAsset,
          amount: product.principalAmount,
          dueAt: state.time,
        },
        {
          from: input.borrower,
          to: input.funder,
          asset: product.fundingAsset,
          amount: claimAmount,
          dueAt: state.time + product.term,
        },
        ...(creatorFee > 0
          ? [{
            from: input.borrower,
            to: product.creator,
            asset: product.fundingAsset,
            amount: creatorFee,
            dueAt: state.time + product.term,
          }]
          : []),
      ],
    });

    const proposed = this.inspect().agreements.get(agreementId);
    this.require(proposed !== undefined, `Agreement ${agreementId} could not be created`);
    const repaymentObligation = proposed.obligations[1];
    this.require(repaymentObligation !== undefined, "Product repayment obligation could not be created");
    const current = this.inspect();
    const claim: RepaymentClaim = {
      id: this.ids.next("claim"),
      agreementId,
      obligationId: repaymentObligation.id,
      holder: input.funder,
      asset: product.fundingAsset,
      amount: claimAmount,
      dueAt: state.time + product.term,
      status: "active",
    };
    const funding: ProductFunding = {
      id: this.ids.next("funding"),
      productId: product.id,
      applicationId: application.id,
      agreementId,
      funder: input.funder,
      borrower: input.borrower,
      repaymentClaimId: claim.id,
      fundedAt: state.time,
    };
    const pending: DomainEvent[] = [
      this.event("RepaymentClaimCreated", current.time, { claim }),
      this.event("ProductFunded", current.time, { funding }),
    ];
    if (product.collateral) {
      const lock: CollateralLock = {
        id: this.ids.next("collateral"),
        agreementId,
        owner: input.borrower,
        asset: product.collateral.asset,
        amount: product.collateral.amount,
        status: "locked",
      };
      pending.push(this.event("CollateralLocked", current.time, { lock }));
    }
    this.commit(current, pending);

    // Three-way consent already exists: publication (creator), application (borrower), funding (funder).
    for (const party of proposed.parties) {
      if (party !== input.funder) this.acceptAgreement(agreementId, party);
    }
    return { fundingId: funding.id, agreementId, repaymentClaimId: claim.id };
  }

  transferRepaymentClaim(input: { actor: string; claimId: string; to: string }): void {
    const state = this.inspect();
    const claim = state.repaymentClaims.get(input.claimId);
    this.require(claim !== undefined, `Repayment claim ${input.claimId} does not exist`);
    this.require(claim.status === "active", `Repayment claim ${input.claimId} is not active`);
    this.require(input.actor === claim.holder, "Only the current claim holder may transfer it");
    this.requireEntity(state, input.to);
    this.require(input.to !== claim.holder, "A claim must move to a different holder");
    this.commit(state, [
      this.event("RepaymentClaimTransferred", state.time, {
        claimId: claim.id,
        from: claim.holder,
        to: input.to,
      }),
    ]);
  }

  /** The obligation's recipient (claim holder, or the plain payee if no claim exists) sells it. */
  sellRepaymentClaim(input: { actor: string; claimId: string; to: string; price: number }): void {
    const state = this.inspect();
    const claim = state.repaymentClaims.get(input.claimId);
    this.require(claim !== undefined, `Repayment claim ${input.claimId} does not exist`);
    this.require(claim.status === "active", `Repayment claim ${input.claimId} is not active`);
    this.require(input.actor === claim.holder, "Only the current claim holder may sell it");
    this.requireEntity(state, input.to);
    this.require(input.to !== claim.holder, "A claim must be sold to a different holder");
    this.requireAmount(input.price);
    this.require(
      this.availableBalance(state, input.to, claim.asset) >= input.price,
      `${input.to} has insufficient ${claim.asset} to buy this claim`,
    );
    this.commit(state, [
      this.event("AssetTransferred", state.time, {
        from: input.to,
        to: input.actor,
        asset: claim.asset,
        amount: input.price,
        reason: "claim-sale",
        claimId: claim.id,
      }),
      this.event("RepaymentClaimTransferred", state.time, {
        claimId: claim.id,
        from: claim.holder,
        to: input.to,
      }),
    ]);
  }

  /** The recipient forces early resolution of a still-pending obligation instead of waiting for its due date. */
  callInObligation(input: { actor: string; agreementId: string; obligationId: string }): void {
    const state = this.inspect();
    const agreement = state.agreements.get(input.agreementId);
    this.require(agreement !== undefined, `Agreement ${input.agreementId} does not exist`);
    this.require(agreement.status === "active", `Agreement ${input.agreementId} is not active`);
    const obligation = agreement.obligations.find((candidate) => candidate.id === input.obligationId);
    this.require(obligation !== undefined, `Obligation ${input.obligationId} does not exist`);
    this.require(
      agreement.obligationStatuses.get(obligation.id) === "pending",
      `Obligation ${input.obligationId} is not pending`,
    );
    const claim = [...state.repaymentClaims.values()].find(
      (candidate) => candidate.agreementId === agreement.id && candidate.obligationId === obligation.id,
    );
    const recipient = claim?.holder ?? obligation.to;
    this.require(input.actor === recipient, "Only the obligation's recipient may call it in early");

    const pending: DomainEvent[] = [];
    const working = this.project(state, []);
    const workingAgreement = working.agreements.get(agreement.id);
    const workingObligation = workingAgreement?.obligations.find(
      (candidate) => candidate.id === obligation.id,
    );
    this.require(
      workingAgreement !== undefined && workingObligation !== undefined,
      "Obligation could not be resolved",
    );
    this.resolveObligation(working, workingAgreement, workingObligation, state.time, pending);
    this.commit(state, pending);
  }

  /** The recipient pushes a still-pending obligation's due date out, buying the borrower more time. */
  extendObligation(input: {
    actor: string;
    agreementId: string;
    obligationId: string;
    newDueAt: number;
  }): void {
    const state = this.inspect();
    const agreement = state.agreements.get(input.agreementId);
    this.require(agreement !== undefined, `Agreement ${input.agreementId} does not exist`);
    this.require(agreement.status === "active", `Agreement ${input.agreementId} is not active`);
    const obligation = agreement.obligations.find((candidate) => candidate.id === input.obligationId);
    this.require(obligation !== undefined, `Obligation ${input.obligationId} does not exist`);
    this.require(
      agreement.obligationStatuses.get(obligation.id) === "pending",
      `Obligation ${input.obligationId} is not pending`,
    );
    const claim = [...state.repaymentClaims.values()].find(
      (candidate) => candidate.agreementId === agreement.id && candidate.obligationId === obligation.id,
    );
    const recipient = claim?.holder ?? obligation.to;
    this.require(input.actor === recipient, "Only the obligation's recipient may extend its term");
    this.require(
      Number.isInteger(input.newDueAt) && input.newDueAt > obligation.dueAt,
      "A new due date must be a later integer tick",
    );
    this.commit(state, [
      this.event("ObligationRescheduled", state.time, {
        agreementId: agreement.id,
        obligationId: obligation.id,
        previousDueAt: obligation.dueAt,
        newDueAt: input.newDueAt,
      }),
    ]);
  }

  publishAudit(input: AuditInput): string {
    const state = this.inspect();
    this.requireEntity(state, input.auditor);
    this.require(input.note.trim().length > 0, "An audit needs a public note");
    if (input.subjectType === "product") {
      this.require(state.products.has(input.subjectId), `Product ${input.subjectId} does not exist`);
    } else {
      this.requireEntity(state, input.subjectId);
    }
    const audit: AuditReport = {
      id: this.ids.next("audit"),
      auditor: input.auditor,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      assessment: input.assessment,
      note: input.note.trim(),
      publishedAt: state.time,
    };
    this.commit(state, [this.event("AuditPublished", state.time, { audit })]);
    return audit.id;
  }

  proposeAgreement(input: AgreementProposal): string {
    const state = this.inspect();
    const parties = [...new Set(input.parties)];
    this.require(parties.length > 0, "An agreement needs at least one party");
    this.require(parties.includes(input.proposer), "The proposer must be a party");
    this.require(input.obligations.length > 0, "An agreement needs at least one obligation");
    for (const party of parties) this.requireEntity(state, party);

    const obligations: TransferObligation[] = input.obligations.map((obligation) => {
      this.require(parties.includes(obligation.from), `${obligation.from} is not a party`);
      this.require(parties.includes(obligation.to), `${obligation.to} is not a party`);
      this.require(obligation.from !== obligation.to, "An obligation must move an asset");
      this.requireAsset(state, obligation.asset);
      this.requireAmount(obligation.amount);
      this.require(
        Number.isInteger(obligation.dueAt) && obligation.dueAt >= state.time,
        "Obligation due time cannot be in the past",
      );
      return { ...obligation, id: this.ids.next("obligation") };
    });

    const agreement: AgreementDefinition = {
      id: this.ids.next("agreement"),
      proposer: input.proposer,
      parties,
      obligations,
      memo: input.memo ?? "",
      proposedAt: state.time,
    };
    const pending: DomainEvent[] = [
      this.event("AgreementProposed", state.time, { agreement }),
    ];
    const working = this.project(state, pending);

    if (parties.length === 1) {
      const activated = this.event("AgreementActivated", state.time, { agreementId: agreement.id });
      pending.push(activated);
      applyEvent(working, activated);
      this.settleDueObligations(working, state.time, pending);
    }

    this.commit(state, pending);
    return agreement.id;
  }

  acceptAgreement(agreementId: string, signer: string): void {
    const state = this.inspect();
    const agreement = state.agreements.get(agreementId);
    this.require(agreement !== undefined, `Agreement ${agreementId} does not exist`);
    this.require(agreement.status === "proposed", `Agreement ${agreementId} is not open`);
    this.require(agreement.parties.includes(signer), `${signer} is not a party`);
    this.require(!agreement.signatures.has(signer), `${signer} already signed`);

    const signed = this.event("AgreementSigned", state.time, { agreementId, signer });
    const pending: DomainEvent[] = [signed];
    const working = this.project(state, pending);
    const projectedAgreement = working.agreements.get(agreementId);

    if (
      projectedAgreement &&
      projectedAgreement.parties.every((party) => projectedAgreement.signatures.has(party))
    ) {
      const activated = this.event("AgreementActivated", state.time, { agreementId });
      pending.push(activated);
      applyEvent(working, activated);
      this.settleDueObligations(working, state.time, pending);
    }

    this.commit(state, pending);
  }

  declineAgreement(agreementId: string, decliner: string): void {
    const state = this.inspect();
    const agreement = state.agreements.get(agreementId);
    this.require(agreement !== undefined, `Agreement ${agreementId} does not exist`);
    this.require(agreement.status === "proposed", `Agreement ${agreementId} is not open`);
    this.require(agreement.parties.includes(decliner), `${decliner} is not a party`);
    this.commit(state, [
      this.event("AgreementDeclined", state.time, { agreementId, decliner }),
    ]);
  }

  advanceTo(target: number): void {
    const state = this.inspect();
    this.require(Number.isInteger(target) && target > state.time, "Target time must be a future integer");

    const pending: DomainEvent[] = [];
    const working = this.project(state, []);
    for (let time = state.time + 1; time <= target; time += 1) {
      const advanced = this.event("TimeAdvanced", time, { to: time });
      pending.push(advanced);
      applyEvent(working, advanced);
      this.runProduction(working, time, pending);
      this.settleDueObligations(working, time, pending);
    }
    this.commit(state, pending);
  }

  private runProduction(state: WorldState, time: number, pending: DomainEvent[]): void {
    const rules = [...state.productionRules.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const rule of rules) {
      if (time < rule.startsAt || (time - rule.startsAt) % rule.every !== 0) continue;

      if (!hasAmounts(state, rule.owner, rule.inputs)) {
        const skipped = this.event("ProductionSkipped", time, {
          ruleId: rule.id,
          owner: rule.owner,
          reason: "missing-inputs",
        });
        pending.push(skipped);
        applyEvent(state, skipped);
        continue;
      }

      const successful = this.random.next() < rule.successChance;
      const completed = this.event("ProductionCompleted", time, {
        ruleId: rule.id,
        owner: rule.owner,
        successful,
        consumed: structuredClone(rule.inputs),
        produced: structuredClone(successful ? rule.successOutputs : rule.failureOutputs),
      });
      pending.push(completed);
      applyEvent(state, completed);
    }
  }

  private settleDueObligations(
    state: WorldState,
    time: number,
    pending: DomainEvent[],
  ): void {
    const due = [...state.agreements.values()]
      .filter((agreement) => agreement.status === "active" || agreement.status === "defaulted")
      .flatMap((agreement) =>
        agreement.obligations
          .filter(
            (obligation) =>
              agreement.obligationStatuses.get(obligation.id) === "pending" &&
              obligation.dueAt <= time,
          )
          .map((obligation) => ({ agreement, obligation })),
      )
      .sort(
        (left, right) =>
          left.obligation.dueAt - right.obligation.dueAt ||
          left.obligation.id.localeCompare(right.obligation.id),
      );

    for (const { agreement, obligation } of due) {
      this.resolveObligation(state, agreement, obligation, time, pending);
    }
  }

  /** Settles an obligation now if affordable, else defaults it and liquidates any collateral. */
  private resolveObligation(
    state: WorldState,
    agreement: AgreementState,
    obligation: TransferObligation,
    time: number,
    pending: DomainEvent[],
  ): void {
    const claim = [...state.repaymentClaims.values()].find(
      (candidate) =>
        candidate.agreementId === agreement.id && candidate.obligationId === obligation.id,
    );
    const recipient = claim?.holder ?? obligation.to;
    if (balanceOf(state, obligation.from, obligation.asset) >= obligation.amount) {
      const transferred = this.event("AssetTransferred", time, {
        from: obligation.from,
        to: recipient,
        asset: obligation.asset,
        amount: obligation.amount,
        reason: "agreement",
        agreementId: agreement.id,
        obligationId: obligation.id,
      });
      const settled = this.event("ObligationSettled", time, {
        agreementId: agreement.id,
        obligationId: obligation.id,
      });
      pending.push(transferred, settled);
      applyEvent(state, transferred);
      applyEvent(state, settled);
    } else {
      if (claim) this.liquidateCollateral(state, agreement.id, recipient, time, pending);
      const defaulted = this.event("ObligationDefaulted", time, {
        agreementId: agreement.id,
        obligationId: obligation.id,
        debtor: obligation.from,
        shortfall: obligation.amount - balanceOf(state, obligation.from, obligation.asset),
      });
      pending.push(defaulted);
      applyEvent(state, defaulted);
    }
    this.releaseResolvedCollateral(state, agreement.id, time, pending);
  }

  private liquidateCollateral(
    state: WorldState,
    agreementId: string,
    recipient: string,
    time: number,
    pending: DomainEvent[],
  ): void {
    for (const lock of state.collateralLocks.values()) {
      if (lock.agreementId !== agreementId || lock.status !== "locked") continue;
      const liquidated = this.event("CollateralLiquidated", time, { lockId: lock.id, to: recipient });
      pending.push(liquidated);
      applyEvent(state, liquidated);
    }
  }

  private releaseResolvedCollateral(
    state: WorldState,
    agreementId: string,
    time: number,
    pending: DomainEvent[],
  ): void {
    const agreement = state.agreements.get(agreementId);
    if (!agreement || [...agreement.obligationStatuses.values()].some((status) => status === "pending")) {
      return;
    }
    for (const lock of state.collateralLocks.values()) {
      if (lock.agreementId !== agreementId || lock.status !== "locked") continue;
      const released = this.event("CollateralReleased", time, { lockId: lock.id });
      pending.push(released);
      applyEvent(state, released);
    }
  }

  private project(state: WorldState, events: DomainEvent[]): WorldState {
    const projected = rebuildWorld(this.store.load());
    this.require(projected.version === state.version, "State changed during command preparation");
    for (const event of events) applyEvent(projected, event);
    return projected;
  }

  private commit(state: WorldState, events: DomainEvent[]): void {
    this.store.append(events, state.version);
  }

  private event<T>(type: EventType, at: number, data: T): DomainEvent<T> {
    return { id: this.ids.next("event"), type, at, data };
  }

  private requireBorrowerEligible(
    state: WorldState,
    product: FinancialProduct,
    borrower: string,
  ): void {
    const borrowerReputation = reputationOf(state, borrower).score ?? 0.5;
    this.require(
      borrowerReputation >= product.minimumRepaymentReputation,
      `${borrower} does not meet the product's repayment-reputation condition`,
    );
    if (product.collateral) {
      this.require(
        this.availableBalance(state, borrower, product.collateral.asset) >= product.collateral.amount,
        `${borrower} cannot lock the required collateral`,
      );
    }
  }

  private requireEntity(state: WorldState, entity: string): void {
    this.require(state.entities.has(entity), `Entity ${entity} does not exist`);
  }

  private requireAsset(state: WorldState, asset: string): void {
    this.require(state.assets.has(asset), `Asset ${asset} does not exist`);
  }

  private requireAmount(amount: number): void {
    this.require(Number.isFinite(amount) && amount > 0, "Amount must be positive and finite");
  }

  private requireRate(rate: number, label: string): void {
    this.require(Number.isFinite(rate) && rate >= 0 && rate < 1, `${label} must be between 0 and 1`);
  }

  private availableBalance(state: WorldState, entity: string, asset: string): number {
    return balanceOf(state, entity, asset) - lockedAmount(state, entity, asset);
  }

  private roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private require(condition: boolean, message: string): asserts condition {
    if (!condition) throw new DomainError(message);
  }
}
