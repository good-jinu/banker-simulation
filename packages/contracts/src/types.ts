export type CurrencyCode = "USD";

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
  months: number;
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

export type ContractStep = LendStep | WaitStep | CollectStep | CloseStep;
export type ContractStepType = ContractStep["type"];

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  blockId?: string;
}

export interface CashFlowEntry {
  month: number;
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
  finalMonth: number;
}
