import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
} from "pixi.js";
import { BUILDER_VARIABLES, type MarketBuilderNode } from "../market-world.ts";

export type BuilderBranch = "thenSteps" | "elseSteps";

export interface BuilderInsertTarget {
  ownerId: string | null;
  branch: BuilderBranch | null;
  index: number;
  terminal: boolean;
}

interface CanvasLabels {
  clause: string;
  startDetail: string;
  start: string;
  transfer: string;
  wait: string;
  variable: string;
  condition: string;
  decision: string;
  end: string;
  true: string;
  false: string;
  merge: string;
  fit: string;
}

interface CardLayout {
  node: MarketBuilderNode;
  names: readonly string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoardLayout {
  cards: readonly CardLayout[];
  transform: { x: number; y: number; scale: number };
}

interface Props {
  nodes: readonly MarketBuilderNode[];
  labels: CanvasLabels;
  renderNodeDetails: (
    node: MarketBuilderNode,
    names: readonly string[],
  ) => ReactNode;
  onRequestInsert: (target: BuilderInsertTarget) => void;
  onLayout?: (layout: BoardLayout) => void;
  highlightAddControls?: boolean;
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

interface PathOwner {
  ownerId: string | null;
  branch: BuilderBranch | null;
}

const ROW_GAP = 72;
const START_ROW_GAP = 48;
const BRANCH_GAP = 96;
const GRID = 28;

const COLOR = {
  night: 0x071328,
  line: 0x55728f,
  gold: 0xd9a84e,
  green: 0x61cfaa,
  red: 0xd66b70,
  grid: 0x193653,
};

function nodeSize(node: MarketBuilderNode): { width: number; height: number } {
  switch (node.kind) {
    case "start":
      return { width: 180, height: 96 };
    case "transfer":
      return { width: 440, height: 410 };
    case "wait":
      return { width: 400, height: 320 };
    case "variable":
      return { width: 440, height: 380 };
    case "condition":
      return { width: 520, height: 410 };
    case "decision":
      return { width: 300, height: 180 };
    case "end":
      return { width: 180, height: 96 };
  }
}

function rowGapAfter(node: MarketBuilderNode): number {
  return node.kind === "start" ? START_ROW_GAP : ROW_GAP;
}

function visibleNodes(
  nodes: readonly MarketBuilderNode[],
): readonly MarketBuilderNode[] {
  return nodes.filter((node) => node.kind !== "end");
}

function measurePath(path: readonly MarketBuilderNode[]): number {
  let width = 0;
  for (const node of visibleNodes(path)) {
    width = Math.max(width, nodeSize(node).width);
    if (node.kind !== "condition") continue;
    width = Math.max(
      width,
      measurePath(node.thenSteps ?? []) +
        BRANCH_GAP +
        measurePath(node.elseSteps ?? []),
    );
  }
  return width || 180;
}

function nodeGlyph(kind: MarketBuilderNode["kind"]): string {
  if (kind === "start") return "●";
  if (kind === "transfer") return "⇄";
  if (kind === "wait") return "◷";
  if (kind === "variable") return "ƒ";
  return "◇";
}

class BuilderCanvasScene {
  private readonly app = new Application();
  private readonly world = new Container();
  private grid = new Graphics();
  private readonly scopes = new Graphics();
  private edges = new Graphics();
  private readonly controls = new Container();
  private host: HTMLElement | null = null;
  private ready = false;
  private destroyed = false;
  private fitted = false;
  private nodes: readonly MarketBuilderNode[] = [];
  private labels: CanvasLabels | null = null;
  private onRequestInsert: Props["onRequestInsert"] = () => undefined;
  private onLayout: (layout: BoardLayout) => void = () => undefined;
  private highlightAddControls = false;
  private pointerStart: Point | null = null;
  private worldStart: Point | null = null;
  private moved = false;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private cards: CardLayout[] = [];
  private scopeBounds: Bounds[] = [];
  private lastLayoutKey = "";

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
    this.world.addChild(this.scopes, this.edges, this.controls);
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
      this.reportLayout();
    });
    this.ready = true;
    this.drawGrid();
    this.render();
  }

  sync(props: Props): void {
    const needsRender =
      this.nodes !== props.nodes ||
      this.labels !== props.labels ||
      this.highlightAddControls !== Boolean(props.highlightAddControls);
    this.nodes = props.nodes;
    this.labels = props.labels;
    this.onRequestInsert = props.onRequestInsert;
    this.onLayout = props.onLayout ?? (() => undefined);
    this.highlightAddControls = Boolean(props.highlightAddControls);
    if (this.ready && needsRender) this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host?.removeEventListener("wheel", this.onWheel);
    if (!this.ready) return;
    this.app.destroy({ removeView: true });
  }

  fit(): void {
    if (!this.ready) return;
    const width = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const height = Math.max(1, this.bounds.maxY - this.bounds.minY);
    const scale = Math.max(
      0.14,
      Math.min(
        1,
        (this.app.screen.width - 96) / width,
        (this.app.screen.height - 96) / height,
      ),
    );
    this.world.scale.set(scale);
    this.world.position.set(
      (this.app.screen.width - width * scale) / 2 - this.bounds.minX * scale,
      (this.app.screen.height - height * scale) / 2 - this.bounds.minY * scale,
    );
    this.reportLayout();
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
      0.14,
      Math.min(1.8, oldScale * Math.exp(-event.deltaY * 0.0012)),
    );
    const localX = (pointer.x - this.world.x) / oldScale;
    const localY = (pointer.y - this.world.y) / oldScale;
    this.world.scale.set(nextScale);
    this.world.position.set(
      pointer.x - localX * nextScale,
      pointer.y - localY * nextScale,
    );
    this.reportLayout();
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
    this.reportLayout();
  }

  private endPan(): void {
    this.pointerStart = null;
    this.worldStart = null;
  }

  private drawGrid(): void {
    this.grid.clear();
    for (let x = 0; x <= this.app.screen.width; x += GRID)
      this.grid.moveTo(x, 0).lineTo(x, this.app.screen.height);
    for (let y = 0; y <= this.app.screen.height; y += GRID)
      this.grid.moveTo(0, y).lineTo(this.app.screen.width, y);
    this.grid.stroke({ color: COLOR.grid, alpha: 0.42, width: 1 });
  }

  private render(): void {
    if (!this.ready || !this.labels) return;
    this.scopes.clear();
    this.edges.clear();
    this.controls
      .removeChildren()
      .forEach((child) => child.destroy({ children: true }));
    this.cards = [];
    this.scopeBounds = [];
    const path = visibleNodes(this.nodes);
    const rootWidth = measurePath(path);
    this.bounds = {
      minX: -rootWidth / 2 - 80,
      minY: -80,
      maxX: rootWidth / 2 + 80,
      maxY: 180,
    };
    if (path.length === 0) {
      this.addPlus(0, 40, {
        ownerId: null,
        branch: null,
        index: 0,
        terminal: true,
      });
    } else {
      this.layoutPath(
        path,
        { ownerId: null, branch: null },
        0,
        40,
        BUILDER_VARIABLES,
      );
    }
    if (!this.fitted) {
      this.fitted = true;
      this.fit();
    } else {
      this.reportLayout();
    }
  }

  private layoutPath(
    rawPath: readonly MarketBuilderNode[],
    owner: PathOwner,
    centerX: number,
    startY: number,
    inheritedNames: readonly string[],
  ): number {
    const path = visibleNodes(rawPath);
    if (path.length === 0) {
      this.addPlus(centerX, startY, { ...owner, index: 0, terminal: true });
      return startY;
    }
    const names = [...inheritedNames];
    let y = startY;
    for (let index = 0; index < path.length; index += 1) {
      const node = path[index]!;
      const size = nodeSize(node);
      const rowGap = rowGapAfter(node);
      const namesAtNode = [...names];
      this.addCard(node, centerX, y, namesAtNode);
      if (node.kind === "variable" && node.variableName)
        names.push(node.variableName);
      const remainder = path.slice(index + 1);
      if (node.kind === "condition") {
        const thenPath = visibleNodes(node.thenSteps ?? []);
        const elsePath = visibleNodes(node.elseSteps ?? []);
        const thenWidth = measurePath(thenPath);
        const elseWidth = measurePath(elsePath);
        const thenX = centerX - (thenWidth + BRANCH_GAP) / 2;
        const elseX = centerX + (elseWidth + BRANCH_GAP) / 2;
        const thenFirstSize = thenPath[0] ? nodeSize(thenPath[0]) : null;
        const elseFirstSize = elsePath[0] ? nodeSize(elsePath[0]) : null;
        const branchY =
          y +
          size.height / 2 +
          rowGap +
          Math.max(thenFirstSize?.height ?? 0, elseFirstSize?.height ?? 0) / 2;
        this.drawEdge(
          { x: centerX - 70, y: y + size.height / 2 },
          { x: thenX, y: branchY - (thenFirstSize?.height ?? 0) / 2 },
          true,
        );
        this.drawEdge(
          { x: centerX + 70, y: y + size.height / 2 },
          { x: elseX, y: branchY - (elseFirstSize?.height ?? 0) / 2 },
          false,
        );
        const nestedScopeStart = this.scopeBounds.length;
        const thenBottom = this.layoutPath(
          thenPath,
          { ownerId: node.id, branch: "thenSteps" },
          thenX,
          branchY,
          namesAtNode,
        );
        const elseBottom = this.layoutPath(
          elsePath,
          { ownerId: node.id, branch: "elseSteps" },
          elseX,
          branchY,
          namesAtNode,
        );
        const nextSize = remainder[0] ? nodeSize(remainder[0]) : null;
        const branchBottom = Math.max(thenBottom, elseBottom);
        const nestedScopes = this.scopeBounds.slice(nestedScopeStart);
        const contentMinX = Math.min(
          centerX - size.width / 2,
          thenX - thenWidth / 2,
          elseX - elseWidth / 2,
          ...nestedScopes.map((scope) => scope.minX),
        );
        const contentMaxX = Math.max(
          centerX + size.width / 2,
          thenX + thenWidth / 2,
          elseX + elseWidth / 2,
          ...nestedScopes.map((scope) => scope.maxX),
        );
        const contentBottom = Math.max(
          branchBottom,
          ...nestedScopes.map((scope) => scope.maxY),
        );
        this.drawConditionScope(
          contentMinX - 32,
          y - size.height / 2 - 28,
          contentMaxX + 32,
          contentBottom + 24,
        );
        const nextY = nextSize
          ? branchBottom + rowGap + nextSize.height / 2
          : branchBottom + 48;
        const mergePlusY = nextSize
          ? (branchBottom + nextY - nextSize.height / 2) / 2
          : nextY;
        this.addPlus(centerX, mergePlusY, {
          ...owner,
          index: index + 1,
          terminal: remainder.length === 0,
        });
        if (remainder.length > 0) {
          this.drawEdge(
            { x: thenX, y: thenBottom },
            { x: centerX, y: nextY - nextSize!.height / 2 },
          );
          this.drawEdge(
            { x: elseX, y: elseBottom },
            { x: centerX, y: nextY - nextSize!.height / 2 },
          );
          return this.layoutPath(remainder, owner, centerX, nextY, names);
        }
        this.expandBounds(centerX, nextY, { width: 44, height: 44 });
        return branchBottom;
      }
      const nextSize = remainder[0] ? nodeSize(remainder[0]) : null;
      const nextY = nextSize
        ? y + size.height / 2 + rowGap + nextSize.height / 2
        : y + size.height / 2 + 48;
      if (remainder.length > 0) {
        this.drawEdge(
          { x: centerX, y: y + size.height / 2 },
          { x: centerX, y: nextY - nextSize!.height / 2 },
        );
        this.addPlus(centerX, (y + nextY) / 2, {
          ...owner,
          index: index + 1,
          terminal: false,
        });
        y = nextY;
        continue;
      }
      const terminalY = y + size.height / 2 + 48;
      this.drawEdge(
        { x: centerX, y: y + size.height / 2 },
        { x: centerX, y: terminalY },
      );
      this.addPlus(centerX, terminalY, {
        ...owner,
        index: index + 1,
        terminal: true,
      });
      this.expandBounds(centerX, terminalY, { width: 44, height: 44 });
      return y + size.height / 2;
    }
    return y;
  }

  private addCard(
    node: MarketBuilderNode,
    x: number,
    y: number,
    names: readonly string[],
  ): void {
    const size = nodeSize(node);
    this.cards.push({
      node,
      names,
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height,
    });
    this.expandBounds(x, y, size);
  }

  private addPlus(x: number, y: number, target: BuilderInsertTarget): void {
    const root = new Container();
    root.position.set(x, y);
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new Rectangle(-22, -22, 44, 44);
    const circle = new Graphics()
      .circle(0, 0, 16)
      .fill(COLOR.night)
      .stroke({
        color: this.highlightAddControls ? COLOR.green : COLOR.gold,
        width: this.highlightAddControls ? 4 : 2,
      });
    const mark = new Graphics()
      .moveTo(-6, 0)
      .lineTo(6, 0)
      .moveTo(0, -6)
      .lineTo(0, 6)
      .stroke({ color: 0xf1e2ba, width: 2 });
    root.addChild(circle, mark);
    root.on("pointertap", (event: FederatedPointerEvent) => {
      if (this.moved) return;
      event.stopPropagation();
      this.onRequestInsert(target);
    });
    this.controls.addChild(root);
    this.expandBounds(x, y, { width: 44, height: 44 });
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
        width: 3,
      });
  }

  /** Visually contains a condition and both of its local execution lanes. */
  private drawConditionScope(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): void {
    const width = right - left;
    const height = Math.max(96, bottom - top);
    this.scopes
      .roundRect(left, top, width, height, 22)
      .fill({ color: 0x102640, alpha: 0.3 })
      .stroke({ color: COLOR.line, alpha: 0.82, width: 2 });
    const bounds = { minX: left, minY: top, maxX: right, maxY: top + height };
    this.scopeBounds.push(bounds);
    this.expandBounds((left + right) / 2, top + height / 2, { width, height });
  }

  private expandBounds(
    x: number,
    y: number,
    size: { width: number; height: number },
  ): void {
    this.bounds.minX = Math.min(this.bounds.minX, x - size.width / 2 - 48);
    this.bounds.maxX = Math.max(this.bounds.maxX, x + size.width / 2 + 48);
    this.bounds.minY = Math.min(this.bounds.minY, y - size.height / 2 - 48);
    this.bounds.maxY = Math.max(this.bounds.maxY, y + size.height / 2 + 48);
  }

  private reportLayout(): void {
    if (!this.ready) return;
    const transform = {
      x: this.world.x,
      y: this.world.y,
      scale: this.world.scale.x,
    };
    const key = [
      Math.round(transform.x),
      Math.round(transform.y),
      Math.round(transform.scale * 1000),
      ...this.cards.map(
        (card) => `${card.node.id}:${Math.round(card.x)}:${Math.round(card.y)}`,
      ),
    ].join("|");
    if (key === this.lastLayoutKey) return;
    this.lastLayoutKey = key;
    this.onLayout({ cards: this.cards, transform });
  }
}

