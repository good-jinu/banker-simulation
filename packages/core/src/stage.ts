export const PLAYER_ID = "player";
export const MARKET_ID = "market";

export type PaymentOutcome = "settled" | "defaulted";
export type BorrowerRiskRating = "low" | "medium" | "high";
export type RevenueCertainty = "confirmed" | "variable";

export interface StageCollateralDefinition {
  assetId: string;
  label: string;
  appraisedValue: number;
  liquidationValue: number;
}

export interface StageBorrowerDefinition {
  id: string;
  name: string;
  needAmount: number;
  minimumFunding: number;
  fundsAvailableAt: number;
  expectedRevenue: number;
  bestCaseRevenue?: number;
  adverseCaseRevenue?: number;
  realizedRevenue?: number;
  maximumAcceptedRepayment: number;
  maximumSecuredRepayment?: number;
  riskRating?: BorrowerRiskRating;
  revenueCertainty?: RevenueCertainty;
  collateral?: StageCollateralDefinition;
}

export interface CashTargetObjective {
  targetCash: number;
  deadline: number;
}

export interface StageSimulationDefinition {
  schemaVersion: 1;
  stageId: string;
  seed: number;
  currency: string;
  startingPlayerCash: number;
  borrower: StageBorrowerDefinition;
  objective: CashTargetObjective;
  rewardId: string;
  partialPaymentOnDefault?: boolean;
}

export type ContractCondition =
  | { fact: "payment-outcome"; equals: PaymentOutcome }
  | { fact: "borrower-risk-rating"; equals: BorrowerRiskRating }
  | { fact: "revenue-certainty"; equals: RevenueCertainty };

export type ContractRuntimeAction =
  | {
      type: "close";
      sourceBlockId: string;
    }
  | {
      type: "release-collateral";
      sourceBlockId: string;
    }
  | {
      type: "liquidate-collateral";
      sourceBlockId: string;
    }
  | {
      type: "if";
      sourceBlockId: string;
      condition: ContractCondition;
      thenActions: ContractRuntimeAction[];
      elseActions: ContractRuntimeAction[];
    };

export interface FundableContractTerms {
  id: string;
  name: string;
  borrowerId: string;
  principal: number;
  repayment: number;
  dueMonth: number;
  collateral?: {
    borrowerId: string;
    amount: number;
    sourceBlockId: string;
  };
  execution?: ContractRuntimeAction[];
  sourceBlocks: {
    lend: string;
    wait: string;
    collect: string;
    close: string;
  };
}

