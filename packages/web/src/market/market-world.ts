import type { LocalText } from "../i18n/local-text.ts";
import { evaluateRecipe, type ValueRecipe } from "./market-recipe.ts";

/**
 * Pure, seeded open-market simulation.  The world advances one in-game day at
 * a time: borrowers with randomly generated profiles appear on the map,
 * discover the contracts the banker posted, file requests, and — once the
 * banker accepts — repay or default when their loan comes due.  Every random
 * outcome is derived from the run seed plus an incrementing cursor, so a
 * given seed always replays the same world.
 */

export type Gender = "female" | "male";

export interface ActorProfile {
  id: string;
  name: string;
  gender: Gender;
  age: number;
  /** Null when the actor has no job. */
  occupation: LocalText | null;
  /** Zero when unemployed. */
  monthlyIncome: number;
  image: string;
  /** Hidden default risk in basis points, derived from the profile. */
  riskBp: number;
}

export type DemandStatus = "open" | "requesting" | "served" | "expired";

export interface Demand {
  id: string;
  actor: ActorProfile;
  /** Cash the actor needs now. */
  amount: number;
  /** Days until the actor is able to pay the money back. */
  payableAfterDays: number;
  /** The largest total repayment the actor will agree to. */
  maxRepayment: number;
  /** Normalized map position in [0, 1]. */
  x: number;
  y: number;
  createdDay: number;
  expiresDay: number;
  status: DemandStatus;
  /** Contracts this actor was rejected from — they will not ask again. */
  rejectedContractIds: string[];
}

export type RequestStatus = "pending" | "review" | "accepted" | "rejected";

/** Why automated processing left a request for a banker to inspect. */
export type RequestIssue = "evaluation-error" | "insufficient-cash";

export interface ContractRequest {
  id: string;
  demandId: string;
  actor: ActorProfile;
  day: number;
  status: RequestStatus;
  /** Present when automatic processing could not safely complete. */
  issue?: RequestIssue;
  /** Contract terms evaluated for THIS requester when the request was filed. */
  principal: number;
  termDays: number;
  repayment: number;
}

export interface ContractOffer {
  id: string;
  x: number;
  y: number;
  postedDay: number;
  requests: ContractRequest[];
  /**
   * The contract IS its builder stack: every scalar term (principal, term,
   * repayment) is a formula evaluated against a specific requester.
   */
  builderNodes: MarketBuilderNode[];
}

export type ComparatorOp = ">" | ">=" | "<" | "<=" | "==";

/**
 * What happens when a decision gate is reached: turn the requester away or
 * leave them in the request list for manual review.
 */
export type DecisionOutcome = "reject" | "draft";

/** The resolved route defaults to automatic signing when no gate stops it. */
export type DecisionRoute = DecisionOutcome | "auto";

export interface MarketBuilderNode {
  id: string;
  kind:
    | "start"
    | "transfer"
    | "wait"
    | "variable"
    | "condition"
    | "decision"
    | "end";
  senderId?: string;
  recipientId?: string;
  /** A recipe assembled from value and operator cards. */
  amount?: ValueRecipe;
  days?: ValueRecipe;
  /** Condition test. */
  left?: ValueRecipe;
  comparator?: ComparatorOp;
  right?: ValueRecipe;
  /** Variable nodes assign a named value card to the current path scope. */
  variableName?: string;
  /** Conditions own two real, path-scoped execution lanes. */
  thenSteps?: MarketBuilderNode[];
  elseSteps?: MarketBuilderNode[];
  /** Decision only: reject immediately, or draft for manual review. */
  outcome?: DecisionOutcome;
}

/** Requester facts every contract formula can reference. */
export const REQUESTER_VARIABLES = ["amount", "days", "income", "age"] as const;

/** Live values exposed as cards in the contract builder. */
export const BUILDER_VARIABLES = [...REQUESTER_VARIABLES, "cash"] as const;

export function demandVariables(
  demand: Demand,
  availableCash: number,
): Record<string, number> {
  return {
    amount: demand.amount,
    days: demand.payableAfterDays,
    income: demand.actor.monthlyIncome,
    age: demand.actor.age,
    cash: availableCash,
  };
}

export interface EvaluatedTerms {
  principal: number;
  termDays: number;
  repayment: number;
}

/**
 * The requester's projected state after running a contract in isolation.
 * This deliberately contains no mutable world or other-actor state: external
 * facts, such as the bank's available cash, are inputs to the formulas only.
 */
export interface RequesterContractState {
  /** Simulated requester cash, beginning at zero when they apply. */
  cash: number;
  /** Funds received from the player at day zero. */
  fundedAtStart: number;
  /** All funds received from the player during this contract. */
  funded: number;
  /** All funds paid back to the player during this contract. */
  repaid: number;
  /** The simulated contract clock. */
  day: number;
  /** A payment was requested before this demand says the requester can pay. */
  paidTooEarly: boolean;
}

function compareValues(
  left: number,
  comparator: ComparatorOp,
  right: number,
): boolean {
  switch (comparator) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "==":
      return left === right;
  }
}

/**
 * Walk a contract path. Conditions only select a path: variables created in a
 * path stay in that path, while transfers and waits contribute to the shared
 * contract result.
 */
