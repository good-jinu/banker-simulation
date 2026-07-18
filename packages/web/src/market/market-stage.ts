import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type TextStyleOptions,
} from "pixi.js";
import type { ContractOffer, MarketWorld } from "./market-world.ts";
import { pendingRequestCount, staticContractTerms } from "./market-world.ts";

/**
 * PixiJS scene for the open-market map.  Demand nodes are draggable portrait
 * circles; contract offers are squares with a pending-request badge. Matching
 * demands animate into a newly posted contract and file their request after
 * the visual arrival. Demand nodes remain tap-only; contract squares can be
 * dragged to reposition them.
 */

export interface MarketStageCallbacks {
  onTapDemand(demandId: string): void;
  onTapContract(contractId: string): void;
  /** A contract square was dragged; coordinates are normalized to [0, 1]. */
  onMoveContract(contractId: string, x: number, y: number): void;
}

const DEMAND_RADIUS = 26;
const CONTRACT_HALF = 27;
const DRAG_THRESHOLD_PX = 7;

const GOLD = 0xd6aa52;
const GOLD_BRIGHT = 0xf0cf82;
const CREAM = 0xf4e7c0;
const MIST = 0xb9c6dd;
const NIGHT = 0x0e2140;
const NIGHT_SOFT = 0x142743;
const RED = 0xe2574c;
const GREEN = 0x59c184;

const LABEL_STYLE: TextStyleOptions = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fontWeight: "800",
  fill: CREAM,
};

interface DemandNode {
  root: Container;
  sprite: Sprite;
  highlight: Graphics;
  /** Random phase so map nodes do not vibrate in lockstep. */
  jitterPhase: number;
}

interface ContractNode {
  root: Container;
  highlight: Graphics;
  badge: Container;
  badgeText: Text;
  termsText: Text;
  jitterPhase: number;
}

interface DragState {
  kind: "contract";
  id: string;
  node: Container;
  originX: number;
  originY: number;
  startGlobalX: number;
  startGlobalY: number;
  moved: boolean;
}

/** A per-frame animation; returns false once finished. */
type Animation = (deltaMs: number) => boolean;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Fixed contracts label their terms; dynamic ones show the formula mark. */
function contractMapLabel(contract: ContractOffer): string {
  const terms = staticContractTerms(contract.builderNodes);
  return terms ? `$${terms.principal} · ${terms.termDays}d` : "$ƒ(x)";
}

export class MarketStage {
  private readonly app = new Application();
  private callbacks: MarketStageCallbacks | null = null;
  private world: MarketWorld | null = null;
  private ready = false;
  private destroyed = false;
  private readonly gridLayer = new Graphics();
  // Keep one render group (the stage itself). Updating nested render groups
  // after the first frame can leave Pixi with stale batch instructions and
  // blank the scene when the first contract is added.
  private readonly contractLayer = new Container();
  private readonly nodeLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly demandNodes = new Map<string, DemandNode>();
  private readonly contractNodes = new Map<string, ContractNode>();
  private readonly absorbingDemandIds = new Set<string>();
  private drag: DragState | null = null;
  private animations: Animation[] = [];
  private suspended = false;
  private timeFlowing = false;
  private highlightedDemandId: string | null = null;
  private highlightedContractId: string | null = null;
  private jitterClock = 0;
  /** Runs even when game time is paused so tutorial targets stay unmistakable. */
  private highlightClock = 0;

