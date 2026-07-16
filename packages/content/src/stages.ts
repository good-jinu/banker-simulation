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
      maximumAcceptedRepayment: 125_000,
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
  scoring: { metrics: ["ending-cash", "time-used", "liquidity", "complexity"] },
};

export const stageCatalog: readonly StageDefinition[] = [firstYieldStage];

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
