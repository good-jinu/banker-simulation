# Banker Simulation

A browser game about lending, cash flow, credit risk, and liquidity.

## Run locally

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Commands

```sh
pnpm check      # Format, lint, type-check, test, and build
pnpm build      # Production build
pnpm typecheck  # TypeScript checks
```

The app lives in `packages/web`.

For the full manual development-testing workflow, see
[docs/manual-testing.md](docs/manual-testing.md).

## Manual market testing

In development, open a market directly with:

```text
http://localhost:5173/?dev=market&stage=first-yield&phase=map&fresh=1
```

Use `phase=intro` to start at the customer conversation. The `fresh=1` option
starts a clean run; without it, the saved market session is restored. The
`DEV TEST` panel provides Save, Load, Reset, and Export JSON controls. Market
state is also saved automatically in the browser, so reloading the page keeps
the current day, cash, customers, loans, goals, conversation progress, and
clock settings.
