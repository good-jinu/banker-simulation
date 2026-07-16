import type {
  CollateralStep,
  CollectStep,
  ContractCondition,
  ContractProgram,
  ContractStep,
  LendStep,
  ValidationIssue,
  WaitStep,
} from "./types.ts";

export const MAX_CONTRACT_STEPS = 24;
export const MAX_CONTRACT_DEPTH = 3;
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

export function flattenContractSteps(
  steps: readonly ContractStep[],
): ContractStep[] {
  return steps.flatMap((step) =>
    step.type === "if"
      ? [
          step,
          ...flattenContractSteps(step.thenSteps),
          ...flattenContractSteps(step.elseSteps),
        ]
      : [step],
  );
}

export function countContractSteps(program: ContractProgram): number {
  return flattenContractSteps(program.steps).length;
}

function conditionIsValid(condition: ContractCondition): boolean {
  if (condition.fact === "payment-outcome")
    return condition.equals === "settled" || condition.equals === "defaulted";
  if (condition.fact === "borrower-risk-rating")
    return ["low", "medium", "high"].includes(condition.equals);
  if (condition.fact === "revenue-certainty")
    return ["confirmed", "variable"].includes(condition.equals);
  return false;
}

function sequenceAlwaysCloses(steps: readonly ContractStep[]): boolean {
  for (const step of steps) {
    if (step.type === "close") return true;
    if (
      step.type === "if" &&
      sequenceAlwaysCloses(step.thenSteps) &&
      sequenceAlwaysCloses(step.elseSteps)
    ) {
      return true;
    }
  }
  return false;
}

function validateSequence(
  steps: readonly ContractStep[],
  issues: ValidationIssue[],
  depth: number,
  nested: boolean,
): void {
  let terminated = false;
  for (const step of steps) {
    if (terminated) {
      issues.push(
        issue(
          "unreachable",
          "error",
          "This block can never run because every earlier path is closed.",
          step.id,
        ),
      );
    }

    if (nested && ["lend", "wait", "collect"].includes(step.type)) {
      issues.push(
        issue(
          "nested-value-flow",
          "error",
          "Lend, Wait, and Collect belong in the main sequence, not inside a branch.",
          step.id,
        ),
      );
    }

    if (step.type === "if") {
      if (depth >= MAX_CONTRACT_DEPTH) {
        issues.push(
          issue(
            "nesting-depth",
            "error",
            `Branches may be nested at most ${MAX_CONTRACT_DEPTH} levels deep.`,
            step.id,
          ),
        );
      }
      if (!conditionIsValid(step.condition)) {
        issues.push(
          issue(
            "condition-value",
            "error",
            "Choose a valid public fact and comparison for this branch.",
            step.id,
          ),
        );
      }
      if (step.thenSteps.length === 0 || step.elseSteps.length === 0) {
        issues.push(
          issue(
            "empty-branch",
            "error",
            "Both Then and Else need at least one block.",
            step.id,
          ),
        );
      }
      validateSequence(step.thenSteps, issues, depth + 1, true);
      validateSequence(step.elseSteps, issues, depth + 1, true);
      if (
        sequenceAlwaysCloses(step.thenSteps) &&
        sequenceAlwaysCloses(step.elseSteps)
      ) {
        terminated = true;
      }
    } else if (step.type === "close") {
      terminated = true;
    }
  }
}

function collateralActions(
  step: ContractStep,
  action: CollateralStep["action"],
): CollateralStep[] {
  if (step.type !== "if") return [];
  return [...step.thenSteps, ...step.elseSteps].flatMap((candidate) => {
    const own =
      candidate.type === "collateral" && candidate.action === action
        ? [candidate]
        : [];
    return [...own, ...collateralActions(candidate, action)];
  });
}

