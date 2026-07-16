# Banker Simulation — Ground-Up Rebuild Plan

## Product vision

Build a mobile-first financial automation puzzle game where the player designs
contracts, publishes or funds them into a living market, advances time, and tries
to reach a stage objective.

The closest design shorthand is:

- the readable, composable programs of a visual programming puzzle;
- the market feedback and product competition of an economic simulation;
- the open-ended solutions and scoring of an automation puzzle;
- banking contracts, claims, liquidity, collateral, and risk as the machinery.

The player should feel like they are inventing a financial machine, not filling
out a banking form.

## Experience pillars

1. **Compose, observe, improve.** A player builds a contract from simple blocks,
   watches it interact with the economy, and revises it after seeing the result.
2. **Readable finance.** Every movement of money, asset, obligation, and risk must
   have a visible cause. The game teaches its vocabulary through play.
3. **Several valid solutions.** A stage should support conservative, aggressive,
   and opportunistic approaches instead of hiding one required answer.
4. **A living market.** Borrowers have needs and acceptance rules. Competitors use
   limited capital. Demand, prices, defaults, and production affect later choices.
5. **Touch-first interaction.** Core play must work through taps. Dragging,
   hovering, precise handles, and keyboard shortcuts may be conveniences but can
   never be requirements.
6. **Deterministic rules.** The same initial state, seed, contract, and commands
   must produce the same outcome. Randomness is seeded and explainable.
7. **Meaningful progression.** Each completed stage awards a tangible object: a
   new contract block, analysis tool, market capability, or named collectible.
   Progression expands expression rather than adding grind.

## Decisions already made

These are architectural constraints for the rebuild unless playtesting disproves
them.

- Use React, TypeScript, and Vite for the game shell and interface.
- Keep the simulation and contract semantics independent of React.
- Do not use React Flow, a free-form node editor, Canvas, or PixiJS for the
  contract builder.
- Do not use drag-and-drop as a required interaction.
- Represent a contract as structured blocks in an ordered program.
- Linear flow is implied by array order; do not store explicit edges.
- Represent branches as nested sequences, not arbitrary graph connections.
- Support `if / else`, `switch`, bounded repetition, and financial schedules.
- Do not support `while`, recursion, arbitrary code, or unbounded execution.
- Ship the browser build as a responsive PWA.
- Use Capacitor later for iOS and Android store packages from the same web build.
- Build one end-to-end playable stage before generalizing the engine or authoring
  a full campaign.

## Explicit non-goals for the first release

- Real-money banking, trading, or financial advice
- A realistic simulation of every banking regulation or accounting convention
- Arbitrary scripting or a general-purpose programming language
- Realtime multiplayer or a shared global economy
- A spatial factory, conveyor belts, physics, characters, or a 3D world
- User-generated stages or contracts
- Cloud saves, accounts, social feeds, daily rewards, streaks, or loot boxes
- Macroeconomic realism beyond what creates clear and interesting decisions

## Core game loop

1. Read the stage goal and inspect the current portfolio.
2. Inspect open market needs, counterparties, prices, and known risks.
3. Assemble a product or contract from blocks.
4. Validate it and preview its cash flows and plausible outcomes.
5. Publish, offer, accept, fund, reject, or withdraw it.
6. Advance time and watch production, payments, trades, defaults, and competitors.
7. Diagnose the result and revise the design or capital allocation.
8. Reach the objective before a deadline or loss condition.
9. Receive the stage object, review the score, and unlock the next stage.

Every solved problem should expose a larger, more interesting problem. More
content is not a substitute for a replayable decision loop.

## Screen model

### 1. Main screen

- Continue the most recent run
- Start a new campaign
- Open stage selection
- Settings, accessibility, credits, and save management
- Show the most recently earned stage object

### 2. Stage screen

- Stage title, story premise, and economic situation
- Primary currency target and deadline
- Additional constraints and optional mastery goals
- Starting assets and available contract blocks
- Tangible reward object
- Best score and prior outcome summary
- Locked stages show what must be learned, not an engagement timer

### 3. Gameplay screen

The gameplay screen has three conceptual areas plus a persistent status bar.

#### Portfolio

- Cash and other owned assets
- Active products and agreements
- Claims receivable and obligations payable
- Collateral locked or held
- Realized profit, expected cash flow, liquidity, and risk
- A chronological explanation of recent changes

#### Open market

- Borrower and investor needs
- Product applications and competing offers
- Tradable assets and claims
- Visible prices, quantities, deadlines, and acceptance requirements
- Counterparty reputation and public information
- Rival actions with an understandable reason

#### Contract workshop

