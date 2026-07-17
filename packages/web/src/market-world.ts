import type { LocalText } from "./campaign-stages.ts";
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

export type RequestStatus = "pending" | "accepted" | "rejected";

export interface ContractRequest {
  id: string;
  demandId: string;
  actor: ActorProfile;
  day: number;
  status: RequestStatus;
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
 * What happens to a requester the moment they apply: sign the loan, turn
 * them away, or leave them in the request list for manual review.
 */
export type DecisionOutcome = "accept" | "reject" | "draft";

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
  /** Condition/decision test. */
  left?: ValueRecipe;
  comparator?: ComparatorOp;
  right?: ValueRecipe;
  /** Variable nodes assign a named value card to the current path scope. */
  variableName?: string;
  /** Conditions own two real, path-scoped execution lanes. */
  thenSteps?: MarketBuilderNode[];
  elseSteps?: MarketBuilderNode[];
  /** Decision only: branch outcomes for the requester. */
  thenOutcome?: DecisionOutcome;
  elseOutcome?: DecisionOutcome;
}

/** Requester facts every contract formula can reference. */
export const REQUESTER_VARIABLES = ["amount", "days", "income", "age"] as const;

export function demandVariables(demand: Demand): Record<string, number> {
  return {
    amount: demand.amount,
    days: demand.payableAfterDays,
    income: demand.actor.monthlyIncome,
    age: demand.actor.age,
  };
}

export interface EvaluatedTerms {
  principal: number;
  termDays: number;
  repayment: number;
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
function walkContractTerms(
  nodes: readonly MarketBuilderNode[],
  variables: Record<string, number>,
): EvaluatedTerms {
  const terms: EvaluatedTerms = { principal: 0, termDays: 0, repayment: 0 };
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
        terms.termDays += Math.max(
          0,
          Math.round(evaluateRecipe(node.days, scope)),
        );
      } else if (node.kind === "transfer") {
        const value = evaluateRecipe(node.amount, scope);
        if (node.senderId === "player") terms.principal += value;
        else if (node.recipientId === "player") terms.repayment += value;
      }
    }
  };
  walk(nodes, { ...variables });
  return {
    principal: Math.round(terms.principal),
    termDays: terms.termDays,
    repayment: Math.round(terms.repayment),
  };
}

/**
 * Run the stack's decision nodes for a requester. Conditions route through
 * their selected lane and variable values remain local to that lane; the first
 * decision branch that is not "draft" settles the requester, and a stack
 * with no deciding node leaves them for manual review.
 */
export function decideRequestOutcome(
  nodes: readonly MarketBuilderNode[],
  demand: Demand,
): DecisionOutcome {
  try {
    const decidePath = (
      path: readonly MarketBuilderNode[],
      scope: Record<string, number>,
    ): DecisionOutcome => {
      for (const node of path) {
        if (node.kind === "variable") {
          if (!node.variableName) throw new Error("Choose a variable name.");
          scope[node.variableName] = evaluateRecipe(node.amount, scope);
          continue;
        }
        if (node.kind !== "condition" && node.kind !== "decision") continue;
        const left = evaluateRecipe(node.left, scope);
        const right = evaluateRecipe(node.right, scope);
        const holds = compareValues(left, node.comparator ?? ">", right);
        if (node.kind === "condition") {
          const outcome = decidePath(
            holds ? (node.thenSteps ?? []) : (node.elseSteps ?? []),
            { ...scope },
          );
          if (outcome !== "draft") return outcome;
          continue;
        }
        const outcome =
          (holds ? node.thenOutcome : node.elseOutcome) ?? "draft";
        if (outcome !== "draft") return outcome;
      }
      return "draft";
    };
    return decidePath(nodes, demandVariables(demand));
  } catch {
    return "draft";
  }
}

