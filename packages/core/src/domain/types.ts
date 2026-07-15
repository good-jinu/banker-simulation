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
export type AgreementStatus = "proposed" | "active" | "completed" | "defaulted";

export interface AgreementState extends AgreementDefinition {
  signatures: Set<string>;
  status: AgreementStatus;
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

export interface ProductFunding {
  id: string;
  productId: string;
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
  | "AgreementActivated"
  | "ObligationSettled"
  | "ObligationDefaulted"
  | "TimeAdvanced"
  | "ProductionRuleRegistered"
  | "ProductionCompleted"
  | "ProductionSkipped"
  | "ProductPublished"
  | "ProductFunded"
  | "RepaymentClaimCreated"
  | "RepaymentClaimTransferred"
  | "CollateralLocked"
  | "CollateralReleased"
  | "CollateralLiquidated"
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
  products: Map<string, FinancialProduct>;
  productFundings: Map<string, ProductFunding>;
  repaymentClaims: Map<string, RepaymentClaim>;
  collateralLocks: Map<string, CollateralLock>;
  audits: Map<string, AuditReport>;
}
