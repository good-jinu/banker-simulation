# Banker Simulation

A mobile-first financial automation puzzle. Players assemble readable contract
blocks, publish them into a deterministic market, advance time, and learn from
every transfer, payment, rejection, and default.

The current build contains the first three end-to-end stages from
[`PLAN.md`](PLAN.md):

```text
Lend $1,000 -> Wait 24 months -> Collect $1,200 -> Close

Require collateral -> Lend -> Wait -> Collect
  If payment defaulted: liquidate collateral -> Close
  Else: release collateral -> Close
```

The curriculum now moves from a confirmed invoice, through affordable borrower
terms, to a variable-revenue secured loan. The third stage makes default,
partial payment, collateral recovery, and the executed `If / Else` branch
visible as separate, block-linked events.

## Run it

The repository pins Node.js and pnpm in `mise.toml`.

```sh
mise install
pnpm install
pnpm dev
```

Vite prints the local browser URL. The production build is an installable,
offline-capable PWA.

## Checks

```sh
pnpm check          # boundaries, types, formatting, tests, production build
pnpm test           # every headless domain, contract, and content test
pnpm format         # format the rebuild surface
```

The stage suite includes machine-verified solutions for all three stages, a
lower-return loss, unaffordable rejections, secured and unsecured defaults,
bounded branch validation, replay equality, and cash conservation.

## Workspace

```text
packages/
  core/       deterministic commands, events, replay, balances, and settlement
  contracts/  contract AST, validation, summaries, projection, and compiler
  content/    stage definitions, objectives, rewards, scoring, and fixtures
  web/        React screens, tap-first workshop, IndexedDB saves, and PWA shell
```

The dependency direction is `web -> content -> contracts -> core`. No domain
package imports React, DOM, browser storage, wall-clock time, or unseeded
randomness. See [`docs/architecture.md`](docs/architecture.md) for the boundary,
event flow, state ownership, and save model.

## Current playable

- Main, stage-selection, and gameplay screens
- Three sequential stages with persistent unlocks, objects, and scores
- Touch-first insert, configure, delete, duplicate, discard, and undo actions
- Nested `If / Else` paths with a typed public-fact condition picker
- Collateral requirements, settlement release, and capped default liquidation
- Plain-language validation and a block-linked cash-flow timeline
- Best, expected, and adverse cash-flow previews with visible branch choices
- Visible borrower need, acceptance limits, revenue timing, and default capacity
- Publish/fund, advance one month, and advance to next event commands
- Append-only explanations for every important state change
- Event-to-block explanations for conditions, branches, and recovery actions
- Functional target, deadline, win, loss, reward objects, and score breakdowns
- IndexedDB autosave with identical event replay after reload
- Responsive desktop and mobile layouts with no required drag, hover, or keyboard
- Manifest, service worker, safe-area layout, and reduced-motion support

The earlier free-market proof of concept remains available in the legacy core
modules and unmounted `packages/web/src/App.tsx`. It stays isolated until later
phases reintroduce its useful market behavior behind authored stages.

## Legacy tools

```sh
pnpm demo    # deterministic legacy headless scenario
pnpm play    # legacy SQLite terminal sandbox
```
