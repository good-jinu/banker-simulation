/**
 * Bank Trust — a rolling reputation, not a point tally.
 *
 * No action grants permanent credit. Each day the bank's standing is recomputed
 * from decayed aggregates of what it has actually done, and the displayed score
 * walks toward that figure. Approving a loan is worth nothing until it is
 * repaid; farming the same cheap loan stops paying once reach saturates;
 * borrowed cash cannot inflate the score because strength uses net assets.
 *
 * The felt asymmetry — mistakes sting at once, recovery is a grind — lives in
 * the display walk (rise slowly, fall fast), not in the decay constants. Making
 * losses near-permanent instead would gate a perfect score behind the default
 * dice, since even a well-underwritten loan book defaults sometimes.
 *
 * This module is deliberately world-free: it takes plain numbers so the model
 * can be tested without constructing a simulation, and so market-world.ts can
 * import it without a cycle. The player never sees any weight or threshold in
 * here — only three broad bands and qualitative messages.
 */

/**
 * Decayed evidence of the bank's conduct. Ratio pairs (repaid/defaulted,
 * honored/missed, ...) must share a decay rate or the ratios drift on their
 * own as the numerator and denominator age apart.
 */
export type Reputation = {
  /** Contracts that reached full repayment. */
  repaid: number;
  /** Contracts that ended in customer default. */
  defaulted: number;
  /** Interest actually collected, less funding costs and principal written off. */
  realizedProfit: number;
  /** Principal recently written off. Drives loss severity and the 80 ceiling. */
  openLoss: number;
  /** Summed pricing fairness of repaid contracts, in [0, repaid]. */
  fairness: number;
  /** Resolved contracts issued by an automated product. */
  productRepaid: number;
  productDefaulted: number;
  /** The bank's own record as a borrower. */
  fundingHonored: number;
  fundingMissed: number;
  /**
   * Decayed count of business the bank has actually transacted — loans written,
   * contracts resolved, deposits taken. This is the one number a player can
   * never coast on: it fades faster than anything else here, so standing has to
   * be re-earned by trading rather than held by past results.
   */
  activity: number;
};

export type TrustPillars = {
  /** Breadth of customers actually served to completion. */
  reach: number;
  /** Realized profit and net assets. */
  strength: number;
  /** Defaults, funding record, product performance, pricing fairness. */
  reliability: number;
};

export type TrustCeilingCause =
  "weak-reliability" | "open-losses" | "unpaid-obligation" | null;

export type TrustAssessment = {
  pillars: TrustPillars;
  /** The weighted composite before ceilings, 0-100. */
  composite: number;
  /** The lowest active ceiling, 100 when none applies. */
  ceiling: number;
  ceilingCause: TrustCeilingCause;
  /** How busy the bank is, 0-1. Scales the whole assessment. */
  momentum: number;
  /** What the displayed score is walking toward. */
  target: number;
};

/** Inputs that come from the world rather than the reputation record. */
export type TrustContext = {
  netWorth: number;
  /** Stage cash scale, so thresholds travel across stages without retuning. */
  startingCash: number;
  /** Any accepted funding the bank has failed to repay. */
  hasUnpaidObligation: boolean;
};

const PILLAR_WEIGHTS = { reach: 0.35, strength: 0.3, reliability: 0.35 };

/**
 * Mastery is excellence on all three pillars, not a simultaneous perfect
 * maximum on all three. The pillars are rolling averages that crest at
 * different moments — reach peaks while the newest loans are still outstanding,
 * strength peaks once they repay — so demanding 1.0 from each at the same
 * instant is a knife-edge no amount of skill reliably lands. This headroom is
 * what separates "a full score is hard" from "a full score is luck". Every
 * ceiling still applies on top of it.
 */
const MASTERY_HEADROOM = 1.05;

/** Per-day decay. Ratio counters share one rate; loss severity fades faster
 * so a single unlucky default does not lock the stage out of a full score. */
const MEMORY_DECAY = 0.99;
const LOSS_DECAY = 0.94;
/**
 * Business fades fastest of all. This is the stage's clock: a bank that stops
 * trading watches its standing walk to zero in a few weeks, which is what keeps
 * a player working the market instead of waiting out a timer.
 */
const ACTIVITY_DECAY = 0.93;
/** Transactions the market expects of a bank worth rating. Expressed as the
 * decayed level a steadily busy bank holds: roughly one deal every five days. */
