# Banker Simulation Pixel Art Guide

All player-facing raster art must use the same modern 16-bit pixel-art language.
This document is the source of truth for generated and hand-authored game art.

## Visual direction

- Modern financial workplaces and ordinary contemporary people.
- Deep navy and graphite surfaces with restrained amber and muted-teal accents.
- Crisp, deliberate pixel clusters. Do not use painterly blur, airbrush texture, or photorealistic detail.
- Strong silhouettes that remain readable at the final mobile display size.
- UI art must not contain baked-in labels, numbers, logos, or status text.

## Palette anchors

- Background navy: `#071328`
- Deep shadow: `#030914`
- Panel navy: `#10223d`
- Warm gold: `#d9a84e`
- Highlight amber: `#f0c86c`
- Muted teal: `#4ca9a0`
- Paper: `#e7dcc0`
- Warning red: `#c95d61`

Small value and saturation variations are allowed, but new art should remain visibly related to these anchors.

## Asset rules

- Customer portraits: square source, exported to `320x320` WebP.
- Market organization thumbnails: square source, exported to `256x256` WebP.
- Stage thumbnails: 4:3 source, exported to `480x360` WebP.
- Contract node art: square transparent source, exported to `160x160` lossless WebP.
- Connector art: square transparent source, exported to `64x64` lossless WebP.
- Render raster assets with `image-rendering: pixelated`.
- Scale icons uniformly inside a node; never stretch them independently by axis.
- Transparent assets must have clean alpha edges and no baked-in cast shadow.

## Contract builder sizing

Node dimensions are expressed in board cells and are part of gameplay:

- Start: `3x2`, fixed and immutable.
- Transfer Money: `10x6`.
- Wait: `5x4`.
- Connector: `1x1`, directional.
- End: `3x2`.
- Reserve: `5x4`.
- Secure Asset: `6x5`.
- Condition: `7x5`.
- Repeat: `6x5`.
- Intake: `7x5`.
- Settle: `7x5`.

All stages use a `54x24` board. New node art must remain legible when a
10-cell-wide node is rendered inside a 390px viewport.

## Image-generation prompt baseline

Use the following clauses for new assets, then append the specific subject:

> Polished handcrafted 16-bit pixel art for a mobile financial simulation game. Crisp coherent pixel clusters, strong silhouette, deep navy and graphite palette with restrained amber, gold, and muted-teal accents. Modern grounded setting. No words, letters, numbers, logos, UI labels, watermark, photorealism, painterly blur, or fantasy styling.

For transparent icons, generate on a flat chroma-key background and remove it before committing the final WebP.
