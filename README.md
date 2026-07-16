# Banker Simulation

A mobile-first financial automation puzzle. Players assemble readable contract
blocks, publish them into a deterministic market, advance time, and learn from
every transfer, payment, rejection, and default.

The current build is the first end-to-end stage from [`PLAN.md`](PLAN.md):

```text
Lend $1,000 -> Wait 24 months -> Collect $1,200 -> Close
```

Mina needs working capital for a confirmed order. The player must turn a $1,000
treasury into $1,200 by month 24. Conservative terms settle but miss the goal,
impossible terms are rejected with a reason, and an aggressive accepted promise
can visibly default against Mina's known payment capacity.

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

The stage suite includes a machine-verified winning contract, a lower-return
settlement that loses the objective, an unaffordable rejected contract, a
visible default, replay equality, and cash conservation.

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

## First playable

- Main, stage-selection, and gameplay screens
- Touch-first insert, configure, delete, duplicate, discard, and undo actions
- Plain-language validation and a block-linked cash-flow timeline
- Visible borrower need, acceptance limits, revenue timing, and default capacity
- Publish/fund, advance one month, and advance to next event commands
- Append-only explanations for every important state change
- Functional target, deadline, win, loss, reward object, and score breakdown
- IndexedDB autosave with identical event replay after reload
- Responsive desktop and mobile layouts with no required drag, hover, or keyboard
- Manifest, service worker, safe-area layout, and reduced-motion support

The earlier free-market proof of concept remains available in the legacy core
modules and unmounted `packages/web/src/App.tsx`. It is intentionally isolated
from the structured workshop until later phases reintroduce its useful behavior
behind contract blocks and authored stages.

## Legacy tools

```sh
pnpm demo    # deterministic legacy headless scenario
pnpm play    # legacy SQLite terminal sandbox
```
