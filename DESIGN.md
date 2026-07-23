# Banker Simulation Design Guide

For engineering/architecture conventions, see [CLAUDE.md](./CLAUDE.md).

## 1. Product Concept

`Banker Simulation` is a game about listening to customers, evaluating loan requests, and managing the cash flow and credit risk of a small bank.

The core loop is:

`Conversation → Information Gathering → Credit Judgment → Lending Decision → Time Progression → Outcome`

The player decides who to trust, when to preserve cash, how to survive defaults and repayments, and whether external funding is worth the risk.

## 2. Art Direction

The visual identity combines 1960s pop-art graphic novels with the clarity of a financial board game.

- Heavy black ink outlines
- Ben-Day halftone dots
- Cream paper textures
- Saturated red, electric green, yellow, and orange color blocks
- A limited palette with strong contrast
- Slightly rough screen-print surfaces
- Highly readable character silhouettes, expressions, and props

Avoid photorealism, soft 3D rendering, glossy SaaS dashboards, excessive gradients, and generic corporate-finance visuals.

The tone should feel financially tense without becoming cold or intimidating. Black and red communicate danger and pressure; cream and bank motifs communicate trust; green and yellow communicate growth, approval, and opportunity.

## 3. Color System

| Role | Color | Usage |
| --- | --- | --- |
| Ink | `#11100D` | Outlines, body text, shadows |
| Paper | `#F7E5B7` | Backgrounds, cards, speech bubbles |
| Red | `#EE321D` | Warnings, tension, major headers |
| Green | `#3EAF3C` | Stability, approval, growth, positive states |
| Yellow | `#FFD328` | Available actions, goals, emphasis |
| Orange | `#F36B24` | Lending, cash movement, secondary risk states |

Black outlines are not decoration. They are the shared visual language that binds every element into one game world.

## 4. Character Direction

Characters are not menu decoration; they are the center of the player's decisions. A customer's job, situation, and trustworthiness should be communicated through dialogue and visual evidence together.

- Make the character the visual focus of consultation scenes.
- Include a prop that communicates the character's job, such as a bread basket, work clipboard, or loan file.
- Connect expressions to game states: `neutral`, `requesting`, `evaluating`, `worried`, and `relieved`.
- Build faces, clothing, props, and poses as reusable composition units.
- Make faces and signature colors readable even as small map nodes.
- Use distinct silhouettes and palettes so characters can be recognized quickly.

### Atomic Asset Structure

Character assets should be individual transparent PNGs rather than large scene illustrations.

```text
assets/pop-art/avatars/
  mina-request.png
  mina-neutral.png
  jun-evaluating.png
  jun-neutral.png
  auditor-neutral.png
  fund-manager-neutral.png
  regulator-neutral.png
```

Each asset must be reusable in consultation scenes, customer nodes, detail modals, and event animations.

## 5. World and Backgrounds

Backgrounds are game boards, not empty UI space.

- The underwriting room is the desk where the player meets and evaluates customers.
- The market map is a financial network connecting the bank to customers and funding sources.
- Backgrounds must leave negative space for important interactions.
- Characters, nodes, cash transfers, and alerts should be composited as layers over the background plates.

Current core backgrounds:

- `assets/pop-art/backgrounds/underwriting-room.png`
- `assets/pop-art/backgrounds/market-map.png`

## 6. UI / UX Principles

### Game First

Every screen should feel like a game scene, not a website.

- Avoid generic SaaS dashboard cards and spreadsheet layouts.
- Place interactions over illustrated environments.
- Style buttons as paper labels, stamps, signs, or speech bubbles.
- Treat information panels as decision cards rather than passive data tables.

### Conversation First

Conversation is a core player action, not just a tutorial.

1. Show the customer's request and situation.
2. Let the player choose what to ask.
3. Make the player infer risk from the answers.
4. Reveal the underwriting action when enough information is gathered.
5. Reflect the decision in cash, repayment, and default outcomes.

### Readability

- Emphasize one primary objective on each screen.
- Never communicate important numbers through color alone; pair them with labels and icons.
- On small screens, the customer face, loan amount, due date, and current cash must be immediately readable.
- Pause time when a modal or high-stakes decision is open.

## 7. Motion Principles

Motion should explain financial flow rather than exist only as decoration.

- Loan approval: money travels from the bank to the customer.
- Funding: money travels from an external lender to the bank.
- Repayment: money returns from the customer to the bank.
- Default: the transfer stops and warning colors take over.
- Mission clear: use a strong stamp-like or printed-poster celebration.

The player controls time with play, pause, and speed controls. Important decisions should automatically pause the simulation.

## 8. Content Rules

Every new customer or financial event should define:

- Name and occupation
- Loan purpose
- Income and requested amount
- Interest rate and term
- Conversational clues that allow the player to infer risk
- Visual success and failure states
- The action that moves the player from conversation into market operation

Prefer customers with distinct stories and decision criteria over customers who only differ numerically.

## 9. Quality Checklist

Before adding a new screen or asset, verify:

- Does the pop-art outline and halftone treatment match the existing assets?
- Is text readable against the cream paper and black ink palette?
- Are the character's job and state communicated through expression and props?
- Can the asset be reused in the consultation room, map, and modals?
- Does the screen feel more like a game scene than a web dashboard?
- Can the player immediately understand the decision they need to make?