export function MarketBuilderCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BuilderCanvasScene | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [layout, setLayout] = useState<BoardLayout>({
    cards: [],
    transform: { x: 0, y: 0, scale: 1 },
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BuilderCanvasScene();
    sceneRef.current = scene;
    scene.sync({ ...propsRef.current, onLayout: setLayout });
    void scene
      .init(host)
      .then(() => scene.sync({ ...propsRef.current, onLayout: setLayout }));
    return () => {
      sceneRef.current = null;
      scene.destroy();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync({ ...props, onLayout: setLayout });
  }, [props]);

  return (
    <div className="mk-builder-canvas-shell">
      <div
        ref={hostRef}
        className="mk-builder-canvas"
        role="application"
        aria-label="Contract graph. Drag the background to pan and use the mouse wheel to zoom."
      />
      <div
        className="mk-builder-form-layer"
        aria-hidden={layout.cards.length === 0}
      >
        <div
          className="mk-builder-form-world"
          style={{
            transform: `translate(${layout.transform.x}px, ${layout.transform.y}px) scale(${layout.transform.scale})`,
          }}
        >
          {layout.cards.map((card) => (
            <article
              className={`mk-canvas-node-card type-${card.node.kind}`}
              key={card.node.id}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
              }}
              aria-label={props.labels[card.node.kind]}
            >
              <header className="mk-canvas-node-header">
                <span className="mk-canvas-node-icon" aria-hidden="true">
                  {nodeGlyph(card.node.kind)}
                </span>
                <div>
                  <small>{props.labels.clause}</small>
                  <strong>{props.labels[card.node.kind]}</strong>
                </div>
              </header>
              {card.node.kind === "start" && (
                <p className="mk-canvas-start-detail">
                  {props.labels.startDetail}
                </p>
              )}
              {card.node.kind !== "start" &&
                props.renderNodeDetails(card.node, card.names)}
            </article>
          ))}
        </div>
      </div>
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
