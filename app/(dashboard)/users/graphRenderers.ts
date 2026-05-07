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
  /** Display label drawn by the Canvas2D late-zoom label pass (UI-01). Omit to skip. */
  label?: string;
  /** Connection count — used as priority key for the 200-cap collision pass. */
  degree?: number;
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
  /**
   * Late-zoom label fade band (UI-01). Opacity is 0 below labelFadeStartScale,
   * lerps to 1 at labelFadeEndScale. When either is undefined, the Canvas2D
   * label pass is skipped (back-compat).
   */
  labelFadeStartScale?: number;
  labelFadeEndScale?: number;
  /**
   * Indices that always render their label regardless of zoom (hover/select).
   * Override labels bypass the 200-cap and collision check, but their AABBs
   * still occupy space so subsequent normal labels respect them.
   */
  labelOverrideIndices?: ReadonlySet<number>;
  /**
   * Cosmos-only fade band, expressed in Cosmos zoom-level units (1.0 ≈ fit).
   * Read by CosmosGraphRenderer.drawLabelOverlay; ignored by CanvasGraphRenderer.
   * `frame.view.scale` is the Canvas2D zoom and is not meaningful for the GPU
   * backend, so the Cosmos overlay needs its own band.
   */
  cosmosLabelFadeStartZoom?: number;
  cosmosLabelFadeEndZoom?: number;
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
      // Build a set of visible indices so edge endpoints can be tested efficiently.
      // frame.userIndices reflects the filtered visible set (set by rebuildVisibleIndices).
      const visibleSet = frame.userIndices
        ? new Set(frame.userIndices)
        : null;
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const t = targets[i];
        // Skip edges where either endpoint has been filtered out (hidden by filter, not in visibleSet).
        if (visibleSet && (!visibleSet.has(s) || !visibleSet.has(t))) continue;
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

    // ---------------------------------------------------------------
    // Late-zoom label pass (UI-01)
    // ---------------------------------------------------------------
    // Runs in screen space (resetTransform + dpr scale) so labels are
    // rendered at fixed pixel size regardless of world zoom. Guarded by
    // labelFadeStartScale/EndScale on the frame; back-compat: if either
    // is missing, the entire pass is skipped.
    const fadeStart = frame.labelFadeStartScale;
    const fadeEnd = frame.labelFadeEndScale;
    const overrideIndices = frame.labelOverrideIndices;
    if (fadeStart != null && fadeEnd != null && fadeEnd > fadeStart) {
      const rawOpacity = (view.scale - fadeStart) / (fadeEnd - fadeStart);
      const opacity = rawOpacity < 0 ? 0 : rawOpacity > 1 ? 1 : rawOpacity;
      const hasOverrides = overrideIndices && overrideIndices.size > 0;

      if (opacity > 0 || hasOverrides) {
        // Reset to screen space — labels at fixed pixel size.
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#111827";

        // Build candidate list: nodes with labels that are on-screen.
        // Same world→screen formula as hitTest in AccUsersGraph:
        //   sx = cssWidth/2 + (wx - view.x) * view.scale
        //   sy = cssHeight/2 + (wy - view.y) * view.scale
        const halfW = frame.cssWidth / 2;
        const halfH = frame.cssHeight / 2;
        const margin = 50;

        type Candidate = {
          index: number;
          sx: number;
          sy: number;
          label: string;
          degree: number;
          override: boolean;
        };

        const overrideCandidates: Candidate[] = [];
        const normalCandidates: Candidate[] = [];

        for (let i = 0; i < frame.nodes.length; i++) {
          const n = frame.nodes[i];
          const label = n.label;
          if (!label) continue;
          const wx = frame.positions[i * 2];
          const wy = frame.positions[i * 2 + 1];
          const sx = halfW + (wx - view.x) * view.scale;
          const sy = halfH + (wy - view.y) * view.scale;
          if (
            sx < -margin || sx > frame.cssWidth + margin ||
            sy < -margin || sy > frame.cssHeight + margin
          ) continue;

          const isOverride = overrideIndices ? overrideIndices.has(i) : false;
          const cand: Candidate = {
            index: i,
            sx,
            sy,
            label,
            degree: n.degree ?? 0,
            override: isOverride,
          };
          if (isOverride) overrideCandidates.push(cand);
          else if (opacity > 0) normalCandidates.push(cand);
        }

        // Priority sort: highest degree first.
        normalCandidates.sort((a, b) => b.degree - a.degree);

        // Hard cap of 200 labels total. Override labels are guaranteed slots
        // and count toward the cap.
        const MAX_LABELS = 200;
        const drawnAabbs: Array<[number, number, number, number]> = [];
        let drawnCount = 0;

        const aabbsOverlap = (
          a: [number, number, number, number],
          b: [number, number, number, number],
        ): boolean => {
          // [x, y, w, h] — x/y is top-left; rectangles overlap iff projections
          // overlap on both axes.
          return !(
            a[0] + a[2] <= b[0] ||
            b[0] + b[2] <= a[0] ||
            a[1] + a[3] <= b[1] ||
            b[1] + b[3] <= a[1]
          );
        };

        // Draw override labels first — full opacity, bypass collision check
        // but still register their AABBs so normal labels avoid them.
        ctx.globalAlpha = 1;
        for (const c of overrideCandidates) {
          if (drawnCount >= MAX_LABELS) break;
          const textWidth = ctx.measureText(c.label).width + 4;
          const aabb: [number, number, number, number] = [
            c.sx - textWidth / 2,
            c.sy - 18,
            textWidth,
            14,
          ];
          ctx.fillText(c.label, c.sx, c.sy - 8);
          drawnAabbs.push(aabb);
          drawnCount++;
        }

        // Draw normal labels with fade opacity, skipping collisions.
        if (opacity > 0 && drawnCount < MAX_LABELS) {
          ctx.globalAlpha = opacity;
          for (const c of normalCandidates) {
            if (drawnCount >= MAX_LABELS) break;
            const textWidth = ctx.measureText(c.label).width + 4;
            const aabb: [number, number, number, number] = [
              c.sx - textWidth / 2,
              c.sy - 18,
              textWidth,
              14,
            ];
            let collides = false;
            for (let j = 0; j < drawnAabbs.length; j++) {
              if (aabbsOverlap(aabb, drawnAabbs[j])) {
                collides = true;
                break;
              }
            }
            if (collides) continue;
            ctx.fillText(c.label, c.sx, c.sy - 8);
            drawnAabbs.push(aabb);
            drawnCount++;
          }
        }

        ctx.globalAlpha = 1;
      }
    }

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
  // Defaults applied on init only — controlsToSimulationConfig overrides
  // repulsion/linkSpring/linkDistance/cluster/gravity from the live sliders
  // immediately after Cosmos finishes init (see AccUsersGraph cosmos.then).
  simulationRepulsion: 0.5,
  simulationLinkSpring: 0.4,
  simulationLinkDistance: 12,
  simulationCluster: 0,
  simulationGravity: 0.15,
  simulationFriction: 0.85,
  simulationDecay: 1000,
  // TD-006: center force keeps hub nodes from escaping to the spaceSize wall.
  // Slider config (controlsToSimulationConfig) raises this further at runtime.
  simulationCenter: 0.4,
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
  // Cached visible set: used by setVisibleIndices to avoid redundant size-buffer rebuilds.
  private lastVisibleSet: ReadonlySet<number> | null = null;
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
        // 16384 is the typical WebGL2 MAX_TEXTURE_SIZE on modern GPUs; Cosmos
        // auto-clamps to the device limit (see Store.adjustSpaceSize). At 25k+
        // nodes the previous 4096 caused a visible boundary clamp — nodes
        // bunched against the edges instead of fanning into the canvas. The
        // larger space combined with the higher repulsion ceiling in
        // controlsToSimulationConfig (sep=100 → repulsion 5.0, linkDistance 80)
        // gives the separation slider room to actually spread the layout.
        spaceSize: usePhysics ? 16384 : 4096,
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
          // Re-heat so neighbors visibly react during the drag. start()+render()
          // pairing is required because once alpha cools below ALPHA_MIN the
          // sim flag flips to false and render() alone won't resume forces.
          try { renderer.graph?.start?.(0.3); } catch { /* ignore */ }
          try { renderer.graph?.render?.(0.3); } catch { /* ignore */ }
        };
        baseConfig.onDragEnd = () => {
          // Reheat strongly so the released node is pulled back toward its
          // physics equilibrium by surrounding repulsion + link springs,
          // rather than sitting wherever it was dropped.
          try { renderer.graph?.start?.(1.0); } catch { /* ignore */ }
          try { renderer.graph?.render?.(1.0); } catch { /* ignore */ }
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

  // Scale factor: organic layout outputs [0,1] normalized; Cosmos space is now
  // 16384 in physics mode (was 4096). Seed positions are scaled to span most of
  // the available space so the simulation starts from a reasonable spread
  // rather than crammed at origin.
  // Mapping: cosmosCoord = (normalizedCoord - 0.5) * COSMOS_SPACE_SCALE
  private static readonly COSMOS_SPACE_SCALE = 8000;

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
        // FILT-01: preserve current visibility filter when rebuilding size buffer
        // for new node count. Without this, the first draw() after data arrives
        // (lastNodeCount: 0 → N) clobbers any filter zeroes that setVisibleIndices
        // may have uploaded — and any subsequent node-count change does the same.
        const sizes = buildNodeSizeBuffer(nodeCount, this.nodeConnections);
        const visible = this.lastVisibleSet;
        const shapes = new Float32Array(nodeCount);
        if (visible) {
          for (let i = 0; i < nodeCount; i++) {
            if (!visible.has(i)) {
              sizes[i] = 0;
              shapes[i] = 8; // None — keep parity with setVisibleIndices
            }
          }
        }
        this.graph.setPointSizes(sizes);
        if (visible && typeof this.graph.setPointShapes === "function") {
          this.graph.setPointShapes(shapes);
        }
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
      // GPU-physics path: links arrived after the simulation already started
      // (or with zero springs the alpha already collapsed). Re-warm so the
      // force-directed layout actually has springs to act on this frame.
      // CRITICAL: use render(1.0), NOT start(1.0). cosmos.gl v3's start() only
      // sets store.isSimulationRunning + store.alpha — it does NOT call
      // startFrames(). The rAF loop dies after the initial empty-data render()
      // (alpha=0 → end() → stopFrames). Only render(alpha) re-spins the loop.
      // Without this, the simulation has hot alpha but no frames execute → grey canvas.
      if (this.usePhysics && linkCount > 0) {
        // CRITICAL: pair start(alpha) + render(alpha). render() alone won't
        // resume forces after a previous end() flipped isSimulationRunning
        // to false. See setSimulationConfig comment for the full rationale.
        try { this.graph.start?.(1.0); } catch { /* ignore */ }
        try { this.graph.render?.(1.0); } catch { /* ignore */ }
      }
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

    // Every data change must pair with render() — cosmos.gl v3's render() is
    // what calls startFrames()/runs the rAF loop. start() alone does not.
    // In physics mode we still want the loop running so the simulation can tick
    // (this also covers the case where points/colors/sizes upload but no link
    // arrival happens to trigger the render(1.0) re-warm above).
    if (needsRender) {
      this.graph.render();
    }

    if (isFirstLoad && !this.usePhysics) {
      // Physics mode: positions don't exist yet — defer fit until sim cools (handled by caller).
      this.graph.fitView(600);
    } else if (isFirstLoad && this.usePhysics) {
      // Physics mode: nodes were just seeded but Cosmos's space is huge (4096).
      // Schedule a fitView shortly after first frame so the user sees the graph
      // even if the simulation is still cooling. Without this, ±1000-unit seed
      // positions land outside the default camera frustum (grey canvas).
      try { this.graph.fitView?.(800); } catch { /* ignore */ }
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
   * Project a Cosmos space-coordinate to screen pixels (relative to the canvas
   * top-left). Returns null if Cosmos isn't ready or the call fails. Used by
   * 02-04 lasso polygon-select to test nodes against a screen-space polygon
   * without having to mirror Cosmos's internal camera math (the Canvas2D
   * `view.current` does NOT track Cosmos's camera).
   */
  spaceToScreen(spaceX: number, spaceY: number): [number, number] | null {
    if (!this.graph) return null;
    try {
      const out = (this.graph as { spaceToScreenPosition?: (p: [number, number]) => [number, number] })
        .spaceToScreenPosition?.([spaceX, spaceY]);
      if (!out || !Number.isFinite(out[0]) || !Number.isFinite(out[1])) return null;
      return out;
    } catch {
      return null;
    }
  }

  /**
   * UI-01 (gap closure 03-04): Screen-space label pass for the Cosmos backend.
   *
   * Mirrors the Canvas2D label pass in CanvasGraphRenderer.draw() (fade band,
   * AABB collision skip, override indices, 200-cap, degree-priority sort), but
   * projects world→screen via Cosmos's spaceToScreenPosition rather than the
   * Canvas2D `halfW + (wx - view.x) * view.scale` formula, and reads the zoom
   * level via the public `Graph.getZoomLevel()` API so the fade band lives in
   * Cosmos zoom-level units (1.0 ≈ fit).
   *
   * The overlay's backing store is sized lazily here (matches the canvas2d
   * pattern at lines 135-142 of CanvasGraphRenderer.draw — there is no JSX-side
   * resize block for canvas2d, and there isn't one for the overlay either).
   *
   * Caller (AccUsersGraph rAF tick) is expected to gate this on
   * `renderer instanceof CosmosGraphRenderer` so the canvas2d path is unaffected.
   */
  drawLabelOverlay(ctx: CanvasRenderingContext2D, frame: GraphRenderFrame, dpr: number): void {
    // Lazy-resize the backing store to cssWidth*dpr × cssHeight*dpr. Matches
    // CanvasGraphRenderer.draw() lines 135-142.
    const canvas = ctx.canvas;
    const wantWidth = Math.max(1, Math.floor(frame.cssWidth * dpr));
    const wantHeight = Math.max(1, Math.floor(frame.cssHeight * dpr));
    if (canvas.width !== wantWidth || canvas.height !== wantHeight) {
      canvas.width = wantWidth;
      canvas.height = wantHeight;
    }

    // Fade band: prefer Cosmos zoom-level band; fall back to Canvas2D scale
    // band only as a degraded last resort (units differ — approximation).
    const fadeStart = frame.cosmosLabelFadeStartZoom ?? frame.labelFadeStartScale;
    const fadeEnd = frame.cosmosLabelFadeEndZoom ?? frame.labelFadeEndScale;
    const overrideIndices = frame.labelOverrideIndices;

    // Always paint a clean transparent canvas at frame start.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.cssWidth, frame.cssHeight);

    if (fadeStart == null || fadeEnd == null || fadeEnd <= fadeStart) return;
    if (!this.graph) return;

    // Public API verified in node_modules/@cosmos.gl/graph/dist/index.d.ts:343
    let cosmosZoom = 1;
    try {
      const z = (this.graph as { getZoomLevel?: () => number }).getZoomLevel?.();
      if (typeof z === "number" && Number.isFinite(z)) cosmosZoom = z;
    } catch {
      // If the call throws (older Cosmos build), we already have cosmosZoom=1
      // which falls below typical fadeStart bands → no normal labels render,
      // overrides still draw. Acceptable degradation.
    }

    const rawOpacity = (cosmosZoom - fadeStart) / (fadeEnd - fadeStart);
    // Isolated view: when a node is selected, suppress the zoom-band
    // cloud labels entirely so only the selection + same-user overrides
    // remain visible. AccUsersGraph adds sameUserHighlightSet to overrides.
    const isIsolated = frame.selectedNodeIndex >= 0;
    const opacity = isIsolated
      ? 0
      : rawOpacity < 0 ? 0 : rawOpacity > 1 ? 1 : rawOpacity;
    const hasOverrides = !!overrideIndices && overrideIndices.size > 0;

    if (opacity <= 0 && !hasOverrides) return;

    // Halo style: bold text with a soft white stroke. The stroke is wide
    // enough to lift labels off any background color (light cluster fills,
    // dark hub centers, etc.) without adding chrome. Hover/selected labels
    // get a heavier weight + thicker halo in the override pass below.
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    // Zoom-relative font scaling: keep labels readable at any zoom level.
    // Linear in cosmosZoom (Cosmos's own zoom-level units; 1.0 ≈ fit).
    // Floor=1 keeps current sizes at fit-zoom; ceiling=2.4 prevents giant
    // labels at extreme zoom-in. Stroke + y-offset + AABB scale together
    // so the visual ratio (text:halo:offset) stays constant.
    const zoomScale = Math.max(1, Math.min(2.4, cosmosZoom * 0.7));

    const margin = 50;
    type Candidate = {
      index: number;
      sx: number;
      sy: number;
      label: string;
      degree: number;
      override: boolean;
    };
    const overrideCandidates: Candidate[] = [];
    const normalCandidates: Candidate[] = [];

    // In GPU-physics mode Cosmos moves points on the GPU and never writes them
    // back to posRef.current (the Canvas2D position buffer). frame.positions
    // therefore holds only the initial seed coordinates — projecting them via
    // spaceToScreenPosition produces nonsensical screen positions and labels
    // render off-screen. Use the live positions from getPointPositionsArray()
    // when available; fall back to frame.positions only for worker-physics mode
    // (where posRef IS the live buffer).
    const livePositions = this.getPointPositionsArray();
    const positions = livePositions ?? frame.positions;

    for (let i = 0; i < frame.nodes.length; i++) {
      const n = frame.nodes[i];
      const label = n.label;
      if (!label) continue;
      const wx = positions[i * 2];
      const wy = positions[i * 2 + 1];
      const screen = this.spaceToScreen(wx, wy);
      if (!screen) continue;
      const sx = screen[0];
      const sy = screen[1];
      if (
        sx < -margin || sx > frame.cssWidth + margin ||
        sy < -margin || sy > frame.cssHeight + margin
      ) continue;
      const isOverride = overrideIndices ? overrideIndices.has(i) : false;
      const cand: Candidate = {
        index: i,
        sx,
        sy,
        label,
        degree: n.degree ?? 0,
        override: isOverride,
      };
      if (isOverride) overrideCandidates.push(cand);
      else if (opacity > 0) normalCandidates.push(cand);
    }

    normalCandidates.sort((a, b) => b.degree - a.degree);

    const MAX_LABELS = 200;
    const drawnAabbs: Array<[number, number, number, number]> = [];
    let drawnCount = 0;
    const aabbsOverlap = (
      a: [number, number, number, number],
      b: [number, number, number, number],
    ): boolean =>
      !(
        a[0] + a[2] <= b[0] ||
        b[0] + b[2] <= a[0] ||
        a[1] + a[3] <= b[1] ||
        b[1] + b[3] <= a[1]
      );

    // Override labels: full opacity, bypass collision, but register AABBs.
    // Heavier weight + thicker halo — these are the labels the user
    // explicitly asked for (hover, selection).
    const overrideFontPx = Math.round(13 * zoomScale);
    const overrideOffsetY = Math.round(10 * zoomScale);
    const overrideAabbY = Math.round(22 * zoomScale);
    const overrideAabbH = Math.round(17 * zoomScale);
    ctx.globalAlpha = 1;
    ctx.font = `700 ${overrideFontPx}px ui-sans-serif, system-ui, sans-serif`;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillStyle = "#0f172a";
    ctx.lineWidth = Math.max(3, 4 * zoomScale * 0.6);
    for (const c of overrideCandidates) {
      if (drawnCount >= MAX_LABELS) break;
      const textWidth = ctx.measureText(c.label).width + 6;
      const aabb: [number, number, number, number] = [
        c.sx - textWidth / 2,
        c.sy - overrideAabbY,
        textWidth,
        overrideAabbH,
      ];
      ctx.strokeText(c.label, c.sx, c.sy - overrideOffsetY);
      ctx.fillText(c.label, c.sx, c.sy - overrideOffsetY);
      drawnAabbs.push(aabb);
      drawnCount++;
    }

    if (opacity > 0 && drawnCount < MAX_LABELS) {
      const normalFontPx = Math.round(12 * zoomScale);
      const normalOffsetY = Math.round(9 * zoomScale);
      const normalAabbY = Math.round(20 * zoomScale);
      const normalAabbH = Math.round(16 * zoomScale);
      ctx.globalAlpha = opacity;
      ctx.font = `600 ${normalFontPx}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = Math.max(2.5, 3 * zoomScale * 0.6);
      for (const c of normalCandidates) {
        if (drawnCount >= MAX_LABELS) break;
        const textWidth = ctx.measureText(c.label).width + 6;
        const aabb: [number, number, number, number] = [
          c.sx - textWidth / 2,
          c.sy - normalAabbY,
          textWidth,
          normalAabbH,
        ];
        let collides = false;
        for (let j = 0; j < drawnAabbs.length; j++) {
          if (aabbsOverlap(aabb, drawnAabbs[j])) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
        ctx.strokeText(c.label, c.sx, c.sy - normalOffsetY);
        ctx.fillText(c.label, c.sx, c.sy - normalOffsetY);
        drawnAabbs.push(aabb);
        drawnCount++;
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Returns the current GPU-side point positions in Cosmos space (flat
   * [x0,y0,x1,y1,...]). Returns null if Cosmos isn't ready. Used by 02-04
   * lasso polygon-select — the React-side `posRef.current` is only the seed,
   * the GPU has since moved the points.
   */
  getPointPositionsArray(): number[] | null {
    if (!this.graph) return null;
    try {
      const arr = (this.graph as { getPointPositions?: () => number[] }).getPointPositions?.();
      return arr ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Update one or more Cosmos simulation parameters and re-warm the simulation
   * so changes are visibly applied. No-op when not in GPU-physics mode.
   */
  setSimulationConfig(partial: Partial<SimulationConfig>): void {
    if (!this.graph || !this.usePhysics) return;
    try {
      // CRITICAL: must use setConfigPartial, NOT setConfig.
      // Per cosmos.gl v3 source (dist/index.js:5780): setConfig(t) calls
      // `ze(this.config)` first which resets the FULL config object to defaults
      // before merging the provided keys. That wipes our baseConfig values:
      //   - enableDrag → false (drag stops working)
      //   - onPointClick / onBackgroundClick → undefined (pick stops working)
      //   - onDragStart / onDragEnd → undefined (drag re-warm stops)
      //   - onPointMouseOver / onPointMouseOut → undefined (hover label stops)
      // setConfigPartial (dist/index.js:5793) does a true partial merge that
      // preserves all untouched keys. AccUsersGraph calls setSimulationConfig
      // on init AND on every slider change, so a destructive setConfig wipes
      // interaction wiring within milliseconds of Cosmos becoming usable.
      if (typeof this.graph.setConfigPartial === "function") {
        this.graph.setConfigPartial(partial);
      } else if (typeof this.graph.setConfig === "function") {
        // Fallback only — older builds that don't expose setConfigPartial.
        this.graph.setConfig(partial);
      }
      // Re-warm so neighbors visibly react to the slider scrub.
      // CRITICAL: pair start(alpha) + render(alpha).
      //   - start(alpha): sets store.isSimulationRunning=true and store.alpha
      //     (dist/index.js:6396-6398). Required because Cosmos's frame() loop
      //     calls end() (line 6609-6611) once alpha decays below ALPHA_MIN,
      //     which sets isSimulationRunning=false. After that, every
      //     runSimulationStep call early-exits via the `(t || n && !zoom)`
      //     gate at line 6557 — forces are never recomputed even if alpha is
      //     bumped by a subsequent render(alpha).
      //   - render(alpha): calls update(alpha) then startFrames(). update()
      //     does NOT touch isSimulationRunning (line 6537-6539), so render()
      //     alone is insufficient to re-arm the simulation after end().
      // Both are required: start() flips the run flag, render() spins the loop
      // so the running flag gets observed by per-frame force passes.
      this.graph.start?.(0.3);
      this.graph.render?.(0.3);
    } catch {
      /* swallow — partial config rejected by graph; next applyer will retry */
    }
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
    if (!this.graph || !this.usePhysics) {
      return;
    }
    try {
      this.graph.setPointPositions(this.scalePositionsForCosmos(positions));
    } catch {
      /* swallow — initial seed rejected by graph */
    }
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

  /**
   * Hide nodes excluded by the active filter set via zero-size points.
   *
   * Cosmos.gl has no per-node visibility flag; the supported pattern is to set
   * a node's point size to 0 (zero pixel → invisible, no hit-test). Included
   * nodes get degree-based sizes matching the existing buildNodeSizeBuffer logic.
   *
   * Per RESEARCH.md Pitfall 5: zero-size points still participate in physics.
   * This is accepted — the CONTEXT.md notes that "physics simulation reflows"
   * on filter change so hidden-node physics residue is tolerable.
   *
   * Cache: when the same Set reference is passed again (filter unchanged) the
   * method returns early to avoid redundant GPU uploads during steady-state
   * slider/HUD redraws.
   */
  setVisibleIndices(visibleSet: ReadonlySet<number>): void {
    if (!this.graph) {
      // Renderer not ready yet — still record the latest set so that when the
      // next nodeCount-change branch runs in draw() it preserves the filter
      // (see FILT-01 fix in draw()).
      this.lastVisibleSet = visibleSet;
      return;
    }
    // FILT-01: content-aware identity cache. Reference equality alone can leak a
    // stale Set across renderer re-init scenarios; compare size + membership instead.
    const prev = this.lastVisibleSet;
    if (
      prev &&
      prev.size === visibleSet.size &&
      [...visibleSet].every((i) => prev.has(i))
    ) {
      return;
    }
    this.lastVisibleSet = visibleSet;

    const nodeCount = this.lastNodeCount;
    if (nodeCount === 0) return;

    const connections = this.nodeConnections;
    // Match buildNodeSizeBuffer's degree-scaled sizing for visible nodes so the
    // un-filtered ones keep their original look — earlier this path used a
    // smaller 3/4/6 ladder which made every visible node appear "thinner"
    // when a filter was applied, even though it was supposed to be a no-op
    // for them.
    const sizes = buildNodeSizeBuffer(nodeCount, connections);
    // Belt-and-suspenders hide: size=0 AND shape=8 (None). Cosmos's setPointSizes
    // alone is fragile because cosmos.gl drops the input buffer when its length
    // ever drifts from internal pointsNumber (dist/index.js updatePointSize fallback),
    // restoring the default size and making hidden nodes reappear "thinner" rather
    // than vanishing. setPointShapes with shape=8 is a separate kill switch in the
    // shape decoder — fragments are never emitted regardless of size.
    const shapes = new Float32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      if (!visibleSet.has(i)) {
        sizes[i] = 0;
        shapes[i] = 8; // None
      } else {
        shapes[i] = 0; // Circle (default)
      }
    }

    try {
      if (typeof this.graph.setPointSizes === "function") {
        this.graph.setPointSizes(sizes);
      }
      if (typeof this.graph.setPointShapes === "function") {
        this.graph.setPointShapes(shapes);
      }
      this.graph.render?.();
    } catch {
      /* swallow — non-fatal if Cosmos rejects the upload */
    }
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
    this.lastVisibleSet = null;
    this.usePhysics = false;
  }
}
