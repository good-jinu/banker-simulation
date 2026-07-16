export const PLAYER_ID = "player";
export const MARKET_ID = "market";

export interface StageBorrowerDefinition {
  id: string;
  name: string;
  needAmount: number;
  minimumFunding: number;
  fundsAvailableAt: number;
  expectedRevenue: number;
  maximumAcceptedRepayment: number;
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
}

export interface FundableContractTerms {
  id: string;
  name: string;
  borrowerId: string;
  principal: number;
  repayment: number;
  dueMonth: number;
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
          | "contract-repayment";
        contractId?: string;
        sourceBlockId?: string;
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
  "published" | "rejected" | "active" | "settled" | "defaulted";

export interface RuntimeContractState extends FundableContractTerms {
  status: RuntimeContractStatus;
  rejectionReasons: string[];
}

export interface StageRunState {
  stageId: string;
  seed: number;
  time: number;
  status: RunStatus;
  balances: Record<string, number>;
  minimumPlayerCash: number;
  contract: RuntimeContractState | null;
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
    case "TimeAdvanced":
      state.time = event.data.to;
      break;
    case "BorrowerRevenueRealized":
    case "PaymentRequested":
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
  ) {
    throw new StageCommandError(
      "Stage deadline must be a positive whole month",
    );
  }
  const amounts = [
    definition.startingPlayerCash,
    definition.borrower.needAmount,
    definition.borrower.minimumFunding,
    definition.borrower.expectedRevenue,
    definition.borrower.maximumAcceptedRepayment,
    definition.objective.targetCash,
  ];
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new StageCommandError(
      "Stage money values must be non-negative integer minor units",
    );
  }
}

function cloneEvents(events: readonly StageEvent[]): StageEvent[] {
  return structuredClone(events) as StageEvent[];
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
      this.append("RunStarted", 0, {
        stageId: definition.stageId,
        seed: definition.seed,
        playerCash: definition.startingPlayerCash,
        marketCash: definition.borrower.expectedRevenue,
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
      this.history.forEach((event, index) => {
        this.require(
          event.sequence === index + 1,
          "Run history has a broken event sequence",
        );
      });
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
    if (this.definition.borrower.fundsAvailableAt > state.time) {
      candidates.push(this.definition.borrower.fundsAvailableAt);
    }
    if (
      state.contract?.status === "active" &&
      state.contract.dueMonth > state.time
    ) {
      candidates.push(state.contract.dueMonth);
    }
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
      state = this.inspect();

      if (month === this.definition.borrower.fundsAvailableAt) {
        const borrower = this.definition.borrower;
        this.append("CashTransferred", month, {
          from: MARKET_ID,
          to: borrower.id,
          amount: borrower.expectedRevenue,
          reason: "business-revenue",
        });
        this.append("BorrowerRevenueRealized", month, {
          borrowerId: borrower.id,
          amount: borrower.expectedRevenue,
          rule: `The financed order pays at month ${borrower.fundsAvailableAt}`,
        });
      }

      state = this.inspect();
      if (
        state.contract?.status === "active" &&
        state.contract.dueMonth === month
      ) {
        const contract = state.contract;
        this.append("PaymentRequested", month, {
          contractId: contract.id,
          amount: contract.repayment,
          sourceBlockId: contract.sourceBlocks.collect,
        });
        const borrowerCash = this.inspect().balances[contract.borrowerId] ?? 0;
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
          this.append("ContractClosed", month, {
            contractId: contract.id,
            sourceBlockId: contract.sourceBlocks.close,
          });
        } else {
          this.append("PaymentDefaulted", month, {
            contractId: contract.id,
            amount: contract.repayment,
            shortfall: contract.repayment - borrowerCash,
            sourceBlockId: contract.sourceBlocks.collect,
          });
        }
      }

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
              ? "The borrower could not meet the promised payment."
              : `The target was not reached by month ${this.definition.objective.deadline}.`,
        });
        return;
      }
    }
  }

  private acceptanceReasons(contract: FundableContractTerms): string[] {
    const borrower = this.definition.borrower;
    const reasons: string[] = [];
    if (contract.borrowerId !== borrower.id)
      reasons.push("This borrower did not request the contract.");
    if (contract.principal < borrower.minimumFunding) {
      reasons.push(
        `${borrower.name} needs the full minimum funding amount to take the order.`,
      );
    }
    if (contract.principal > borrower.needAmount) {
      reasons.push(
        `${borrower.name} will not borrow more than the stated need.`,
      );
    }
    if (contract.dueMonth < borrower.fundsAvailableAt) {
      reasons.push(
        `${borrower.name} cannot pay before the order revenue arrives.`,
      );
    }
    if (contract.repayment > borrower.maximumAcceptedRepayment) {
      reasons.push(
        `${borrower.name} rejects a repayment above the published limit.`,
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