- Tap-first structured block sequence
- Insert buttons before, between, and after blocks
- Block picker grouped by purpose
- Bottom sheet or focused screen for block configuration
- Validation messages attached to the relevant block
- Plain-language contract summary and cash-flow preview
- Publish, save draft, duplicate, and discard actions

#### Persistent status

- Current stage goal and progress
- Simulation date/tick
- Available currency and liquidity warning
- Pause, advance one step, and advance to next event
- Undo for builder edits; simulation commands are confirmed rather than silently
  rewound

Desktop may show portfolio, market, and workshop together. Mobile uses bottom
navigation or focused screens while preserving the same game state.

## Contract language

### Representation

A contract is an abstract syntax tree (AST), not a drawing. The saved model stores
meaning only; layout is generated by React and CSS.

```ts
type ContractProgram = {
  schemaVersion: 1;
  id: string;
  name: string;
  steps: ContractStep[];
};

type ContractStep =
  | LendStep
  | WaitStep
  | CollectStep
  | TransferStep
  | ChargeFeeStep
  | CollateralStep
  | IfStep
  | SwitchStep
  | RepeatStep
  | ScheduleStep
  | CloseStep;
```

The foundational contract should read like a sentence:

```text
[Lend 1,000 USD] -> [Wait 24 months] -> [Collect 1,200 USD]
```

On mobile the same sequence renders vertically. The arrows are CSS decoration;
the array order is the control flow.

### Control blocks

`if / else` owns two nested sequences:

```text
[If payment was received]
  Then: [Release collateral] -> [Close contract]
  Else: [Charge late fee] -> [Liquidate collateral]
```

`switch` owns a finite set of cases and a required default:

```text
[Switch on borrower rating]
  AAA:     [Set rate to 4%]
  BBB:     [Set rate to 8%] -> [Require collateral]
  Default: [Reject]
```

`repeat` is always bounded:

```text
[Repeat 12 times]
  [Collect 100 USD]
```

`schedule` is the preferred financial loop because it advances time explicitly:

```text
[Every 1 month, 24 occurrences]
  [Collect 50 USD]
  [Apply interest]
```

### Language safety rules

- Repetition count and schedule occurrences are fixed when the contract activates.
- A stage may set a lower limit, but the engine has a hard global maximum.
- No recursion, `while`, dynamic code evaluation, or mutable jump targets.
- Limit total nesting depth and total executable blocks per contract.
- A scheduled iteration advances time automatically.
- A plain repeat must have a finite body and execution budget.
- Conditions may inspect only public or explicitly acquired information.
- Currency, asset, party, date, and claim ports are statically typed concepts even
  though the player does not see programming-language types.
- Invalid or unreachable sequences cannot be published.
- A block cannot create value without naming its source or corresponding
  obligation.

### Compilation pipeline

```text
Editable ContractProgram
        -> schema validation
        -> type and safety validation
        -> plain-language summary
        -> cash-flow projection
        -> immutable executable contract
        -> simulation commands and scheduled events
```

The editor never directly mutates balances or agreements. It produces a program;
the compiler and simulation decide whether that program is legal and executable.

### Initial block set

Start smaller than the eventual language:

1. `Lend`
2. `Wait`
3. `Collect`
4. `Close`
5. `Require collateral`
6. `If / Else`
7. `Schedule`
8. `Switch`

Add fees, guarantees, claim transfers, currency conversion, bundling, and other
blocks only after the foundational loop is enjoyable.

## Simulation model

The simulation is a pure TypeScript domain with no browser or React dependency.

### Authoritative concepts

- Time and seeded randomness
- Entities and controllers
- Currencies, resources, property, and claims
- Conserved balances and explicit issuance
- Agreements, consent, obligations, settlement, and default
- Collateral locking, release, and liquidation
- Standing market offers and finite liquidity
- Production rules connecting finance to a small real economy
- Reputation derived from observable history
- Competitors with visible capital and explainable policies
- Append-only domain events sufficient to replay a run

The current code may be consulted for proven behavior, but every retained concept
must be reintroduced behind the new contracts and stages rather than copied by
default.

### Command/event boundary

All player and agent actions are commands. Successful commands emit events.

```text
Command: PublishContract
  -> validate program and consent
  -> Event: ContractPublished

Command: AdvanceTime
  -> run scheduled work and agents
  -> Events: PaymentRequested, PaymentSettled, OfferChanged, ...
```

The UI renders projected state from events. Tests can run a full stage without a
browser.

### Time model