function walkContract(
  nodes: readonly MarketBuilderNode[],
  variables: Record<string, number>,
  execute: {
    wait(days: number): void;
    transfer(node: MarketBuilderNode, amount: number): void;
  },
): void {
  const walk = (
    path: readonly MarketBuilderNode[],
    scope: Record<string, number>,
  ): void => {
    for (const node of path) {
      if (node.kind === "condition") {
        const left = evaluateRecipe(node.left, scope);
        const right = evaluateRecipe(node.right, scope);
        const holds = compareValues(left, node.comparator ?? ">", right);
        walk(holds ? (node.thenSteps ?? []) : (node.elseSteps ?? []), {
          ...scope,
        });
      } else if (node.kind === "variable") {
        if (!node.variableName) throw new Error("Choose a variable name.");
        scope[node.variableName] = evaluateRecipe(node.amount, scope);
      } else if (node.kind === "wait") {
        execute.wait(Math.max(0, Math.round(evaluateRecipe(node.days, scope))));
      } else if (node.kind === "transfer") {
        execute.transfer(node, evaluateRecipe(node.amount, scope));
      }
    }
  };
  walk(nodes, { ...variables });
}

function walkContractTerms(
  nodes: readonly MarketBuilderNode[],
  variables: Record<string, number>,
): EvaluatedTerms {
  const terms: EvaluatedTerms = { principal: 0, termDays: 0, repayment: 0 };
  walkContract(nodes, variables, {
    wait: (days) => {
      terms.termDays += days;
    },
    transfer: (node, value) => {
      if (node.senderId === "player") terms.principal += value;
      else if (node.recipientId === "player") terms.repayment += value;
    },
  });
  return {
    principal: Math.round(terms.principal),
    termDays: terms.termDays,
    repayment: Math.round(terms.repayment),
  };
}

/**
 * Execute a contract against only the applying requester's temporary state.
 * This is the matching runtime: it never copies or mutates the market world.
 */
export function simulateContractForDemand(
  nodes: readonly MarketBuilderNode[],
  demand: Demand,
  availableCash: number,
): RequesterContractState | null {
  try {
    const state: RequesterContractState = {
      cash: 0,
      fundedAtStart: 0,
      funded: 0,
      repaid: 0,
      day: 0,
      paidTooEarly: false,
    };
    walkContract(nodes, demandVariables(demand, availableCash), {
      wait: (days) => {
        state.day += days;
      },
      transfer: (node, amount) => {
        if (!Number.isFinite(amount) || amount < 0)
          throw new Error("Transfer amount must be a non-negative number.");
        if (node.senderId === "player") {
          state.cash += amount;
          state.funded += amount;
          if (state.day === 0) state.fundedAtStart += amount;
        } else if (node.recipientId === "player") {
          state.cash -= amount;
          state.repaid += amount;
          if (state.day < demand.payableAfterDays) state.paidTooEarly = true;
        }
      },
    });
    return state;
  } catch {
    return null;
  }
}

/**
 * Demand policy is expressed against the projected requester state, rather
 * than against a parallel list of contract-term fields. New requester state
 * and demand rules can be added here without changing the contract runtime.
 */
export function requesterStateSatisfiesDemand(
  state: RequesterContractState,
  demand: Demand,
): boolean {
  return (
    state.fundedAtStart >= demand.amount &&
    state.repaid <= demand.maxRepayment &&
    !state.paidTooEarly
  );
}

/**
 * Run the stack's decision gates for a requester. Conditions route through
 * their selected lane and then merge back into the following contract flow.
 * A draft gate pauses the flow for manual approval. When no decision gate is
 * reached, the request router signs automatically after the full contract run
 * and funding check succeed.
 */
export function decideRequestOutcome(
  nodes: readonly MarketBuilderNode[],
  demand: Demand,
  availableCash: number,
): DecisionRoute {
  try {
    const decidePath = (
      path: readonly MarketBuilderNode[],
      scope: Record<string, number>,
    ): DecisionOutcome | null => {
      for (const node of path) {
        if (node.kind === "variable") {
          if (!node.variableName) throw new Error("Choose a variable name.");
          scope[node.variableName] = evaluateRecipe(node.amount, scope);
          continue;
        }
        if (node.kind !== "condition" && node.kind !== "decision") continue;
        if (node.kind === "decision") return node.outcome ?? "draft";
        const left = evaluateRecipe(node.left, scope);
        const right = evaluateRecipe(node.right, scope);
        const holds = compareValues(left, node.comparator ?? ">", right);
        const outcome = decidePath(
          holds ? (node.thenSteps ?? []) : (node.elseSteps ?? []),
          { ...scope },
        );
        if (outcome) return outcome;
      }
      return null;
    };
    return decidePath(nodes, demandVariables(demand, availableCash)) ?? "auto";
  } catch {
    return "draft";
  }
}

/** Terms this contract would offer a specific requester; null when broken. */
export function evaluateContractForDemand(
  nodes: readonly MarketBuilderNode[],
  demand: Demand,
  availableCash: number,
): EvaluatedTerms | null {
  const state = simulateContractForDemand(nodes, demand, availableCash);
  if (!state || state.funded <= 0 || state.repaid <= 0 || state.day <= 0)
    return null;
  return {
    principal: Math.round(state.funded),
    termDays: state.day,
    repayment: Math.round(state.repaid),
  };
}

/** Terms for an arbitrary variable set — the builder's sample preview. */
export function evaluateTermsWithVariables(
  nodes: readonly MarketBuilderNode[],
  variables: Record<string, number>,
): EvaluatedTerms | null {
  try {
    const terms = walkContractTerms(nodes, variables);
    if (terms.principal <= 0 || terms.termDays <= 0 || terms.repayment <= 0)
      return null;
    return terms;
  } catch {
    return null;
  }
}

/**
 * Terms of a contract that references no requester variables — used for the
 * map label.  Null means the contract is dynamic (or broken).
 */