/** Terms this contract would offer a specific requester; null when broken. */
export function evaluateContractForDemand(
  nodes: readonly MarketBuilderNode[],
  demand: Demand,
): EvaluatedTerms | null {
  try {
    const terms = walkContractTerms(nodes, demandVariables(demand));
    if (terms.principal <= 0 || terms.termDays <= 0 || terms.repayment <= 0)
      return null;
    return terms;
  } catch {
    return null;
  }
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

export type LoanStatus = "active" | "repaid" | "defaulted";

export interface Loan {
  id: string;
  contractId: string;
  actor: ActorProfile;
  principal: number;
  repayment: number;
  signedDay: number;
  dueDay: number;
  /** Chance rolled at the due date, fixed when the loan is signed. */
  defaultChanceBp: number;
  status: LoanStatus;
  resolvedDay?: number;
}

export type WorldEventKind =
  | "demand-appeared"
  | "demand-expired"
  | "request-filed"
  | "loan-signed"
  | "loan-repaid"
  | "loan-defaulted";

export interface WorldEvent {
  id: string;
  day: number;
  kind: WorldEventKind;
  actorName: string;
  amount: number;
}

export interface MarketWorld {
  seed: string;
  /** Monotonic counter salting every random roll. */
  cursor: number;
  day: number;
  startingCash: number;
  cash: number;
  nextId: number;
  demands: Demand[];
  contracts: ContractOffer[];
  loans: Loan[];
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

export function emptyWorld(seed: string): MarketWorld {
  let world: MarketWorld = {
    seed,
    cursor: 0,
    day: 0,
    startingCash: MARKET_STARTING_CASH,
    cash: MARKET_STARTING_CASH,
    nextId: 1,
    demands: [],
    contracts: [],
    loans: [],
    log: [],
  };
  // Open the doors with a populated street rather than an empty map.
  for (let index = 0; index < 4; index += 1) world = spawnDemand(world);
  return world;
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
  constructor(
    private readonly seed: string,
    public cursor: number,
  ) {}

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
 * True when a posted contract satisfies what the demand asks for.  Terms are
 * evaluated for this specific requester, so a dynamic contract lending
 * `amount` fits the $200 needer and the $300 needer alike.
 */
export function contractFitsDemand(
  contract: ContractOffer,
  demand: Demand,
): boolean {
  if (demand.rejectedContractIds.includes(contract.id)) return false;
  const terms = evaluateContractForDemand(contract.builderNodes, demand);
  return (
    terms !== null &&
    terms.principal >= demand.amount &&
    terms.repayment <= demand.maxRepayment &&
    terms.termDays >= demand.payableAfterDays
  );
}

/** Build the request a demand files on a contract, terms snapshotted now. */
function buildRequest(
  demand: Demand,
  contract: ContractOffer,
  day: number,
): ContractRequest | null {
  const terms = evaluateContractForDemand(contract.builderNodes, demand);
  if (!terms) return null;
  return {
    id: `request-${demand.id}-${contract.id}`,
    demandId: demand.id,
    actor: demand.actor,
    day,
    status: "pending",
    principal: terms.principal,
    termDays: terms.termDays,
    repayment: terms.repayment,
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
  let cash = world.cash;
  let log = world.log;

  // 1. Loans that come due today either repay or default.
  let loans = world.loans.map((loan) => {
    if (loan.status !== "active" || loan.dueDay > day) return loan;
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
      `event-${loan.id}-due`,
    );
    return {
      ...loan,
      status: defaulted ? ("defaulted" as const) : ("repaid" as const),
      resolvedDay: day,
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

  // 3. Requesters run out of patience: a pending request older than the
  //    patience window is withdrawn and the person leaves the market.
  let contracts = world.contracts;
  const impatientDemandIds = new Set<string>();
  contracts = contracts.map((contract) => {
    const stale = contract.requests.filter(
      (request) =>
        request.status === "pending" &&
        day - request.day >= REQUEST_LIFETIME_DAYS,
    );
    if (stale.length === 0) return contract;
    for (const request of stale) {
      impatientDemandIds.add(request.demandId);
      const actorName = request.actor.name;
      log = pushEvent(
        log,
        { day, kind: "demand-expired", actorName, amount: request.principal },
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

  // 4. Open demands discover fitting contracts and apply.  The contract's
  //    decision nodes settle each applicant on the spot: auto-accepted
  //    loans sign immediately, auto-rejected people return to browsing,
  //    and drafts wait in the request list for the banker.
  demands = demands.map((demand) => {
    if (demand.status !== "open") return demand;
    const fitting = contracts.filter((contract) =>
      contractFitsDemand(contract, demand),
    );
    if (fitting.length === 0) return demand;
    if (!roller.chance(DAILY_REQUEST_CHANCE)) return demand;
    const contract = roller.pick(fitting);
    const request = buildRequest(demand, contract, day);
    if (!request) return demand;

    let outcome = decideRequestOutcome(contract.builderNodes, demand);
    if (outcome === "accept" && cash < request.principal) outcome = "draft";
    if (outcome === "reject")
      return {
        ...demand,
        rejectedContractIds: [...demand.rejectedContractIds, contract.id],
      };

    const settled = outcome === "accept";
    const entry: ContractRequest = settled
      ? { ...request, status: "accepted" }
      : request;
    contracts = contracts.map((candidate) =>
      candidate.id === contract.id
        ? { ...candidate, requests: [...candidate.requests, entry] }
        : candidate,
    );
    log = pushEvent(
      log,
      {
        day,
        kind: settled ? "loan-signed" : "request-filed",
        actorName: demand.actor.name,
        amount: request.principal,
      },
      `event-${request.id}`,
    );
    if (!settled) return { ...demand, status: "requesting" as const };
    cash -= request.principal;
    loans = [
      ...loans,
      {
        id: `loan-${request.id}`,
        contractId: contract.id,
        actor: request.actor,
        principal: request.principal,
        repayment: request.repayment,
        signedDay: day,
        dueDay: day + request.termDays,
        defaultChanceBp: loanDefaultChanceBp(request.actor, request.repayment),
        status: "active" as const,
      },
    ];
    return { ...demand, status: "served" as const };
  });

  // 5. Pending requests whose demand expired never resolve, so they are
  //    withdrawn together with the demand (step 2 only expires open demands,
  //    which cannot have pending requests — kept for safety).
  if (expiredIds.size > 0)
    contracts = contracts.map((contract) => ({
      ...contract,
      requests: contract.requests.filter(
        (request) =>
          request.status !== "pending" || !expiredIds.has(request.demandId),
      ),
    }));

  let next: MarketWorld = {
    ...world,
    cursor: roller.cursor,
    day,
    cash,
    demands: demands.filter(
      (demand) => demand.status !== "expired" || demand.expiresDay + 5 > day,
    ),
    contracts,
    loans,
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
 * Rewrite a posted contract's terms.  Pending requests were filed against
 * the old terms, so their demands return to the open market.
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
      .filter((request) => request.status === "pending")
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
              (request) => request.status !== "pending",
            ),
          }
        : candidate,
    ),
    demands: world.demands.map((demand) =>
      releasedDemandIds.has(demand.id) && demand.status === "requesting"
        ? { ...demand, status: "open" as const }
        : demand,
    ),
  };
}

/** Remove a posted contract; pending requesters return to the market. */
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
      .filter((request) => request.status === "pending")
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
 * The contract's decision nodes run exactly as they do for automatic
 * applicants: accept signs the loan, reject turns the person away (they
 * will not ask this contract again), draft waits in the request list.
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
  if (!contractFitsDemand(contract, demand)) return world;
  const request = buildRequest(demand, contract, world.day);
  if (!request) return world;

  let outcome = decideRequestOutcome(contract.builderNodes, demand);
  if (outcome === "accept" && world.cash < request.principal) outcome = "draft";
  if (outcome === "reject")
    return {
      ...world,
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

  const settled = outcome === "accept";
  const entry: ContractRequest = settled
    ? { ...request, status: "accepted" }
    : request;
  const loans = settled
    ? [
        ...world.loans,
        {
          id: `loan-${request.id}`,
          contractId,
          actor: request.actor,
          principal: request.principal,
          repayment: request.repayment,
          signedDay: world.day,
          dueDay: world.day + request.termDays,
          defaultChanceBp: loanDefaultChanceBp(
            request.actor,
            request.repayment,
          ),
          status: "active" as const,
        },
      ]
    : world.loans;
  return {
    ...world,
    cash: settled ? world.cash - request.principal : world.cash,
    loans,
    contracts: world.contracts.map((candidate) =>
      candidate.id === contractId
        ? { ...candidate, requests: [...candidate.requests, entry] }
        : candidate,
    ),
    demands: world.demands.map((candidate) =>
      candidate.id === demandId
        ? {
            ...candidate,
            status: settled ? ("served" as const) : ("requesting" as const),
          }
        : candidate,
    ),
    log: pushEvent(
      world.log,
      {
        day: world.day,
        kind: settled ? "loan-signed" : "request-filed",
        actorName: demand.actor.name,
        amount: request.principal,
      },
      `event-${request.id}`,
    ),
  };
}

export type AcceptFailure = "insufficient-cash" | "not-found";

export interface AcceptResult {
  world: MarketWorld;
  failure: AcceptFailure | null;
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
  if (world.cash < request.principal)
    return { world, failure: "insufficient-cash" };
  const loan: Loan = {
    id: `loan-${request.id}`,
    contractId,
    actor: request.actor,
    principal: request.principal,
    repayment: request.repayment,
    signedDay: world.day,
    dueDay: world.day + request.termDays,
    defaultChanceBp: loanDefaultChanceBp(request.actor, request.repayment),
    status: "active",
  };
  return {
    failure: null,
    world: {
      ...world,
      cash: world.cash - request.principal,
      loans: [...world.loans, loan],
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
        `event-${loan.id}`,
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

/** Sum of principal still deployed in active loans. */
export function outstandingPrincipal(world: MarketWorld): number {
  return world.loans
    .filter((loan) => loan.status === "active")
    .reduce((sum, loan) => sum + loan.principal, 0);
}

export function pendingRequestCount(contract: ContractOffer): number {
  return contract.requests.filter((request) => request.status === "pending")
    .length;
}