- Use discrete ticks with an in-world calendar label.
- Simulation time advances only through an explicit player command.
- Provide advance-one-tick and advance-to-next-event controls.
- Agents act in a stable, documented order per tick.
- Expensive projections may later move to a Web Worker without changing domain
  APIs.

### Explainability

Every important event must answer:

- What happened?
- Which rule or contract block caused it?
- What value moved?
- What could the player have known beforehand?

Unexpected outcomes are welcome. Untraceable outcomes are defects.

## Stage system

Stages are data, not conditionals embedded in UI components.

```ts
type StageDefinition = {
  id: string;
  title: string;
  briefing: string;
  seed: number;
  startingWorld: StartingWorldDefinition;
  availableBlocks: ContractStep["type"][];
  primaryObjective: Objective;
  optionalObjectives: Objective[];
  lossConditions: LossCondition[];
  reward: StageReward;
  scoring: ScoringDefinition;
};
```

### Objectives

The first stages can emphasize a target currency amount, but later objectives
must constrain how it is reached:

- Reach 1,200 USD by month 24.
- Keep at least 250 USD liquid throughout the stage.
- Fund two businesses without a default.
- Earn a target amount while limiting exposure to one borrower.
- Survive a production shock and finish solvent.
- Produce a performing payment schedule accepted by a cautious borrower.

### Rewards

Each stage awards one visible object. An object may be:

- a new contract block;
- an analysis tool such as cash-flow preview;
- a market capability such as trading claims;
- a named desk item or trophy that records mastery.

Foundational actions should not be withheld merely to lengthen progression. A
reward should open a new kind of reasoning or provide lasting expression.

### Scoring

Stage completion is binary, but mastery is multidimensional:

- Ending net worth or target currency
- Time used
- Liquidity maintained
- Defaults and losses
- Capital efficiency
- Contract complexity
- Optional objective completion

Show separate metrics before considering a combined medal. Players should be able
to understand why one solution differs from another.

## Campaign curriculum

This is a learning sequence, not a final content commitment.

| Stage | New idea                              | Required expression            | Example reward    |
| ----- | ------------------------------------- | ------------------------------ | ----------------- |
| 1     | Money now versus money later          | Lend -> Wait -> Collect        | Contract stamp    |
| 2     | Borrower consent and affordable terms | Compare market needs           | Cash-flow preview |
| 3     | Default and collateral                | If / Else                      | Collateral block  |
| 4     | Installment lending                   | Bounded schedule               | Schedule block    |
| 5     | Customer segmentation                 | Switch on public facts         | Rating desk       |
| 6     | Competing uses of capital             | Allocate between two borrowers | Portfolio lens    |
| 7     | Rival lender and changing demand      | React to market events         | Market alert      |
| 8     | Transferable claims                   | Sell or hold future cash flow  | Claims desk       |

Only stages 1–3 should be authored before the first external playtest.

## Technical architecture

### Package boundaries

```text
packages/core
  Deterministic world, commands, events, agents, replay, and projections

packages/contracts
  Versioned AST, block catalog, validation, summaries, compiler, and runtime

packages/content
  Stage definitions, scenarios, rewards, copy, and balance parameters

packages/web
  React screens, block editor, responsive layout, PWA, audio, and persistence

ios / android
  Capacitor-generated native projects added only when the web game is stable
```

Dependency direction:

```text
web -> content -> contracts -> core
web -------------------------> core
```

`core`, `contracts`, and `content` must not import React or browser APIs.

### UI state ownership

- The simulation owns authoritative world state.
- The workshop owns an editable contract draft.
- Campaign progress owns stage completion and rewards.
- Presentation state owns selected tabs, open sheets, and animations.
- Never duplicate balances or agreement status in React-local state.

### Persistence

- Use a versioned save envelope from the beginning.
- Store campaign progress, active run events, contract drafts, settings, and schema
  versions separately.
- Use IndexedDB for the PWA rather than relying on `localStorage` for full saves.
- Autosave after committed simulation commands and contract edits.
- Keep export/import of a portable save as a pre-release requirement.
- Capacitor builds initially use the same save abstraction; a native storage
  adapter may be added without changing game code.

### PWA and mobile

- Responsive portrait and landscape layouts
- Offline shell and bundled stage content
- Web app manifest, icons, service worker, and update flow
- Safe-area support and no hover-only actions
- Large tap targets and bottom-sheet configuration
- Pause/resume handling and audio suspension
- Capacitor packaging after the PWA passes real-device playtests
- Store builds must feel like complete offline games, not remote website wrappers

## Rebuild phases

Each phase has a validation gate. Do not start the next phase merely because all
planned files exist.

### Implementation status — 2026-07-16

