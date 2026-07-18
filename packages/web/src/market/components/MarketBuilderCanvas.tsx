import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Text,
  type FederatedPointerEvent,
} from "pixi.js";
import type { MarketBuilderNode } from "../market-world.ts";

export type BuilderBranch = "thenSteps" | "elseSteps";

export interface BuilderInsertTarget {
  ownerId: string | null;
  branch: BuilderBranch | null;
  index: number;
  terminal: boolean;
}

interface CanvasLabels {
  start: string;
  transfer: string;
  wait: string;
  variable: string;
  condition: string;
  decision: string;
  end: string;
  true: string;
  false: string;
  fit: string;
}

interface Props {
  nodes: readonly MarketBuilderNode[];
  selectedNodeId: string | null;
  labels: CanvasLabels;
  nodeLabel: (node: MarketBuilderNode) => string;
  onSelectNode: (id: string | null) => void;
  onRequestInsert: (
    target: BuilderInsertTarget,
    position: { x: number; y: number },
  ) => void;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 72;
const ROW_GAP = 72;
const BRANCH_GAP = 72;
const GRID = 28;

const COLOR = {
  night: 0x071328,
  panel: 0x102640,
  panelDeep: 0x0b1c32,
  line: 0x55728f,
  lineHot: 0xd9a84e,
  gold: 0xd9a84e,
  cream: 0xf1e2ba,
  mist: 0x9fb1c5,
  green: 0x61cfaa,
  red: 0xd66b70,
  grid: 0x193653,
};

interface PathOwner {
  ownerId: string | null;
  branch: BuilderBranch | null;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function visibleNodes(
  nodes: readonly MarketBuilderNode[],
): MarketBuilderNode[] {
  return nodes.filter((node) => node.kind !== "end");
}

function measurePath(path: readonly MarketBuilderNode[]): number {
  let width = NODE_WIDTH;
  for (const node of visibleNodes(path)) {
    if (node.kind !== "condition") continue;
    const thenWidth = measurePath(node.thenSteps ?? []);
    const elseWidth = measurePath(node.elseSteps ?? []);
    width = Math.max(width, thenWidth + BRANCH_GAP + elseWidth);
  }
  return width;
}

class BuilderCanvasScene {
  private readonly app = new Application();
  private readonly world = new Container();
  private grid = new Graphics();
  private edges = new Graphics();
  private readonly objects = new Container();
  /**
   * Objects removed during an input event may still be in Pixi's render list
   * for the current frame, so they are destroyed two ticks later rather than
   * immediately — and rather than never, which would leak every text texture
   * created while editing.
   */
  private retiredObjects: Container[] = [];
  private retiringObjects: Container[] = [];
  private host: HTMLElement | null = null;
  private ready = false;
  private destroyed = false;
  private fitted = false;
  private nodes: readonly MarketBuilderNode[] = [];
  private selectedNodeId: string | null = null;
  private labels: CanvasLabels | null = null;
  private nodeLabel: Props["nodeLabel"] = () => "";
  private onSelectNode: Props["onSelectNode"] = () => undefined;
  private onRequestInsert: Props["onRequestInsert"] = () => undefined;
  private pointerStart: Point | null = null;
  private worldStart: Point | null = null;
  private moved = false;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      resizeTo: host,
      background: COLOR.night,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy({ removeView: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.grid, this.world);
    this.world.addChild(this.edges, this.objects);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (event) => this.beginPan(event));
    this.app.stage.on("pointermove", (event) => this.pan(event));
    this.app.stage.on("pointerup", () => this.endPan());
    this.app.stage.on("pointerupoutside", () => this.endPan());
    host.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.renderer.on("resize", () => {
      this.app.stage.hitArea = this.app.screen;
      this.drawGrid();
    });
    // Objects retired on frame N are still referenced by that frame's render
    // list; promote them one tick later and destroy them the tick after.
    this.app.ticker.add(() => {
      if (this.retiringObjects.length > 0) {
        for (const object of this.retiringObjects)
          object.destroy({ children: true });
        this.retiringObjects = [];
      }
      if (this.retiredObjects.length > 0) {
        this.retiringObjects = this.retiredObjects;
        this.retiredObjects = [];
      }
    });
    this.ready = true;
    this.drawGrid();
    this.render();
  }

