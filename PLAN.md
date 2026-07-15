# Banker Simulation — Improvement Plan

The goal is Minecraft/Factorio/Capitalism-Lab-grade retention built on healthy drivers —
autonomy, competence, expression, discovery, escalation, narrative — never streaks,
cooldowns, or loot-box mechanics.

**Guiding rule (the Factorio lesson):** every solved problem must expose a larger,
more interesting problem. Every phase below is playable and testable on its own,
and each strictly reuses the engine primitives that already exist (events,
agreements, claims, collateral, reputation).

## Diagnosis (2026-07-15)

The engine foundation is strong: event-sourced, deterministic, append-only, with
composable agreements. The gameplay problems are structural:

1. **The economy has no cycles.** Grain's only sink is the seed barter. Nobody ever
   initiates a grain-for-coin sale, so a coin loan is unpayable by construction and
   the tutorial's promise ("Mina repays you") is mechanically false.
2. **Nothing says "no" to the player.** `fundProduct` auto-signs for every party, so
   borrowers cannot reject terms; interest rate is not a decision. Rule agents
   silently ignore unattractive proposals instead of declining them.
3. **Nothing surprises the player.** One deal, one borrower, no prices, no
   competition, no progression, and the session evaporates on reload.

## Phase 1 — An honest, winnable first loop  ✅ DONE (2026-07-15)

Make the first session truthful, winnable in several ways, and losable for
understandable reasons.

### Engine primitives
- [x] **Standing offers**: `postOffer` / `fillOffer` / `withdrawOffer` with
      `OfferPosted` / `OfferFilled` / `OfferWithdrawn` events. An offer is a posted
      price ("buying grain at 1 coin, up to 60"); fills settle both legs as ordinary
      `AssetTransferred` events. This gives the world price signals and makes
      grain → coin (and coin → seed) conversion possible.
- [x] **Agreement decline**: `declineAgreement` + `AgreementDeclined` event +
      `declined` status. Rejection becomes visible history instead of silent limbo.
- [x] **Product applications**: `applyForProduct` / `withdrawApplication`. A borrower
      must apply before anyone can fund them; `fundProduct` requires an open
      application. Publication = creator consent, application = borrower consent,
      funding = funder consent — three-way consent makes atomic activation honest.

### Agents (the world becomes alive)
- [x] `MarketMakerAgent` — merchant maintains standing offers (sells seed, buys grain).
- [x] `InputPurchasingAgent` — farmer buys seed with coins when she can afford it.
- [x] `FundingSeekingAgent` — farmer applies to published products when she needs
      capital, with her own acceptance criteria (max interest rate, min term,
      collateral budget). Publishing a bad product now gets zero applicants.
- [x] `LiquiditySeekingAgent` — farmer sells grain into standing offers to cover
      upcoming coin obligations before they come due.
- [x] `ValueSeekingAgent` declines PV-negative proposals instead of ghosting.
- [x] `InputSeekingAgent` skips counterparties that declined, defers barter while a
      funding application is open, withdraws its own stale proposals.
- [x] `advanceWithAgents` — advance one tick at a time, letting agents act between
      ticks, so the world reacts during time skips, not only after them.

### Scenario rework (multiple viable strategies)
- [x] Merchant posts seed-sell and grain-buy offers at start; harvest fires at t5
      (before a t0+6 repayment is due); merchant is barter-averse so the *player*
      is the essential financier.
- [x] Viable strategies from turn one: unsecured coin loan, land-collateralized
      loan, accepting Mina's direct seed barter, funding then selling the claim.
      A failed harvest forces a real decision instead of a scripted trap.

### Web app
- [x] Fix the three `pnpm check` TypeScript errors in `App.tsx`.
- [x] Honest onboarding copy: Mina borrows coins → buys seed → harvests → sells
      grain to Jun → repays (or defaults, and collateral moves).
- [x] Market panel: standing offers with live prices; player can fill offers.
- [x] Applications panel: fund a borrower who *applied*, not an arbitrary target.
- [x] Inbound proposals panel: accept/decline agreements proposed to the player.
- [x] Persistence: serialize the event log to localStorage; restore on load;
      reset clears. (Event sourcing makes this ~30 lines.)

## Phase 2 — Foresight and consequence (competence loop)  ✅ DONE (2026-07-15)

- [x] **Monte Carlo projection before commitment.** `projectOutcome` (new
      `domain/projection.ts`) clones the event log into a fresh
      `MemoryEventStore`, replays it under many `SeededRandom` seeds via the
      existing `advanceWithAgents`, and aggregates P(default), mean net value,
      and best/worst case — zero engine changes, entirely composed from
      primitives that already existed. Wired into the web UI as a "Preview
      outcome" action on each open application, shown before the player funds.
- [x] **Tick digest.** `summarizeTicks` (in `reporting.ts`) diffs the
      world state and new events across a time skip into settlement/default/
      production counts and price moves, with a priority-ordered headline.
      Replaces the web UI's ad hoc single-message toast with a multi-bullet
      digest ("2 settlements · 1 failed harvest · grain sell bid now 0.6").
