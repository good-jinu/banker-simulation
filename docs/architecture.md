# Rebuild architecture

This note records the code-facing decisions behind the first playable described
in `PLAN.md`.

## Package boundaries

```text
packages/web -> packages/content -> packages/contracts -> packages/core
       |                 |                    |
       +-----------------+--------------------+
```

- `core` owns deterministic commands, append-only stage events, replay, balances,
  time, settlement, default, and objective resolution.
- `contracts` owns the versioned contract AST, static validation, readable
  summaries, cash-flow projection, and compilation into immutable funding terms.
- `content` owns authored stage data, public borrower facts, objectives, rewards,
  scoring, and machine-verified solution fixtures.
- `web` owns React screens, draft editing, navigation, IndexedDB persistence,
  responsive presentation, and the PWA shell.

`core`, `contracts`, and `content` may not import React, DOM or browser storage
APIs, wall-clock time, or unseeded randomness. `scripts/lint-boundaries.mjs`
checks these rules. The dependency direction is enforced through workspace
package manifests and the same check.

## Command and event flow

The workshop never mutates money or agreement state. Publishing follows one
direction:

```text
editable ContractProgram
  -> validateProgram
  -> summarizeProgram + projectCashFlows
  -> compileContract
  -> StageEngine.publishAndFund(command)
  -> ContractPublished / ContractRejected / ContractFunded / CashTransferred
```

Advancing time is also a command. The engine emits a `TimeAdvanced` event for
each discrete month, then scheduled revenue and payment events in stable order.
Objective evaluation runs only after that month's settlements or defaults.

Every consequential event contains a reason or source block id. The interface
can therefore say which block moved value and why an outcome occurred without
reconstructing hidden control flow.

## Determinism and money

- Money uses integer cents.
- Stage time changes only through explicit commands.
- Stage seeds are recorded in `RunStarted`; Stage 1 has no random outcome.
- Business revenue comes from a finite market balance, so funding, spending,
  revenue, and repayment conserve total cash.
- A restored event sequence must have contiguous sequence numbers and the same
  stage id before it can replay.
- The same stage definition, draft, and event history reconstruct the same state.

The older economic sandbox remains in the existing `core` modules and
`packages/web/src/App.tsx`, but the new application does not import the legacy
screen. This keeps proven domain behavior available while preventing the old
product-form interface from mixing with the structured workshop.

## UI state ownership

- Replayed stage events are the source of truth for cash, time, contract status,
  payment status, win/loss, and rewards earned by a run.
- `ContractProgram` is the source of truth for the editable workshop draft.
- Campaign progress records completed stage ids, tangible rewards, and best
  score breakdowns.
- React-local state is limited to screen selection, the active mobile tab,
  sheets, feedback, and draft undo history.

## Save model

IndexedDB database version 1 stores four independently versioned values:

- campaign progress;
- active run events;
- current contract draft;
- player settings.

They are assembled into a schema-versioned save envelope at the adapter
boundary. Contract edits and committed simulation commands autosave. A bad or
unknown envelope falls back to a fresh local campaign without changing domain
rules.

## First-playable scope

Stage 1 supports exactly one ordered sequence:

```text
Lend -> Wait -> Collect -> Close
```

This deliberate limit lets the project verify the compose-observe-improve loop,
replay, explanation, mobile editing, and stage progression before adding nested
control flow. `If / Else`, collateral, schedules, rivals, and production chains
remain later phase work.