- ✅ **Phase 0 complete.** The `core`, `contracts`, `content`, and `web` package
  boundaries are established; architecture and boundary rules are documented;
  shared format, lint, typecheck, test, and build commands pass; and the legacy
  sandbox remains isolated from the mounted application.
- ✅ **Phase 1 implementation complete.** Main, stage, and gameplay screens; the
  tap-first `Lend -> Wait -> Collect -> Close` workshop; readable validation and
  cash-flow projection; publish/fund, settlement, rejection, default, objective,
  reward, scoring, IndexedDB restore, replay, and offline PWA behavior are
  implemented. The supplied winning contract is machine verified, and the full
  flow was exercised at a 390×844 phone viewport and desktop viewport.
- ✅ **Phase 1 external playtest complete.** A human playtest was completed on
  2026-07-16, closing the remaining Phase 1 validation step. Preserve any
  observations as inputs to Phase 2 rather than reopening the completed phase.
- 🟨 **Phase 2 implementation complete; external validation pending.**
  Collateral locking/release/liquidation, partial default recovery, nested
  `If / Else`, typed public-fact conditions, best/expected/adverse previews,
  event-to-block branch traces, and authored stages 2–3 are implemented. Domain
  tests reject unreachable/value-creating recovery paths and machine-verify the
  supplied secured and unsecured strategies. A human phone playtest must still
  confirm that players can explain each branch and edit the maximum supported
  Phase 2 nesting comfortably before the phase gate is closed.
- ⬜ **Phases 3–6 have not started.** Do not infer their completion from the
  preserved legacy sandbox behavior.

### Phase 0 — Freeze the rules and create a clean skeleton ✅

Deliverables:

- Record this decision set in code-facing architecture notes.
- Establish `core`, `contracts`, `content`, and `web` package boundaries.
- Create one command, one event, one contract block, and one stage fixture through
  the full dependency chain.
- Decide which current domain tests describe behavior worth preserving.
- Keep the old implementation isolated until the vertical slice replaces it; do
  not mix old product-form UI with the new workshop.
- Add shared formatting, linting, typecheck, test, and build commands.

Gate:

- A clean checkout can run every check and render the new application skeleton.
- No domain package imports React, DOM, storage, or wall-clock APIs.

### Phase 1 — One complete, honest stage ✅

Build the smallest end-to-end game:

- Main screen, stage screen, and gameplay screen
- One borrower with a visible need
- Player starts with 1,000 USD
- Blocks: `Lend`, `Wait`, `Collect`, and `Close`
- Tap `+` to append or insert a block
- Tap a block to configure or delete it
- Plain-language validation and cash-flow timeline
- Publish/fund, advance time, settle or fail honestly
- Win by reaching the target amount before the deadline
- Award one persistent stage object
- Save, reload, reset, and replay

Gate:

- A first-time player can complete the stage on a phone without developer help.
- The stage has at least two understandable unsuccessful designs.
- Reloading at any point preserves an identical run.
- A headless test proves the supplied winning contract reaches the objective.

### Phase 2 — Risk and conditional contracts 🟨

Implementation is complete. The player-explanation and phone-usability portions
of the validation gate remain open for an external playtest.

Deliverables:

- Collateral and default rules
- `If / Else` with nested sequences
- Public borrower facts and condition picker
- Outcome preview showing best, expected, and adverse cash flows
- Clear event-to-block trace when a branch executes
- A second and third stage teaching risk and recovery

Gate:

- Players can explain why each branch ran.
- Secured and unsecured strategies are both situationally viable.
- Invalid branches, unreachable blocks, and value-creation exploits are rejected by
  tests and in-editor validation.

### Phase 3 — Bounded schedules and portfolio pressure

Deliverables:

- `Schedule` and advanced `Repeat` blocks with hard bounds
- Installment payments and recurring fees or interest
- Two borrowers with different cash-flow timing
- Portfolio calendar and liquidity forecast
- Advance-to-next-event control
- Stages where the final amount alone is insufficient; timing matters

Gate:

- The runtime cannot hang or exceed its execution budget for any valid contract.
- At least three capital-allocation approaches are plausible across tested seeds.
- Mobile editing remains usable at the maximum supported nesting depth.

### Phase 4 — Segmentation and a living market

Deliverables:

- `Switch` based on public, typed facts
- Borrower acceptance policies
- One rival lender with limited visible capital
- A small production chain connecting credit to goods and prices
- Market repricing from deterministic inventory or demand rules
- Explanations for rejections, rival decisions, and price changes

Gate:

- Publishing unattractive terms produces an understandable lack of demand.
- The rival creates time pressure without benefiting from player reading speed.
- Financing one business visibly changes another business or market price.

