export type CurrencyCode = "USD";

export type PaymentOutcome = "settled" | "defaulted";
export type BorrowerRiskRating = "low" | "medium" | "high";
export type RevenueCertainty = "confirmed" | "variable";

export type ContractCondition =
  | {
      fact: "payment-outcome";
      equals: PaymentOutcome;
    }
  | {
      fact: "borrower-risk-rating";
      equals: BorrowerRiskRating;
    }
  | {
      fact: "revenue-certainty";
      equals: RevenueCertainty;
    };

export interface ContractProgram {
  schemaVersion: 1;
  id: string;
  name: string;
  steps: ContractStep[];
}

export interface LendStep {
  id: string;
  type: "lend";
  borrowerId: string;
  currency: CurrencyCode;
  amount: number;
}

export interface WaitStep {
  id: string;
  type: "wait";
  days: number;
}

export interface ScheduleStep {
  id: string;
  type: "schedule";
  intervalDays: number;
  occurrences: number;
  steps: ContractStep[];
}

export interface CollectStep {
  id: string;
  type: "collect";
  fromId: string;
  currency: CurrencyCode;
  amount: number;
}

export interface CloseStep {
  id: string;
  type: "close";
}

export interface RequireCollateralStep {
  id: string;
  type: "collateral";
  action: "require";
  borrowerId: string;
  currency: CurrencyCode;
  amount: number;
}

export interface ReleaseCollateralStep {
  id: string;
  type: "collateral";
  action: "release";
}

export interface LiquidateCollateralStep {
  id: string;
  type: "collateral";
  action: "liquidate";
}

export type CollateralStep =
  RequireCollateralStep | ReleaseCollateralStep | LiquidateCollateralStep;

export interface IfStep {
  id: string;
  type: "if";
  condition: ContractCondition;
  thenSteps: ContractStep[];
  elseSteps: ContractStep[];
}

export type ContractStep =
  | LendStep
  | WaitStep
  | CollectStep
  | CloseStep
  | CollateralStep
  | IfStep
  | ScheduleStep;
export type ContractStepType = ContractStep["type"];

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  blockId?: string;
}

export interface CashFlowEntry {
  day: number;
  amount: number;
  currency: CurrencyCode;
  label: string;
  blockId: string;
}

export interface CashFlowProjection {
  entries: CashFlowEntry[];
  totalOutflow: number;
  totalInflow: number;
  netChange: number;
  finalDay: number;
}

export type OutcomeScenario = "best" | "expected" | "adverse";

export interface OutcomeProjectionInput {
  startDay?: number;
  startingCash: number;
  borrowerId: string;
  borrowerRiskRating: BorrowerRiskRating;
  revenueCertainty: RevenueCertainty;
  bestRevenue: number;
  expectedRevenue: number;
  adverseRevenue: number;
  collateralLiquidationValue?: number;
  partialPaymentOnDefault?: boolean;
}

export interface ScenarioCashFlowProjection extends CashFlowProjection {
  scenario: OutcomeScenario;
  borrowerRevenue: number;
  paymentOutcome: PaymentOutcome;
  branch: "then" | "else" | null;
  endingCash: number;
  collateralRecovery: number;
}

export interface OutcomeCashFlowProjection {
  best: ScenarioCashFlowProjection;
  expected: ScenarioCashFlowProjection;
  adverse: ScenarioCashFlowProjection;
}
