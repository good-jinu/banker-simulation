import type { FundableContractTerms } from "@banker-simulation/core";
import type {
  CashFlowProjection,
  CloseStep,
  CollectStep,
  ContractProgram,
  ContractStep,
  ContractStepType,
  LendStep,
  WaitStep,
} from "./types.ts";
import { hasValidationErrors, validateProgram } from "./validation.ts";

export interface CompiledContract {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly steps: readonly Readonly<ContractStep>[];
  readonly terms: Readonly<FundableContractTerms>;
}

export class ContractValidationError extends Error {
  constructor() {
    super("Fix the highlighted contract blocks before publishing.");
    this.name = "ContractValidationError";
  }
}

function one<T extends ContractStepType>(
  program: ContractProgram,
  type: T,
): Extract<ContractStep, { type: T }> {
  const step = program.steps.find(
    (candidate): candidate is Extract<ContractStep, { type: T }> =>
      candidate.type === type,
  );
  if (!step) throw new ContractValidationError();
  return step;
}

export function compileContract(
  program: ContractProgram,
  publishedAt = 0,
): CompiledContract {
  const issues = validateProgram(program);
  if (hasValidationErrors(issues)) throw new ContractValidationError();

  const lend = one(program, "lend") as LendStep;
  const wait = one(program, "wait") as WaitStep;
  const collect = one(program, "collect") as CollectStep;
  const close = one(program, "close") as CloseStep;
  const frozenSteps = structuredClone(program.steps).map((step) =>
    Object.freeze(step),
  );
  const terms = Object.freeze({
    id: program.id,
    name: program.name.trim(),
    borrowerId: lend.borrowerId,
    principal: lend.amount,
    repayment: collect.amount,
    dueMonth: publishedAt + wait.months,
    sourceBlocks: Object.freeze({
      lend: lend.id,
      wait: wait.id,
      collect: collect.id,
      close: close.id,
    }),
  });

  return Object.freeze({
    schemaVersion: 1,
    id: program.id,
    name: program.name.trim(),
    steps: Object.freeze(frozenSteps),
    terms,
  });
}

export function projectCashFlows(
  program: ContractProgram,
  startMonth = 0,
): CashFlowProjection {
  let month = startMonth;
  const entries: CashFlowProjection["entries"] = [];
  for (const step of program.steps) {
    if (step.type === "lend") {
      entries.push({
        month,
        amount: -step.amount,
        currency: step.currency,
        label: `Fund ${step.borrowerId}`,
        blockId: step.id,
      });
    } else if (step.type === "wait") {
      month += step.months;
    } else if (step.type === "collect") {
      entries.push({
        month,
        amount: step.amount,
        currency: step.currency,
        label: `Collect from ${step.fromId}`,
        blockId: step.id,
      });
    }
  }
  const totalOutflow =
    entries.reduce((sum, entry) => sum + Math.min(entry.amount, 0), 0) * -1;
  const totalInflow = entries.reduce(
    (sum, entry) => sum + Math.max(entry.amount, 0),
    0,
  );
  return {
    entries,
    totalOutflow,
    totalInflow,
    netChange: totalInflow - totalOutflow,
    finalMonth: month,
  };
}

export function summarizeProgram(
  program: ContractProgram,
  partyNames: Readonly<Record<string, string>> = {},
): string {
  if (program.steps.length === 0)
    return "Add blocks to describe the agreement.";
  return program.steps
    .map((step) => {
      if (step.type === "lend") {
        return `Lend ${formatMoney(step.amount, step.currency)} to ${partyNames[step.borrowerId] ?? step.borrowerId} now.`;
      }
      if (step.type === "wait")
        return `Wait ${step.months} ${step.months === 1 ? "month" : "months"}.`;
      if (step.type === "collect") {
        return `Collect ${formatMoney(step.amount, step.currency)} from ${partyNames[step.fromId] ?? step.fromId}.`;
      }
      return "Close the contract.";
    })
    .join(" ");
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function createDefaultStep(
  type: ContractStepType,
  id: string,
): ContractStep {
  if (type === "lend")
    return { id, type, borrowerId: "mina", currency: "USD", amount: 100_000 };
  if (type === "wait") return { id, type, months: 12 };
  if (type === "collect")
    return { id, type, fromId: "mina", currency: "USD", amount: 110_000 };
  return { id, type: "close" };
}
