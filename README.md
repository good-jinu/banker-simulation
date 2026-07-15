# Banker Simulation

A pnpm monorepo for a web-based economic sandbox where financial behavior emerges from generic rules. There is no `Bank` class: players publish safe product templates composed from ownership, transfer, time, conditions, claims, collateral, fees, and audit reports.

## Workspace

```text
banker-simulation/
├── mise.toml
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── core/    event-sourced simulation, SQLite CLI, and tests
│   └── web/     browser game powered by @banker-simulation/core
└── tsconfig.base.json
```

`packages/core` is the authoritative economic engine. `packages/web` imports it through pnpm's workspace protocol and runs a local in-browser session. The browser lets a human-controlled cooperative advance time, inspect assets and repayment reputation, publish a fixed-term advance, fund an eligible borrower, transfer its repayment claim, fork its terms, and publish a basic public audit.

## Setup with mise

```sh
mise install
pnpm install
pnpm check
```

The project pins Node.js and pnpm in `mise.toml`; pnpm is also declared in the root `packageManager` field.

## Run the web game

```sh
pnpm dev
```

Open the local URL printed by Vite. The prototype session currently resets when the page reloads; durable multiplayer state belongs in the later game-server phase.

## Other commands

```sh
pnpm build    # production web build
pnpm test     # core behavioral tests
pnpm demo     # deterministic headless scenario
pnpm play     # persistent SQLite terminal game
```

The terminal game stores its append-only ledger in `packages/core/data/game.sqlite`.

## Architecture

```text
Browser player                       Terminal player
      |                                    |
packages/web                         packages/core CLI
      |                                    |
      +------ @banker-simulation/core ------+
                         |
                 EconomicEngine
                         |
             validates economic invariants
                         |
                  EventStore interface
                    /            \
              in-memory          SQLite
              browser/tests    persistent CLI
```

State is rebuilt by replaying events. Existing events are never edited. SQLite writes use an expected stream version so two writers cannot silently overwrite each other's decisions. A later Postgres game server can implement the same event-store boundary.

## Current economic laws

1. Only defined assets can be held or transferred.
2. Direct transfers require authorization from the current owner.
3. Balances cannot go below zero.
4. Every agreement is composed from ordinary timed transfers.
5. All parties must sign before an agreement activates.
6. Due promises settle if funded and default otherwise.
7. Production consumes scarce inputs and has explicit outcome risk.
8. A published product can require repayment history, set fixed interest and fees, and lock collateral.
9. A repayment claim is transferable; enforcement follows its current holder.
10. Collateral cannot be transferred while locked, releases after resolution, and liquidates to the claim holder on default.
11. Reputation is derived from delayed-promise settlement history, not assigned by the game.
12. World history is append-only and deterministic given its events and random inputs.

## Deliberate PoC boundaries

- The product builder currently supports fixed-term advances rather than arbitrary player code.
- Revenue shares, pooled funding, insurance triggers, markets, and multi-dimensional trust are the next product modules.
- Production outcomes are public once they occur; private information is not implemented yet.
- Collateral is a deterministic asset lock; courts, external oracles, and dispute resolution do not exist yet.
- The browser session is local and single-player; SQLite persistence is available through the terminal package.
- The studio-controlled random source represents the future world oracle. Its trust model should eventually become gameplay.
