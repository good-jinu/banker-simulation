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
 * circles; contract offers are squares with a pending-request badge.  A small
 * pointer movement is a tap (opens a detail page); a real drag hands the
 * demand to `onDropDemand` when it lands on a contract, and the stage plays
 * the matching success pulse or the reject X before snapping the node home.
 */

export interface MarketStageCallbacks {
  onTapDemand(demandId: string): void;
  onTapContract(contractId: string): void;
  /** Return true when the demand fit and a request was filed. */
  onDropDemand(demandId: string, contractId: string): boolean;
}

const DEMAND_RADIUS = 26;
const CONTRACT_HALF = 27;
const DRAG_THRESHOLD_PX = 7;
const DROP_RANGE_PX = 56;

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
}

interface ContractNode {
  root: Container;
  badge: Container;
  badgeText: Text;
  termsText: Text;
}

interface DragState {
  demandId: string;
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
  private readonly contractLayer = new Container();
  private readonly nodeLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly demandNodes = new Map<string, DemandNode>();
  private readonly contractNodes = new Map<string, ContractNode>();
  private drag: DragState | null = null;
  private animations: Animation[] = [];

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
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    // Contract markers must not share a Pixi batch with masked portraits.
    // Adding a contract to the portrait layer corrupts WebGL rendering on
    // some devices and blanks the entire map.
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
      if (this.animations.length === 0) return;
      this.animations = this.animations.filter((run) => run(ticker.deltaMS));
    });

    this.ready = true;
    this.drawGrid();
    if (this.world) this.syncWorld(this.world);
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
    this.app.destroy(true);
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

    // A dragged node whose demand left the open pool (auto-request fired,
    // expiry, or the drop just succeeded) ends its drag.
    if (this.drag && !openDemandIds.has(this.drag.demandId)) this.drag = null;

    for (const [id, node] of this.demandNodes) {
      if (openDemandIds.has(id)) continue;
      node.root.destroy({ children: true });
      this.demandNodes.delete(id);
    }
    for (const [id, node] of this.contractNodes) {
      if (contractIds.has(id)) continue;
      node.root.destroy({ children: true });
      this.contractNodes.delete(id);
    }

    // Contract controls are rendered by React above the canvas. Keeping
    // them out of Pixi avoids a WebGL batching bug triggered when a contract
    // container is added after masked customer portraits.

    for (const demand of world.demands) {
      if (demand.status !== "open") continue;
      if (this.demandNodes.has(demand.id)) continue;
      const node = this.buildDemandNode(
        demand.id,
        demand.actor.image,
        demand.amount,
      );
      this.demandNodes.set(demand.id, node);
      this.nodeLayer.addChild(node.root);
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
      if (node)
        node.root.position.set(this.px(contract.x), this.py(contract.y));
    }
    for (const demand of this.world.demands) {
      if (demand.status !== "open") continue;
      const node = this.demandNodes.get(demand.id);
      if (!node) continue;
      // Never yank the node out from under the player's finger.
      if (this.drag?.demandId === demand.id) continue;
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

    root.on("pointerdown", (event: FederatedPointerEvent) => {
      if (this.drag) return;
      this.drag = {
        demandId,
        node: root,
        originX: root.x,
        originY: root.y,
        startGlobalX: event.global.x,
        startGlobalY: event.global.y,
        moved: false,
      };
    });

    return { root, sprite };
  }

  private buildContractNode(contractId: string): ContractNode {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    // Contract contents are added after the marker has joined the stage.
    // This keeps Pixi from compiling a partially-built render group.
    const termsText = new Text({ text: "", style: LABEL_STYLE });
    const badge = new Container();
    badge.position.set(CONTRACT_HALF - 3, -CONTRACT_HALF + 3);
    const badgeText = new Text({ text: "0", style: LABEL_STYLE });
    badge.visible = false;

    root.on("pointertap", () => {
      // A drag that started on a demand never taps the contract: the tap
      // event needs pointerdown and pointerup on this same node.
      this.callbacks?.onTapContract(contractId);
    });

    return { root, badge, badgeText, termsText };
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = event.global.x - drag.startGlobalX;
    const dy = event.global.y - drag.startGlobalY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      this.nodeLayer.addChild(drag.node); // lift above everything else
    }
    drag.node.position.set(drag.originX + dx, drag.originY + dy);
  }

  private onPointerUp(event: FederatedPointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    if (!drag.moved) {
      this.callbacks?.onTapDemand(drag.demandId);
      return;
    }

    const target = this.dropTarget(drag.node.x, drag.node.y);
    if (!target) {
      this.snapBack(drag);
      return;
    }
    const accepted =
      this.callbacks?.onDropDemand(drag.demandId, target.contractId) ?? false;
    if (accepted) {
      // The world update removes the node on the next sync; hide it now so
      // it does not flash back to its map spot first.
      drag.node.visible = false;
      this.playMatchPulse(target.node.root.x, target.node.root.y);
    } else {
      this.playRejectX(target.node.root.x, target.node.root.y);
      this.snapBack(drag);
    }
    void event;
  }

  private dropTarget(
    x: number,
    y: number,
  ): { contractId: string; node: ContractNode } | null {
    let best: {
      contractId: string;
      node: ContractNode;
      distance: number;
    } | null = null;
    for (const [contractId, node] of this.contractNodes) {
      const distance = Math.hypot(node.root.x - x, node.root.y - y);
      if (distance > DROP_RANGE_PX) continue;
      if (!best || distance < best.distance)
        best = { contractId, node, distance };
    }
    return best;
  }

  private snapBack(drag: DragState): void {
    const { node, originX, originY } = drag;
    const fromX = node.x;
    const fromY = node.y;
    const duration = 260;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      if (node.destroyed) return false;
      elapsed += deltaMs;
      const t = easeOutCubic(Math.min(1, elapsed / duration));
      node.position.set(
        fromX + (originX - fromX) * t,
        fromY + (originY - fromY) * t,
      );
      return elapsed < duration;
    });
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

  /** Red X flash: the contract does not satisfy the demand. */
  private playRejectX(x: number, y: number): void {
    const size = 16;
    const cross = new Graphics()
      .moveTo(-size, -size)
      .lineTo(size, size)
      .moveTo(size, -size)
      .lineTo(-size, size)
      .stroke({ width: 6, color: RED, cap: "round" });
    cross.position.set(x, y);
    cross.scale.set(0.5);
    this.fxLayer.addChild(cross);
    const duration = 550;
    let elapsed = 0;
    this.animations.push((deltaMs) => {
      elapsed += deltaMs;
      const t = Math.min(1, elapsed / duration);
      cross.scale.set(0.5 + easeOutCubic(t) * 0.7);
      cross.alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      if (t >= 1) {
        cross.destroy();
        return false;
      }
      return true;
    });
  }
}