function branchContainsAction(
  steps: readonly ContractStep[],
  action: "release" | "liquidate",
): boolean {
  return flattenContractSteps(steps).some(
    (step) => step.type === "collateral" && step.action === action,
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

  const allSteps = flattenContractSteps(program.steps);
  if (allSteps.length > MAX_CONTRACT_STEPS) {
    issues.push(
      issue(
        "step-budget",
        "error",
        `A contract may contain at most ${MAX_CONTRACT_STEPS} executable blocks.`,
      ),
    );
  }

  const ids = new Set<string>();
  for (const step of allSteps) {
    if (!step.id.trim())
      issues.push(issue("block-id", "error", "Every block needs an id."));
    if (ids.has(step.id))
      issues.push(
        issue("duplicate-id", "error", "Block ids must be unique.", step.id),
      );
    ids.add(step.id);
  }

  const lends = allSteps.filter(
    (step): step is LendStep => step.type === "lend",
  );
  const waits = allSteps.filter(
    (step): step is WaitStep => step.type === "wait",
  );
  const collects = allSteps.filter(
    (step): step is CollectStep => step.type === "collect",
  );
  for (const [type, matches] of [
    ["lend", lends],
    ["wait", waits],
    ["collect", collects],
  ] as const) {
    if (matches.length === 0)
      issues.push(issue(`missing-${type}`, "error", `Add a ${type} block.`));
    if (matches.length > 1)
      issues.push(
        issue(
          `duplicate-${type}`,
          "error",
          `A contract supports one ${type} block.`,
          matches[1]?.id,
        ),
      );
  }

  if (!sequenceAlwaysCloses(program.steps)) {
    issues.push(
      issue(
        "missing-close",
        "error",
        "Every possible path needs a Close block.",
      ),
    );
  }
  validateSequence(program.steps, issues, 1, false);

  const rootTypes = program.steps.map((step) => step.type);
  const lendIndex = rootTypes.indexOf("lend");
  const waitIndex = rootTypes.indexOf("wait");
  const collectIndex = rootTypes.indexOf("collect");
  if (
    lendIndex >= 0 &&
    waitIndex >= 0 &&
    collectIndex >= 0 &&
    !(lendIndex < waitIndex && waitIndex < collectIndex)
  ) {
    issues.push(
      issue(
        "block-order",
        "error",
        "The main sequence must read Lend → Wait → Collect before recovery logic.",
        program.steps[Math.max(lendIndex, waitIndex, collectIndex)]?.id,
      ),
    );
  }
  for (const step of program.steps) {
    if (step.type === "if" && program.steps.indexOf(step) < collectIndex) {
      issues.push(
        issue(
          "early-condition",
          "error",
          "Payment outcome is only known after Collect runs.",
          step.id,
        ),
      );
    }
  }

  const lend = lends[0];
  const wait = waits[0];
  const collect = collects[0];
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
    if (lend.currency !== collect.currency)
      issues.push(
        issue(
          "currency",
          "error",
          "Lend and Collect must use the same currency.",
          collect.id,
        ),
      );
    if (lend.borrowerId !== collect.fromId)
      issues.push(
        issue(
          "party",
          "error",
          "Collect from the same borrower you funded.",
          collect.id,
        ),
      );
    if (collect.amount < lend.amount)
      issues.push(
        issue(
          "negative-return",
          "warning",
          "This contract returns less than it lends.",
          collect.id,
        ),
      );
  }

  const requirements = allSteps.filter(
    (step): step is Extract<CollateralStep, { action: "require" }> =>
      step.type === "collateral" && step.action === "require",
  );
  const releases = allSteps.filter(
    (step): step is Extract<CollateralStep, { action: "release" }> =>
      step.type === "collateral" && step.action === "release",
  );
  const liquidations = allSteps.filter(
    (step): step is Extract<CollateralStep, { action: "liquidate" }> =>
      step.type === "collateral" && step.action === "liquidate",
  );
  if (requirements.length > 1)
    issues.push(
      issue(
        "duplicate-collateral",
        "error",
        "Require collateral only once.",
        requirements[1]?.id,
      ),
    );
  for (const action of [...releases, ...liquidations]) {
    if (program.steps.includes(action))
      issues.push(
        issue(
          "unguarded-collateral-action",
          "error",
          "Release and Liquidate must live inside an If / Else payment-outcome branch.",
          action.id,
        ),
      );
  }
  const requirement = requirements[0];
  if (requirement) {
    if (!program.steps.includes(requirement))
      issues.push(
        issue(
          "nested-collateral-requirement",
          "error",
          "Require collateral in the main sequence before collection.",
          requirement.id,
        ),
      );
    if (!Number.isSafeInteger(requirement.amount) || requirement.amount <= 0)
      issues.push(
        issue(
          "collateral-amount",
          "error",
          "Collateral must have a positive whole-cent value.",
          requirement.id,
        ),
      );
    if (lend && requirement.borrowerId !== lend.borrowerId)
      issues.push(
        issue(
          "collateral-party",
          "error",
          "Collateral must belong to the borrower receiving the loan.",
          requirement.id,
        ),
      );
    if (lend && requirement.currency !== lend.currency)
      issues.push(
        issue(
          "collateral-currency",
          "error",
          "Collateral and the loan must use the same valuation currency.",
          requirement.id,
        ),
      );
  }
  if ((releases.length > 0 || liquidations.length > 0) && !requirement)
    issues.push(
      issue(
        "collateral-from-nothing",
        "error",
        "Require collateral before a branch can release or liquidate it.",
        releases[0]?.id ?? liquidations[0]?.id,
      ),
    );
  if (requirement && (releases.length === 0 || liquidations.length === 0))
    issues.push(
      issue(
        "orphaned-collateral",
        "error",
        "A secured contract needs both a settlement release and a default liquidation path.",
        requirement.id,
      ),
    );

  for (const step of program.steps) {
    if (step.type !== "if") continue;
    const hasCollateralAction =
      collateralActions(step, "release").length > 0 ||
      collateralActions(step, "liquidate").length > 0;
    if (!hasCollateralAction) continue;
    if (step.condition.fact !== "payment-outcome") {
      issues.push(
        issue(
          "unsafe-collateral-condition",
          "error",
          "Collateral recovery must branch on the observed payment outcome.",
          step.id,
        ),
      );
      continue;
    }
    const defaultSteps =
      step.condition.equals === "defaulted" ? step.thenSteps : step.elseSteps;
    const settledSteps =
      step.condition.equals === "settled" ? step.thenSteps : step.elseSteps;
    if (!branchContainsAction(defaultSteps, "liquidate"))
      issues.push(
        issue(
          "missing-liquidation",
          "error",
          "The default branch must liquidate the pledged collateral.",
          step.id,
        ),
      );
    if (branchContainsAction(defaultSteps, "release"))
      issues.push(
        issue(
          "release-on-default",
          "error",
          "Do not release collateral after a default.",
          step.id,
        ),
      );
    if (!branchContainsAction(settledSteps, "release"))
      issues.push(
        issue(
          "missing-release",
          "error",
          "The settled branch must release the pledged collateral.",
          step.id,
        ),
      );
    if (branchContainsAction(settledSteps, "liquidate"))
      issues.push(
        issue(
          "liquidate-on-settlement",
          "error",
          "Settled payments cannot liquidate collateral.",
          step.id,
        ),
      );
  }

  return issues;
}

export function hasValidationErrors(
  issues: readonly ValidationIssue[],
): boolean {
  return issues.some((candidate) => candidate.severity === "error");
}
