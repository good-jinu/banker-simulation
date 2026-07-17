# Banker Simulation

A mobile-first financial automation puzzle. Players inspect incomplete market
information, build contracts from generic nodes, offer them to real demand, and
turn accepted designs into automatic sales pipelines.

The game deliberately avoids named product categories such as loans, deposits,
insurance, or derivatives. Those structures emerge naturally from operations
like transferring value, waiting, reserving liquidity, securing an asset,
branching on an outcome, repeating a payment, receiving funding, and settling
an obligation.

## Playable campaign

1. **The First Yield** — turn a visible need into a timed exchange.
2. **Room to Breathe** — preserve minimum liquidity while funding demand.
3. **The Safety Net** — secure an asset and define both outcome branches.
4. **Payment Rhythm** — repeat a transfer on a bounded schedule.
5. **Keep the Till Open** — automate two independent contracts.
6. **Funding Desk** — receive funding, deploy it, and settle every promise.

Every stage uses the same four-part flow:

```text
Open Market → Demand detail → Contract Builder → Automated Pipeline
```

Customers progress from individuals to companies, government organizations,
and multi-party funding networks. Information is intentionally incomplete, but
the immediate need is always visible.

## Run it

```sh
pnpm install
pnpm --filter @banker-simulation/web dev
```

The game targets phones first, caps its play surface at 500px, and includes an
offline-capable Vite PWA build.

## Checks

```sh
pnpm --filter @banker-simulation/web check
pnpm check
```

## Current frontend structure

```text
packages/web/src/
  GameApp.tsx            home, stage selection, progression
  CampaignStageApp.tsx   shared market, builder, and pipeline gameplay
  campaign-stages.ts     all six authored stage definitions
  persistence.ts         campaign/settings save adapter
  game.css               home and stage selection styles
  campaign-stage.css     gameplay styles
```

Additional deterministic simulation packages remain available for headless
research and tests, but the mounted game does not import them.

See [campaign architecture](docs/architecture.md) and the
[pixel-art guide](docs/PIXEL_ART_STYLE_GUIDE.md) for implementation rules.
