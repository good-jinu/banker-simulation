# Manual Development Testing

The market can be opened directly during local development. This avoids going
through the main menu and stage selection every time a lending scenario needs
to be checked.

## Start the development server

```sh
pnpm install
pnpm dev
```

Then open the market directly:

```text
http://localhost:5173/?dev=market&stage=first-yield&phase=map&fresh=1
```

The development entry point is enabled only when Vite is running in development
mode. It is not available in production builds.

## URL options

| Parameter | Values                                 | Purpose                                                                 |
| --------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `dev`     | `market`                               | Enables the direct market test environment.                             |
| `stage`   | `first-yield`, `credit-under-pressure` | Selects the stage to test.                                              |
| `phase`   | `intro`, `map`                         | Starts at the customer conversation or the market map.                  |
| `fresh`   | `1`                                    | Discards the saved session for the initial load and starts a clean run. |

Examples:

```text
# Start a clean run at the intro conversation
http://localhost:5173/?dev=market&stage=first-yield&phase=intro&fresh=1

# Resume the saved first stage directly at the market map
http://localhost:5173/?dev=market&stage=first-yield&phase=map

# Start a clean challenge-stage map
http://localhost:5173/?dev=market&stage=credit-under-pressure&phase=map&fresh=1
```

## Session persistence

The active market session is stored automatically in the browser using
IndexedDB. Each stage has its own saved session, so testing one stage does not
overwrite another stage's progress.

The saved game state includes:

- current phase and day;
- cash, customers, outstanding loans, funding, and repayments;
- cumulative lending, goals, mission completion, and insolvency state;
- intro conversation progress;
- clock pause and speed settings.

Transient events, notifications, and open dialogs are intentionally cleared on
restore. They are presentation state rather than simulation state.

## DEV TEST controls

The `DEV TEST` panel is visible in the intro and map phases:

- **Save** writes the current session immediately;
- **Load** restores the latest saved session for the selected stage;
- **Reset** deletes the saved session and creates a new run at the selected phase;
- **Export JSON** downloads the current snapshot as a JSON file for inspection or
  sharing a reproducible manual-test state.

The game also saves automatically after state changes. Remove `fresh=1` from the
URL when you want to verify that a reload resumes the saved state.

## Suggested manual test flow

1. Open a clean intro URL with `fresh=1`.
2. Ask one or both customer questions and confirm that the same speech bubble
   updates instead of creating a new message box.
3. Reload without `fresh=1` and verify that the conversation progress remains.
4. Proceed to the map, issue a loan, and confirm the cash and loan book change.
5. Use **Save**, **Reset**, and **Load** to verify that the loan and cash state
   can be reproduced.
6. Use **Export JSON** when a snapshot is needed for debugging or a test report.
