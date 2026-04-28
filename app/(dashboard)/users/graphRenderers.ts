"use client";

import { buildNodeColorBuffer, buildNodeSizeBuffer, buildLinkBuffer, buildLinkColorBuffer } from "./cosmosUtils";

const DIMMED_USER_COLOR = "#9CA3AF";

export interface GraphRenderNode {
  kind: "user" | "project" | "role" | "module";
  id: string;
  color: string;
  radius?: number;
}

export interface GraphRenderView {
  x: number;
  y: number;
  scale: number;
}

export interface GraphVisibleBounds {
  minWX: number;
  maxWX: number;
  minWY: number;
  maxWY: number;
}

export interface GraphRenderFrame {
  nodes: readonly GraphRenderNode[];
  positions: Float32Array;
  nodeIndexMap: ReadonlyMap<string, number>;
  userIndices?: Uint32Array;
  links?: { sources: Int32Array; targets: Int32Array };
  selectedNodeId: string | null;
  selectedNodeIndex: number;
  highlightSet: ReadonlySet<number>;
  filterActive: boolean;
  isInteracting: boolean;
  view: GraphRenderView;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  backgroundColor: string;
}

export interface GraphDrawResult {
  needsContinuousRedraw: boolean;
}

export interface GraphRenderer {
  readonly backend: "canvas2d" | "cosmos";
  draw(frame: GraphRenderFrame): GraphDrawResult;
  destroy(): void;
}