  sync(props: Props): void {
    const needsRender =
      this.nodes !== props.nodes ||
      this.selectedNodeId !== props.selectedNodeId ||
      this.labels === null;
    this.nodes = props.nodes;
    this.selectedNodeId = props.selectedNodeId;
    this.labels = props.labels;
    this.nodeLabel = props.nodeLabel;
    this.onSelectNode = props.onSelectNode;
    this.onRequestInsert = props.onRequestInsert;
    if (this.ready && needsRender) this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host?.removeEventListener("wheel", this.onWheel);
    if (!this.ready) return;
    this.app.stage.removeChildren();
    this.retiredObjects.forEach((object) => object.destroy({ children: true }));
    this.retiredObjects.length = 0;
    this.retiringObjects.forEach((object) =>
      object.destroy({ children: true }),
    );
    this.retiringObjects.length = 0;
    this.world.destroy({ children: true });
    this.grid.destroy();
    // `true` also releases Pixi's process-wide pools. React can mount the map
    // canvas while this canvas is being cleaned up, so releasing those shared
    // batches corrupts the newly mounted renderer.
    this.app.destroy({ removeView: true });
  }

  fit(): void {
    if (!this.ready) return;
    const width = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const height = Math.max(1, this.bounds.maxY - this.bounds.minY);
    const scale = Math.max(
      0.25,
      Math.min(
        1,
        (this.app.screen.width - 80) / width,
        (this.app.screen.height - 80) / height,
      ),
    );
    this.world.scale.set(scale);
    this.world.position.set(
      (this.app.screen.width - width * scale) / 2 - this.bounds.minX * scale,
      (this.app.screen.height - height * scale) / 2 - this.bounds.minY * scale,
    );
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.host?.getBoundingClientRect();
    if (!rect) return;
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const oldScale = this.world.scale.x;
    const nextScale = Math.max(
      0.25,
      Math.min(1.8, oldScale * Math.exp(-event.deltaY * 0.0012)),
    );
    const localX = (pointer.x - this.world.x) / oldScale;
    const localY = (pointer.y - this.world.y) / oldScale;
    this.world.scale.set(nextScale);
    this.world.position.set(
      pointer.x - localX * nextScale,
      pointer.y - localY * nextScale,
    );
  };

  private beginPan(event: FederatedPointerEvent): void {
    this.pointerStart = { x: event.global.x, y: event.global.y };
    this.worldStart = { x: this.world.x, y: this.world.y };
    this.moved = false;
  }

  private pan(event: FederatedPointerEvent): void {
    if (!this.pointerStart || !this.worldStart) return;
    const dx = event.global.x - this.pointerStart.x;
    const dy = event.global.y - this.pointerStart.y;
    if (Math.hypot(dx, dy) > 4) this.moved = true;
    if (!this.moved) return;
    this.world.position.set(this.worldStart.x + dx, this.worldStart.y + dy);
  }

  private endPan(): void {
    this.pointerStart = null;
    this.worldStart = null;
  }

  private drawGrid(): void {
    if (this.grid.parent) {
      this.app.stage.removeChild(this.grid);
      this.retiredObjects.push(this.grid);
      this.grid = new Graphics();
      this.app.stage.addChildAt(this.grid, 0);
    }
    for (let x = 0; x <= this.app.screen.width; x += GRID)
      this.grid.moveTo(x, 0).lineTo(x, this.app.screen.height);
    for (let y = 0; y <= this.app.screen.height; y += GRID)
      this.grid.moveTo(0, y).lineTo(this.app.screen.width, y);
    this.grid.stroke({ color: COLOR.grid, alpha: 0.42, width: 1 });
  }

  private render(): void {
    if (!this.ready || !this.labels) return;
    // Graphics.clear() can invalidate a batch queued by the frame that
    // dispatched the pointer event. Swap the edge layer just like the nodes.
    this.world.removeChild(this.edges);
    this.retiredObjects.push(this.edges);
    this.edges = new Graphics();
    this.world.addChildAt(this.edges, 0);
    // React can sync this scene from inside a Pixi pointer handler. Destroying
    // those objects immediately invalidates geometry already queued for the
    // current frame, so keep them detached until the renderer is disposed.
    this.retiredObjects.push(...this.objects.removeChildren());
    const path = visibleNodes(this.nodes);
    const rootWidth = measurePath(path);
    this.bounds = {
      minX: -rootWidth / 2 - 60,
      minY: -40,
      maxX: rootWidth / 2 + 60,
      maxY: 100,
    };
    this.layoutPath(path, { ownerId: null, branch: null }, 0, 20);
    if (!this.fitted) {
      this.fitted = true;
      this.fit();
    }
  }