export function staticContractTerms(
  nodes: readonly MarketBuilderNode[],
): EvaluatedTerms | null {
  try {
    return walkContractTerms(nodes, {});
  } catch {
    return null;
  }
}

export interface Loan {
  contractId: string;
  actor: ActorProfile;
  principal: number;
  repayment: number;
  signedDay: number;
  dueDay: number;
  /** Chance rolled at the due date, fixed when the loan is signed. */
  defaultChanceBp: number;
  resolvedDay?: number;
}

/**
 * A balance-sheet asset. Cash, loan receivables, and future instruments all
 * use this single interface; `loan` is optional metadata for the loan type.
 * `value` is the carrying value used by totals and the portfolio UI.
 */
export interface Asset {
  id: string;
  kind: string;
  value: number;
  status: "active" | "settled" | "defaulted";
  loan?: Loan;
}

/** A balance-sheet obligation, ready for future payable/debt mechanics. */
export interface Liability {
  id: string;
  kind: string;
  value: number;
  status: "active" | "settled";
}

export interface BalanceSheet {
  assets: Asset[];
  liabilities: Liability[];
}

/**
 * A currently held asset that contributes to the bank's total assets.
 *
 * This helper filters historical zero-value records out of the live portfolio.
 */
export type ActiveAsset = Asset & { status: "active" };

export type WorldEventKind =
  | "demand-appeared"
  | "demand-expired"
  | "request-filed"
  | "loan-signed"
  | "loan-repaid"
  | "loan-defaulted"
  | "special-event";

export type SpecialEventId = "first-yield-tutorial";

export interface WorldEvent {
  id: string;
  day: number;
  kind: WorldEventKind;
  actorName: string;
  amount: number;
  specialEventId?: SpecialEventId;
}

export interface MarketWorld {
  seed: string;
  /** Monotonic counter salting every random roll. */
  cursor: number;
  day: number;
  startingCash: number;
  nextId: number;
  demands: Demand[];
  contracts: ContractOffer[];
  balanceSheet: BalanceSheet;
  log: WorldEvent[];
}

export const MARKET_STARTING_CASH = 1_000;
export const MARKET_START_DATE = "2015-03-01";

const MAX_OPEN_DEMANDS = 9;
/** How long a person browses the map before giving up. */
export const DEMAND_LIFETIME_DAYS = 16;
/** How long a filed request waits for the banker before it is withdrawn. */
export const REQUEST_LIFETIME_DAYS = 16;
const DAILY_SPAWN_CHANCE = 0.3;
const DAILY_REQUEST_CHANCE = 0.35;
const MAX_LOG_ENTRIES = 120;

export function emptyWorld(
  seed: string,
  startingCash = MARKET_STARTING_CASH,
): MarketWorld {
  let world: MarketWorld = {
    seed,
    cursor: 0,
    day: 0,
    startingCash,
    nextId: 1,
    demands: [],
    contracts: [],
    balanceSheet: {
      assets: [
        { id: "cash", kind: "cash", value: startingCash, status: "active" },
      ],
      liabilities: [],
    },
    log: [],
  };
  // Open the doors with a populated street rather than an empty map.
  for (let index = 0; index < 4; index += 1) world = spawnDemand(world);
  return world;
}

function cashAsset(world: MarketWorld): Asset {
  const asset = world.balanceSheet.assets.find(
    (candidate) => candidate.id === "cash",
  );
  if (!asset) throw new Error("The balance sheet must contain a cash asset.");
  return asset;
}

/** Liquid cash available to fund new contracts. */
export function availableCash(world: MarketWorld): number {
  return cashAsset(world).value;
}

function withCashValue(assets: Asset[], value: number): Asset[] {
  return assets.map((asset) =>
    asset.id === "cash" ? { ...asset, value } : asset,
  );
}

/** Loan-receivable positions, including resolved records kept for history. */
export function loanReceivables(world: MarketWorld): Asset[] {
  return world.balanceSheet.assets.filter(
    (asset) => asset.kind === "loan-receivable" && asset.loan,
  );
}

/** Active loan-receivable positions that remain outstanding. */
export function activeLoanReceivables(world: MarketWorld): Asset[] {
  return loanReceivables(world).filter((asset) => asset.status === "active");
}

/** Deterministic roll in [0, 1) from the world seed and cursor. */
function hashRoll(seed: string, cursor: number): number {
  const input = `${seed}:${cursor}`;
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 8) / 0x1000000;
}

/**
 * Mutable roller over an immutable world: callers copy the world, draw as
 * many rolls as they need, and store the advanced cursor back on the copy.
 */
class Roller {
  private readonly seed: string;
  cursor: number;

  constructor(seed: string, cursor: number) {
    this.seed = seed;
    this.cursor = cursor;
  }

  next(): number {
    return hashRoll(this.seed, this.cursor++);
  }