  async init(
    host: HTMLElement,
    callbacks: MarketStageCallbacks,
  ): Promise<void> {
    this.callbacks = callbacks;
    await this.app.init({
      resizeTo: host,
      background: 0x071328,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy({ removeView: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(
      this.gridLayer,
      this.contractLayer,
      this.nodeLayer,
      this.fxLayer,
    );

    // The whole stage tracks pointer movement so drags survive fast swipes
    // that leave the node's own hit area.
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointermove", (event) => this.onPointerMove(event));
    this.app.stage.on("pointerup", (event) => this.onPointerUp(event));
    this.app.stage.on("pointerupoutside", (event) => this.onPointerUp(event));

    this.app.renderer.on("resize", () => {
      this.app.stage.hitArea = this.app.screen;
      this.drawGrid();
      this.layout();
    });
    this.app.ticker.add((ticker) => {
      if (this.animations.length > 0)
        this.animations = this.animations.filter((run) => run(ticker.deltaMS));
      this.applyJitter(ticker.deltaMS);
    });

    this.ready = true;
    this.drawGrid();
    if (this.world) this.syncWorld(this.world);
    if (this.suspended) this.app.ticker.stop();
  }

  /** Stop rendering while an opaque overlay covers the map. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (!this.ready || this.destroyed) return;
    if (suspended) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  /** While game time advances the map nodes vibrate; paused nodes sit still. */
  setTimeFlowing(flowing: boolean): void {
    this.timeFlowing = flowing;
  }

  /** Draw attention to a tutorial demand without changing its hit target. */
  setHighlightedDemand(demandId: string | null): void {
    this.highlightedDemandId = demandId;
    for (const [id, node] of this.demandNodes)
      node.highlight.visible = id === demandId;
  }

  /** Draw attention to a tutorial contract without changing its hit target. */
  setHighlightedContract(contractId: string | null): void {
    this.highlightedContractId = contractId;
    for (const [id, node] of this.contractNodes)
      node.highlight.visible = id === contractId;
  }

  /** Animate a matching demand into its contract before filing the request. */
  absorbDemand(
    demandId: string,
    contractId: string,
    onComplete: () => void,
  ): void {
    if (this.absorbingDemandIds.has(demandId)) return;
    const demand = this.demandNodes.get(demandId);
    const contract = this.contractNodes.get(contractId);
    if (!demand || !contract) return;
    this.absorbingDemandIds.add(demandId);
    const root = demand.root;
    const fromX = root.x;
    const fromY = root.y;
    const startScale = root.scale.x;
    const duration = 620;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      if (root.destroyed) return false;
      elapsed += deltaMs;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      root.position.set(
        fromX + (contract.root.x - fromX) * eased,
        fromY + (contract.root.y - fromY) * eased,
      );
      root.scale.set(Math.max(0.03, startScale * (1 - eased)));
      root.alpha = 1 - progress * 0.4;
      if (progress < 1) return true;
      root.visible = false;
      this.demandNodes.delete(demandId);
      this.absorbingDemandIds.delete(demandId);
      root.destroy({ children: true });
      this.playMatchPulse(contract.root.x, contract.root.y);
      onComplete();
      return false;
    });
  }

  private applyJitter(deltaMs: number): void {
    this.highlightClock += deltaMs;
    if (this.timeFlowing) this.jitterClock += deltaMs;
    const nodes: Array<{ root: Container; jitterPhase: number }> = [
      ...this.demandNodes.values(),
      ...this.contractNodes.values(),
    ];
    for (const { root, jitterPhase } of nodes) {
      if (root.destroyed) continue;
      // The dragged node stays glued to the pointer.
      if (!this.timeFlowing || this.drag?.node === root) {
        root.pivot.set(0, 0);
        continue;
      }
      // Pivot offsets the visuals without disturbing the layout position that
      // drags, drops, and hit-testing read from root.x / root.y.
      const t = this.jitterClock / 1000;
      root.pivot.set(
        Math.sin(t * 9.3 + jitterPhase) * 1.1,
        Math.cos(t * 11.7 + jitterPhase * 1.9) * 1.1,
      );
    }
    const pulse = (Math.sin(this.highlightClock / 170) + 1) / 2;
    for (const [id, node] of this.demandNodes) {
      const highlighted = id === this.highlightedDemandId;
      node.highlight.visible = highlighted;
      if (highlighted) {
        node.highlight.alpha = 0.2 + pulse * 0.8;
        node.highlight.scale.set(1 + pulse * 0.28);
      }
    }
    for (const [id, node] of this.contractNodes) {
      const highlighted = id === this.highlightedContractId;
      node.highlight.visible = highlighted;
      if (highlighted) {
        node.highlight.alpha = 0.2 + pulse * 0.8;
        node.highlight.scale.set(1 + pulse * 0.28);
      }
    }
  }

  /** Grow a freshly added map node from nothing to full size. */
  private playSpawn(root: Container): void {
    root.scale.set(0);
    const duration = 320;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      if (root.destroyed) return false;
      elapsed += deltaMs;
      const t = Math.min(1, elapsed / duration);
      // Ease out with a light overshoot so the pop reads as an arrival.
      const eased = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      root.scale.set(Math.max(0, eased));
      if (t >= 1) root.scale.set(1);
      return t < 1;
    });
  }

