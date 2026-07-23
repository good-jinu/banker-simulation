Architecture and engineering conventions for this repo, for AI agents working in it. For product, art direction, and game design, see [DESIGN.md](./DESIGN.md).

## Project shape

Single web package: `packages/web`. Pnpm workspace, Vite + React 19, strict TypeScript.

## Architecture: core vs UI

- `src/market/market-world.ts` — the core simulation engine. Pure reducer (`reduce(world, action)`), no React, no I/O. All state transitions go through `MarketAction`, a discriminated union — read it before adding a new action type.
- `src/market/*.tsx` (`MarketApp.tsx`, `MarketGameView.tsx`, `MarketDialogs.tsx`, etc.) — presentational layer driven by `market-world.ts` state and events.
- `src/market/hooks/` — hooks bridging the engine to components (clock ticking, effects, session persistence).
- `src/app/` — top-level app shell (`GameApp.tsx`) and save/load (`persistence.ts`).
- `src/i18n/` — locale strings (`en.ts`, `ko.ts`) and lookup helpers.
- `src/lib/` — standalone utilities not tied to a specific feature (e.g. `game-clock.ts`).
- `src/dev/` — development-only tooling, see below.

Prefer extending an existing feature folder (`market/`) over creating a new one unless it's a genuinely separate concern.

## Dev tooling

Dev-only code (URL-based launch shortcuts, debug panels, cheats) lives in `src/dev/` and loads only under `import.meta.env.DEV`, via a dynamic `lazy()` import in `main.tsx`. This keeps it out of the production bundle. Follow this pattern for new dev/debug utilities rather than inlining `if (import.meta.env.DEV)` checks inside feature components.

## Type-first workflow

`tsconfig.base.json` runs with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Define or extend the type before implementing:

1. Add/edit the type or discriminated union (e.g. a new `MarketAction` variant or `Product` kind).
2. Implement the reducer branch or component.
3. Run `pnpm typecheck` and let the compiler catch missing branches — don't guess at call sites.

## Testing

New pure-logic modules (no React/DOM dependency — reducers, calculators, parsers) must ship with a co-located `*.test.ts` alongside the implementation, following the existing pattern (`market-world.test.ts`, `persistence.test.ts`, `game-clock.test.ts`, `market-dev-query.test.ts`).

## File size

Aim for under ~250–300 lines for new files. This is a guideline, not a gate — the following existing files are grandfathered and don't need to be split proactively:

- `market/market-world.ts` (805 lines) — core reducer; size reflects the breadth of the simulation
- `market/MarketGameView.tsx` (508 lines)
- `market/MarketDialogs.tsx` (376 lines)
- `market/market-campaign.ts` (362 lines)
- `app/persistence.ts` (317 lines)

Don't refactor these as a side effect of an unrelated change. If a feature already requires deep changes to one of them, splitting it is a reasonable call to make in that moment.

## Commands

- `pnpm dev` — start the dev server
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm --filter @banker-simulation/web lint` — ESLint, zero warnings
- `pnpm --filter @banker-simulation/web test` — Vitest
- `pnpm check` — lint + typecheck + test + build (also runs via the mise-managed pre-commit hook)