- [x] **Distress decisions.** Three new engine primitives, each reusing
      existing event types wherever possible: `extendObligation` (new
      `ObligationRescheduled` event — the one case with no honest existing
      composition), `callInObligation` (reuses the refactored-out
      `resolveObligation` — same settle/default/liquidate logic as natural
      due-date resolution, just player-triggered early; no new event types),
      and `sellRepaymentClaim` (reuses `AssetTransferred` +
      `RepaymentClaimTransferred`). Rescue financing deliberately got no new
      primitive — it's the existing publish/apply/fund pipeline, kept
      consensual. Surfaced in a new "Distress desk" panel for claims due
      within 3 ticks.

## Prototype rule from here onward

Keep the player's foundational actions available. Progression should change
opportunities, scale, information, and consequences — not permission. Capital,
counterparty consent, collateral, liquidity, and time are the constraints; there
are no history-based feature locks.

Each remaining phase is a validation gate, not a promise to add every imaginable
banking feature. Do not start the next phase until the current loop is fun in the
browser.

## Phase 3 — Competing uses for capital  ← CURRENT

Test one question: **is choosing where and how to deploy limited capital fun?**

### Small economic chain
- Add one second borrower: a mill that buys grain and produces flour on a different
  schedule from Mina's farm.
- Jun buys flour, giving the mill an output market. Mina supplies the mill with
  grain, so financing one business changes the prospects of the other.
- Keep the chain deliberately small: seed → grain → flour. Do not add more
  industries yet.

### Rival lender
- Add one rival with a visible, limited coin balance and simple published criteria.
- The rival evaluates open applications after one simulation tick. It must not win
  because the human reads or clicks slowly.
- It funds the best acceptable use of its capital and can also hold cash. Its choice
  and reason are visible in the tick digest.

### Minimal living price
- Jun adjusts the grain bid from a small deterministic inventory rule: low inventory
  raises the bid; high inventory lowers it.
- Repricing withdraws the stale offer and posts a new ordinary standing offer. No
  general pricing engine, order book, or macroeconomic model yet.

### Player freedom
The player may fund either borrower, publish different terms, keep cash, accept
barter, trade a claim, or manage distress. No option is unlocked by completing a
required number of deals.

### Validation gate
Phase 3 succeeds only if a short playtest of three production cycles makes players
want to restart and try a different allocation strategy. Verify at least three
plausible approaches: prioritize the farm, prioritize the mill, or preserve cash
and act after the rival or a shock. If one choice always dominates, rebalance this
phase instead of adding more systems.

## Phase 4 — Policies and portfolio pressure

Add automation only after Phase 3 creates enough repeated decisions to justify it.

- Let the player define one small funding policy from the same public facts used by
  rule-based agents: maximum exposure, minimum reputation, maximum principal, and
  required collateral.
- The policy uses the player's real coin and performs the same `fundProduct` action
  as manual play. The player can pause it or override it at any time.
- Add a compact portfolio summary: available coin, deployed principal, repayments
  due, realized profit, defaults, and exposure by borrower.
- Create situations where a reasonable policy sometimes holds too much cash or
  concentrates on one part of the chain. The player should diagnose and revise it.

### Validation gate
Automation succeeds if it removes tedious repeat funding while creating an
interesting policy-design problem. If there are too few decisions to automate,
expand borrower variation slightly before adding more policy conditions.

## Phase 5 — Replayable small worlds

Generalize only the parts proven fun in Phases 3 and 4.

- Generate seeded variations of the same small economy: borrower balances,
  production timing, success chances, rival preferences, and starting inventories.
- Add a few economic conditions as scenario parameters, such as a poor harvest,
  strong flour demand, or scarce merchant liquidity. Compose them from existing
  production, offer, transfer, and agreement behavior.
- Support named saves in IndexedDB and export/import of the append-only event
  history.
- Show the world seed so players can replay or share an interesting run.

### Validation gate
Different seeds must change good capital-allocation and policy choices, not merely
change which random roll defaults. A player should be able to explain why one seed
favored a different strategy.

## End of prototype

Stop here and evaluate the game as a whole. The prototype is successful when:

1. The first financing loop is understandable without knowing banking terminology.
2. At least three strategies are viable across the tested seeds.
3. Financing decisions visibly affect production, prices, and later credit risk.
4. The rival creates strategic pressure without taking control away from the player.
5. Automation becomes useful because the player's successful portfolio has grown.
6. Players voluntarily restart to try a different strategy or shared seed.

## Explicitly deferred beyond the prototype

Audits and deception, private information, insurance, revenue shares, syndication,
large production networks, macro regimes, multiplayer, arbitrary player code, and
a general contract language are possible later expansions. Add them only in
response to evidence from prototype playtests; none are required to prove the core
sandbox loop.