  int(minInclusive: number, maxInclusive: number): number {
    return (
      minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1))
    );
  }

  pick<T>(items: readonly T[]): T {
    return items[
      Math.min(items.length - 1, Math.floor(this.next() * items.length))
    ]!;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

const text = (en: string, ko: string): LocalText => ({ en, ko });

const FEMALE_NAMES = [
  "Elena",
  "Sofia",
  "Mina",
  "Ava",
  "Grace",
  "Lucia",
  "Naomi",
  "Iris",
  "Clara",
  "Joan",
  "Priya",
  "Hana",
];

const MALE_NAMES = [
  "Daniel",
  "Noah",
  "Marcus",
  "Theo",
  "Omar",
  "Felix",
  "Ivan",
  "Jonas",
  "Ravi",
  "Mateo",
  "Ethan",
  "Kofi",
];

const LAST_NAMES = [
  "Brooks",
  "Kim",
  "Martinez",
  "Reed",
  "Park",
  "Okafor",
  "Novak",
  "Silva",
  "Haddad",
  "Larsen",
  "Tanaka",
  "Moreau",
  "Costa",
  "Weber",
  "Ali",
  "Petrov",
];

const FEMALE_PORTRAITS = [
  "/assets/stage-one/customers/elena.webp",
  "/assets/stage-one/customers/sofia.webp",
];

const MALE_PORTRAITS = [
  "/assets/stage-one/customers/daniel.webp",
  "/assets/campaign/market/courier.webp",
];

interface OccupationSpec {
  label: LocalText;
  incomeMin: number;
  incomeMax: number;
}

const OCCUPATIONS: readonly OccupationSpec[] = [
  {
    label: text("Cafe supervisor", "카페 매니저"),
    incomeMin: 2400,
    incomeMax: 3200,
  },
  {
    label: text("Delivery coordinator", "배송 코디네이터"),
    incomeMin: 2800,
    incomeMax: 3800,
  },
  {
    label: text("Independent caterer", "출장 요리사"),
    incomeMin: 3000,
    incomeMax: 4600,
  },
  { label: text("Courier", "배달원"), incomeMin: 2000, incomeMax: 3000 },
  {
    label: text("Machine operator", "기계 조작원"),
    incomeMin: 2600,
    incomeMax: 3900,
  },
  {
    label: text("Print shop clerk", "인쇄소 직원"),
    incomeMin: 2200,
    incomeMax: 3100,
  },
  {
    label: text("Night-shift nurse", "야간 간호사"),
    incomeMin: 3400,
    incomeMax: 5200,
  },
  { label: text("Street vendor", "노점상"), incomeMin: 1500, incomeMax: 2600 },
  { label: text("Bus driver", "버스 기사"), incomeMin: 2700, incomeMax: 3600 },
  { label: text("Tailor", "재단사"), incomeMin: 1900, incomeMax: 3000 },
  {
    label: text("Warehouse picker", "물류 창고 직원"),
    incomeMin: 2100,
    incomeMax: 2900,
  },
  {
    label: text("Software tutor", "코딩 강사"),
    incomeMin: 3200,
    incomeMax: 5600,
  },
];

function generateActor(roller: Roller, id: string): ActorProfile {
  const gender: Gender = roller.chance(0.5) ? "female" : "male";
  const first = roller.pick(gender === "female" ? FEMALE_NAMES : MALE_NAMES);
  const last = roller.pick(LAST_NAMES);
  const age = roller.int(19, 74);
  const employedChance = age >= 68 ? 0.25 : age >= 60 ? 0.6 : 0.85;
  const employed = roller.chance(employedChance);
  const occupation = employed ? roller.pick(OCCUPATIONS) : null;
  const monthlyIncome = occupation
    ? Math.round(roller.int(occupation.incomeMin, occupation.incomeMax) / 50) *
      50
    : 0;
  let riskBp = 300;
  if (!employed) riskBp += 2500;
  if (age >= 65) riskBp += 1200;
  else if (age <= 22) riskBp += 500;
  if (monthlyIncome > 0 && monthlyIncome < 2200) riskBp += 400;
  return {
    id,
    name: `${first} ${last}`,
    gender,
    age,
    occupation: occupation?.label ?? null,
    monthlyIncome,
    image: roller.pick(gender === "female" ? FEMALE_PORTRAITS : MALE_PORTRAITS),
    riskBp,
  };
}

/**
 * Draw candidate positions until one keeps clear of every occupied node, so
 * map circles and squares do not stack on each other.  Gives up after a few
 * tries on a crowded map and accepts the final candidate.
 */
function pickPosition(
  roller: Roller,
  occupied: ReadonlyArray<{ x: number; y: number }>,
  span: { min: number; size: number },
): { x: number; y: number } {
  let candidate = { x: 0.5, y: 0.5 };
  for (let attempt = 0; attempt < 14; attempt += 1) {
    candidate = {
      x: span.min + roller.next() * span.size,
      y: span.min + roller.next() * span.size,
    };
    const clear = occupied.every(
      (node) => Math.hypot(node.x - candidate.x, node.y - candidate.y) > 0.17,
    );
    if (clear) return candidate;
  }
  return candidate;
}

function occupiedPositions(
  world: MarketWorld,
): Array<{ x: number; y: number }> {
  return [
    ...world.demands
      .filter((demand) => demand.status === "open")
      .map((demand) => ({ x: demand.x, y: demand.y })),
    ...world.contracts.map((contract) => ({ x: contract.x, y: contract.y })),
  ];
}

function pushEvent(
  log: WorldEvent[],
  event: Omit<WorldEvent, "id">,
  id: string,
): WorldEvent[] {
  const next = [...log, { ...event, id }];
  return next.length > MAX_LOG_ENTRIES
    ? next.slice(next.length - MAX_LOG_ENTRIES)
    : next;
}

/** Append a one-time scripted event to the same history as simulation events. */
export function recordSpecialEvent(
  world: MarketWorld,
  specialEventId: SpecialEventId,
  actorName: string,
): MarketWorld {
  if (
    world.log.some(
      (event) =>
        event.kind === "special-event" &&
        event.specialEventId === specialEventId,
    )
  )
    return world;
  return {
    ...world,
    log: pushEvent(
      world.log,
      {
        day: world.day,
        kind: "special-event",
        actorName,
        amount: 0,
        specialEventId,
      },
      `event-special-${specialEventId}`,
    ),
  };
}

function spawnDemand(world: MarketWorld): MarketWorld {
  const roller = new Roller(world.seed, world.cursor);
  const actorId = `actor-${world.nextId}`;
  const demandId = `demand-${world.nextId}`;
  const actor = generateActor(roller, actorId);
  const amount = roller.int(4, 40) * 10;
  const payableAfterDays = roller.int(1, 12) * 30;
  // The margin an actor tolerates grows with the borrowing horizon.
  const marginPct =
    0.04 + (payableAfterDays / 360) * 0.22 + roller.next() * 0.08;
  const position = pickPosition(roller, occupiedPositions(world), {
    min: 0.06,
    size: 0.88,
  });
  const demand: Demand = {
    id: demandId,
    actor,
    amount,
    payableAfterDays,
    maxRepayment: Math.ceil(amount * (1 + marginPct)),
    x: position.x,
    y: position.y,
    createdDay: world.day,
    expiresDay: world.day + DEMAND_LIFETIME_DAYS,
    status: "open",
    rejectedContractIds: [],
  };
  return {
    ...world,
    cursor: roller.cursor,
    nextId: world.nextId + 1,
    demands: [...world.demands, demand],
    log: pushEvent(
      world.log,
      {
        day: world.day,
        kind: "demand-appeared",
        actorName: actor.name,
        amount,
      },
      `event-${demandId}`,
    ),
  };
}

/**
 * True when executing a posted contract would satisfy the requester's demand.
 * The execution uses a temporary requester state plus read-only assumptions,
 * never a clone of (or mutation to) the market world.
 */
export function contractFitsDemand(
  contract: ContractOffer,
  demand: Demand,
  availableCash: number,
): boolean {
  if (demand.rejectedContractIds.includes(contract.id)) return false;
  const state = simulateContractForDemand(
    contract.builderNodes,
    demand,
    availableCash,
  );
  return (
    state !== null &&
    // A match must also be signable by the current loan lifecycle.
    state.funded > 0 &&
    state.repaid > 0 &&
    state.day > 0 &&
    requesterStateSatisfiesDemand(state, demand)
  );
}

/** True only when a contract run threw while evaluating this applicant. */
function contractHasEvaluationError(
  contract: ContractOffer,
  demand: Demand,
  availableCash: number,
): boolean {
  return (
    !demand.rejectedContractIds.includes(contract.id) &&
    simulateContractForDemand(contract.builderNodes, demand, availableCash) ===
      null
  );
}

/**
 * Open demands that should automatically apply when a contract enters the
 * market. This is the same fit and decision logic used by fileRequest; the
 * caller may animate the visual arrival before filing each request.
 */
export function matchingOpenDemandIds(
  world: MarketWorld,
  contractId: string,
): string[] {
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (!contract) return [];
  const cash = availableCash(world);
  return world.demands
    .filter((demand) => {
      if (demand.status !== "open") return false;
      // Evaluation failures always surface for review, even if a decision
      // would otherwise reject the applicant. Silently dropping a broken
      // contract would hide a configuration or requester-data problem.
      if (contractHasEvaluationError(contract, demand, cash)) return true;
      return (
        contractFitsDemand(contract, demand, cash) &&
        decideRequestOutcome(contract.builderNodes, demand, cash) !== "reject"
      );
    })
    .map((demand) => demand.id);
}

/** Build the request a demand files on a contract, terms snapshotted now. */
function buildRequest(
  demand: Demand,
  contract: ContractOffer,
  day: number,
  availableCash: number,
  serial: number,
): ContractRequest | null {
  const terms = evaluateContractForDemand(
    contract.builderNodes,
    demand,
    availableCash,
  );
  if (!terms) return null;
  return {
    // The serial keeps IDs unique when the same demand re-applies to the
    // same contract after its pending request was released by an edit.
    id: `request-${serial}-${demand.id}-${contract.id}`,
    demandId: demand.id,
    actor: demand.actor,
    day,
    status: "pending",
    principal: terms.principal,
    termDays: terms.termDays,
    repayment: terms.repayment,
  };
}

function buildReviewRequest(
  demand: Demand,
  contract: ContractOffer,
  day: number,
  serial: number,
): ContractRequest {
  return {
    id: `request-${serial}-${demand.id}-${contract.id}`,
    demandId: demand.id,
    actor: demand.actor,
    day,
    status: "review",
    issue: "evaluation-error",
    // These values are deliberately unusable: a review request never reaches
    // acceptRequest until the contract is corrected and re-evaluated.
    principal: 0,
    termDays: 0,
    repayment: 0,
  };
}

/** Default chance for a specific loan, mixing actor risk and burden. */
export function loanDefaultChanceBp(
  actor: ActorProfile,
  repayment: number,
): number {
  let chanceBp = actor.riskBp;
  if (actor.monthlyIncome > 0) {
    const burden = repayment / actor.monthlyIncome;
    if (burden > 2) chanceBp += 900;
    else if (burden > 1) chanceBp += 400;
  }
  return Math.min(8_500, Math.max(100, chanceBp));
}

/** Advance the world exactly one day. */
export function advanceWorldDay(world: MarketWorld): MarketWorld {
  const day = world.day + 1;
  const roller = new Roller(world.seed, world.cursor);
  let cash = availableCash(world);
  let log = world.log;

  // 1. Loan-receivable assets that come due today either repay or default.
  let assets = world.balanceSheet.assets.map((asset) => {
    const loan = asset.loan;
    if (
      asset.kind !== "loan-receivable" ||
      !loan ||
      asset.status !== "active" ||
      loan.dueDay > day
    )
      return asset;
    const defaulted = roller.next() < loan.defaultChanceBp / 10_000;
    if (!defaulted) cash += loan.repayment;
    log = pushEvent(
      log,
      {
        day,
        kind: defaulted ? "loan-defaulted" : "loan-repaid",
        actorName: loan.actor.name,
        amount: loan.repayment,
      },
      `event-${asset.id}-due`,
    );
    return {
      ...asset,
      value: 0,
      status: defaulted ? ("defaulted" as const) : ("settled" as const),
      loan: { ...loan, resolvedDay: day },
    };
  });

  // 2. Stale open demands leave the market.
  const expiredIds = new Set<string>();
  let demands = world.demands.map((demand) => {
    if (demand.status !== "open" || demand.expiresDay > day) return demand;
    expiredIds.add(demand.id);
    log = pushEvent(
      log,
      {
        day,
        kind: "demand-expired",
        actorName: demand.actor.name,
        amount: demand.amount,
      },
      `event-${demand.id}-expired`,
    );
    return { ...demand, status: "expired" as const };
  });

  // 3. Requesters run out of patience: a queued review/request older than the
  //    patience window is withdrawn and the person leaves the market.
  let contracts = world.contracts;
  const impatientDemandIds = new Set<string>();
  contracts = contracts.map((contract) => {
    const stale = contract.requests.filter(
      (request) =>
        (request.status === "pending" || request.status === "review") &&
        day - request.day >= REQUEST_LIFETIME_DAYS,
    );
    if (stale.length === 0) return contract;
    for (const request of stale) {
      impatientDemandIds.add(request.demandId);
      const demand = demands.find(
        (candidate) => candidate.id === request.demandId,
      );
      log = pushEvent(
        log,
        {
          day,
          kind: "demand-expired",
          actorName: request.actor.name,
          amount: demand?.amount ?? request.principal,
        },
        `event-${request.id}-impatient`,
      );
    }
    return {
      ...contract,
      requests: contract.requests.filter((request) => !stale.includes(request)),
    };
  });
  if (impatientDemandIds.size > 0)
    demands = demands.map((demand) =>
      impatientDemandIds.has(demand.id) && demand.status === "requesting"
        ? { ...demand, status: "expired" as const, expiresDay: day }
        : demand,
    );

  // 4. Open demands discover fitting contracts and apply. Decision gates can
  //    reject, queue for review, or safely sign the loan in this same tick.
  let nextId = world.nextId;
  demands = demands.map((demand) => {
    if (demand.status !== "open") return demand;
    const candidates = contracts.filter(
      (contract) =>
        contractFitsDemand(contract, demand, cash) ||
        contractHasEvaluationError(contract, demand, cash),
    );
    if (candidates.length === 0) return demand;
    if (!roller.chance(DAILY_REQUEST_CHANCE)) return demand;
    const contract = roller.pick(candidates);
    const evaluationFailed = contractHasEvaluationError(contract, demand, cash);
    const outcome = decideRequestOutcome(contract.builderNodes, demand, cash);
    const request = evaluationFailed
      ? buildReviewRequest(demand, contract, day, nextId)
      : buildRequest(demand, contract, day, cash, nextId);
    if (!request) return demand;
    nextId += 1;

    // An execution failure is always visible for review, never hidden by a
    // rejection rule or pushed through the automated signing path.
    if (evaluationFailed) {
      contracts = contracts.map((candidate) =>
        candidate.id === contract.id
          ? { ...candidate, requests: [...candidate.requests, request] }
          : candidate,
      );
      log = pushEvent(
        log,
        {
          day,
          kind: "request-filed",
          actorName: demand.actor.name,
          amount: demand.amount,
        },
        `event-${request.id}`,
      );
      return { ...demand, status: "requesting" as const };
    }

    if (outcome === "reject")
      return {
        ...demand,
        rejectedContractIds: [...demand.rejectedContractIds, contract.id],
      };

    if (outcome === "auto" && cash >= request.principal) {
      const loanAsset = loanAssetForRequest(contract.id, request, day);
      cash -= request.principal;
      assets = [...assets, loanAsset];
      contracts = contracts.map((candidate) =>
        candidate.id === contract.id
          ? {
              ...candidate,
              requests: [
                ...candidate.requests,
                { ...request, status: "accepted" as const },
              ],
            }
          : candidate,
      );
      log = pushEvent(
        log,
        {
          day,
          kind: "loan-signed",
          actorName: request.actor.name,
          amount: request.principal,
        },
        `event-${loanAsset.id}`,
      );
      return { ...demand, status: "served" as const };
    }

    contracts = contracts.map((candidate) =>
      candidate.id === contract.id
        ? {
            ...candidate,
            requests: [
              ...candidate.requests,
              outcome === "auto"
                ? { ...request, issue: "insufficient-cash" }
                : request,
            ],
          }
        : candidate,
    );
    log = pushEvent(
      log,
      {
        day,
        kind: "request-filed",
        actorName: demand.actor.name,
        amount: request.principal,
      },
      `event-${request.id}`,
    );
    return { ...demand, status: "requesting" as const };
  });

  // 5. Queued requests whose demand expired never resolve, so they are
  //    withdrawn together with the demand (step 2 only expires open demands,
  //    which cannot have pending requests — kept for safety).
  if (expiredIds.size > 0)
    contracts = contracts.map((contract) => ({
      ...contract,
      requests: contract.requests.filter(
        (request) =>
          (request.status !== "pending" && request.status !== "review") ||
          !expiredIds.has(request.demandId),
      ),
    }));

  let next: MarketWorld = {
    ...world,
    cursor: roller.cursor,
    day,
    nextId,
    demands: demands.filter(
      // Settled people (served or expired) linger a few days for the map
      // animation, then leave so the list does not grow forever.
      (demand) =>
        demand.status === "open" ||
        demand.status === "requesting" ||
        demand.expiresDay + 5 > day,
    ),
    contracts,
    balanceSheet: {
      ...world.balanceSheet,
      assets: withCashValue(assets, cash),
    },
    log,
  };

  // 6. New demand walks in when the street has room.
  const openCount = next.demands.filter(
    (demand) => demand.status === "open",
  ).length;
  const spawnChance =
    openCount >= MAX_OPEN_DEMANDS
      ? 0
      : openCount <= 2
        ? DAILY_SPAWN_CHANCE * 2
        : DAILY_SPAWN_CHANCE;
  const spawnRoller = new Roller(next.seed, next.cursor);
  const shouldSpawn = spawnRoller.chance(spawnChance);
  next = { ...next, cursor: spawnRoller.cursor };
  if (shouldSpawn) next = spawnDemand(next);
  return next;
}

/** Post a new contract offer onto the market map. */
export function postContract(
  world: MarketWorld,
  builderNodes: MarketBuilderNode[],
): MarketWorld {
  const roller = new Roller(world.seed, world.cursor);
  const position = pickPosition(roller, occupiedPositions(world), {
    min: 0.14,
    size: 0.72,
  });
  const contract: ContractOffer = {
    id: `contract-${world.nextId}`,
    x: position.x,
    y: position.y,
    postedDay: world.day,
    requests: [],
    builderNodes,
  };
  return {
    ...world,
    cursor: roller.cursor,
    nextId: world.nextId + 1,
    contracts: [...world.contracts, contract],
  };
}

/**
 * Rewrite a posted contract's terms. Queued requests were filed against
 * the old terms, so their demands return to the open market — and people
 * the old terms turned away will reconsider the new ones.
 */
export function updateContract(
  world: MarketWorld,
  contractId: string,
  builderNodes: MarketBuilderNode[],
): MarketWorld {
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (!contract) return world;
  const releasedDemandIds = new Set(
    contract.requests
      .filter(
        (request) =>
          request.status === "pending" || request.status === "review",
      )
      .map((request) => request.demandId),
  );
  return {
    ...world,
    contracts: world.contracts.map((candidate) =>
      candidate.id === contractId
        ? {
            ...candidate,
            builderNodes,
            requests: candidate.requests.filter(
              (request) =>
                request.status !== "pending" && request.status !== "review",
            ),
          }
        : candidate,
    ),
    demands: world.demands.map((demand) => {
      const released =
        releasedDemandIds.has(demand.id) && demand.status === "requesting";
      const wasRejected = demand.rejectedContractIds.includes(contractId);
      if (!released && !wasRejected) return demand;
      return {
        ...demand,
        status: released ? ("open" as const) : demand.status,
        rejectedContractIds: demand.rejectedContractIds.filter(
          (id) => id !== contractId,
        ),
      };
    }),
  };
}

/** Reposition a contract on the map; coordinates are normalized to [0, 1]. */
export function moveContract(
  world: MarketWorld,
  contractId: string,
  x: number,
  y: number,
): MarketWorld {
  if (!world.contracts.some((candidate) => candidate.id === contractId))
    return world;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    ...world,
    contracts: world.contracts.map((candidate) =>
      candidate.id === contractId
        ? { ...candidate, x: clamp(x), y: clamp(y) }
        : candidate,
    ),
  };
}