### Phase 5 — Campaign, rewards, and replayability

Deliverables:

- Versioned stage catalog and unlock graph
- Stage objects and collection display
- Optional mastery objectives and score breakdown
- Seeded scenario variations after authored stages are proven
- Contract duplication and reusable templates
- Save export/import and multiple local profiles

Gate:

- Players voluntarily replay at least one stage to try a different design.
- Rewards change expression or analysis rather than merely increasing a number.
- Different seeds change good decisions, not only random success rolls.

### Phase 6 — PWA polish and Capacitor release candidate

Deliverables:

- Installable offline PWA
- Asset caching and safe update behavior
- Audio, haptics where available, accessibility, and reduced-motion settings
- Real-device testing on representative iOS and Android phones/tablets
- Capacitor iOS and Android projects
- Native icons, splash screens, lifecycle, back button, and save verification
- Privacy disclosures, store metadata, screenshots, and monetization integration if
  required

Gate:

- A full campaign session works offline after installation.
- Saves survive OS suspension, app upgrades, and ordinary storage pressure tests.
- No core interaction depends on hover, precision dragging, or a desktop keyboard.
- Store packages contain the game and meet platform quality requirements.

## Testing strategy

### Contract language

- Schema migration tests for saved programs
- Unit tests per block and condition
- Static validation tests for types, reachability, and execution bounds
- Snapshot tests for plain-language summaries and cash-flow timelines
- Fuzz/property tests ensuring every accepted program terminates within budget

### Simulation

- Deterministic replay tests
- Currency and asset conservation tests
- Consent and ownership invariants
- Settlement, default, collateral, and claim lifecycle tests
- Seeded agent behavior tests
- Projection tests proving previews never mutate the live run

### Stages

- At least one machine-verified winning solution per required stage
- Known losing solutions for tutorial feedback
- Balance fixtures for conservative, aggressive, and opportunistic strategies
- Regression tests for objectives, rewards, and unlocks

### Interface

- Component tests for insertion, deletion, editing, and nested control blocks
- Keyboard and screen-reader behavior even though touch is primary
- End-to-end tests at phone, tablet, and desktop viewports
- Offline, save/restore, update, and corrupted-save recovery tests
- Visual checks for maximum nesting, large currency values, and translated text

## Performance and quality budgets

- Do not run the simulation from React render cycles or animation frames.
- Contract editing should remain responsive at the maximum allowed program size.
- Avoid premature Canvas rendering; DOM block counts are deliberately bounded.
- Run long projections off the main thread only after measurement shows a need.
- Keep stage content and essential assets available offline.
- Respect reduced motion, color contrast, text scaling, and safe areas.
- Use exact decimal or integer minor-unit money representation before adding
  multiple currencies; never rely on uncontrolled floating-point accumulation.

## Primary design risks

### The builder becomes programming homework

Mitigation: use financial verbs, progressive stages, sensible defaults, immediate
plain-language summaries, and domain-specific `Schedule` instead of generic loops.

### The finance becomes a spreadsheet

Mitigation: make counterparties visible, animate consequential value movement,
explain market reactions, and center play on composing and revising contracts.

### Automatic outcomes feel arbitrary

Mitigation: show public inputs, seeded uncertainty, previews, and event-to-block
traces. Hide complexity only when it does not affect a decision.

### Nested blocks fail on mobile

Mitigation: stack branches vertically, use focused sub-editors with breadcrumbs,
cap nesting depth, and test real phones from Phase 1.

### The simulation grows before the game is fun

Mitigation: enforce phase gates. Do not add instruments, industries, or macro rules
until players want to replay the current small economy.

### A wrapped web build feels cheap in stores

Mitigation: ship a complete offline game, use mobile-specific navigation and
lifecycle behavior, add appropriate native feedback, and test the packaged app as
its own product.

## First playable definition of done

The rebuild has a valid foundation when all of the following are true:

1. A new player can navigate Main -> Stages -> Gameplay without explanation.
2. The player can build `Lend -> Wait -> Collect` entirely through taps.
3. The contract has a correct plain-language and cash-flow preview.
4. A borrower accepts viable terms and rejects impossible terms for a visible
   reason.
5. Advancing time visibly settles or defaults the agreement.
6. The stage target, deadline, win, loss, reward, and score are all functional.
7. Saving and replay reproduce the same event history.
8. The entire experience works in a narrow mobile viewport and offline PWA mode.
9. Domain and stage tests pass without opening a browser.
10. At least one playtester chooses to retry with a different contract.

Only after this milestone should the rebuild expand the language or economy.
