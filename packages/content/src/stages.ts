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
  mustReachDeadline?: boolean;
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
    startDate: "2011-01-01",
    startingPlayerCash: 100_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 100_000,
      minimumFunding: 100_000,
      fundsAvailableAt: 720,
      expectedRevenue: 120_000,
      bestCaseRevenue: 120_000,
      adverseCaseRevenue: 120_000,
      maximumAcceptedRepayment: 125_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    objective: { targetCash: 120_000, deadline: 720 },
    rewardId: "contract-stamp",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 720,
    label: "Hold $1,200 by day 720",
  },
  optionalObjectives: [],
  lossConditions: [
    "Reach day 720 with less than $1,200",
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
    startDate: "2011-04-01",
    startingPlayerCash: 100_000,
    borrower: {
      id: "jun",
      name: "Jun's Supply Co.",
      needAmount: 80_000,
      minimumFunding: 80_000,
      fundsAvailableAt: 540,
      expectedRevenue: 100_000,
      bestCaseRevenue: 105_000,
      adverseCaseRevenue: 90_000,
      realizedRevenue: 100_000,
      maximumAcceptedRepayment: 100_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    objective: { targetCash: 120_000, deadline: 540 },
    rewardId: "cashflow-lens",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 540,
    label: "Hold $1,200 by day 540",
  },
  optionalObjectives: [],
  lossConditions: [
    "Offer less than the $800 minimum",
    "Request more than Jun's published $1,000 limit",
    "Reach day 540 below $1,200",
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
    startDate: "2011-08-01",
    startingPlayerCash: 100_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 100_000,
      minimumFunding: 100_000,
      fundsAvailableAt: 720,
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
    objective: { targetCash: 120_000, deadline: 720 },
    rewardId: "collateral-seal",
    partialPaymentOnDefault: true,
  },
  availableBlocks: ["lend", "collateral", "wait", "collect", "if", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 120_000,
    deadline: 720,
    label: "Recover $1,200 by day 720",
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

export const paymentRhythmStage: StageDefinition = {
  schemaVersion: 1,
  id: "payment-rhythm",
  number: 4,
  title: "Payment Rhythm",
  subtitle: "A return can arrive in pieces",
  briefing:
    "Imani can turn an $800 materials advance into four confirmed monthly receipts. Build a fixed payment schedule instead of waiting for one balloon payment.",
  learningGoal:
    "Use a bounded Schedule to collect visible installments and read the calendar.",
  simulation: {
    schemaVersion: 1,
    stageId: "payment-rhythm",
    seed: 20260719,
    currency: "USD",
    startDate: "2012-01-01",
    startingPlayerCash: 100_000,
    borrower: {
      id: "imani",
      name: "Imani Printworks",
      needAmount: 80_000,
      minimumFunding: 80_000,
      fundsAvailableAt: 90,
      expectedRevenue: 90_000,
      bestCaseRevenue: 90_000,
      adverseCaseRevenue: 90_000,
      realizedRevenue: 90_000,
      maximumAcceptedRepayment: 95_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    objective: { targetCash: 110_000, deadline: 180 },
    rewardId: "schedule-dial",
  },
  availableBlocks: ["lend", "wait", "schedule", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 110_000,
    deadline: 180,
    label: "Hold $1,100 by day 180",
  },
  optionalObjectives: [],
  lossConditions: [
    "Ask for more than Imani's published $950 total limit",
    "Reach day 180 with less than $1,100",
  ],
  reward: {
    id: "schedule-dial",
    name: "Payment Rhythm Dial",
    description:
      "A calibrated desk dial that makes every promised payment date visible.",
    kind: "block",
  },
  scoring: standardScoring,
};

export const keepTillOpenStage: StageDefinition = {
  schemaVersion: 1,
  id: "keep-till-open",
  number: 5,
  title: "Keep the Till Open",
  subtitle: "Two promises, one treasury",
  briefing:
    "Mina and Jun both have confirmed work, but their cash arrives at different times. Fund both visible needs and keep enough of the treasury available to finish with $2,000.",
  learningGoal:
    "Publish two independent agreements and read which borrower pays next.",
  simulation: {
    schemaVersion: 1,
    stageId: "keep-till-open",
    seed: 20260720,
    currency: "USD",
    startDate: "2012-06-01",
    startingPlayerCash: 180_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 80_000,
      minimumFunding: 80_000,
      fundsAvailableAt: 90,
      expectedRevenue: 100_000,
      realizedRevenue: 100_000,
      maximumAcceptedRepayment: 100_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    borrowers: [
      {
        id: "mina",
        name: "Mina's Workshop",
        needAmount: 80_000,
        minimumFunding: 80_000,
        fundsAvailableAt: 90,
        expectedRevenue: 100_000,
        realizedRevenue: 100_000,
        maximumAcceptedRepayment: 100_000,
        riskRating: "low",
        revenueCertainty: "confirmed",
      },
      {
        id: "jun",
        name: "Jun's Supply Co.",
        needAmount: 70_000,
        minimumFunding: 70_000,
        fundsAvailableAt: 120,
        expectedRevenue: 90_000,
        realizedRevenue: 90_000,
        maximumAcceptedRepayment: 90_000,
        riskRating: "low",
        revenueCertainty: "confirmed",
      },
    ],
    maxActiveContracts: 2,
    objective: { targetCash: 200_000, deadline: 120 },
    rewardId: "portfolio-lens",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 200_000,
    deadline: 120,
    label: "Hold $2,000 by day 120",
  },
  optionalObjectives: [],
  lossConditions: ["Fund only one borrower", "Reach day 120 below $2,000"],
  reward: {
    id: "portfolio-lens",
    name: "Portfolio Lens",
    description:
      "A desk lens that keeps several promises and dates in one view.",
    kind: "tool",
  },
  scoring: standardScoring,
};

export const fundingDeskStage: StageDefinition = {
  schemaVersion: 1,
  id: "funding-desk",
  number: 6,
  title: "Funding Desk",
  subtitle: "Promises fund promises",
  briefing:
    "Ava will place $700 for 150 days if the rate is fair. Her deposit can fund Mina's $1,000 invoice bridge, but the money is a liability: repay Ava on day 180 after Mina settles on day 150.",
  learningGoal:
    "Publish a deposit product, read its demand factors, then manage the loan and withdrawal calendar as one balance sheet.",
  simulation: {
    schemaVersion: 1,
    stageId: "funding-desk",
    seed: 20260721,
    currency: "USD",
    startDate: "2013-01-01",
    startingPlayerCash: 50_000,
    borrower: {
      id: "mina",
      name: "Mina's Workshop",
      needAmount: 100_000,
      minimumFunding: 100_000,
      fundsAvailableAt: 150,
      expectedRevenue: 120_000,
      bestCaseRevenue: 120_000,
      adverseCaseRevenue: 120_000,
      realizedRevenue: 120_000,
      maximumAcceptedRepayment: 120_000,
      riskRating: "low",
      revenueCertainty: "confirmed",
    },
    savers: [
      {
        id: "ava",
        name: "Ava Park",
        depositAmount: 70_000,
        availableAt: 30,
        requiredTermDays: 150,
        minimumAnnualRateBps: 500,
      },
    ],
    objective: {
      targetCash: 68_000,
      deadline: 180,
      mustReachDeadline: true,
    },
    rewardId: "liquidity-ledger",
  },
  availableBlocks: ["lend", "wait", "collect", "close"],
  primaryObjective: {
    type: "cash-target",
    amount: 68_000,
    deadline: 180,
    mustReachDeadline: true,
    label: "Hold $680 after Ava withdraws on day 180",
  },
  optionalObjectives: [],
  lossConditions: [
    "Offer less than Ava's 5.00% annual rate or a term other than 150 days",
    "Fund Mina before Ava's deposit arrives",
    "Miss Ava's $714.55 withdrawal on day 180",
  ],
  reward: {
    id: "liquidity-ledger",
    name: "Liquidity Ledger",
    description:
      "A permanent ledger that keeps future obligations beside cash on hand.",
    kind: "capability",
  },
  scoring: standardScoring,
};

export const stageCatalog: readonly StageDefinition[] = [
  firstYieldStage,
  affordableTermsStage,
  collateralRecoveryStage,
  paymentRhythmStage,
  keepTillOpenStage,
  fundingDeskStage,
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
    { id: "wait-2", type: "wait", days: 720 },
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
    { id: "wait-2", type: "wait", days: 540 },
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
    { id: "wait-3", type: "wait", days: 720 },
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

export const paymentRhythmWinningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "payment-rhythm-solution",
  name: "Four-receipt materials advance",
  steps: [
    {
      id: "lend-1",
      type: "lend",
      borrowerId: "imani",
      currency: "USD",
      amount: 80_000,
    },
    { id: "wait-2", type: "wait", days: 90 },
    {
      id: "schedule-3",
      type: "schedule",
      intervalDays: 30,
      occurrences: 4,
      steps: [
        {
          id: "collect-4",
          type: "collect",
          fromId: "imani",
          currency: "USD",
          amount: 22_500,
        },
      ],
    },
    { id: "close-5", type: "close" },
  ],
};

export const keepTillOpenMinaProgram: ContractProgram = {
  schemaVersion: 1,
  id: "keep-till-open-mina",
  name: "Mina early return",
  steps: [
    {
      id: "lend-mina",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 80_000,
    },
    { id: "wait-mina", type: "wait", days: 90 },
    {
      id: "collect-mina",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    { id: "close-mina", type: "close" },
  ],
};

export const keepTillOpenJunProgram: ContractProgram = {
  schemaVersion: 1,
  id: "keep-till-open-jun",
  name: "Jun later return",
  steps: [
    {
      id: "lend-jun",
      type: "lend",
      borrowerId: "jun",
      currency: "USD",
      amount: 70_000,
    },
    { id: "wait-jun", type: "wait", days: 120 },
    {
      id: "collect-jun",
      type: "collect",
      fromId: "jun",
      currency: "USD",
      amount: 90_000,
    },
    { id: "close-jun", type: "close" },
  ],
};

export const fundingDeskWinningProgram: ContractProgram = {
  schemaVersion: 1,
  id: "funding-desk-mina",
  name: "Ava-funded invoice bridge",
  steps: [
    {
      id: "lend-mina",
      type: "lend",
      borrowerId: "mina",
      currency: "USD",
      amount: 100_000,
    },
    { id: "wait-mina", type: "wait", days: 120 },
    {
      id: "collect-mina",
      type: "collect",
      fromId: "mina",
      currency: "USD",
      amount: 120_000,
    },
    { id: "close-mina", type: "close" },
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