/** Remove a posted contract; queued requesters return to the market. */
export function withdrawContract(
  world: MarketWorld,
  contractId: string,
): MarketWorld {
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (!contract) return world;
  const releasedDemandIds = new Set(
    contract.requests
      .filter(
        (request) =>
          request.status === "pending" || request.status === "review",
      )
      .map((request) => request.demandId),
  );
  return {
    ...world,
    contracts: world.contracts.filter(
      (candidate) => candidate.id !== contractId,
    ),
    demands: world.demands.map((demand) =>
      releasedDemandIds.has(demand.id) && demand.status === "requesting"
        ? { ...demand, status: "open" as const }
        : demand,
    ),
  };
}

/**
 * File a request on behalf of a demand the player dragged onto a contract.
 * The contract's decision gates run exactly as they do for automatic
 * applicants: reject turns the person away (they will not ask this contract
 * again), while draft waits in the request list for the banker to accept.
 * No-op unless the demand is open and the contract fits its need — the
 * caller checks fit first to drive the reject animation.
 */
export function fileRequest(
  world: MarketWorld,
  demandId: string,
  contractId: string,
): MarketWorld {
  const demand = world.demands.find((candidate) => candidate.id === demandId);
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (!demand || !contract || demand.status !== "open") return world;
  const cash = availableCash(world);
  const evaluationFailed = contractHasEvaluationError(contract, demand, cash);
  if (!evaluationFailed && !contractFitsDemand(contract, demand, cash))
    return world;
  const outcome = decideRequestOutcome(contract.builderNodes, demand, cash);
  // A failed run is never rejected or auto-signed. It remains visible, but
  // cannot be accepted until the contract is fixed and filed again.
  const request = evaluationFailed
    ? buildReviewRequest(demand, contract, world.day, world.nextId)
    : buildRequest(demand, contract, world.day, cash, world.nextId);
  if (!request) return world;

  const filed: MarketWorld = {
    ...world,
    nextId: world.nextId + 1,
    contracts: world.contracts.map((candidate) =>
      candidate.id === contractId
        ? { ...candidate, requests: [...candidate.requests, request] }
        : candidate,
    ),
    demands: world.demands.map((candidate) =>
      candidate.id === demandId
        ? { ...candidate, status: "requesting" as const }
        : candidate,
    ),
    log: pushEvent(
      world.log,
      {
        day: world.day,
        kind: "request-filed",
        actorName: demand.actor.name,
        amount: request.principal || demand.amount,
      },
      `event-${request.id}`,
    ),
  };
  if (evaluationFailed) return filed;

  if (outcome === "reject")
    return {
      ...world,
      nextId: world.nextId + 1,
      demands: world.demands.map((candidate) =>
        candidate.id === demandId
          ? {
              ...candidate,
              rejectedContractIds: [
                ...candidate.rejectedContractIds,
                contractId,
              ],
            }
          : candidate,
      ),
    };

  if (outcome !== "auto") return filed;

  const result = acceptRequest(filed, contractId, request.id);
  if (!result.failure) return result.world;
  // The terms are sound but the balance has changed since matching. Preserve
  // a normal, manually approvable request and explain why automation stopped.
  return {
    ...filed,
    contracts: filed.contracts.map((candidate) =>
      candidate.id === contractId
        ? {
            ...candidate,
            requests: candidate.requests.map((entry) =>
              entry.id === request.id
                ? { ...entry, issue: "insufficient-cash" }
                : entry,
            ),
          }
        : candidate,
    ),
  };
}

