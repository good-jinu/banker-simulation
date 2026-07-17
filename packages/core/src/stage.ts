export const PLAYER_ID = "player";
export const MARKET_ID = "market";

/**
 * One engine tick is one in-game day.  Deposit interest still accrues on a
 * 30-day rhythm at one twelfth of the annual rate, so day-based runs earn
 * exactly what the older month-based runs did.
 */
export const DAYS_PER_ACCRUAL_PERIOD = 30;

/** Stage clocks default to the campaign's opening date. */
export const DEFAULT_STAGE_START_DATE = "2011-01-01";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve an engine day index to a calendar date on the stage's clock. */
export function gameDayToDate(startDate: string, day: number): Date {
  return new Date(Date.parse(`${startDate}T00:00:00Z`) + day * 86_400_000);
}

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

/**
 * An authored saver is deliberately small and legible.  Later stages can
 * replace this with a wider market, but this gives the first funding lesson a
 * deterministic customer whose decision can always be explained.
 */
export interface StageSaverDefinition {
  id: string;
  name: string;
  depositAmount: number;
  availableAt: number;
  requiredTermDays: number;
  minimumAnnualRateBps: number;
}

export interface DepositProductTerms {
  id: string;
  name: string;
  annualRateBps: number;
  termDays: number;
  minimumDeposit: number;
  maximumDeposit: number;
}

export interface CashTargetObjective {
  targetCash: number;
  deadline: number;
  minimumLiquidity?: number;
  /** Prevent a temporary balance before a due withdrawal from ending a stage. */
  mustReachDeadline?: boolean;
}

export interface StageSimulationDefinition {
  schemaVersion: 1;
  stageId: string;
  seed: number;
  currency: string;
  /** ISO calendar date shown for day 0; defaults to DEFAULT_STAGE_START_DATE. */
  startDate?: string;
  startingPlayerCash: number;
  borrower: StageBorrowerDefinition;
  borrowers?: StageBorrowerDefinition[];
  savers?: StageSaverDefinition[];
  maxActiveContracts?: number;
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
  dueDay: number;
  payments?: Array<{
    id: string;
    dueDay: number;
    amount: number;
    sourceBlockId: string;
  }>;
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
        saverCash?: Record<string, number>;
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
      type: "DepositProductPublished";
      at: number;
      data: { product: DepositProductTerms };
    }
  | {
      sequence: number;
      type: "DepositOpened";
      at: number;
      data: {
        productId: string;
        saverId: string;
        principal: number;
        openedAt: number;
        dueDay: number;
      };
    }
  | {
      sequence: number;
      type: "DepositProductReviewed";
      at: number;
      data: {
        productId: string;
        saverId: string;
        accepted: boolean;
        reasons: string[];
      };
    }
  | {
      sequence: number;
      type: "DepositInterestAccrued";
      at: number;
      data: { productId: string; saverId: string; amount: number };
    }
  | {
      sequence: number;
      type: "DepositWithdrawn";
      at: number;
      data: { productId: string; saverId: string; amount: number };
    }
  | {
      sequence: number;
      type: "DepositWithdrawalFailed";
      at: number;
      data: {
        productId: string;
        saverId: string;
        amount: number;
        availableCash: number;
      };
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
          | "collateral-recovery"
          | "deposit-open"
          | "deposit-withdrawal";
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
      data: {
        contractId: string;
        amount: number;
        sourceBlockId: string;
        paymentId?: string;
      };
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
      data: {
        contractId: string;
        amount: number;
        sourceBlockId: string;
        paymentId?: string;
        isFinal?: boolean;
      };
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
  settledPaymentIds: string[];
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

export interface RuntimeDepositProductState extends DepositProductTerms {
  publishedAt: number;
}

export type RuntimeDepositStatus = "active" | "withdrawn" | "failed";

export interface RuntimeDepositState {
  productId: string;
  saverId: string;
  principal: number;
  openedAt: number;
  dueDay: number;
  accruedInterest: number;
  status: RuntimeDepositStatus;
}

export interface RuntimeDepositProductReview {
  productId: string;
  saverId: string;
  accepted: boolean;
  reasons: string[];
  reviewedAt: number;
}

export interface StageRunState {
  stageId: string;
  seed: number;
  time: number;
  status: RunStatus;
  balances: Record<string, number>;
  minimumPlayerCash: number;
  contract: RuntimeContractState | null;
  contracts: RuntimeContractState[];
  collateral: RuntimeCollateralState | null;
  depositProducts: RuntimeDepositProductState[];
  depositProductReviews: RuntimeDepositProductReview[];
  deposits: RuntimeDepositState[];
  depositLiability: number;
  nextDepositObligation: { dueDay: number; amount: number } | null;
  rewardEarned: string | null;
}

export interface PublishResult {
  accepted: boolean;
  reasons: string[];
}

export interface DepositProductResult {
  published: boolean;
  demandReasons: string[];
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
    contracts: [],
    collateral: null,
    depositProducts: [],
    depositProductReviews: [],
    deposits: [],
    depositLiability: 0,
    nextDepositObligation: null,
    rewardEarned: null,
  };
}