function createCircleSprite(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const diameter = size * 2;
  canvas.width = diameter;
  canvas.height = diameter;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size, size, size, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function getUserIndices(nodes: readonly GraphRenderNode[], supplied: Uint32Array | undefined): Uint32Array {
  if (supplied) return supplied;
  return new Uint32Array(nodes.map((_, index) => index));
}

export function getVisibleWorldBounds(
  view: GraphRenderView,
  cssWidth: number,
  cssHeight: number,
  padWorld = 0,
): GraphVisibleBounds {
  return {
    minWX: view.x - (cssWidth / 2) / view.scale - padWorld,
    maxWX: view.x + (cssWidth / 2) / view.scale + padWorld,
    minWY: view.y - (cssHeight / 2) / view.scale - padWorld,
    maxWY: view.y + (cssHeight / 2) / view.scale + padWorld,
  };
}

export class CanvasGraphRenderer implements GraphRenderer {
  readonly backend = "canvas2d" as const;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly spriteCache = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(frame: GraphRenderFrame): GraphDrawResult {
    const dpr = Math.min(frame.devicePixelRatio || 1, 2);
    const wantWidth = Math.max(1, Math.floor(frame.cssWidth * dpr));
    const wantHeight = Math.max(1, Math.floor(frame.cssHeight * dpr));
    if (this.canvas.width !== wantWidth || this.canvas.height !== wantHeight) {
      this.canvas.width = wantWidth;
      this.canvas.height = wantHeight;
    }

    const ctx = this.ctx;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = frame.backgroundColor;
    ctx.fillRect(0, 0, frame.cssWidth, frame.cssHeight);

    if (!frame.nodes.length || !frame.positions.length) {
      return { needsContinuousRedraw: false };
    }

    const view = frame.view;
    ctx.translate(frame.cssWidth / 2, frame.cssHeight / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.x, -view.y);

    const bounds = getVisibleWorldBounds(view, frame.cssWidth, frame.cssHeight, 50 / view.scale);

    // Draw connection edges — very subtle halftone style
    if (frame.links && frame.links.sources.length > 0 && frame.positions.length > 0) {
      const { sources, targets } = frame.links;
      ctx.globalAlpha = frame.isInteracting ? 0.04 : 0.07;
      ctx.strokeStyle = "#9CA3AF";
      ctx.lineWidth = 0.7 / view.scale;
      ctx.beginPath();
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const t = targets[i];
        const sx = frame.positions[s * 2];
        const sy = frame.positions[s * 2 + 1];
        const tx = frame.positions[t * 2];
        const ty = frame.positions[t * 2 + 1];
        if (
          sx < bounds.minWX && tx < bounds.minWX ||
          sx > bounds.maxWX && tx > bounds.maxWX ||
          sy < bounds.minWY && ty < bounds.minWY ||
          sy > bounds.maxWY && ty > bounds.maxWY
        ) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const hasSelection = frame.selectedNodeIndex >= 0;
    const dimBatches = new Map<string, [number, number][]>();
    const brightBatches = new Map<string, [number, number][]>();
    const userIndices = getUserIndices(frame.nodes, frame.userIndices);

    for (let offset = 0; offset < userIndices.length; offset++) {
      const index = userIndices[offset];
      const node = frame.nodes[index];
      const nx = frame.positions[index * 2];
      const ny = frame.positions[index * 2 + 1];
      if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
      if (node.id === frame.selectedNodeId) continue;

      const target = hasSelection && !frame.highlightSet.has(index) ? dimBatches : brightBatches;
      const list = target.get(node.color) ?? [];
      list.push([nx, ny]);
      target.set(node.color, list);
    }

    const normalRadius = 3 / view.scale;
    const brightRadius = 4.5 / view.scale;
    if (hasSelection) {
      ctx.globalAlpha = 0.10;
      const dimSprite = this.getSprite(DIMMED_USER_COLOR);
      const diameter = normalRadius * 2;
      for (const coords of dimBatches.values()) {
        for (const [nx, ny] of coords) {
          ctx.drawImage(dimSprite, nx - normalRadius, ny - normalRadius, diameter, diameter);
        }
      }
    }

    ctx.globalAlpha = hasSelection ? 1 : 0.78;
    const userRadius = hasSelection ? brightRadius : normalRadius;
    const userDiameter = userRadius * 2;
    for (const [color, coords] of brightBatches) {
      const sprite = this.getSprite(color);
      for (const [nx, ny] of coords) {
        ctx.drawImage(sprite, nx - userRadius, ny - userRadius, userDiameter, userDiameter);
      }
    }

    if (frame.selectedNodeIndex >= 0) {
      const sx = frame.positions[frame.selectedNodeIndex * 2];
      const sy = frame.positions[frame.selectedNodeIndex * 2 + 1];
      const color = frame.nodes[frame.selectedNodeIndex].color;
      const selectedRadius = 9 / view.scale;

      ctx.globalAlpha = 0.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    return { needsContinuousRedraw: false };
  }

  destroy(): void {
    this.spriteCache.clear();
  }

  private getSprite(color: string): HTMLCanvasElement {
    const cached = this.spriteCache.get(color);
    if (cached) return cached;
    const sprite = createCircleSprite(color, 8);
    this.spriteCache.set(color, sprite);
    return sprite;
  }
}

export class CosmosGraphRenderer implements GraphRenderer {
  readonly backend = "cosmos" as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph: any;  // Graph instance from @cosmos.gl/graph — typed as any to avoid static import
  private lastNodeCount = 0;
  private lastLinkCount = 0;
  private nodeConnections: Float32Array | null = null;
  onNodeSelectCallback: ((index: number | null) => void) | null = null;

  private constructor(graph: unknown) {
    // Use private constructor — instances are created via CosmosGraphRenderer.create()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph = graph as any;
  }

  /**
   * Async factory — mirrors the existing WebGpuGraphRenderer.create() pattern.
   * Detects WebGL2 first, then dynamically imports @cosmos.gl/graph to avoid SSR issues.
   * The container element MUST be in the DOM (even if opacity-0) before calling.
   */
  static async create(
    container: HTMLElement,
    onContextLost?: (reason: string) => void,
  ): Promise<{ renderer: CosmosGraphRenderer | null; failureReason?: string }> {
    // WebGL2 check — give the caller a failureReason without importing the heavy cosmos package
    if (typeof document !== "undefined") {
      try {
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2")) {
          return { renderer: null, failureReason: "WebGL2 is not supported in this browser" };
        }
      } catch {
        return { renderer: null, failureReason: "WebGL2 detection failed" };
      }
    }

    try {
      // Dynamic import prevents Next.js server-side module resolution from touching WebGL APIs
      const { Graph } = await import("@cosmos.gl/graph");

      const renderer = new CosmosGraphRenderer(null);

      const graph = new Graph(container as HTMLDivElement, {
        enableSimulation: true,
        fitViewOnInit: false,        // AccUsersGraph controls zoom/pan externally
        backgroundColor: "#F8F7F4", // GRAPH_BACKGROUND — matches AccUsersGraph constant
        spaceSize: 65536,            // large space prevents visible square border at zoom-out
        pointDefaultColor: [0.612, 0.639, 0.686, 1.0] as [number, number, number, number],
        pointDefaultSize: 4,
        linkDefaultColor: [0.612, 0.639, 0.686, 0.25] as [number, number, number, number],
        linkDefaultWidth: 1,
        linkDefaultArrows: false,
        simulationRepulsion: 1.0,   // matches DEFAULT_PHYSICS_CONFIG — overridden in draw()
        simulationLinkSpring: 0.6,
        simulationGravity: 0.05,    // low gravity = organic spread, not ring
        simulationFriction: 0.85,
        simulationDecay: 10000,     // slow decay = longer settling = more natural spread
        // v3 click callbacks — wire selection so clicks behave same as Canvas 2D
        onPointClick: (index: number, _pos: [number, number], _event: MouseEvent) => {
          renderer.selectNode(index);
          renderer.onNodeSelectCallback?.(index);
        },
        onBackgroundClick: (_event: MouseEvent) => {
          renderer.selectNode(null);
          renderer.onNodeSelectCallback?.(null);
        },
      });

      renderer.graph = graph;

      // v3: call start() then render() on init (render() alone no longer restarts simulation)
      await graph.ready;
      graph.start();
      graph.render();

      // Forward context loss events to caller so it can fall back to Canvas 2D
      void onContextLost; // parameter reserved for future use

      return { renderer };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { renderer: null, failureReason: `CosmosGraphRenderer initialization failed: ${message}` };
    }
  }

  /**
   * Select a node by index (or clear selection with null).
   * Uses v3 selectPointByIndex API with adjacent point highlighting.
   * Called by onPointClick / onBackgroundClick callbacks and by AccUsersGraph.tsx.
   */
  selectNode(index: number | null): void {
    if (!this.graph) return;
    if (index === null) {
      this.graph.unselectPoints();
    } else {
      // selectAdjacentPoints=true highlights connected nodes — matches Canvas 2D highlightSet behavior
      this.graph.selectPointByIndex(index, true);
    }
  }

  // Scale factor: organic layout outputs [0,1] normalized; Cosmos space is 4096 centered at 0.
  // Mapping: cosmosCoord = (normalizedCoord - 0.5) * COSMOS_SPACE_SCALE
  private static readonly COSMOS_SPACE_SCALE = 2000;

  /**
   * Scale a [0,1]-normalized positions Float32Array to Cosmos simulation space.
   * Cosmos default spaceSize is 4096 (centered at 0). Our organic layout outputs [0.05, 0.95].
   * Without scaling, all nodes land within a 1×1 sub-pixel region near origin — blank white canvas.
   */
  private scalePositionsForCosmos(src: Float32Array): Float32Array {
    const out = new Float32Array(src.length);
    const scale = CosmosGraphRenderer.COSMOS_SPACE_SCALE;
    for (let i = 0; i < src.length; i++) {
      out[i] = (src[i] - 0.5) * scale;
    }
    return out;
  }

  /**
   * Push data into Cosmos GPU buffers.
   * Only re-uploads when node count or link count changes — avoids VRAM churn at 60fps.
   * Cosmos manages its own render loop; we do NOT need to call render() every frame.
   * Uses static imports from cosmosUtils (no dynamic imports needed — cosmosUtils has no WebGL deps).
   */
  draw(frame: GraphRenderFrame): GraphDrawResult {
    if (!this.graph) return { needsContinuousRedraw: false };

    const nodeCount = frame.nodes.length;
    const linkCount = frame.links?.sources.length ?? 0;
    const isFirstLoad = this.lastNodeCount === 0 && nodeCount > 0;

    if (nodeCount !== this.lastNodeCount) {
      // Rebuild node connections for size scaling
      const connections = new Float32Array(nodeCount);
      if (frame.links) {
        for (let i = 0; i < frame.links.sources.length; i++) {
          const s = frame.links.sources[i];
          const t = frame.links.targets[i];
          if (s >= 0 && s < nodeCount) connections[s]++;
          if (t >= 0 && t < nodeCount) connections[t]++;
        }
      }
      this.nodeConnections = connections;

      // Positions come from the organic layout in [0,1] normalized space.
      // Must be scaled to Cosmos simulation coordinates before upload.
      this.graph.setPointPositions(this.scalePositionsForCosmos(frame.positions));
      this.graph.setPointColors(buildNodeColorBuffer(frame.nodes));
      if (typeof this.graph.setPointSizes === "function") {
        this.graph.setPointSizes(buildNodeSizeBuffer(nodeCount, this.nodeConnections));
      }
      this.lastNodeCount = nodeCount;
    }

    if (frame.links && linkCount !== this.lastLinkCount) {
      this.graph.setLinks(buildLinkBuffer(frame.links));
      this.graph.setLinkColors(buildLinkColorBuffer(linkCount));
      this.lastLinkCount = linkCount;
    }

    if (isFirstLoad) {
      // Re-trigger Cosmos render loop after pushing data — the loop may have idled
      // after initializing with an empty scene. render() acts as a wake-up call.
      this.graph.render();
      this.graph.fitView(600);
    }

    // Cosmos owns its render loop — no continuous redraw needed from our RAF
    return { needsContinuousRedraw: false };
  }

  /**
   * Live physics update from slider values.
   * Uses setConfigPartial (NOT setConfig) to avoid resetting ALL physics values.
   * Per RESEARCH.md Pitfall 2: setConfig resets everything; setConfigPartial is incremental.
   */
  setPhysicsConfig(partial: {
    repulsion?: number;
    linkSpring?: number;
    gravity?: number;
  }): void {
    if (!this.graph) return;
    // Scale slider values to Cosmos simulation ranges for organic spread equivalent to Canvas 2D.
    // repulsion 0–2 → simulationRepulsion 0–3 (Cosmos needs higher values for equivalent spread)
    // linkSpring 0–2 → simulationLinkSpring 0–1 (softer than raw value for organic feel)
    // gravity 0–0.5 → simulationGravity 0–0.15 (keep very low so nodes breathe freely)
    this.graph.setConfigPartial({
      ...(partial.repulsion !== undefined && { simulationRepulsion: partial.repulsion * 1.5 }),
      ...(partial.linkSpring !== undefined && { simulationLinkSpring: partial.linkSpring * 0.5 }),
      ...(partial.gravity !== undefined && { simulationGravity: partial.gravity * 0.3 }),
    });
  }

  destroy(): void {
    this.graph?.destroy?.();
    this.graph = null;
    this.onNodeSelectCallback = null;
    this.nodeConnections = null;
    this.lastNodeCount = 0;
    this.lastLinkCount = 0;
  }
}