  private layoutPath(
    rawPath: readonly MarketBuilderNode[],
    owner: PathOwner,
    centerX: number,
    startY: number,
  ): number {
    const path = visibleNodes(rawPath);
    if (path.length === 0) return startY;
    let y = startY;
    for (let index = 0; index < path.length; index += 1) {
      const node = path[index]!;
      this.addNode(node, centerX, y);
      this.expandBounds(centerX, y);
      if (node.kind === "condition") {
        const thenPath = visibleNodes(node.thenSteps ?? []);
        const elsePath = visibleNodes(node.elseSteps ?? []);
        const thenWidth = measurePath(thenPath);
        const elseWidth = measurePath(elsePath);
        const thenX = centerX - (thenWidth + BRANCH_GAP) / 2;
        const elseX = centerX + (elseWidth + BRANCH_GAP) / 2;
        const branchY = y + NODE_HEIGHT + ROW_GAP;
        this.addBranchLabel(
          centerX - 34,
          y + NODE_HEIGHT / 2 + 24,
          this.labels!.true,
          true,
        );
        this.addBranchLabel(
          centerX + 34,
          y + NODE_HEIGHT / 2 + 24,
          this.labels!.false,
          false,
        );
        this.layoutBranch(node, "thenSteps", thenPath, centerX, thenX, branchY);
        this.layoutBranch(node, "elseSteps", elsePath, centerX, elseX, branchY);
        return Math.max(branchY, this.bounds.maxY);
      }
      const next = path[index + 1];
      if (next) {
        const nextY = y + NODE_HEIGHT + ROW_GAP;
        this.drawEdge(
          { x: centerX, y: y + NODE_HEIGHT / 2 },
          { x: centerX, y: nextY - NODE_HEIGHT / 2 },
        );
        this.addPlus(centerX, (y + nextY) / 2, {
          ...owner,
          index: index + 1,
          terminal: false,
        });
        y = nextY;
      } else {
        const terminalY = y + NODE_HEIGHT / 2 + 54;
        this.drawEdge(
          { x: centerX, y: y + NODE_HEIGHT / 2 },
          { x: centerX, y: terminalY },
        );
        this.addPlus(centerX, terminalY, {
          ...owner,
          index: path.length,
          terminal: true,
        });
        this.bounds.maxY = Math.max(this.bounds.maxY, terminalY + 30);
      }
    }
    return y;
  }

  private layoutBranch(
    condition: MarketBuilderNode,
    branch: BuilderBranch,
    path: readonly MarketBuilderNode[],
    originX: number,
    centerX: number,
    startY: number,
  ): void {
    const owner = { ownerId: condition.id, branch };
    const from = {
      x: originX + (branch === "thenSteps" ? -34 : 34),
      y: startY - ROW_GAP - NODE_HEIGHT / 2,
    };
    if (path.length === 0) {
      const target = { x: centerX, y: startY - 26 };
      this.drawEdge(from, target, branch === "thenSteps");
      this.addPlus(target.x, target.y, { ...owner, index: 0, terminal: true });
      this.expandBounds(target.x, target.y);
      return;
    }
    const first = { x: centerX, y: startY - NODE_HEIGHT / 2 };
    this.drawEdge(from, first, branch === "thenSteps");
    this.addPlus((from.x + first.x) / 2, (from.y + first.y) / 2, {
      ...owner,
      index: 0,
      terminal: false,
    });
    this.layoutPath(path, owner, centerX, startY);
  }

  private drawEdge(from: Point, to: Point, positive?: boolean): void {
    const middle = (from.y + to.y) / 2;
    this.edges
      .moveTo(from.x, from.y)
      .bezierCurveTo(from.x, middle, to.x, middle, to.x, to.y)
      .stroke({
        color:
          positive === true
            ? COLOR.green
            : positive === false
              ? COLOR.red
              : COLOR.line,
        alpha: 0.9,
        width: 2,
      });
  }

