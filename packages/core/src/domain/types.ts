export type ControllerKind = "rule-based" | "human";

export interface Entity {
  id: string;
  name: string;
  controller: ControllerKind;
}

export interface AssetDefinition {
  id: string;
  name: string;
  kind: "currency" | "resource" | "property" | "claim";
  divisible: boolean;
}

export interface AssetAmount {
  asset: string;
  amount: number;
}

export interface TransferObligation {
  id: string;
  from: string;
  to: string;
  asset: string;
  amount: number;
  dueAt: number;
}

export interface AgreementDefinition {
  id: string;
  proposer: string;
  parties: string[];
  obligations: TransferObligation[];
  memo: string;
  proposedAt: number;
}

export type ObligationStatus = "pending" | "settled" | "defaulted";
export type AgreementStatus = "proposed" | "declined" | "active" | "completed" | "defaulted";

export interface AgreementState extends AgreementDefinition {
  signatures: Set<string>;
  status: AgreementStatus;
  declinedBy?: string;
  obligationStatuses: Map<string, ObligationStatus>;
}

export interface ProductionRule {
  id: string;
  owner: string;
  every: number;
  startsAt: number;
  inputs: AssetAmount[];
  successChance: number;
  successOutputs: AssetAmount[];
  failureOutputs: AssetAmount[];
}

export type OfferSide = "buy" | "sell";
export type OfferStatus = "open" | "filled" | "withdrawn";

/** A posted standing price: the poster buys or sells `asset` for `priceAsset` until exhausted. */
export interface StandingOffer {
  id: string;
  poster: string;
  side: OfferSide;
  asset: string;
  priceAsset: string;
  pricePerUnit: number;
  remaining: number;
  status: OfferStatus;
  postedAt: number;
}

/** A safe, configurable financial product. It composes existing transfers through time. */
export interface FinancialProduct {
  id: string;
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
  publishedAt: number;
}

export type ApplicationStatus = "open" | "funded" | "withdrawn";

/** A borrower's standing consent to be funded under a published product's terms. */
export interface ProductApplication {
  id: string;
  productId: string;
  borrower: string;
  status: ApplicationStatus;
  appliedAt: number;
}

export interface ProductFunding {
  id: string;
  productId: string;
  applicationId: string;
  agreementId: string;
  funder: string;
  borrower: string;
  repaymentClaimId: string;
  fundedAt: number;
}

export type ClaimStatus = "active" | "settled" | "defaulted";

/** A transferable right to one future repayment. */
export interface RepaymentClaim {
  id: string;
  agreementId: string;
  obligationId: string;
  holder: string;
  asset: string;
  amount: number;
  dueAt: number;
  status: ClaimStatus;
}

export type CollateralStatus = "locked" | "released" | "liquidated";

export interface CollateralLock {
  id: string;
  agreementId: string;
  owner: string;
  asset: string;
  amount: number;
  status: CollateralStatus;
}

export interface AuditReport {
  id: string;
  auditor: string;
  subjectType: "product" | "actor";
  subjectId: string;
  assessment: "transparent" | "caution";
  note: string;
  publishedAt: number;
}

export interface Reputation {
  settled: number;
  defaulted: number;
  score: number | null;
}

export type EventType =
  | "EntityRegistered"
  | "AssetDefined"
  | "AssetIssued"
  | "AssetTransferred"
  | "AgreementProposed"
  | "AgreementSigned"
  | "AgreementDeclined"
  | "AgreementActivated"
  | "ObligationSettled"
  | "ObligationDefaulted"
  | "TimeAdvanced"
  | "ProductionRuleRegistered"
  | "ProductionCompleted"
  | "ProductionSkipped"
  | "OfferPosted"
  | "OfferFilled"
  | "OfferWithdrawn"
  | "ProductPublished"
  | "ProductApplicationSubmitted"
  | "ProductApplicationWithdrawn"
  | "ProductFunded"
  | "RepaymentClaimCreated"
  | "RepaymentClaimTransferred"
  | "CollateralLocked"
  | "CollateralReleased"
  | "CollateralLiquidated"
  | "ObligationRescheduled"
  | "AuditPublished";

export interface DomainEvent<T = unknown> {
  id: string;
  type: EventType;
  at: number;
  data: T;
}

export interface StoredEvent<T = unknown> extends DomainEvent<T> {
  sequence: number;
}

export interface EventStore {
  load(): StoredEvent[];
  append(events: DomainEvent[], expectedVersion: number): void;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface RandomSource {
  next(): number;
}

export interface WorldState {
  version: number;
  time: number;
  entities: Map<string, Entity>;
  assets: Map<string, AssetDefinition>;
  balances: Map<string, Map<string, number>>;
  agreements: Map<string, AgreementState>;
  productionRules: Map<string, ProductionRule>;
  offers: Map<string, StandingOffer>;
  products: Map<string, FinancialProduct>;
  applications: Map<string, ProductApplication>;
  productFundings: Map<string, ProductFunding>;
  repaymentClaims: Map<string, RepaymentClaim>;
  collateralLocks: Map<string, CollateralLock>;
  audits: Map<string, AuditReport>;
}