export type AcceptFailure = "insufficient-cash" | "not-found";

export interface AcceptResult {
  world: MarketWorld;
  failure: AcceptFailure | null;
}

function loanAssetForRequest(
  contractId: string,
  request: ContractRequest,
  day: number,
): Asset {
  const loan: Loan = {
    contractId,
    actor: request.actor,
    principal: request.principal,
    repayment: request.repayment,
    signedDay: day,
    dueDay: day + request.termDays,
    defaultChanceBp: loanDefaultChanceBp(request.actor, request.repayment),
  };
  return {
    id: `loan-${request.id}`,
    kind: "loan-receivable",
    value: request.principal,
    status: "active",
    loan,
  };
}

/** Accept a pending request: cash goes out now, the loan starts today. */
export function acceptRequest(
  world: MarketWorld,
  contractId: string,
  requestId: string,
): AcceptResult {
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  const request = contract?.requests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!contract || !request || request.status !== "pending")
    return { world, failure: "not-found" };
  const cash = availableCash(world);
  if (cash < request.principal) return { world, failure: "insufficient-cash" };
  const loanAsset = loanAssetForRequest(contractId, request, world.day);
  return {
    failure: null,
    world: {
      ...world,
      balanceSheet: {
        ...world.balanceSheet,
        assets: [
          ...withCashValue(world.balanceSheet.assets, cash - request.principal),
          loanAsset,
        ],
      },
      contracts: world.contracts.map((candidate) =>
        candidate.id === contractId
          ? {
              ...candidate,
              requests: candidate.requests.map((entry) =>
                entry.id === requestId
                  ? { ...entry, status: "accepted" as const }
                  : entry,
              ),
            }
          : candidate,
      ),
      demands: world.demands.map((demand) =>
        demand.id === request.demandId
          ? { ...demand, status: "served" as const }
          : demand,
      ),
      log: pushEvent(
        world.log,
        {
          day: world.day,
          kind: "loan-signed",
          actorName: request.actor.name,
          amount: request.principal,
        },
        `event-${loanAsset.id}`,
      ),
    },
  };
}