function refreshDepositMetrics(state: StageRunState): void {
  const active = state.deposits.filter(
    (deposit) => deposit.status === "active",
  );
  state.depositLiability = active.reduce(
    (total, deposit) => total + deposit.principal + deposit.accruedInterest,
    0,
  );
  const next = active
    .map((deposit) => ({
      dueDay: deposit.dueDay,
      amount: deposit.principal + deposit.accruedInterest,
    }))
    .sort((left, right) => left.dueDay - right.dueDay)[0];
  state.nextDepositObligation = next ?? null;
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
        ...(event.data.saverCash ?? {}),
      };
      state.minimumPlayerCash = event.data.playerCash;
      break;
    case "ContractPublished":
      state.contract = {
        ...structuredClone(event.data.contract),
        status: "published",
        rejectionReasons: [],
        settledPaymentIds: [],
      };
      state.contracts.push(state.contract);
      break;
    case "DepositProductPublished":
      state.depositProducts.push({
        ...structuredClone(event.data.product),
        publishedAt: event.at,
      });
      break;
    case "DepositOpened":
      state.deposits.push({
        ...event.data,
        accruedInterest: 0,
        status: "active",
      });
      break;
    case "DepositProductReviewed":
      state.depositProductReviews.push({
        ...structuredClone(event.data),
        reviewedAt: event.at,
      });
      break;
    case "DepositInterestAccrued": {
      const deposit = state.deposits.find(
        (candidate) =>
          candidate.productId === event.data.productId &&
          candidate.saverId === event.data.saverId &&
          candidate.status === "active",
      );
      if (deposit) deposit.accruedInterest += event.data.amount;
      break;
    }
    case "DepositWithdrawn": {
      const deposit = state.deposits.find(
        (candidate) =>
          candidate.productId === event.data.productId &&
          candidate.saverId === event.data.saverId &&
          candidate.status === "active",
      );
      if (deposit) deposit.status = "withdrawn";
      break;
    }
    case "DepositWithdrawalFailed": {
      const deposit = state.deposits.find(
        (candidate) =>
          candidate.productId === event.data.productId &&
          candidate.saverId === event.data.saverId &&
          candidate.status === "active",
      );
      if (deposit) deposit.status = "failed";
      break;
    }
    case "ContractRejected":
      for (const contract of state.contracts)
        if (contract.id === event.data.contractId) {
          contract.status = "rejected";
          contract.rejectionReasons = [...event.data.reasons];
        }
      break;
    case "ContractFunded":
      for (const contract of state.contracts)
        if (contract.id === event.data.contractId) contract.status = "active";
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
      for (const contract of state.contracts)
        if (contract.id === event.data.contractId) {
          if (event.data.paymentId)
            contract.settledPaymentIds.push(event.data.paymentId);
          if (event.data.isFinal ?? true) contract.status = "settled";
        }
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
  refreshDepositMetrics(state);
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
  const startDate = definition.startDate ?? DEFAULT_STAGE_START_DATE;
  if (
    !ISO_DATE_PATTERN.test(startDate) ||
    Number.isNaN(Date.parse(`${startDate}T00:00:00Z`))
  )
    throw new StageCommandError(
      "Stage start date must be a valid YYYY-MM-DD calendar date",
    );
  if (
    !Number.isInteger(definition.objective.deadline) ||
    definition.objective.deadline < 1
  )
    throw new StageCommandError("Stage deadline must be a positive whole day");
  const amounts = [
    definition.startingPlayerCash,
    ...(definition.borrowers ?? [definition.borrower]).flatMap((borrower) => [
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
    ]),
    ...(definition.savers ?? []).map((saver) => saver.depositAmount),
    definition.objective.targetCash,
  ];
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0))
    throw new StageCommandError(
      "Stage money values must be non-negative integer minor units",
    );
  for (const saver of definition.savers ?? []) {
    if (!saver.id.trim() || !saver.name.trim())
      throw new StageCommandError("Every saver needs an id and name");
    if (
      !Number.isInteger(saver.availableAt) ||
      saver.availableAt < 1 ||
      !Number.isInteger(saver.requiredTermDays) ||
      saver.requiredTermDays < 1 ||
      !Number.isInteger(saver.minimumAnnualRateBps) ||
      saver.minimumAnnualRateBps < 0
    )
      throw new StageCommandError(
        "Saver terms must use positive whole days and rates",
      );
  }
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
  /**
   * Materialized view of the history.  Day-based runs advance the clock
   * hundreds of times, so replaying the log on every read is too slow.
   */
  private readonly state: StageRunState = initialState();

  constructor(
    definition: StageSimulationDefinition,
    events: readonly StageEvent[] = [],
  ) {
    validateDefinition(definition);
    this.definition = structuredClone(definition);
    this.history = cloneEvents(events);

    if (this.history.length === 0) {
      const marketCash = this.borrowers().reduce(
        (total, borrower) =>
          total +
          (borrower.realizedRevenue ?? borrower.expectedRevenue) +
          (borrower.collateral?.liquidationValue ?? 0),
        0,
      );
      this.append("RunStarted", 0, {
        stageId: definition.stageId,
        seed: definition.seed,
        playerCash: definition.startingPlayerCash,
        marketCash,
        ...(this.savers().length > 0
          ? {
              saverCash: Object.fromEntries(
                this.savers().map((saver) => [saver.id, saver.depositAmount]),
              ),
            }
          : {}),
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
      for (const event of this.history) applyStageEvent(this.state, event);
    }
  }

  inspect(): StageRunState {
    return structuredClone(this.state);
  }

  events(): StageEvent[] {
    return cloneEvents(this.history);
  }

  private borrowers(): StageBorrowerDefinition[] {
    return this.definition.borrowers ?? [this.definition.borrower];
  }

  private borrowerFor(id: string): StageBorrowerDefinition | undefined {
    return this.borrowers().find((borrower) => borrower.id === id);
  }

  private savers(): StageSaverDefinition[] {
    return this.definition.savers ?? [];
  }

  /**
   * Product publication is a command too: the eventual customer choice is
   * settled only when time advances, so pausing never leaks a market action.
   */
  publishDepositProduct(product: DepositProductTerms): DepositProductResult {
    const state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    this.require(product.id.trim().length > 0, "A deposit product needs an id");
    this.require(
      product.name.trim().length > 0,
      "A deposit product needs a name",
    );
    this.require(
      !state.depositProducts.some((candidate) => candidate.id === product.id),
      "A deposit product already uses that id",
    );
    this.require(
      Number.isInteger(product.annualRateBps) &&
        product.annualRateBps >= 0 &&
        product.annualRateBps <= 10_000,
      "Deposit rate must be a whole number between 0 and 10,000 basis points",
    );
    this.require(
      Number.isInteger(product.termDays) && product.termDays > 0,
      "Deposit term must be a positive whole number of days",
    );
    this.requireMoney(product.minimumDeposit, "Minimum deposit");
    this.requireMoney(product.maximumDeposit, "Maximum deposit");
    this.require(
      product.maximumDeposit >= product.minimumDeposit,
      "Maximum deposit must not be below the minimum deposit",
    );
    this.append("DepositProductPublished", state.time, {
      product: structuredClone(product),
    });
    const waiting = this.savers().filter(
      (saver) =>
        !state.deposits.some((deposit) => deposit.saverId === saver.id),
    );
    const demandReasons = waiting.flatMap((saver) =>
      this.depositAcceptanceReasons(saver, product).map(
        (reason) => `${saver.name}: ${reason}`,
      ),
    );
    return { published: true, demandReasons };
  }

  publishAndFund(contract: FundableContractTerms): PublishResult {
    const state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    const active = state.contracts.filter(
      (candidate) => candidate.status === "active",
    );
    this.require(
      active.length < (this.definition.maxActiveContracts ?? 1),
      "Your portfolio is already at its active-contract limit",
    );
    this.require(
      !active.some((candidate) => candidate.borrowerId === contract.borrowerId),
      "This borrower already has an active contract",
    );
    this.require(contract.id.trim().length > 0, "A contract needs an id");
    this.require(contract.name.trim().length > 0, "A contract needs a name");
    this.requireMoney(contract.principal, "Principal");
    this.requireMoney(contract.repayment, "Repayment");
    this.require(
      Number.isInteger(contract.dueDay),
      "Payment day must be a whole day",
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
      const collateral = this.borrowerFor(contract.borrowerId)?.collateral;
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

  advanceOneDay(): void {
    const state = this.inspect();
    this.advanceTo(
      Math.min(state.time + 1, this.definition.objective.deadline),
    );
  }

  advanceToNextEvent(): void {
    const state = this.inspect();
    this.require(state.status === "playing", "This run is already over");
    const candidates = [this.definition.objective.deadline];
    for (const borrower of this.borrowers())
      if (borrower.fundsAvailableAt > state.time)
        candidates.push(borrower.fundsAvailableAt);
    for (const saver of this.savers())
      if (
        saver.availableAt > state.time &&
        !state.deposits.some((deposit) => deposit.saverId === saver.id)
      )
        candidates.push(saver.availableAt);
    for (const deposit of state.deposits.filter(
      (candidate) =>
        candidate.status === "active" && candidate.dueDay > state.time,
    ))
      candidates.push(deposit.dueDay);
    for (const contract of state.contracts.filter(
      (candidate) => candidate.status === "active",
    )) {
      const payment = this.pendingPayments(contract).find(
        (candidate) => candidate.dueDay > state.time,
      );
      if (payment) candidates.push(payment.dueDay);
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

    for (let day = state.time + 1; day <= target; day += 1) {
      this.append("TimeAdvanced", day, { from: day - 1, to: day });

      this.resolveDepositDemand(day);
      if (!this.resolveDepositObligations(day)) return;

      for (const borrower of this.borrowers().filter(
        (candidate) => candidate.fundsAvailableAt === day,
      )) {
        const revenue = borrower.realizedRevenue ?? borrower.expectedRevenue;
        this.append("CashTransferred", day, {
          from: MARKET_ID,
          to: borrower.id,
          amount: revenue,
          reason: "business-revenue",
        });
        this.append("BorrowerRevenueRealized", day, {
          borrowerId: borrower.id,
          amount: revenue,
          rule: `The financed work produces ${revenue} cents at day ${borrower.fundsAvailableAt}.`,
        });
      }

      state = this.inspect();
      for (const contract of state.contracts.filter(
        (candidate) => candidate.status === "active",
      )) {
        for (const payment of this.pendingPayments(contract).filter(
          (candidate) => candidate.dueDay === day,
        )) {
          this.resolvePayment(contract, day, payment);
          state = this.inspect();
          if (
            state.contracts.find((candidate) => candidate.id === contract.id)
              ?.status !== "active"
          )
            break;
        }
      }

      state = this.inspect();
      if (state.status !== "playing") return;
      const playerCash = state.balances[PLAYER_ID] ?? 0;
      const objectiveCanResolve =
        !this.definition.objective.mustReachDeadline ||
        day >= this.definition.objective.deadline;
      if (
        objectiveCanResolve &&
        playerCash >= this.definition.objective.targetCash
      ) {
        this.append("StageWon", day, {
          endingCash: playerCash,
          rewardId: this.definition.rewardId,
        });
        return;
      }
      if (day >= this.definition.objective.deadline) {
        this.append("StageLost", day, {
          endingCash: playerCash,
          reason:
            state.contract?.status === "defaulted"
              ? "The borrower defaulted and recovery did not reach the target."
              : `The target was not reached by day ${this.definition.objective.deadline}.`,
        });
        return;
      }
    }
  }

  private depositAcceptanceReasons(
    saver: StageSaverDefinition,
    product: DepositProductTerms,
  ): string[] {
    const reasons: string[] = [];
    if (product.annualRateBps < saver.minimumAnnualRateBps)
      reasons.push(
        `requires at least ${(saver.minimumAnnualRateBps / 100).toFixed(2)}% annual interest`,
      );
    if (product.termDays !== saver.requiredTermDays)
      reasons.push(`requires a ${saver.requiredTermDays}-day term`);
    if (saver.depositAmount < product.minimumDeposit)
      reasons.push("cannot meet this product's minimum deposit");
    if (saver.depositAmount > product.maximumDeposit)
      reasons.push("would exceed this product's maximum deposit");
    return reasons;
  }

  private resolveDepositDemand(day: number): void {
    let state = this.inspect();
    for (const saver of this.savers()) {
      if (saver.availableAt > day) continue;
      if (state.deposits.some((deposit) => deposit.saverId === saver.id))
        continue;
      for (const candidate of state.depositProducts.filter(
        (product) =>
          product.publishedAt <= day &&
          !state.depositProductReviews.some(
            (review) =>
              review.productId === product.id && review.saverId === saver.id,
          ),
      )) {
        const reasons = this.depositAcceptanceReasons(saver, candidate);
        this.append("DepositProductReviewed", day, {
          productId: candidate.id,
          saverId: saver.id,
          accepted: reasons.length === 0,
          reasons,
        });
      }
      state = this.inspect();
      const product = state.depositProducts
        .filter(
          (candidate) =>
            candidate.publishedAt <= day &&
            this.depositAcceptanceReasons(saver, candidate).length === 0,
        )
        .sort(
          (left, right) =>
            right.annualRateBps - left.annualRateBps ||
            left.publishedAt - right.publishedAt ||
            left.id.localeCompare(right.id),
        )[0];
      if (!product) continue;
      this.append("DepositOpened", day, {
        productId: product.id,
        saverId: saver.id,
        principal: saver.depositAmount,
        openedAt: day,
        dueDay: day + product.termDays,
      });
      this.append("CashTransferred", day, {
        from: saver.id,
        to: PLAYER_ID,
        amount: saver.depositAmount,
        reason: "deposit-open",
      });
      state = this.inspect();
    }
  }

  /**
   * Interest accrues into a liability every 30 held days.  Cash only moves
   * when the account matures, which keeps the funding/withdrawal timing
   * visible.
   */
  private resolveDepositObligations(day: number): boolean {
    let state = this.inspect();
    for (const deposit of state.deposits.filter(
      (candidate) =>
        candidate.status === "active" &&
        candidate.openedAt < day &&
        candidate.dueDay >= day &&
        (day - candidate.openedAt) % DAYS_PER_ACCRUAL_PERIOD === 0,
    )) {
      const product = state.depositProducts.find(
        (candidate) => candidate.id === deposit.productId,
      );
      if (!product) continue;
      const interest = Math.floor(
        (deposit.principal * product.annualRateBps) / 120_000,
      );
      if (interest > 0)
        this.append("DepositInterestAccrued", day, {
          productId: deposit.productId,
          saverId: deposit.saverId,
          amount: interest,
        });
    }

    state = this.inspect();
    for (const deposit of state.deposits.filter(
      (candidate) => candidate.status === "active" && candidate.dueDay === day,
    )) {
      const amount = deposit.principal + deposit.accruedInterest;
      const availableCash = state.balances[PLAYER_ID] ?? 0;
      if (availableCash < amount) {
        this.append("DepositWithdrawalFailed", day, {
          productId: deposit.productId,
          saverId: deposit.saverId,
          amount,
          availableCash,
        });
        this.append("StageLost", day, {
          endingCash: availableCash,
          reason: `Liquidity failure: ${this.saverName(deposit.saverId)} is due ${amount} cents, but only ${availableCash} cents are liquid.`,
        });
        return false;
      }
      this.append("CashTransferred", day, {
        from: PLAYER_ID,
        to: deposit.saverId,
        amount,
        reason: "deposit-withdrawal",
      });
      this.append("DepositWithdrawn", day, {
        productId: deposit.productId,
        saverId: deposit.saverId,
        amount,
      });
      state = this.inspect();
    }
    return true;
  }

  private saverName(id: string): string {
    return this.savers().find((saver) => saver.id === id)?.name ?? id;
  }

  private pendingPayments(contract: RuntimeContractState): Array<{
    id: string;
    dueDay: number;
    amount: number;
    sourceBlockId: string;
  }> {
    const payments = contract.payments ?? [
      {
        id: "legacy-payment",
        dueDay: contract.dueDay,
        amount: contract.repayment,
        sourceBlockId: contract.sourceBlocks.collect,
      },
    ];
    return payments.filter(
      (payment) => !contract.settledPaymentIds.includes(payment.id),
    );
  }

  private resolvePayment(
    contract: RuntimeContractState,
    day: number,
    payment: {
      id: string;
      dueDay: number;
      amount: number;
      sourceBlockId: string;
    },
  ): void {
    const finalPayment = this.pendingPayments(contract).length === 1;
    this.append("PaymentRequested", day, {
      contractId: contract.id,
      amount: payment.amount,
      sourceBlockId: payment.sourceBlockId,
      paymentId: payment.id,
    });
    const borrowerCash = this.inspect().balances[contract.borrowerId] ?? 0;
    let outcome: PaymentOutcome;
    let shortfall = 0;
    if (borrowerCash >= payment.amount) {
      this.append("CashTransferred", day, {
        from: contract.borrowerId,
        to: PLAYER_ID,
        amount: payment.amount,
        reason: "contract-repayment",
        contractId: contract.id,
        sourceBlockId: payment.sourceBlockId,
      });
      this.append("PaymentSettled", day, {
        contractId: contract.id,
        amount: payment.amount,
        sourceBlockId: payment.sourceBlockId,
        paymentId: payment.id,
        isFinal: finalPayment,
      });
      outcome = "settled";
    } else {
      let paid = 0;
      if (this.definition.partialPaymentOnDefault && borrowerCash > 0) {
        paid = borrowerCash;
        this.append("CashTransferred", day, {
          from: contract.borrowerId,
          to: PLAYER_ID,
          amount: paid,
          reason: "default-payment",
          contractId: contract.id,
          sourceBlockId: payment.sourceBlockId,
        });
        this.append("PaymentPartiallySettled", day, {
          contractId: contract.id,
          paid,
          shortfall: payment.amount - paid,
          sourceBlockId: payment.sourceBlockId,
        });
      }
      shortfall = payment.amount - paid;
      this.append("PaymentDefaulted", day, {
        contractId: contract.id,
        amount: payment.amount,
        shortfall,
        sourceBlockId: payment.sourceBlockId,
      });
      outcome = "defaulted";
    }

    if (outcome === "defaulted" || finalPayment)
      this.executeActions(
        actionsOf(contract),
        contract,
        day,
        outcome,
        shortfall,
      );
  }

  private executeActions(
    actions: readonly ContractRuntimeAction[],
    contract: RuntimeContractState,
    day: number,
    paymentOutcome: PaymentOutcome,
    startingShortfall: number,
  ): number {
    let shortfall = startingShortfall;
    for (const action of actions) {
      if (action.type === "close") {
        this.append("ContractClosed", day, {
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
        this.append("ConditionEvaluated", day, {
          contractId: contract.id,
          fact: action.condition.fact,
          expected: action.condition.equals,
          observed,
          matched,
          sourceBlockId: action.sourceBlockId,
        });
        const branch = matched ? "then" : "else";
        this.append("BranchExecuted", day, {
          contractId: contract.id,
          branch,
          reason: `${action.condition.fact} was ${observed}, so ${branch} ran.`,
          sourceBlockId: action.sourceBlockId,
        });
        shortfall = this.executeActions(
          matched ? action.thenActions : action.elseActions,
          contract,
          day,
          paymentOutcome,
          shortfall,
        );
        continue;
      }
      const collateral = this.inspect().collateral;
      if (!collateral || collateral.status !== "locked") continue;
      if (action.type === "release-collateral") {
        if (paymentOutcome !== "settled") continue;
        this.append("CollateralReleased", day, {
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
        this.append("CashTransferred", day, {
          from: MARKET_ID,
          to: PLAYER_ID,
          amount: recoveredAmount,
          reason: "collateral-recovery",
          contractId: contract.id,
          sourceBlockId: action.sourceBlockId,
        });
      }
      shortfall -= recoveredAmount;
      this.append("CollateralLiquidated", day, {
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
    const borrower = this.borrowerFor(contract.borrowerId);
    const reasons: string[] = [];
    if (!borrower) return ["This borrower did not request the contract."];
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
    if (contract.dueDay < borrower.fundsAvailableAt)
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
    const event = {
      sequence: this.history.length + 1,
      type,
      at,
      data,
    } as Extract<StageEvent, { type: T }>;
    this.history.push(event);
    applyStageEvent(this.state, event);
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
