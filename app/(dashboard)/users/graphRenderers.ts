"use client";

import {
  buildNodeColorBuffer,
  buildNodeHighlightColorBuffer,
  buildNodeSizeBuffer,
  buildLinkBuffer,
  buildLinkColorBuffer,
} from "./cosmosUtils";

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
  /**
   * Indices of nodes that share the selected node's user identity (e.g. same email).
   * Both renderers paint these with the selected node's color so duplicate-user
   * instances are visually linked across projects/roles.
   */
  sameUserHighlightSet: ReadonlySet<number>;
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
    const selectedColor = hasSelection ? frame.nodes[frame.selectedNodeIndex].color : null;
    const dimBatches = new Map<string, [number, number][]>();
    const brightBatches = new Map<string, [number, number][]>();
    const sameUserCoords: [number, number][] = [];
    const userIndices = getUserIndices(frame.nodes, frame.userIndices);

    for (let offset = 0; offset < userIndices.length; offset++) {
      const index = userIndices[offset];
      const node = frame.nodes[index];
      const nx = frame.positions[index * 2];
      const ny = frame.positions[index * 2 + 1];
      if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
      if (node.id === frame.selectedNodeId) continue;

      // Same-user instances paint with the selected node's color, separately so they
      // stay bright on top of the dim layer.
      if (frame.sameUserHighlightSet.has(index)) {
        sameUserCoords.push([nx, ny]);
        continue;
      }

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

    // Paint same-user peers last so they stay on top, all in the selected node's color.
    if (hasSelection && selectedColor && sameUserCoords.length > 0) {
      const sprite = this.getSprite(selectedColor);
      for (const [nx, ny] of sameUserCoords) {
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

export interface SimulationConfig {
  simulationRepulsion?: number;
  simulationLinkSpring?: number;
  simulationLinkDistance?: number;
  simulationCluster?: number;
  simulationGravity?: number;
  simulationFriction?: number;
  simulationDecay?: number;
  simulationCenter?: number;
}

export interface CosmosCreateOptions {
  /**
   * When true, Cosmos owns positions via its native GPU force-directed simulation.
   * When false (default), positions are fed externally (d3-force worker → setPointPositions).
   */
  usePhysics?: boolean;
}

const DEFAULT_SIMULATION_CONFIG: Required<SimulationConfig> = {
  simulationRepulsion: 0.5,
  simulationLinkSpring: 1.0,
  simulationLinkDistance: 8,
  simulationCluster: 0,
  simulationGravity: 0.05,
  simulationFriction: 0.85,
  simulationDecay: 1000,
  simulationCenter: 0,
};

export class CosmosGraphRenderer implements GraphRenderer {
  readonly backend = "cosmos" as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph: any;  // Graph instance from @cosmos.gl/graph — typed as any to avoid static import
  private usePhysics = false;
  private lastNodeCount = 0;
  private lastLinkCount = 0;
  private lastPositions: Float32Array | null = null;
  private nodeConnections: Float32Array | null = null;
  private lastLinkUploadAt = 0;
  private gpuRendererString: string | null = null;
  // Cached base color buffer — rebuilt on node-count change, reused while only
  // selection state changes so setPointColors during clicks does not re-hex-parse.
  private baseColorBuffer: Float32Array | null = null;
  private lastSameUserSet: ReadonlySet<number> | null = null;
  private lastSelectedIndex = -1;
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
    options?: CosmosCreateOptions,
  ): Promise<{ renderer: CosmosGraphRenderer | null; failureReason?: string }> {
    const usePhysics = options?.usePhysics === true;
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

      // Force the dedicated GPU on dual-GPU systems (laptops with Intel iGPU + NVIDIA dGPU).
      // Cosmos hardcodes its luma.gl device creation and does not expose powerPreference,
      // so we patch HTMLCanvasElement.prototype.getContext to inject the hint, then restore it.
      // The hint is purely advisory — Windows graphics settings + Chrome's GPU policy still apply.
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(this: HTMLCanvasElement, contextId: string, attrs?: any) {
        if (contextId === "webgl2" || contextId === "webgl" || contextId === "experimental-webgl") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (originalGetContext as any).call(this, contextId, { ...(attrs ?? {}), powerPreference: "high-performance" });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (originalGetContext as any).call(this, contextId, attrs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const renderer = new CosmosGraphRenderer(null);
      renderer.usePhysics = usePhysics;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseConfig: any = {
        // GPU-physics path (TD-005): Cosmos owns positions via its native force-directed sim.
        // Worker-physics path (default): d3-force worker drives positions, Cosmos is a pure GPU renderer.
        enableSimulation: usePhysics,
        rescalePositions: !usePhysics, // physics path lets Cosmos manage its space; non-physics keeps our coords
        fitViewOnInit: false,
        backgroundColor: "#F8F7F4",
        spaceSize: 4096,
        pointDefaultColor: [0.612, 0.639, 0.686, 1.0] as [number, number, number, number],
        pointDefaultSize: 4,
        linkDefaultColor: [0.612, 0.639, 0.686, 0.25] as [number, number, number, number],
        linkDefaultWidth: 1,
        linkDefaultArrows: false,
        onPointClick: (index: number, _pos: [number, number], _event: MouseEvent) => {
          renderer.selectNode(index);
          renderer.onNodeSelectCallback?.(index);
        },
        onBackgroundClick: (_event: MouseEvent) => {
          renderer.selectNode(null);
          renderer.onNodeSelectCallback?.(null);
        },
      };

      if (usePhysics) {
        // Default simulation params — sliders override via setSimulationConfig().
        Object.assign(baseConfig, DEFAULT_SIMULATION_CONFIG);
        // Cosmos native drag — neighbors react to the simulation, no worker round-trip.
        baseConfig.enableDrag = true;
        baseConfig.onDragStart = () => {
          // Re-heat so neighbors visibly react during the drag.
          try { renderer.graph?.start?.(0.3); } catch { /* ignore */ }
        };
        baseConfig.onDragEnd = () => {
          // Settle gently after release.
          try { renderer.graph?.start?.(0.05); } catch { /* ignore */ }
        };
      }

      const graph = new Graph(container as HTMLDivElement, baseConfig);

      renderer.graph = graph;

      try {
        // TD-002 hardening: Cosmos's luma.gl device may be created lazily inside
        // `await graph.ready` AND/OR on the first `graph.render()`. Keep the
        // powerPreference patch active across the full init+ready+first-render path
        // so any WebGL2 context creation hits our patched getContext.
        await graph.ready;
        // Remove zoom-out floor — Cosmos hardcodes [1e-3, ∞]; override to near-zero for infinite zoom out
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (graph as any).zoomInstance?.behavior?.scaleExtent([1e-10, Infinity]);
        graph.render();
      } finally {
        // Restore original getContext so the high-performance hint only applies to Cosmos canvases.
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }

      // Capture GPU vendor/renderer strings via WEBGL_debug_renderer_info for the perf HUD.
      try {
        const canvasEl = container.querySelector("canvas");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gl = (canvasEl?.getContext("webgl2") ?? canvasEl?.getContext("webgl")) as any;
        if (gl) {
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          if (ext) {
            const vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? "");
            const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "");
            renderer.gpuRendererString = `${vendor} / ${rendererStr}`.trim();
          }
        }
      } catch { /* HUD-only; failure to read is non-fatal */ }

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
   * Simulation is disabled — d3-force worker drives positions. We re-upload positions whenever
   * the worker produces a new Float32Array (reference change), and re-upload buffers on count changes.
   */
  draw(frame: GraphRenderFrame): GraphDrawResult {
    if (!this.graph) return { needsContinuousRedraw: false };

    const nodeCount = frame.nodes.length;
    const linkCount = frame.links?.sources.length ?? 0;
    const isFirstLoad = this.lastNodeCount === 0 && nodeCount > 0;
    const positionsChanged = frame.positions !== this.lastPositions;
    let needsRender = false;

    if (nodeCount !== this.lastNodeCount) {
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
      // Cache the base (per-node) color buffer once; selection-state highlights are
      // applied as overlays without re-hex-parsing — see same-user highlight below.
      this.baseColorBuffer = buildNodeColorBuffer(frame.nodes);
      this.graph.setPointColors(this.baseColorBuffer);
      if (typeof this.graph.setPointSizes === "function") {
        this.graph.setPointSizes(buildNodeSizeBuffer(nodeCount, this.nodeConnections));
      }
      this.lastNodeCount = nodeCount;
      // Force highlight recomputation against fresh base buffer.
      this.lastSameUserSet = null;
      this.lastSelectedIndex = -1;
      needsRender = true;
    }

    // GPU-physics path: Cosmos owns positions after the optional initial seed.
    // Skip the per-frame position feed so we don't fight the simulation.
    if (positionsChanged && nodeCount > 0 && !this.usePhysics) {
      this.graph.setPointPositions(this.scalePositionsForCosmos(frame.positions));
      this.lastPositions = frame.positions;
      needsRender = true;
    } else if (positionsChanged) {
      // Track latest reference even when we don't upload — avoids spurious re-uploads
      // on the same frame and keeps lastPositions in sync for the link-edge throttle.
      this.lastPositions = frame.positions;
    }

    if (frame.links && linkCount !== this.lastLinkCount) {
      this.graph.setLinks(buildLinkBuffer(frame.links));
      this.graph.setLinkColors(buildLinkColorBuffer(linkCount));
      this.lastLinkCount = linkCount;
      this.lastLinkUploadAt = Date.now();
      needsRender = true;
    } else if (
      // Edge-render-during-drag fix: Cosmos retains stale link spatial structure
      // when only node positions change. Re-upload the link buffer on every interactive
      // frame so endpoints reference the current frame's positions. Throttled to ~30Hz
      // to avoid GPU upload churn at 60fps.
      frame.links &&
      linkCount > 0 &&
      positionsChanged &&
      frame.isInteracting &&
      Date.now() - this.lastLinkUploadAt >= 33
    ) {
      this.graph.setLinks(buildLinkBuffer(frame.links));
      this.lastLinkUploadAt = Date.now();
      needsRender = true;
    }

    // Same-user highlight: when selection or same-user set changes, rebuild the
    // per-node color buffer from the cached baseColorBuffer and re-upload. When
    // there is no selection, restore base colors.
    const selectionChanged = frame.selectedNodeIndex !== this.lastSelectedIndex;
    const sameUserSetChanged = frame.sameUserHighlightSet !== this.lastSameUserSet;
    if ((selectionChanged || sameUserSetChanged) && this.baseColorBuffer && nodeCount > 0) {
      if (frame.selectedNodeIndex < 0 || frame.sameUserHighlightSet.size === 0) {
        // Restore base colors — pass a copy so Cosmos retains a stable buffer.
        this.graph.setPointColors(new Float32Array(this.baseColorBuffer));
      } else {
        const selectedColor = frame.nodes[frame.selectedNodeIndex]?.color ?? null;
        const buf = buildNodeHighlightColorBuffer(
          frame.nodes,
          this.baseColorBuffer,
          frame.sameUserHighlightSet,
          selectedColor,
        );
        this.graph.setPointColors(buf);
      }
      this.lastSelectedIndex = frame.selectedNodeIndex;
      this.lastSameUserSet = frame.sameUserHighlightSet;
      needsRender = true;
    }

    // Cosmos auto-paints per simulation tick when enableSimulation:true.
    // When simulation is off, every state change must pair with an explicit render().
    if (needsRender && !this.usePhysics) {
      this.graph.render();
    }

    if (isFirstLoad && !this.usePhysics) {
      // Physics mode: positions don't exist yet — defer fit until sim cools (handled by caller).
      this.graph.fitView(600);
    }

    return { needsContinuousRedraw: false };
  }

  /** GPU renderer string captured via WEBGL_debug_renderer_info (or null on failure). */
  getGpuRendererString(): string | null {
    return this.gpuRendererString;
  }

  // Worker-physics path: no-op (handlePhysicsChange routes values to the worker).
  // GPU-physics path: see setSimulationConfig below.
  setPhysicsConfig(_partial: { repulsion?: number; linkSpring?: number; gravity?: number }): void {
    // no-op
  }

  /** True when this renderer was created with usePhysics:true. */
  isUsingPhysics(): boolean {
    return this.usePhysics;
  }

  /**
   * Update one or more Cosmos simulation parameters and re-warm the simulation
   * so changes are visibly applied. No-op when not in GPU-physics mode.
   */
  setSimulationConfig(partial: Partial<SimulationConfig>): void {
    if (!this.graph || !this.usePhysics) return;
    try {
      // Cosmos v3 prefers setConfig (full) over setConfigPartial; both accept partials in practice.
      if (typeof this.graph.setConfig === "function") {
        this.graph.setConfig(partial);
      } else if (typeof this.graph.setConfigPartial === "function") {
        this.graph.setConfigPartial(partial);
      }
      // Re-warm so neighbors visibly react to the slider scrub.
      this.graph.start?.(0.3);
    } catch { /* defensive: never let a bad config crash the renderer */ }
  }

  /** Current simulation alpha (1=hot, 0=cool). Returns 0 when not in physics mode. */
  getSimulationAlpha(): number {
    if (!this.graph || !this.usePhysics) return 0;
    const value = (this.graph as { progress?: number }).progress;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  /** True iff Cosmos is currently ticking the simulation. */
  isSimulationRunning(): boolean {
    if (!this.graph || !this.usePhysics) return false;
    return (this.graph as { isSimulationRunning?: boolean }).isSimulationRunning === true;
  }

  /**
   * Seed initial positions before the first start(). After this call, draw()
   * leaves position management to Cosmos's simulation. No-op outside physics mode
   * — the non-physics path already feeds positions through draw().
   */
  setInitialPositions(positions: Float32Array): void {
    if (!this.graph || !this.usePhysics) return;
    try {
      this.graph.setPointPositions(this.scalePositionsForCosmos(positions));
    } catch { /* ignore — Cosmos falls back to random initial layout */ }
  }

  /**
   * Proxy for Cosmos's setPointClusters. Each entry is a cluster id (or undefined
   * for unclustered nodes). Cluster pull strength is controlled separately via
   * simulationCluster in setSimulationConfig.
   */
  setPointClusters(clusterIds: (number | undefined)[]): void {
    if (!this.graph) return;
    try { this.graph.setPointClusters?.(clusterIds); } catch { /* ignore */ }
  }

  /** Proxy for Cosmos's setClusterPositions ([x0,y0,x1,y1,...] with undefined slots allowed). */
  setClusterPositions(positions: (number | undefined)[]): void {
    if (!this.graph) return;
    try { this.graph.setClusterPositions?.(positions); } catch { /* ignore */ }
  }

  destroy(): void {
    this.graph?.destroy?.();
    this.graph = null;
    this.onNodeSelectCallback = null;
    this.nodeConnections = null;
    this.lastPositions = null;
    this.lastNodeCount = 0;
    this.lastLinkCount = 0;
    this.lastLinkUploadAt = 0;
    this.gpuRendererString = null;
    this.baseColorBuffer = null;
    this.lastSameUserSet = null;
    this.lastSelectedIndex = -1;
    this.usePhysics = false;
  }
}
