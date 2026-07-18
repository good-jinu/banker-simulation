# Game architecture

The mounted game is a mobile-first open-market banking simulation. The world
runs on a real-time day clock: procedurally generated borrowers appear on a
canvas map, the banker posts node-graph contracts onto the same map, borrowers
whose demand fits a posted contract file requests, and accepted loans repay or
default when they come due.

## Frontend structure

```text
GameApp
  ├─ HomeScreen
  └─ MarketApp
       ├─ Market map (PixiJS: draggable demand circles, contract squares)
       ├─ Demand detail
       ├─ Contract detail (request grid, accept / reject, edit)
       └─ Contract builder (node stack)
```

- `GameApp.tsx` owns navigation, locale selection, and save hydration.
- `market-world.ts` is the pure seeded simulation: actor generation, demand
  spawning and expiry, request matching, loan lifecycle with per-actor
  default risk. Every roll derives from `hash(seed, cursor)`, so a seed
  replays the same world.
- `market-stage.ts` is the PixiJS scene: node rendering, tap-versus-drag
  detection, and the drop animations. Dragging a demand circle onto a
  contract square files a request when the contract fits the demand (green
  pulse) and otherwise flashes a red X and snaps the node home. The Pixi
  `Application` lives for the whole market session — detail pages render as
  overlays above the always-mounted map, because destroying a Pixi renderer
  clears pixi's global texture pool out from under any other instance.
- `MarketApp.tsx` renders the map, the detail overlays, and the market
  contract builder, and drives the simulation through `GameClock`.
- `persistence.ts` stores player settings (and legacy campaign progress).

The earlier six-stage campaign (`CampaignStageApp.tsx`,
`campaign-stages.ts`) is no longer mounted; the open market replaced it as
the game. Its cash-flow compiler (`campaign-run.ts`) still provides date
formatting and the builder node vocabulary.

## Simulation rules

- Demands spawn with a needed amount, a horizon after which the actor can pay
  back, and a hidden tolerance for total repayment. Open demands expire if
  ignored.
- Contract terms are formulas, not fixed numbers: every transfer amount and
  wait length is an expression over the requester's facts (`amount`, `days`,
  `income`, `age`), and a condition block binds a variable from one of two
  branches (`if days > 365 then rate = 1.1 else rate = 1.05`). A contract
  lending `amount` therefore serves the $200 and the $300 needer alike.
- A demand requests a posted contract when the terms — evaluated for that
  specific requester — lend at least the needed amount, run at least the
  actor's horizon, and ask a repayment within the actor's tolerance.
  Requests snapshot their evaluated terms; accepted loans are built from the
  snapshot. Rejected actors never ask the same contract again.
- Conditions select a path and then merge into the shared clauses that follow
  them. Decision blocks contain no condition of their own: they either reject
  the applicant immediately or draft the request for manual review. Accepting
  a drafted request signs the loan using the complete, merged contract flow.
- Patience is 16 days per state: an ignored demand leaves the map after 16
  days, a pending request is withdrawn 16 days after filing (the person
  leaves), and a rejection returns them to the map with fresh patience.
- Accepting a request disburses the principal immediately; at the due day a
  seeded roll against the loan's default chance (derived from employment,
  age, income, and repayment burden) decides repayment or default.

The web application has no dependency on the earlier event simulator,
contract-AST workshop, or authored-loan packages. Those packages can be used
for separate experiments, but they are not part of the mounted game or bundle.

## Contract model

The game never asks the player to choose a named financial product. A contract
emerges from generic operations:

```text
Start
  → Transfer / Intake
  → Wait / Reserve / Secure Asset / Repeat / Condition
  → Transfer / Settle
  → End
```

Each stage produces a recommended spatial plan on a 54×24 board. Start is
immutable. Every other node is placed from the palette, while directional 1×1
connectors make the execution order explicit. A proposal is accepted only when:

1. all required nodes occupy their planned cells;
2. every connector points in the execution direction;
3. node types appear in the authored stage sequence; and
4. node parameters satisfy the selected demand.

Accepted contracts become persistent pipeline cards for the current stage.
Stage 5 requires two separate customers and therefore demonstrates multiple
simultaneous automated contracts.

## Stage curriculum

| Stage | New idea           | Required path                                |
| ----- | ------------------ | -------------------------------------------- |
| 01    | Timed exchange     | Transfer → Wait → Transfer                   |
| 02    | Minimum liquidity  | Reserve → Transfer → Wait → Transfer         |
| 03    | Outcome handling   | Transfer → Secure Asset → Wait → Condition   |
| 04    | Repeated flow      | Transfer → Repeat → Transfer                 |
| 05    | Parallel contracts | Two independent timed exchanges              |
| 06    | Funding network    | Intake → Transfer → Wait → Transfer → Settle |

## Save model

IndexedDB schema version 2 contains:

- completed stage ids;
- earned reward ids;
- the most recently opened stage; and
- locale and reduced-motion settings.

When a version-1 save is found, only its campaign completion and settings are
migrated. Old active-run events and draft programs are deliberately discarded
and deleted on the next save.

## Visual system

All customer thumbnails, stage cards, and node graphics follow
[`PIXEL_ART_STYLE_GUIDE.md`](PIXEL_ART_STYLE_GUIDE.md). Raster assets live under
`packages/web/public/assets`, and the interface never relies on text baked into
an image.
