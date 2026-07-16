import type {
  CollectStep,
  ContractProgram,
  ContractStep,
  ContractStepType,
  LendStep,
  ValidationIssue,
  WaitStep,
} from "./types.ts";

export const MAX_CONTRACT_STEPS = 16;
export const MAX_WAIT_MONTHS = 48;

function issue(
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  blockId?: string,
): ValidationIssue {
  return blockId
    ? { code, severity, message, blockId }
    : { code, severity, message };
}

function stepsOf<T extends ContractStepType>(
  program: ContractProgram,
  type: T,
): Extract<ContractStep, { type: T }>[] {
  return program.steps.filter(
    (step): step is Extract<ContractStep, { type: T }> => step.type === type,
  );
}

export function validateProgram(program: ContractProgram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (program.schemaVersion !== 1)
    issues.push(
      issue("schema", "error", "This contract uses an unsupported schema."),
    );
  if (program.name.trim().length === 0)
    issues.push(issue("name", "error", "Give the contract a name."));
  if (program.steps.length > MAX_CONTRACT_STEPS) {
    issues.push(
      issue(
        "step-budget",
        "error",
        `A contract may contain at most ${MAX_CONTRACT_STEPS} blocks.`,
      ),
    );
  }

  const ids = new Set<string>();
  for (const step of program.steps) {
    if (!step.id.trim())
      issues.push(issue("block-id", "error", "Every block needs an id."));
    if (ids.has(step.id))
      issues.push(
        issue("duplicate-id", "error", "Block ids must be unique.", step.id),
      );
    ids.add(step.id);
  }

  const required: ContractStepType[] = ["lend", "wait", "collect", "close"];
  for (const type of required) {
    const matches = stepsOf(program, type);
    if (matches.length === 0)
      issues.push(issue(`missing-${type}`, "error", `Add a ${type} block.`));
    if (matches.length > 1) {
      issues.push(
        issue(
          `duplicate-${type}`,
          "error",
          `Stage 1 supports one ${type} block.`,
          matches[1]?.id,
        ),
      );
    }
  }

  const closeIndex = program.steps.findIndex((step) => step.type === "close");
  if (closeIndex >= 0 && closeIndex < program.steps.length - 1) {
    issues.push(
      issue(
        "unreachable",
        "error",
        "Blocks after Close can never run. Move Close to the end.",
        program.steps[closeIndex + 1]?.id,
      ),
    );
  }

  if (program.steps.length === required.length) {
    const actual = program.steps.map((step) => step.type);
    const firstMismatch = actual.findIndex(
      (type, index) => type !== required[index],
    );
    if (firstMismatch >= 0) {
      issues.push(
        issue(
          "block-order",
          "error",
          "Stage 1 contracts must read Lend → Wait → Collect → Close.",
          program.steps[firstMismatch]?.id,
        ),
      );
    }
  }

  const lend = stepsOf(program, "lend")[0] as LendStep | undefined;
  const wait = stepsOf(program, "wait")[0] as WaitStep | undefined;
  const collect = stepsOf(program, "collect")[0] as CollectStep | undefined;
  if (lend && (!Number.isSafeInteger(lend.amount) || lend.amount <= 0)) {
    issues.push(
      issue(
        "lend-amount",
        "error",
        "Lend a positive whole number of cents.",
        lend.id,
      ),
    );
  }
  if (
    wait &&
    (!Number.isInteger(wait.months) ||
      wait.months < 1 ||
      wait.months > MAX_WAIT_MONTHS)
  ) {
    issues.push(
      issue(
        "wait-duration",
        "error",
        `Wait between 1 and ${MAX_WAIT_MONTHS} months.`,
        wait.id,
      ),
    );
  }
  if (
    collect &&
    (!Number.isSafeInteger(collect.amount) || collect.amount <= 0)
  ) {
    issues.push(
      issue(
        "collect-amount",
        "error",
        "Collect a positive whole number of cents.",
        collect.id,
      ),
    );
  }
  if (lend && collect) {
    if (lend.currency !== collect.currency) {
      issues.push(
        issue(
          "currency",
          "error",
          "Lend and Collect must use the same currency.",
          collect.id,
        ),
      );
    }
    if (lend.borrowerId !== collect.fromId) {
      issues.push(
        issue(
          "party",
          "error",
          "Collect from the same borrower you funded.",
          collect.id,
        ),
      );
    }
    if (collect.amount < lend.amount) {
      issues.push(
        issue(
          "negative-return",
          "warning",
          "This contract returns less than it lends.",
          collect.id,
        ),
      );
    }
  }

  return issues;
}

export function hasValidationErrors(
  issues: readonly ValidationIssue[],
): boolean {
  return issues.some((candidate) => candidate.severity === "error");
}