/** Reject a pending request; the demand returns to the open market. */
export function rejectRequest(
  world: MarketWorld,
  contractId: string,
  requestId: string,
): MarketWorld {
  const contract = world.contracts.find(
    (candidate) => candidate.id === contractId,
  );
  const request = contract?.requests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!contract || !request || request.status !== "pending") return world;
  return {
    ...world,
    contracts: world.contracts.map((candidate) =>
      candidate.id === contractId
        ? {
            ...candidate,
            requests: candidate.requests.filter(
              (entry) => entry.id !== requestId,
            ),
          }
        : candidate,
    ),
    demands: world.demands.map((demand) =>
      demand.id === request.demandId
        ? {
            ...demand,
            status: "open" as const,
            rejectedContractIds: [...demand.rejectedContractIds, contractId],
            // A rejection sends them back to browsing with fresh patience.
            expiresDay: world.day + DEMAND_LIFETIME_DAYS,
          }
        : demand,
    ),
  };
}

/** Every currently held asset; resolved records remain in the ledger only. */
export function activeAssets(world: MarketWorld): ActiveAsset[] {
  return world.balanceSheet.assets.filter(
    (asset): asset is ActiveAsset => asset.status === "active",
  );
}

/** Sum of the active assets on the balance sheet. */
export function totalAssetValue(world: MarketWorld): number {
  return activeAssets(world).reduce((total, asset) => total + asset.value, 0);
}

/** Sum of active obligations; liabilities do not contribute to total assets. */
export function totalLiabilityValue(world: MarketWorld): number {
  return world.balanceSheet.liabilities
    .filter((liability) => liability.status === "active")
    .reduce((total, liability) => total + liability.value, 0);
}

export function netWorth(world: MarketWorld): number {
  return totalAssetValue(world) - totalLiabilityValue(world);
}

/** Sum of principal still deployed in active loans. */
export function outstandingPrincipal(world: MarketWorld): number {
  return activeLoanReceivables(world).reduce(
    (sum, asset) => sum + asset.value,
    0,
  );
}

export function pendingRequestCount(contract: ContractOffer): number {
  return contract.requests.filter(
    (request) => request.status === "pending" || request.status === "review",
  ).length;
}