  /** Shrink a leaving map node to nothing, then destroy it. */
  private playDespawn(root: Container): void {
    const from = root.scale.x;
    const duration = 240;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      if (root.destroyed) return false;
      elapsed += deltaMs;
      const t = Math.min(1, elapsed / duration);
      root.scale.set(from * (1 - easeOutCubic(t)));
      if (t >= 1) {
        root.destroy({ children: true });
        return false;
      }
      return true;
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.ready) return; // init() finishes the cleanup when it resolves
    this.drag = null;
    this.animations = [];
    // Destroy display objects while the renderer still lives: Text unload
    // returns pooled textures, which crashes once the pool itself is gone.
    this.app.stage.removeChildren();
    this.contractLayer.destroy({ children: true });
    this.nodeLayer.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this.gridLayer.destroy();
    this.demandNodes.clear();
    this.contractNodes.clear();
    this.absorbingDemandIds.clear();
    // Remove this view without releasing Pixi's process-wide pools: during a
    // React view transition another canvas may already be using them.
    this.app.destroy({ removeView: true });
  }

  /** Reflect the latest world state into the scene graph. */
  syncWorld(world: MarketWorld): void {
    this.world = world;
    if (!this.ready || this.destroyed) return;

    const openDemandIds = new Set(
      world.demands
        .filter((demand) => demand.status === "open")
        .map((demand) => demand.id),
    );
    const contractIds = new Set(world.contracts.map((contract) => contract.id));

    // A dragged contract that leaves the world ends its drag.
    if (this.drag && !contractIds.has(this.drag.id)) this.drag = null;

    for (const [id, node] of this.demandNodes) {
      if (openDemandIds.has(id)) continue;
      this.playDespawn(node.root);
      this.demandNodes.delete(id);
    }
    for (const [id, node] of this.contractNodes) {
      if (contractIds.has(id)) continue;
      this.playDespawn(node.root);
      this.contractNodes.delete(id);
    }

    for (const contract of world.contracts) {
      let node = this.contractNodes.get(contract.id);
      if (!node) {
        node = this.buildContractNode(contract.id);
        this.contractNodes.set(contract.id, node);
        this.contractLayer.addChild(node.root);
        node.root.position.set(this.px(contract.x), this.py(contract.y));
        this.playSpawn(node.root);
      }
      const pending = pendingRequestCount(contract);
      node.badge.visible = pending > 0;
      node.badgeText.text = pending > 9 ? "9+" : String(pending);
      node.termsText.text = contractMapLabel(contract);
      node.highlight.visible = contract.id === this.highlightedContractId;
    }

    for (const demand of world.demands) {
      if (demand.status !== "open") continue;
      const existing = this.demandNodes.get(demand.id);
      if (existing) {
        if (this.absorbingDemandIds.has(demand.id)) continue;
        // A surviving open demand remains visible and tap-ready.
        existing.root.visible = true;
        continue;
      }
      const node = this.buildDemandNode(
        demand.id,
        demand.actor.image,
        demand.amount,
      );
      this.demandNodes.set(demand.id, node);
      this.nodeLayer.addChild(node.root);
      node.root.position.set(this.px(demand.x), this.py(demand.y));
      node.highlight.visible = demand.id === this.highlightedDemandId;
      this.playSpawn(node.root);
    }

    this.layout();
  }

  private px(nx: number): number {
    return 44 + nx * (this.app.screen.width - 88);
  }

  private py(ny: number): number {
    return 48 + ny * (this.app.screen.height - 104);
  }

  private layout(): void {
    if (!this.world) return;
    for (const contract of this.world.contracts) {
      const node = this.contractNodes.get(contract.id);
      if (!node) continue;
      // Never yank a node out from under the player's finger.
      if (this.drag?.kind === "contract" && this.drag.id === contract.id)
        continue;
      node.root.position.set(this.px(contract.x), this.py(contract.y));
    }
    for (const demand of this.world.demands) {
      if (demand.status !== "open") continue;
      const node = this.demandNodes.get(demand.id);
      if (!node) continue;
      if (this.absorbingDemandIds.has(demand.id)) continue;
      node.root.position.set(this.px(demand.x), this.py(demand.y));
    }
  }

  private drawGrid(): void {
    const { width, height } = this.app.screen;
    const grid = this.gridLayer;
    grid.clear();
    const cell = 34;
    for (let x = cell; x < width; x += cell)
      grid.moveTo(x, 0).lineTo(x, height);
    for (let y = cell; y < height; y += cell)
      grid.moveTo(0, y).lineTo(width, y);
    grid.stroke({ width: 1, color: 0x788caf, alpha: 0.08 });
  }

  private buildDemandNode(
    demandId: string,
    imageUrl: string,
    amount: number,
  ): DemandNode {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    const highlight = new Graphics()
      .circle(0, 0, DEMAND_RADIUS + 7)
      .stroke({ width: 3, color: GOLD_BRIGHT });
    highlight.visible = demandId === this.highlightedDemandId;
    root.addChild(highlight);

    const back = new Graphics()
      .circle(0, 0, DEMAND_RADIUS)
      .fill(NIGHT_SOFT)
      .stroke({ width: 2, color: GOLD });
    root.addChild(back);

    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.width = (DEMAND_RADIUS - 2) * 2;
    sprite.height = (DEMAND_RADIUS - 2) * 2;
    const mask = new Graphics().circle(0, 0, DEMAND_RADIUS - 2).fill(0xffffff);
    sprite.mask = mask;
    root.addChild(sprite, mask);

    const ring = new Graphics()
      .circle(0, 0, DEMAND_RADIUS)
      .stroke({ width: 2, color: GOLD });
    root.addChild(ring);

    const label = new Text({ text: `$${amount}`, style: LABEL_STYLE });
    label.anchor.set(0.5, 0);
    label.y = DEMAND_RADIUS + 5;
    root.addChild(label);

    void Assets.load(imageUrl).then((texture) => {
      if (this.destroyed || sprite.destroyed) return;
      sprite.texture = texture;
      sprite.width = (DEMAND_RADIUS - 2) * 2;
      sprite.height = (DEMAND_RADIUS - 2) * 2;
    });

    root.on("pointertap", () => this.callbacks?.onTapDemand(demandId));

    return {
      root,
      sprite,
      highlight,
      jitterPhase: Math.random() * Math.PI * 2,
    };
  }

  private buildContractNode(contractId: string): ContractNode {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    const highlight = new Graphics()
      .roundRect(
        -CONTRACT_HALF - 8,
        -CONTRACT_HALF - 8,
        (CONTRACT_HALF + 8) * 2,
        (CONTRACT_HALF + 8) * 2,
        16,
      )
      .stroke({ width: 3, color: GOLD_BRIGHT });
    highlight.visible = contractId === this.highlightedContractId;
    root.addChild(highlight);

    const body = new Graphics()
      .roundRect(
        -CONTRACT_HALF,
        -CONTRACT_HALF,
        CONTRACT_HALF * 2,
        CONTRACT_HALF * 2,
        12,
      )
      .fill(NIGHT)
      .stroke({ width: 2, color: GOLD });
    root.addChild(body);

    const dollar = new Text({
      text: "$",
      style: { ...LABEL_STYLE, fontSize: 22, fill: GOLD_BRIGHT },
    });
    dollar.anchor.set(0.5);
    root.addChild(dollar);

    const termsText = new Text({
      text: "",
      style: { ...LABEL_STYLE, fontSize: 10, fontWeight: "700", fill: MIST },
    });
    termsText.anchor.set(0.5, 0);
    termsText.y = CONTRACT_HALF + 5;
    root.addChild(termsText);

    const badge = new Container();
    badge.position.set(CONTRACT_HALF - 3, -CONTRACT_HALF + 3);
    const badgeBack = new Graphics()
      .circle(0, 0, 11)
      .fill(RED)
      .stroke({ width: 2, color: 0x071328 });
    const badgeText = new Text({
      text: "0",
      style: { ...LABEL_STYLE, fill: 0xffffff },
    });
    badgeText.anchor.set(0.5);
    badge.addChild(badgeBack, badgeText);
    badge.visible = false;
    root.addChild(badge);

    // Contracts share the demand drag machinery: a still pointer is a tap
    // that opens the detail page, a real drag repositions the square.
    root.on("pointerdown", (event: FederatedPointerEvent) => {
      if (this.drag) return;
      this.drag = {
        kind: "contract",
        id: contractId,
        node: root,
        originX: root.x,
        originY: root.y,
        startGlobalX: event.global.x,
        startGlobalY: event.global.y,
        moved: false,
      };
    });

    return {
      root,
      highlight,
      badge,
      badgeText,
      termsText,
      jitterPhase: Math.random() * Math.PI * 2,
    };
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = event.global.x - drag.startGlobalX;
    const dy = event.global.y - drag.startGlobalY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.node.parent?.addChild(drag.node); // lift above its layer siblings
    }
    drag.node.position.set(drag.originX + dx, drag.originY + dy);
  }

  private onPointerUp(event: FederatedPointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    if (!drag.moved) {
      this.callbacks?.onTapContract(drag.id);
      return;
    }

    // Persist the drop point in normalized world coordinates so the square
    // stays where the player left it across resizes and re-syncs.
    const spanX = Math.max(1, this.app.screen.width - 88);
    const spanY = Math.max(1, this.app.screen.height - 104);
    this.callbacks?.onMoveContract(
      drag.id,
      (drag.node.x - 44) / spanX,
      (drag.node.y - 48) / spanY,
    );
    void event;
  }

  /** Expanding green ring: the borrower liked the contract. */
  private playMatchPulse(x: number, y: number): void {
    const ring = new Graphics()
      .circle(0, 0, CONTRACT_HALF)
      .stroke({ width: 4, color: GREEN });
    ring.position.set(x, y);
    this.fxLayer.addChild(ring);
    const duration = 450;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      elapsed += deltaMs;
      const t = Math.min(1, elapsed / duration);
      ring.scale.set(1 + t * 0.8);
      ring.alpha = 1 - t;
      if (t >= 1) {
        ring.destroy();
        return false;
      }
      return true;
    });
  }
}