export type StageEvent =
  | {
      sequence: number;
      type: "RunStarted";
      at: number;
      data: {
        stageId: string;
        seed: number;
        playerCash: number;
        marketCash: number;
      };
    }
  | {
      sequence: number;
      type: "ContractPublished";
      at: number;
      data: { contract: FundableContractTerms };
    }
  | {
      sequence: number;
      type: "ContractRejected";
      at: number;
      data: { contractId: string; reasons: string[] };
    }
  | {
      sequence: number;
      type: "ContractFunded";
      at: number;
      data: { contractId: string; borrowerId: string };
    }
  | {
      sequence: number;
      type: "CashTransferred";
      at: number;
      data: {
        from: string;
        to: string;
        amount: number;
        reason:
          | "contract-funding"
          | "business-expense"
          | "business-revenue"
          | "contract-repayment"
          | "default-payment"
          | "collateral-recovery";
        contractId?: string;
        sourceBlockId?: string;
      };
    }
  | {
      sequence: number;
      type: "CollateralLocked";
      at: number;
      data: {
        contractId: string;
        borrowerId: string;
        amount: number;
        assetId: string;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "CollateralReleased";
      at: number;
      data: {
        contractId: string;
        borrowerId: string;
        amount: number;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "CollateralLiquidated";
      at: number;
      data: {
        contractId: string;
        borrowerId: string;
        pledgedAmount: number;
        recoveredAmount: number;
        shortfallRemaining: number;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "TimeAdvanced";
      at: number;
      data: { from: number; to: number };
    }
  | {
      sequence: number;
      type: "BorrowerRevenueRealized";
      at: number;
      data: { borrowerId: string; amount: number; rule: string };
    }
  | {
      sequence: number;
      type: "PaymentRequested";
      at: number;
      data: { contractId: string; amount: number; sourceBlockId: string };
    }
  | {
      sequence: number;
      type: "PaymentPartiallySettled";
      at: number;
      data: {
        contractId: string;
        paid: number;
        shortfall: number;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "PaymentSettled";
      at: number;
      data: { contractId: string; amount: number; sourceBlockId: string };
    }
  | {
      sequence: number;
      type: "PaymentDefaulted";
      at: number;
      data: {
        contractId: string;
        amount: number;
        shortfall: number;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "ConditionEvaluated";
      at: number;
      data: {
        contractId: string;
        fact: ContractCondition["fact"];
        expected: string;
        observed: string;
        matched: boolean;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "BranchExecuted";
      at: number;
      data: {
        contractId: string;
        branch: "then" | "else";
        reason: string;
        sourceBlockId: string;
      };
    }
  | {
      sequence: number;
      type: "ContractClosed";
      at: number;
      data: { contractId: string; sourceBlockId: string };
    }
  | {
      sequence: number;
      type: "StageWon";
      at: number;
      data: { endingCash: number; rewardId: string };
    }
  | {
      sequence: number;
      type: "StageLost";
      at: number;
      data: { endingCash: number; reason: string };
    };

export type RunStatus = "playing" | "won" | "lost";
export type RuntimeContractStatus =
  "published" | "rejected" | "active" | "settled" | "defaulted" | "recovered";
export type RuntimeCollateralStatus = "locked" | "released" | "liquidated";

export interface RuntimeContractState extends FundableContractTerms {
  status: RuntimeContractStatus;
  rejectionReasons: string[];
}

export interface RuntimeCollateralState {
  contractId: string;
  borrowerId: string;
  amount: number;
  assetId: string;
  sourceBlockId: string;
  status: RuntimeCollateralStatus;
  recoveredAmount: number;
}

export interface StageRunState {
  stageId: string;
  seed: number;
  time: number;
  status: RunStatus;
  balances: Record<string, number>;
  minimumPlayerCash: number;
  contract: RuntimeContractState | null;
  collateral: RuntimeCollateralState | null;
  rewardEarned: string | null;
}

export interface PublishResult {
  accepted: boolean;
  reasons: string[];
}

export class StageCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageCommandError";
  }
}

function initialState(): StageRunState {
  return {
    stageId: "",
    seed: 0,
    time: 0,
    status: "playing",
    balances: {},
    minimumPlayerCash: 0,
    contract: null,
    collateral: null,
    rewardEarned: null,
  };
}

function changeBalance(
  state: StageRunState,
  entityId: string,
  amount: number,
): void {
  const next = (state.balances[entityId] ?? 0) + amount;
  if (next < 0)
    throw new StageCommandError(`Event history overdraws ${entityId}`);
  state.balances[entityId] = next;
  state.minimumPlayerCash = Math.min(
    state.minimumPlayerCash,
    state.balances[PLAYER_ID] ?? 0,
  );
}

export function applyStageEvent(state: StageRunState, event: StageEvent): void {
  switch (event.type) {
    case "RunStarted":
      state.stageId = event.data.stageId;
      state.seed = event.data.seed;
      state.time = 0;
      state.balances = {
        [PLAYER_ID]: event.data.playerCash,
        [MARKET_ID]: event.data.marketCash,
      };
      state.minimumPlayerCash = event.data.playerCash;
      break;
    case "ContractPublished":
      state.contract = {
        ...structuredClone(event.data.contract),
        status: "published",
        rejectionReasons: [],
      };
      break;
    case "ContractRejected":
      if (state.contract?.id === event.data.contractId) {
        state.contract.status = "rejected";
        state.contract.rejectionReasons = [...event.data.reasons];
      }
      break;
    case "ContractFunded":
      if (state.contract?.id === event.data.contractId)
        state.contract.status = "active";
      break;
    case "CashTransferred":
      changeBalance(state, event.data.from, -event.data.amount);
      changeBalance(state, event.data.to, event.data.amount);
      break;
    case "CollateralLocked":
      state.collateral = {
        ...event.data,
        status: "locked",
        recoveredAmount: 0,
      };
      break;
    case "CollateralReleased":
      if (state.collateral?.contractId === event.data.contractId)
        state.collateral.status = "released";
      break;
    case "CollateralLiquidated":
      if (state.collateral?.contractId === event.data.contractId) {
        state.collateral.status = "liquidated";
        state.collateral.recoveredAmount = event.data.recoveredAmount;
      }
      if (
        state.contract?.id === event.data.contractId &&
        event.data.shortfallRemaining === 0
      )
        state.contract.status = "recovered";
      break;
    case "TimeAdvanced":
      state.time = event.data.to;
      break;
    case "BorrowerRevenueRealized":
    case "PaymentRequested":
    case "PaymentPartiallySettled":
    case "ConditionEvaluated":
    case "BranchExecuted":
      break;
    case "PaymentSettled":
      if (state.contract?.id === event.data.contractId)
        state.contract.status = "settled";
      break;
    case "PaymentDefaulted":
      if (state.contract?.id === event.data.contractId)
        state.contract.status = "defaulted";
      break;
    case "ContractClosed":
      break;
    case "StageWon":
      state.status = "won";
      state.rewardEarned = event.data.rewardId;
      break;
    case "StageLost":
      state.status = "lost";
      break;
  }
}

export function replayStageEvents(
  events: readonly StageEvent[],
): StageRunState {
  const state = initialState();
  for (const event of events) applyStageEvent(state, event);
  return state;
}

function validateDefinition(definition: StageSimulationDefinition): void {
  if (definition.schemaVersion !== 1)
    throw new StageCommandError("Unsupported stage schema");
  if (
    !Number.isInteger(definition.objective.deadline) ||
    definition.objective.deadline < 1
  )
    throw new StageCommandError(
      "Stage deadline must be a positive whole month",
    );
  const borrower = definition.borrower;
  const amounts = [
    definition.startingPlayerCash,
    borrower.needAmount,
    borrower.minimumFunding,
    borrower.expectedRevenue,
    borrower.bestCaseRevenue ?? borrower.expectedRevenue,
    borrower.adverseCaseRevenue ?? borrower.expectedRevenue,
    borrower.realizedRevenue ?? borrower.expectedRevenue,
    borrower.maximumAcceptedRepayment,
    borrower.maximumSecuredRepayment ?? borrower.maximumAcceptedRepayment,
    borrower.collateral?.appraisedValue ?? 0,
    borrower.collateral?.liquidationValue ?? 0,
    definition.objective.targetCash,
  ];
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0))
    throw new StageCommandError(
      "Stage money values must be non-negative integer minor units",
    );
}

function cloneEvents(events: readonly StageEvent[]): StageEvent[] {
  return structuredClone(events) as StageEvent[];
}

function actionsOf(contract: FundableContractTerms): ContractRuntimeAction[] {
  return (
    contract.execution ?? [
      { type: "close", sourceBlockId: contract.sourceBlocks.close },
    ]
  );
}

export class StageEngine {
  private readonly definition: StageSimulationDefinition;
  private readonly history: StageEvent[];

  constructor(
    definition: StageSimulationDefinition,
    events: readonly StageEvent[] = [],
  ) {
    validateDefinition(definition);
    this.definition = structuredClone(definition);
    this.history = cloneEvents(events);

    if (this.history.length === 0) {
      const borrower = definition.borrower;
      const realizedRevenue =
        borrower.realizedRevenue ?? borrower.expectedRevenue;
      this.append("RunStarted", 0, {
        stageId: definition.stageId,
        seed: definition.seed,
        playerCash: definition.startingPlayerCash,
        marketCash:
          realizedRevenue + (borrower.collateral?.liquidationValue ?? 0),
      });
    } else {
      this.require(
        this.history[0]?.type === "RunStarted",
        "Run history must begin with RunStarted",
      );
      this.require(
        this.history[0]?.data.stageId === definition.stageId,
        `Run history belongs to ${this.history[0]?.data.stageId ?? "another stage"}`,
      );
      this.require(
        this.history[0]?.data.seed === definition.seed,
        "Run history uses a different deterministic seed",
      );
      this.history.forEach((event, index) =>
        this.require(
          event.sequence === index + 1,
          "Run history has a broken event sequence",
        ),
      );
      replayStageEvents(this.history);
    }
  }

  inspect(): StageRunState {
    return replayStageEvents(this.history);
  }

  events(): StageEvent[] {
    return cloneEvents(this.history);
  }

  publishAndFund(contract: FundableContractTerms): PublishResult {
    const state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    this.require(
      state.contract?.status !== "active",
      "An active contract is already funded",
    );
    this.require(
      !state.contract || state.contract.status === "rejected",
      "This run already used its capital",
    );
    this.require(contract.id.trim().length > 0, "A contract needs an id");
    this.require(contract.name.trim().length > 0, "A contract needs a name");
    this.requireMoney(contract.principal, "Principal");
    this.requireMoney(contract.repayment, "Repayment");
    this.require(
      Number.isInteger(contract.dueMonth),
      "Payment month must be a whole month",
    );
    this.require(
      (state.balances[PLAYER_ID] ?? 0) >= contract.principal,
      "You do not have enough available cash to fund this contract",
    );
    if (contract.collateral) {
      this.requireMoney(contract.collateral.amount, "Collateral");
      this.require(
        contract.collateral.borrowerId === contract.borrowerId,
        "Collateral must belong to the funded borrower",
      );
    }

    this.append("ContractPublished", state.time, {
      contract: structuredClone(contract),
    });
    const reasons = this.acceptanceReasons(contract);
    if (reasons.length > 0) {
      this.append("ContractRejected", state.time, {
        contractId: contract.id,
        reasons,
      });
      return { accepted: false, reasons };
    }

    this.append("ContractFunded", state.time, {
      contractId: contract.id,
      borrowerId: contract.borrowerId,
    });
    if (contract.collateral) {
      const collateral = this.definition.borrower.collateral;
      this.require(collateral, "The borrower has no pledgeable collateral");
      this.append("CollateralLocked", state.time, {
        contractId: contract.id,
        borrowerId: contract.borrowerId,
        amount: contract.collateral.amount,
        assetId: collateral.assetId,
        sourceBlockId: contract.collateral.sourceBlockId,
      });
    }
    this.append("CashTransferred", state.time, {
      from: PLAYER_ID,
      to: contract.borrowerId,
      amount: contract.principal,
      reason: "contract-funding",
      contractId: contract.id,
      sourceBlockId: contract.sourceBlocks.lend,
    });
    this.append("CashTransferred", state.time, {
      from: contract.borrowerId,
      to: MARKET_ID,
      amount: contract.principal,
      reason: "business-expense",
      contractId: contract.id,
      sourceBlockId: contract.sourceBlocks.lend,
    });
    return { accepted: true, reasons: [] };
  }

  advanceOneMonth(): void {
    const state = this.inspect();
    this.advanceTo(
      Math.min(state.time + 1, this.definition.objective.deadline),
    );
  }

  advanceToNextEvent(): void {
    const state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    const candidates = [this.definition.objective.deadline];
    if (this.definition.borrower.fundsAvailableAt > state.time)
      candidates.push(this.definition.borrower.fundsAvailableAt);
    if (
      state.contract?.status === "active" &&
      state.contract.dueMonth > state.time
    )
      candidates.push(state.contract.dueMonth);
    this.advanceTo(Math.min(...candidates));
  }

  private advanceTo(target: number): void {
    let state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    this.require(
      Number.isInteger(target) && target > state.time,
      "There is no later event before the deadline",
    );

    for (let month = state.time + 1; month <= target; month += 1) {
      this.append("TimeAdvanced", month, { from: month - 1, to: month });

      if (month === this.definition.borrower.fundsAvailableAt) {
        const borrower = this.definition.borrower;
        const revenue = borrower.realizedRevenue ?? borrower.expectedRevenue;
        this.append("CashTransferred", month, {
          from: MARKET_ID,
          to: borrower.id,
          amount: revenue,
          reason: "business-revenue",
        });
        this.append("BorrowerRevenueRealized", month, {
          borrowerId: borrower.id,
          amount: revenue,
          rule: `The financed work produces ${revenue} cents at month ${borrower.fundsAvailableAt}.`,
        });
      }

      state = this.inspect();
      if (
        state.contract?.status === "active" &&
        state.contract.dueMonth === month
      )
        this.resolvePayment(state.contract, month);

      state = this.inspect();
      const playerCash = state.balances[PLAYER_ID] ?? 0;
      if (playerCash >= this.definition.objective.targetCash) {
        this.append("StageWon", month, {
          endingCash: playerCash,
          rewardId: this.definition.rewardId,
        });
        return;
      }
      if (month >= this.definition.objective.deadline) {
        this.append("StageLost", month, {
          endingCash: playerCash,
          reason:
            state.contract?.status === "defaulted"
              ? "The borrower defaulted and recovery did not reach the target."
              : `The target was not reached by month ${this.definition.objective.deadline}.`,
        });
        return;
      }
    }
  }

  private resolvePayment(contract: RuntimeContractState, month: number): void {
    this.append("PaymentRequested", month, {
      contractId: contract.id,
      amount: contract.repayment,
      sourceBlockId: contract.sourceBlocks.collect,
    });
    const borrowerCash = this.inspect().balances[contract.borrowerId] ?? 0;
    let outcome: PaymentOutcome;
    let shortfall = 0;
    if (borrowerCash >= contract.repayment) {
      this.append("CashTransferred", month, {
        from: contract.borrowerId,
        to: PLAYER_ID,
        amount: contract.repayment,
        reason: "contract-repayment",
        contractId: contract.id,
        sourceBlockId: contract.sourceBlocks.collect,
      });
      this.append("PaymentSettled", month, {
        contractId: contract.id,
        amount: contract.repayment,
        sourceBlockId: contract.sourceBlocks.collect,
      });
      outcome = "settled";
    } else {
      let paid = 0;
      if (this.definition.partialPaymentOnDefault && borrowerCash > 0) {
        paid = borrowerCash;
        this.append("CashTransferred", month, {
          from: contract.borrowerId,
          to: PLAYER_ID,
          amount: paid,
          reason: "default-payment",
          contractId: contract.id,
          sourceBlockId: contract.sourceBlocks.collect,
        });
        this.append("PaymentPartiallySettled", month, {
          contractId: contract.id,
          paid,
          shortfall: contract.repayment - paid,
          sourceBlockId: contract.sourceBlocks.collect,
        });
      }
      shortfall = contract.repayment - paid;
      this.append("PaymentDefaulted", month, {
        contractId: contract.id,
        amount: contract.repayment,
        shortfall,
        sourceBlockId: contract.sourceBlocks.collect,
      });
      outcome = "defaulted";
    }

    this.executeActions(
      actionsOf(contract),
      contract,
      month,
      outcome,
      shortfall,
    );
  }

  private executeActions(
    actions: readonly ContractRuntimeAction[],
    contract: RuntimeContractState,
    month: number,
    paymentOutcome: PaymentOutcome,
    startingShortfall: number,
  ): number {
    let shortfall = startingShortfall;
    for (const action of actions) {
      if (action.type === "close") {
        this.append("ContractClosed", month, {
          contractId: contract.id,
          sourceBlockId: action.sourceBlockId,
        });
        return shortfall;
      }
      if (action.type === "if") {
        const observed = this.observeCondition(
          action.condition,
          paymentOutcome,
        );
        const matched = observed === action.condition.equals;
        this.append("ConditionEvaluated", month, {
          contractId: contract.id,
          fact: action.condition.fact,
          expected: action.condition.equals,
          observed,
          matched,
          sourceBlockId: action.sourceBlockId,
        });
        const branch = matched ? "then" : "else";
        this.append("BranchExecuted", month, {
          contractId: contract.id,
          branch,
          reason: `${action.condition.fact} was ${observed}, so ${branch} ran.`,
          sourceBlockId: action.sourceBlockId,
        });
        shortfall = this.executeActions(
          matched ? action.thenActions : action.elseActions,
          contract,
          month,
          paymentOutcome,
          shortfall,
        );
        continue;
      }
      const collateral = this.inspect().collateral;
      if (!collateral || collateral.status !== "locked") continue;
      if (action.type === "release-collateral") {
        if (paymentOutcome !== "settled") continue;
        this.append("CollateralReleased", month, {
          contractId: contract.id,
          borrowerId: contract.borrowerId,
          amount: collateral.amount,
          sourceBlockId: action.sourceBlockId,
        });
        continue;
      }
      if (paymentOutcome !== "defaulted") continue;
      const liquidationValue =
        this.definition.borrower.collateral?.liquidationValue ?? 0;
      const recoveredAmount = Math.min(
        collateral.amount,
        liquidationValue,
        shortfall,
      );
      if (recoveredAmount > 0) {
        this.append("CashTransferred", month, {
          from: MARKET_ID,
          to: PLAYER_ID,
          amount: recoveredAmount,
          reason: "collateral-recovery",
          contractId: contract.id,
          sourceBlockId: action.sourceBlockId,
        });
      }
      shortfall -= recoveredAmount;
      this.append("CollateralLiquidated", month, {
        contractId: contract.id,
        borrowerId: contract.borrowerId,
        pledgedAmount: collateral.amount,
        recoveredAmount,
        shortfallRemaining: shortfall,
        sourceBlockId: action.sourceBlockId,
      });
    }
    return shortfall;
  }

  private observeCondition(
    condition: ContractCondition,
    paymentOutcome: PaymentOutcome,
  ): string {
    if (condition.fact === "payment-outcome") return paymentOutcome;
    if (condition.fact === "borrower-risk-rating")
      return this.definition.borrower.riskRating ?? "low";
    return this.definition.borrower.revenueCertainty ?? "confirmed";
  }

  private acceptanceReasons(contract: FundableContractTerms): string[] {
    const borrower = this.definition.borrower;
    const reasons: string[] = [];
    if (contract.borrowerId !== borrower.id)
      reasons.push("This borrower did not request the contract.");
    if (contract.principal < borrower.minimumFunding)
      reasons.push(
        `${borrower.name} needs the full minimum funding amount to proceed.`,
      );
    if (contract.principal > borrower.needAmount)
      reasons.push(
        `${borrower.name} will not borrow more than the stated need.`,
      );
    if (contract.dueMonth < borrower.fundsAvailableAt)
      reasons.push(
        `${borrower.name} cannot pay before the expected revenue arrives.`,
      );
    const repaymentLimit = contract.collateral
      ? (borrower.maximumSecuredRepayment ?? borrower.maximumAcceptedRepayment)
      : borrower.maximumAcceptedRepayment;
    if (contract.repayment > repaymentLimit)
      reasons.push(
        `${borrower.name} rejects a repayment above the published limit.`,
      );
    if (contract.collateral) {
      if (!borrower.collateral)
        reasons.push(`${borrower.name} has no eligible collateral to pledge.`);
      else if (contract.collateral.amount > borrower.collateral.appraisedValue)
        reasons.push(
          `${borrower.name}'s collateral is appraised below the requested pledge.`,
        );
    }
    return reasons;
  }

  private append<T extends StageEvent["type"]>(
    type: T,
    at: number,
    data: Extract<StageEvent, { type: T }>["data"],
  ): void {
    this.history.push({
      sequence: this.history.length + 1,
      type,
      at,
      data,
    } as Extract<StageEvent, { type: T }>);
  }

  private require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new StageCommandError(message);
  }

  private requireMoney(amount: number, label: string): void {
    this.require(
      Number.isSafeInteger(amount) && amount > 0,
      `${label} must use positive integer minor units`,
    );
  }
}
