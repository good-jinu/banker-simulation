import type {
  ContractRuntimeAction,
  FundableContractTerms,
} from "@banker-simulation/core";
import type {
  CashFlowProjection,
  CloseStep,
  CollectStep,
  ContractCondition,
  ContractProgram,
  ContractStep,
  ContractStepType,
  LendStep,
  OutcomeCashFlowProjection,
  OutcomeProjectionInput,
  OutcomeScenario,
  PaymentOutcome,
  ScenarioCashFlowProjection,
  WaitStep,
} from "./types.ts";
import {
  flattenContractSteps,
  hasValidationErrors,
  validateProgram,
} from "./validation.ts";

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
  const step = flattenContractSteps(program.steps).find(
    (candidate): candidate is Extract<ContractStep, { type: T }> =>
      candidate.type === type,
  );
  if (!step) throw new ContractValidationError();
  return step;
}

function compileActions(
  steps: readonly ContractStep[],
): ContractRuntimeAction[] {
  return steps.flatMap((step): ContractRuntimeAction[] => {
    if (step.type === "close")
      return [{ type: "close", sourceBlockId: step.id }];
    if (step.type === "collateral" && step.action === "release")
      return [{ type: "release-collateral", sourceBlockId: step.id }];
    if (step.type === "collateral" && step.action === "liquidate")
      return [{ type: "liquidate-collateral", sourceBlockId: step.id }];
    if (step.type === "if")
      return [
        {
          type: "if",
          sourceBlockId: step.id,
          condition: structuredClone(step.condition),
          thenActions: compileActions(step.thenSteps),
          elseActions: compileActions(step.elseSteps),
        },
      ];
    return [];
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
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
  const collateral = flattenContractSteps(program.steps).find(
    (step) => step.type === "collateral" && step.action === "require",
  );
  const collectIndex = program.steps.findIndex(
    (step) => step.id === collect.id,
  );
  const execution = compileActions(program.steps.slice(collectIndex + 1));
  const clonedSteps = structuredClone(program.steps);
  const terms: FundableContractTerms = {
    id: program.id,
    name: program.name.trim(),
    borrowerId: lend.borrowerId,
    principal: lend.amount,
    repayment: collect.amount,
    dueMonth: publishedAt + wait.months,
    ...(collateral?.type === "collateral" && collateral.action === "require"
      ? {
          collateral: {
            borrowerId: collateral.borrowerId,
            amount: collateral.amount,
            sourceBlockId: collateral.id,
          },
        }
      : {}),
    ...(execution.length === 1 && execution[0]?.type === "close"
      ? {}
      : { execution }),
    sourceBlocks: {
      lend: lend.id,
      wait: wait.id,
      collect: collect.id,
      close: close.id,
    },
  };

  return deepFreeze({
    schemaVersion: 1,
    id: program.id,
    name: program.name.trim(),
    steps: clonedSteps,
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
  return cashFlowTotals(entries, month);
}

function cashFlowTotals(
  entries: CashFlowProjection["entries"],
  finalMonth: number,
): CashFlowProjection {
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
    finalMonth,
  };
}

function observedCondition(
  condition: ContractCondition,
  outcome: PaymentOutcome,
  input: OutcomeProjectionInput,
): string {
  if (condition.fact === "payment-outcome") return outcome;
  if (condition.fact === "borrower-risk-rating")
    return input.borrowerRiskRating;
  return input.revenueCertainty;
}

function projectScenario(
  program: ContractProgram,
  input: OutcomeProjectionInput,
  scenario: OutcomeScenario,
  borrowerRevenue: number,
): ScenarioCashFlowProjection {
  const compiled = compileContract(program, input.startMonth ?? 0);
  const terms = compiled.terms;
  const entries: CashFlowProjection["entries"] = [
    {
      month: input.startMonth ?? 0,
      amount: -terms.principal,
      currency: "USD",
      label: `Fund ${input.borrowerId}`,
      blockId: terms.sourceBlocks.lend,
    },
  ];
  const paymentOutcome: PaymentOutcome =
    borrowerRevenue >= terms.repayment ? "settled" : "defaulted";
  let shortfall = 0;
  if (paymentOutcome === "settled") {
    entries.push({
      month: terms.dueMonth,
      amount: terms.repayment,
      currency: "USD",
      label: `Payment settles`,
      blockId: terms.sourceBlocks.collect,
    });
  } else {
    const paid = input.partialPaymentOnDefault
      ? Math.min(borrowerRevenue, terms.repayment)
      : 0;
    if (paid > 0)
      entries.push({
        month: terms.dueMonth,
        amount: paid,
        currency: "USD",
        label: `Partial payment`,
        blockId: terms.sourceBlocks.collect,
      });
    shortfall = terms.repayment - paid;
  }

  let branch: ScenarioCashFlowProjection["branch"] = null;
  let collateralRecovery = 0;
  const execute = (actions: readonly ContractRuntimeAction[]): void => {
    for (const action of actions) {
      if (action.type === "if") {
        const matched =
          observedCondition(action.condition, paymentOutcome, input) ===
          action.condition.equals;
        branch ??= matched ? "then" : "else";
        execute(matched ? action.thenActions : action.elseActions);
      } else if (
        action.type === "liquidate-collateral" &&
        paymentOutcome === "defaulted" &&
        terms.collateral
      ) {
        collateralRecovery = Math.min(
          terms.collateral.amount,
          input.collateralLiquidationValue ?? 0,
          shortfall,
        );
        shortfall -= collateralRecovery;
        if (collateralRecovery > 0)
          entries.push({
            month: terms.dueMonth,
            amount: collateralRecovery,
            currency: "USD",
            label: "Collateral recovery",
            blockId: action.sourceBlockId,
          });
      }
    }
  };
  execute(
    terms.execution ?? [
      { type: "close", sourceBlockId: terms.sourceBlocks.close },
    ],
  );

  const totals = cashFlowTotals(entries, terms.dueMonth);
  return {
    ...totals,
    scenario,
    borrowerRevenue,
    paymentOutcome,
    branch,
    endingCash: input.startingCash + totals.netChange,
    collateralRecovery,
  };
}

export function projectOutcomeCashFlows(
  program: ContractProgram,
  input: OutcomeProjectionInput,
): OutcomeCashFlowProjection {
  return {
    best: projectScenario(program, input, "best", input.bestRevenue),
    expected: projectScenario(
      program,
      input,
      "expected",
      input.expectedRevenue,
    ),
    adverse: projectScenario(program, input, "adverse", input.adverseRevenue),
  };
}

function conditionSummary(condition: ContractCondition): string {
  if (condition.fact === "payment-outcome")
    return `payment is ${condition.equals}`;
  if (condition.fact === "borrower-risk-rating")
    return `the borrower's public risk rating is ${condition.equals}`;
  return `the borrower's revenue is ${condition.equals}`;
}

function summarizeSteps(
  steps: readonly ContractStep[],
  partyNames: Readonly<Record<string, string>>,
): string {
  return steps
    .map((step) => {
      if (step.type === "lend")
        return `Lend ${formatMoney(step.amount, step.currency)} to ${partyNames[step.borrowerId] ?? step.borrowerId} now.`;
      if (step.type === "wait")
        return `Wait ${step.months} ${step.months === 1 ? "month" : "months"}.`;
      if (step.type === "collect")
        return `Collect ${formatMoney(step.amount, step.currency)} from ${partyNames[step.fromId] ?? step.fromId}.`;
      if (step.type === "close") return "Close the contract.";
      if (step.type === "collateral") {
        if (step.action === "require")
          return `Require ${formatMoney(step.amount, step.currency)} of collateral from ${partyNames[step.borrowerId] ?? step.borrowerId}.`;
        if (step.action === "release") return "Release the collateral.";
        return "Liquidate the collateral to recover the shortfall.";
      }
      return `If ${conditionSummary(step.condition)}, then ${summarizeSteps(step.thenSteps, partyNames)} Otherwise, ${summarizeSteps(step.elseSteps, partyNames)}`;
    })
    .join(" ");
}

export function summarizeProgram(
  program: ContractProgram,
  partyNames: Readonly<Record<string, string>> = {},
): string {
  if (program.steps.length === 0)
    return "Add blocks to describe the agreement.";
  return summarizeSteps(program.steps, partyNames);
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function createDefaultCollateralAction(
  action: "release" | "liquidate",
  id: string,
): ContractStep {
  return { id, type: "collateral", action };
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
  if (type === "collateral")
    return {
      id,
      type,
      action: "require",
      borrowerId: "mina",
      currency: "USD",
      amount: 40_000,
    };
  if (type === "if")
    return {
      id,
      type,
      condition: { fact: "payment-outcome", equals: "defaulted" },
      thenSteps: [
        createDefaultCollateralAction("liquidate", `${id}-then-1`),
        { id: `${id}-then-2`, type: "close" },
      ],
      elseSteps: [
        createDefaultCollateralAction("release", `${id}-else-1`),
        { id: `${id}-else-2`, type: "close" },
      ],
    };
  return { id, type: "close" };
}