const ACTIVITY_FULL = 3;
/**
 * At or below this the bank is simply not trading, and momentum is exactly zero
 * rather than a vanishing fraction. Decay is geometric, so without a floor the
 * score would approach zero forever and never arrive — which is the whole
 * reason the old model had to fail runs at 5 instead of 0.
 */
const ACTIVITY_UNRATED = 0.5;
/**
 * What a newly opened bank is credited with. Deliberately above `ACTIVITY_FULL`
 * so day one is flat rather than an immediate slide, and so the first quiet week
 * is a warning instead of a punishment. A bank that trades builds the same
 * cushion for itself, which is why a busy player can pause without penalty.
 */
const OPENING_ACTIVITY = ACTIVITY_FULL * 2;

/** Contracts repaid for full reach. Beyond this, volume stops paying. */
const REACH_FULL = 8;
/** Targets expressed as multiples of the stage's starting cash. */
const NET_WORTH_FULL = 2;
const PROFIT_FULL = 0.25;
/** Loss severity is scored generously because the default *count* already
 * moves the repayment rate and the written-off principal already moves
 * realized profit; this term exists to make a cluster of large losses hurt
 * more than a cluster of small ones, not to punish a third time. */
const LOSS_SEVERITY_FULL = 1.5;
/** The 80 ceiling is for a wound the market can still see. Set high enough
 * that one ordinary default does not pin a bank there for weeks, low enough
 * that a run of them does. */
const OPEN_LOSS_CEILING_AT = 0.25;

/** Observations needed before a ratio is trusted over its neutral prior. */
const CONFIDENCE_SAMPLE = 4;

const RELIABILITY_WEIGHTS = {
  repayment: 0.55,
  containment: 0.1,
  funding: 0.15,
  product: 0.1,
  fairness: 0.1,
};

/** A new bank is presumed competent until its book says otherwise. */
const REPAYMENT_PRIOR = 0.75;
/**
 * The repayment band worth resolving. Scoring a 50%-default book as "half
 * reliable" would let volume launder catastrophe, so the curve starts there —
 * but it tops out at a merely excellent book rather than a spotless one.
 * Defaults are rolled at random, so demanding literal perfection over a
 * decaying window would put a full score behind the dice instead of the play.
 */
const REPAYMENT_FLOOR = 0.5;
const REPAYMENT_EXCELLENT = 0.92;

/**
 * Zero, and reachable: momentum multiplies the assessment, so a bank nobody is
 * doing business with lands on exactly nothing however good its old book was.
 * Without that factor the decaying priors floor the composite around 30 and an
 * idle run could neither be won nor lost.
 */
export const TRUST_COLLAPSE = 0;

/** Rates at or below this are ordinary market pricing; above it, the bank is
 * squeezing. Set above the generated request range so fairness measures what
 * the player authors in a product, not which customers happened to walk in. */
const FAIR_RATE = 22;
const PREDATORY_RATE = 40;

const WEAK_RELIABILITY = 0.45;
const CEILING_WEAK_RELIABILITY = 60;
const CEILING_OPEN_LOSSES = 80;
const CEILING_UNPAID_OBLIGATION = 90;

/** Trust climbs at a walking pace and falls in strides. */
const RISE_PER_DAY = 2.5;
const FALL_FRACTION = 0.5;
const FALL_MINIMUM = 6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function emptyReputation(): Reputation {
  return {
    repaid: 0,
    defaulted: 0,
    realizedProfit: 0,
    openLoss: 0,
    fairness: 0,
    productRepaid: 0,
    productDefaulted: 0,
    fundingHonored: 0,
    fundingMissed: 0,
    activity: 0,
  };
}

/**
 * What a bank that just opened its doors carries: no record, but the market's
 * attention. The grace is real business credit the bank has not earned, so it
 * decays like everything else — spend the first weeks trading or lose it.
 */
export function openingReputation(): Reputation {
  return { ...emptyReputation(), activity: OPENING_ACTIVITY };
}

/** One transaction's worth of standing. */
export function recordActivity(
  reputation: Reputation,
  transactions = 1,
): Reputation {
  return { ...reputation, activity: reputation.activity + transactions };
}

