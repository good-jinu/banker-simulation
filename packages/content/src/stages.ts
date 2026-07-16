import type {
  ContractProgram,
  ContractStepType,
} from "@banker-simulation/contracts";
import type {
  StageRunState,
  StageSimulationDefinition,
} from "@banker-simulation/core";

export interface StageReward {
  id: string;
  name: string;
  description: string;
  kind: "collectible" | "block" | "tool" | "capability";
}

export interface CashObjective {
  type: "cash-target";
  amount: number;
  deadline: number;
  label: string;
}

export interface ScoringDefinition {
  metrics: Array<"ending-cash" | "time-used" | "liquidity" | "complexity">;
}

export interface StageDefinition {
  schemaVersion: 1;
  id: string;
  number: number;
  title: string;
  subtitle: string;
  briefing: string;
  learningGoal: string;
  simulation: StageSimulationDefinition;
  availableBlocks: ContractStepType[];
  primaryObjective: CashObjective;
  optionalObjectives: CashObjective[];
  lossConditions: string[];
  reward: StageReward;
  scoring: ScoringDefinition;
}

export interface StageScore {
  endingCash: number;
  timeUsed: number;
  minimumLiquidity: number;
  contractComplexity: number;
}

const standardScoring: ScoringDefinition = {
  metrics: ["ending-cash", "time-used", "liquidity", "complexity"],
};

export const firstYieldStage: StageDefinition = {
  schemaVersion: 1,
  id: "first-yield",
  number: 1,
  title: "The First Yield",
  subtitle: "Money now, money later",
  briefing:
    "Mina has a confirmed municipal order but needs working capital today. Design a contract that turns your $1,000 treasury into at least $1,200 when her invoice clears.",
  learningGoal: "Build a complete Lend → Wait → Collect → Close contract.",
  simulation: {
    schemaVersion: 1,
    stageId: "first-yield",
    seed: 20260716,
    currency: "USD",
    startingPlayerCash: 100_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 100_000,
      minimumFunding: 100_000,
      fundsAvailableAt: 24,
      expectedRevenue: 120_000,
      bestCaseRevenue: 120_000,
      adverseCaseRevenue: 120_000,
      maximumAcceptedRepayment: 125_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    objective: { targetCash: 120_000, deadline: 24 },
    rewardId: "contract-stamp",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 24,
    label: "Hold $1,200 by month 24",
  },
  optionalObjectives: [],
  lossConditions: [
    "Reach month 24 with less than $1,200",
    "Default on Mina's repayment",
  ],
  reward: {
    id: "contract-stamp",
    name: "Founder's Contract Stamp",
    description:
      "A permanent mark awarded for your first working financial machine.",
    kind: "collectible",
  },
  scoring: standardScoring,
};

