---
name: verify
description: Build, launch, and drive the banker-simulation web game to verify changes at the browser surface.
---

# Verifying banker-simulation

## Build / launch

- Typecheck: `pnpm --filter @banker-simulation/web typecheck`
- Dev server: `pnpm dev --port 5199 --strictPort` from `packages/web`
  (run in background; ready in <1s, serves `http://localhost:5199/`).
- Production build: `pnpm --filter @banker-simulation/web build`
  (vite build + `scripts/prepare-sites.mjs`).

## Driving the app

The surface is a mobile-first React GUI (best at ~400×780 viewport).
Playwright works well; cached browsers live in `~/Library/Caches/ms-playwright`
(no global install — `npm install playwright` into a scratch dir and use the
cached chromium).

Flow landmarks:

- Home → button "Play" → stage grid (`.stage-card.active`) → open-market map.
- The market map is a PixiJS `<canvas>` (`.mk-map canvas`). Nodes are
  Pixi-drawn, so there are no DOM elements to click: tap-scan the canvas in
  a grid and detect which overlay opened via DOM markers —
  `.cs-customer-detail` (demand), `.mk-contract-summary` (contract),
  `.mk-builder-canvas-shell` (builder); none of them → still on the map.
  Go back with the button labeled "Back to the map". Detail pages are
  overlays — the map (and its Pixi app) stays mounted underneath, so
  remembered node coordinates stay valid across navigation.
- Drag-and-drop: `page.mouse.down()` on a demand circle, `move` in ~14 steps
  to a contract square, `up`. A fitting demand files a request (badge +1,
  green pulse); a non-fitting one flashes a red X and snaps back. Moves under
  ~7 px count as taps.
- Time is frozen until you press the clock toggle (aria-label "Resume time").
  Speeds 1x/2x/5x; one game day = 1200 ms at 1x. The skip button jumps to the
  next active loan's due day.
- Cash reads from `.cs-balance-strip div:first-child strong`; the last world
  event from `.cs-timebar-date small`.

Gotchas:

- The world is seeded from `Math.random()` per session — flows are stable in
  shape but not in values; assert on deltas (cash before/after), not amounts.
- "Draft a matching contract" opens an EMPTY draft (start node only), not a
  prefilled one. To build a valid contract, add via the "+" plus buttons:
  Transfer (defaults player→borrower · Loan amount), Wait (Requested days),
  Transfer flipped to Borrower→Player in its settings panel. The panel opens
  in-canvas attached to the selected node; deselect by tapping empty canvas.
- Builder-canvas driving pitfalls: click "Fit graph" before hunting for the
  terminal "+" (the graph is not refit as it grows, so it can be off-screen),
  scan the center column bottom-up (the top "+" inserts BEFORE the stack),
  and dismiss the validation tip first — it sits over the canvas top edge.
- Node order matters to fit rules: the borrower must be funded before the
  repayment transfer, and the wait must cover the demand's payable-after
  window, or drops reject with the red X.
- Prettier is enforced (`pnpm format:check` at repo root) — run
  `npx prettier --write` on touched files before finishing.