/** One day of forgetting. Called once per tick, before the day's events land. */
export function decayReputation(reputation: Reputation): Reputation {
  return {
    repaid: reputation.repaid * MEMORY_DECAY,
    defaulted: reputation.defaulted * MEMORY_DECAY,
    realizedProfit: reputation.realizedProfit * MEMORY_DECAY,
    openLoss: reputation.openLoss * LOSS_DECAY,
    fairness: reputation.fairness * MEMORY_DECAY,
    productRepaid: reputation.productRepaid * MEMORY_DECAY,
    productDefaulted: reputation.productDefaulted * MEMORY_DECAY,
    fundingHonored: reputation.fundingHonored * MEMORY_DECAY,
    fundingMissed: reputation.fundingMissed * MEMORY_DECAY,
    activity: reputation.activity * ACTIVITY_DECAY,
  };
}

/** How busy the bank looks to the market, 0-1. */
export function trustMomentum(reputation: Reputation): number {
  return clamp01(
    (reputation.activity - ACTIVITY_UNRATED) /
      (ACTIVITY_FULL - ACTIVITY_UNRATED),
  );
}

/**
 * How defensible a contract's pricing is, in [0, 1]. Full marks across the
 * ordinary market band, sliding to nothing at genuinely predatory rates.
 */
export function rateFairness(rate: number): number {
  if (rate <= FAIR_RATE) return 1;
  return clamp01((PREDATORY_RATE - rate) / (PREDATORY_RATE - FAIR_RATE));
}

/**
 * A ratio that starts at its prior and earns its way to the observed value as
 * evidence accumulates — so one early default is not read as a 0% repayment
 * rate, and a spotless book still reaches a true 1.0 once proven.
 */
function provenRatio(good: number, bad: number, prior: number): number {
  const total = good + bad;
  if (total <= 0) return prior;
  const confidence = Math.min(1, total / CONFIDENCE_SAMPLE);
  return prior + (good / total - prior) * confidence;
}

/**
 * Score for a record of discrete promises — funding repayments, product
 * contracts. Unlike the loan book these are rare enough that a confidence
 * blend never converges, and a neutral prior would quietly cap an otherwise
 * spotless bank at the prior's value. Kept promises are simply expected: the
 * score starts full and a broken one bites at double weight.
 */
function recordScore(kept: number, broken: number): number | null {
  const total = kept + broken;
  if (total <= 0) return null;
  return clamp01(1 - (2 * broken) / total);
}

/** A weighted mean where absent terms are dropped and the rest renormalized,
 * so a bank that has never borrowed is not scored as a bad borrower. */
function weigh(terms: { weight: number; value: number | null }[]): number {
  let weighted = 0;
  let total = 0;
  for (const term of terms) {
    if (term.value === null) continue;
    weighted += term.weight * term.value;
    total += term.weight;
  }
  return total > 0 ? weighted / total : 0;
}

export function trustPillars(
  reputation: Reputation,
  context: TrustContext,
): TrustPillars {
  const scale = Math.max(1, context.startingCash);

  const reach = clamp01(reputation.repaid / REACH_FULL);

  const strength = weigh([
    {
      weight: 0.5,
      value: clamp01(reputation.realizedProfit / (scale * PROFIT_FULL)),
    },
    {
      weight: 0.5,
      value: clamp01(context.netWorth / (scale * NET_WORTH_FULL)),
    },
  ]);

  const repaymentRate = provenRatio(
    reputation.repaid,
    reputation.defaulted,
    REPAYMENT_PRIOR,
  );
  const productsResolved =
    reputation.productRepaid + reputation.productDefaulted;
  const reliability = weigh([
    {
      weight: RELIABILITY_WEIGHTS.repayment,
      value: clamp01(
        (repaymentRate - REPAYMENT_FLOOR) /
          (REPAYMENT_EXCELLENT - REPAYMENT_FLOOR),
      ),
    },
    {
      weight: RELIABILITY_WEIGHTS.containment,
      value: clamp01(1 - reputation.openLoss / (scale * LOSS_SEVERITY_FULL)),
    },
    {
      weight: RELIABILITY_WEIGHTS.funding,
      value: recordScore(reputation.fundingHonored, reputation.fundingMissed),
    },
    {
      weight: RELIABILITY_WEIGHTS.product,
      value: recordScore(reputation.productRepaid, reputation.productDefaulted),
    },
    {
      weight: RELIABILITY_WEIGHTS.fairness,
      value:
        reputation.repaid > 0 ? reputation.fairness / reputation.repaid : null,
    },
  ]);

  return { reach, strength, reliability };
}