  private addNode(node: MarketBuilderNode, x: number, y: number): void {
    const root = new Container();
    root.position.set(x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2);
    root.eventMode = node.kind === "start" ? "none" : "static";
    root.cursor = node.kind === "start" ? "default" : "pointer";
    root.hitArea = new Rectangle(0, 0, NODE_WIDTH, NODE_HEIGHT);
    const selected = node.id === this.selectedNodeId;
    const panel = new Graphics()
      .roundRect(0, 0, NODE_WIDTH, NODE_HEIGHT, 12)
      .fill({
        color: node.kind === "start" ? 0x123d35 : COLOR.panelDeep,
        alpha: 0.98,
      })
      .stroke({
        color: selected
          ? COLOR.gold
          : node.kind === "start"
            ? COLOR.green
            : COLOR.line,
        width: selected ? 3 : 1.5,
      });
    const icon = new Graphics();
    icon.position.set(17, 17);
    this.drawIcon(icon, node.kind);
    const title = new Text({
      text: this.labels![node.kind],
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        fill: COLOR.cream,
      },
    });
    title.position.set(54, 13);
    const detail = new Text({
      text: this.nodeLabel(node),
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        fontWeight: "600",
        fill: COLOR.mist,
      },
    });
    detail.position.set(54, 36);
    detail.style.wordWrap = true;
    detail.style.wordWrapWidth = 124;
    root.addChild(panel, icon, title, detail);
    root.on("pointertap", (event: FederatedPointerEvent) => {
      if (this.moved) return;
      event.stopPropagation();
      this.onSelectNode(node.id === this.selectedNodeId ? null : node.id);
    });
    this.objects.addChild(root);
  }

  private drawIcon(icon: Graphics, kind: MarketBuilderNode["kind"]): void {
    const color = kind === "start" ? COLOR.green : COLOR.gold;
    icon.roundRect(0, 0, 28, 28, 7).fill({ color, alpha: 0.13 });
    if (kind === "start") icon.circle(14, 14, 6).fill(color);
    else if (kind === "transfer") {
      icon
        .moveTo(6, 10)
        .lineTo(21, 10)
        .lineTo(17, 6)
        .moveTo(21, 18)
        .lineTo(6, 18)
        .lineTo(10, 22)
        .stroke({ color, width: 2 });
    } else if (kind === "wait") {
      icon
        .circle(14, 14, 8)
        .stroke({ color, width: 2 })
        .moveTo(14, 14)
        .lineTo(14, 9)
        .moveTo(14, 14)
        .lineTo(18, 16)
        .stroke({ color, width: 2 });
    } else if (kind === "variable") {
      icon
        .moveTo(7, 8)
        .lineTo(12, 8)
        .lineTo(16, 20)
        .lineTo(21, 20)
        .moveTo(8, 20)
        .lineTo(12, 20)
        .lineTo(16, 8)
        .lineTo(20, 8)
        .stroke({ color, width: 2 });
    } else if (kind === "condition" || kind === "decision") {
      icon.poly([14, 5, 23, 14, 14, 23, 5, 14]).stroke({ color, width: 2 });
      if (kind === "decision") icon.circle(14, 14, 2).fill(color);
    }
  }

  private addPlus(x: number, y: number, target: BuilderInsertTarget): void {
    const root = new Container();
    root.position.set(x, y);
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new Rectangle(-18, -18, 36, 36);
    const circle = new Graphics()
      .circle(0, 0, 13)
      .fill(COLOR.panel)
      .stroke({ color: COLOR.gold, width: 2 });
    const mark = new Graphics()
      .moveTo(-5, 0)
      .lineTo(5, 0)
      .moveTo(0, -5)
      .lineTo(0, 5)
      .stroke({ color: COLOR.cream, width: 2 });
    root.addChild(circle, mark);
    root.on("pointertap", (event: FederatedPointerEvent) => {
      if (this.moved) return;
      event.stopPropagation();
      this.onRequestInsert(target, { x: event.global.x, y: event.global.y });
    });
    this.objects.addChild(root);
  }

  private addBranchLabel(
    x: number,
    y: number,
    text: string,
    positive: boolean,
  ): void {
    const label = new Text({
      text,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 9,
        fontWeight: "900",
        fill: positive ? COLOR.green : COLOR.red,
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.objects.addChild(label);
  }

  private expandBounds(x: number, y: number): void {
    this.bounds.minX = Math.min(this.bounds.minX, x - NODE_WIDTH / 2 - 30);
    this.bounds.maxX = Math.max(this.bounds.maxX, x + NODE_WIDTH / 2 + 30);
    this.bounds.minY = Math.min(this.bounds.minY, y - NODE_HEIGHT / 2 - 30);
    this.bounds.maxY = Math.max(this.bounds.maxY, y + NODE_HEIGHT / 2 + 30);
  }
}

export function MarketBuilderCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BuilderCanvasScene | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BuilderCanvasScene();
    sceneRef.current = scene;
    scene.sync(propsRef.current);
    void scene.init(host).then(() => scene.sync(propsRef.current));
    return () => {
      sceneRef.current = null;
      scene.destroy();
    };
  }, []);

  useEffect(() => sceneRef.current?.sync(props), [props]);

  return (
    <div className="mk-builder-canvas-shell">
      <div
        ref={hostRef}
        className="mk-builder-canvas"
        role="application"
        aria-label="Contract graph. Drag the background to pan and use the mouse wheel to zoom."
      />
      <button
        type="button"
        className="mk-canvas-fit"
        onClick={() => sceneRef.current?.fit()}
      >
        {props.labels.fit}
      </button>
    </div>
  );
}