export const affordableTermsStage: StageDefinition = {
  schemaVersion: 1,
  id: "affordable-terms",
  number: 2,
  title: "Room to Breathe",
  subtitle: "A contract must work for both sides",
  briefing:
    "Jun can complete a short wholesale order with $800 today. Keep $200 liquid, wait for the receivable, and offer terms that Jun can actually accept and repay.",
  learningGoal:
    "Compare visible borrower facts with the best, expected, and adverse cash-flow preview.",
  simulation: {
    schemaVersion: 1,
    stageId: "affordable-terms",
    seed: 20260717,
    currency: "USD",
    startingPlayerCash: 100_000,
    borrower: {
      id: "jun",
      name: "Jun's Supply Co.",
      needAmount: 80_000,
      minimumFunding: 80_000,
      fundsAvailableAt: 18,
      expectedRevenue: 100_000,
      bestCaseRevenue: 105_000,
      adverseCaseRevenue: 90_000,
      realizedRevenue: 100_000,
      maximumAcceptedRepayment: 100_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    objective: { targetCash: 120_000, deadline: 18 },
    rewardId: "cashflow-lens",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 18,
    label: "Hold $1,200 by month 18",
  },
  optionalObjectives: [],
  lossConditions: [
    "Offer less than the $800 minimum",
    "Request more than Jun's published $1,000 limit",
    "Reach month 18 below $1,200",
  ],
  reward: {
    id: "cashflow-lens",
    name: "Three-Case Cash-flow Lens",
    description:
      "A desk lens that keeps best, expected, and adverse outcomes visible.",
    kind: "tool",
  },
  scoring: standardScoring,
};

export const collateralRecoveryStage: StageDefinition = {
  schemaVersion: 1,
  id: "collateral-recovery",
  number: 3,
  title: "The Safety Net",
  subtitle: "Plan for the branch you do not want",
  briefing:
    "Mina's next order is profitable but exposed to a variable final payment. Secure the loan with her cutting rig, then make the contract release it after settlement or liquidate only after a default.",
  learningGoal:
    "Use collateral and a payment-outcome If / Else whose two nested paths both close honestly.",
  simulation: {
    schemaVersion: 1,
    stageId: "collateral-recovery",
    seed: 20260718,
    currency: "USD",
    startingPlayerCash: 100_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 100_000,
      minimumFunding: 100_000,
      fundsAvailableAt: 24,
      expectedRevenue: 110_000,
      bestCaseRevenue: 130_000,
      adverseCaseRevenue: 85_000,
      realizedRevenue: 85_000,
      maximumAcceptedRepayment: 110_000,
      maximumSecuredRepayment: 120_000,
      riskRating: "medium",
      revenueCertainty: "variable",
      collateral: {
        assetId: "mina-cutting-rig",
        label: "CNC cutting rig",
        appraisedValue: 45_000,
        liquidationValue: 45_000,
      },
    },
    objective: { targetCash: 120_000, deadline: 24 },
    rewardId: "collateral-seal",
    partialPaymentOnDefault: true,
  },
  availableBlocks: ["lend", "collateral", "wait", "collect", "if", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 24,
    label: "Recover $1,200 by month 24",
  },
  optionalObjectives: [],
  lossConditions: [
    "Leave either branch without a Close block",
    "Release collateral after default or liquidate after settlement",
    "Finish recovery below $1,200",
  ],
  reward: {
    id: "collateral-seal",
    name: "Collateral Control Seal",
    description:
      "A named seal recording that every pledged asset followed an explicit branch.",
    kind: "block",
  },
  scoring: standardScoring,
};

export const stageCatalog: readonly StageDefinition[] = [
  firstYieldStage,
  affordableTermsStage,
  collateralRecoveryStage,
];

export const firstYieldWinningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "first-yield-solution",
  name: "Invoice bridge",
  steps: [
    {
      id: "lend-1",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    { id: "wait-2", type: "wait", months: 24 },
    {
      id: "collect-3",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 120_000,
    },
    { id: "close-4", type: "close" },
  ],
};

export const affordableTermsWinningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "affordable-terms-solution",
  name: "Wholesale bridge",
  steps: [
    {
      id: "lend-1",
      type: "lend",
      borrowerId: "jun",
      currency: "USD",
      amount: 80_000,
    },
    { id: "wait-2", type: "wait", months: 18 },
    {
      id: "collect-3",
      type: "collect",
      fromId: "jun",
      currency: "USD",
      amount: 100_000,
    },
    { id: "close-4", type: "close" },
  ],
};

export const collateralRecoveryWinningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "collateral-recovery-solution",
  name: "Secured variable-order bridge",
  steps: [
    {
      id: "lend-1",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    {
      id: "collateral-2",
      type: "collateral",
      action: "require",
      borrowerId: "mina",
      currency: "USD",
      amount: 35_000,
    },
    { id: "wait-3", type: "wait", months: 24 },
    {
      id: "collect-4",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 120_000,
    },
    {
      id: "if-5",
      type: "if",
      condition: { fact: "payment-outcome", equals: "defaulted" },
      thenSteps: [
        { id: "liquidate-6", type: "collateral", action: "liquidate" },
        { id: "close-7", type: "close" },
      ],
      elseSteps: [
        { id: "release-8", type: "collateral", action: "release" },
        { id: "close-9", type: "close" },
      ],
    },
  ],
};

export function getStage(stageId: string): StageDefinition {
  const stage = stageCatalog.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Unknown stage ${stageId}`);
  return stage;
}

export function scoreRun(
  state: StageRunState,
  contractComplexity: number,
): StageScore {
  return {
    endingCash: state.balances.player ?? 0,
    timeUsed: state.time,
    minimumLiquidity: state.minimumPlayerCash,
    contractComplexity,
  };
}