/**
 * Ceilings turn "optimize the average" into "clear your blockers": a weighted
 * mean alone would let a player bury serious defaults under a pile of small
 * profitable loans.
 */
export function assessTrust(
  reputation: Reputation,
  context: TrustContext,
): TrustAssessment {
  const pillars = trustPillars(reputation, context);
  // Rounded to display precision, and deliberately no finer. A mastered run
  // accumulates enough float dust to compute 99.99999, which is a perfectly
  // valid six-decimal number and would leave the stage's `trust >= 100` clear
  // check permanently a hair short of firing.
  const composite = Math.min(
    100,
    Math.round(
      100 *
        MASTERY_HEADROOM *
        (PILLAR_WEIGHTS.reach * pillars.reach +
          PILLAR_WEIGHTS.strength * pillars.strength +
          PILLAR_WEIGHTS.reliability * pillars.reliability) *
        100,
    ) / 100,
  );

  const scale = Math.max(1, context.startingCash);
  let ceiling = 100;
  let ceilingCause: TrustCeilingCause = null;
  const limit = (value: number, cause: Exclude<TrustCeilingCause, null>) => {
    if (value >= ceiling) return;
    ceiling = value;
    ceilingCause = cause;
  };
  if (context.hasUnpaidObligation)
    limit(CEILING_UNPAID_OBLIGATION, "unpaid-obligation");
  if (reputation.openLoss > scale * OPEN_LOSS_CEILING_AT)
    limit(CEILING_OPEN_LOSSES, "open-losses");
  if (pillars.reliability < WEAK_RELIABILITY)
    limit(CEILING_WEAK_RELIABILITY, "weak-reliability");

  // Momentum multiplies rather than averages: a bank the market has stopped
  // trading with is not "somewhat trusted", it is unrated. This is the only
  // term that can carry the score all the way to zero, and it is why standing
  // has to be worked for continuously instead of banked.
  const momentum = trustMomentum(reputation);

  return {
    pillars,
    composite,
    ceiling,
    ceilingCause,
    momentum,
    target: Math.min(composite, ceiling) * momentum,
  };
}

/**
 * Where a bank with no history stands. Derived rather than hardcoded so the
 * opening score is one the model actually agrees with — otherwise day one
 * would show a phantom drop as trust corrected toward its real target.
 */
export function openingTrust(startingCash: number): number {
  return assessTrust(openingReputation(), {
    netWorth: startingCash,
    startingCash,
    hasUnpaidObligation: false,
  }).target;
}

/** Moves the displayed score toward its target by one day's worth. */
export function approachTrust(current: number, target: number): number {
  if (target > current) return Math.min(target, current + RISE_PER_DAY);
  if (target < current) {
    const drop = Math.max(FALL_MINIMUM, (current - target) * FALL_FRACTION);
    return Math.max(target, current - drop);
  }
  return current;
}

/** Names the cause the player just watched happen, in priority order: a broken
 * promise outranks a customer default, which outranks ordinary drift. An active
 * ceiling is reported as the cause even on a day with no bad news, because "why
 * won't this go up" is the question it exists to answer. */
export type TrustReason =
  | "contracts-completing"
  | "earnings-sustainable"
  | "defaults-weakened-book"
  | "obligation-unpaid"
  | "market-quiet"
  | "book-thinning";

/** Below this, being unrated is the bank's biggest problem by far. */
const QUIET_MOMENTUM = 0.85;

export function trustReasonFor(
  assessment: TrustAssessment,
  direction: "up" | "down",
  today: { fundingDefault: boolean; customerDefault: boolean; repaid: boolean },
): TrustReason {
  const binding = assessment.composite > assessment.ceiling;
  if (
    today.fundingDefault ||
    (binding && assessment.ceilingCause === "unpaid-obligation")
  )
    return "obligation-unpaid";
  if (today.customerDefault) return "defaults-weakened-book";
  // Reported ahead of ordinary drift: too few deals is the one cause a player
  // cannot diagnose from the map, and the only one that ends the run at zero.
  if (assessment.momentum < QUIET_MOMENTUM) return "market-quiet";
  if (binding) return "defaults-weakened-book";
  if (direction === "down") return "book-thinning";
  return today.repaid ? "contracts-completing" : "earnings-sustainable";
}

export function isReputation(value: unknown): value is Reputation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (Object.keys(emptyReputation()) as (keyof Reputation)[]).every(
    (key) => typeof record[key] === "number" && Number.isFinite(record[key]),
  );
}
