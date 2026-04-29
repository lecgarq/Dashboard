"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { moduleLabel } from "@/lib/acc/modules";
import type { AccGraphNode } from "@/lib/acc/graphSnapshot";
import {
  CanvasGraphRenderer,
  CosmosGraphRenderer,
  type GraphRenderFrame,
  type GraphRenderer,
} from "./graphRenderers";
import { isWebGL2Available } from "./cosmosUtils";
import { toast } from "sonner";
import { type BulkAccUser } from "./AccAnalysisPanel";
import {
  buildAccTopologyGraph,
  computeCentroid,
  computeTopologySeedPositions,
  DEFAULT_GRAPH_CONTROLS,
  DEFAULT_PHYSICS_CONFIG,
  type GraphControlSettings,
  type PhysicsConfig,
} from "./accGraphOrganicLayout";

interface UserNode extends PhysicsNode {
  kind: "user";
  email: string;
  name: string;
  projectId?: string;
  projectName?: string;
  found: boolean;
  hasNoProjects: boolean;
  isAdmin: boolean;
  projectCount: number;
  roles: string[];
  modules: string[];
  color: string;
  lastAddedBucket: string;
  individualAccess: boolean;
}

type SimNode = UserNode;

interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SidePanelState {
  node: SimNode;
}

interface SpatialGrid {
  size: number;
  cells: Map<string, number[]>;
}

interface GraphFilters {
  roles: string[];
  lastAddedBuckets: string[];
  adminAccess: "all" | "admin" | "non-admin";
  modules: string[];
}

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

type OrganicWorkerMessage =
  | {
      type: "tick";
      session: number;
      positions: Float32Array;
      averageVelocity: number;
      linkCount: number;
      tickDurationMs?: number;
      diagnostics?: { activeNodeCount: number; hiddenNodeCount: number };
    }
  | { type: "links"; session: number; sources: Int32Array; targets: Int32Array };

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

const GRAPH_BACKGROUND = "#F8F7F4";
const DEFAULT_FILTERS: GraphFilters = { roles: [], lastAddedBuckets: [], adminAccess: "all", modules: [] };
const IS_DEV = process.env.NODE_ENV !== "production";

const COSMOS_PHYSICS_DEFAULTS = { repulsion: 1.0, linkSpring: 1.0, gravity: 0.25 };
const COSMOS_PHYSICS_KEY = "acc-graph-physics";

function buildGrid(pos: Float32Array, indices: Uint32Array, cellSize: number): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let offset = 0; offset < indices.length; offset++) {
    const i = indices[offset];
    const key = `${Math.floor(pos[i * 2] / cellSize)},${Math.floor(pos[i * 2 + 1] / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(i);
  }
  return { size: cellSize, cells };
}

function getOrderedNodeIds(nodes: readonly SimNode[]): string[] {
  return nodes.map((node) => node.id);
}

function orderedNodeIdsMatch(cachedIds: readonly string[] | null | undefined, nodes: readonly SimNode[]): boolean {
  if (!cachedIds || cachedIds.length !== nodes.length) return false;
  for (let i = 0; i < nodes.length; i++) {
    if (cachedIds[i] !== nodes[i].id) return false;
  }
  return true;
}

function graphNodeToSimNode(node: AccGraphNode): SimNode {
  return {
    kind: "user",
    id: node.id,
    email: node.email,
    name: node.name,
    projectId: node.projectId,
    projectName: node.projectName,
    found: true,
    hasNoProjects: false,
    isAdmin: node.isAdmin,
    projectCount: 1,
    roles: node.roles,
    modules: node.modules,
    lastAddedBucket: node.lastAddedBucket,
    individualAccess: node.individualAccess,
    color: node.color,
    x: node.x,
    y: node.y,
    vx: node.vx,
    vy: node.vy,
  };
}

function getViewportSize(container: HTMLDivElement | null): { width: number; height: number } {
  return {
    width: container?.clientWidth || 900,
    height: container?.clientHeight || 600,
  };
}

/**
 * Build highlight sets relative to a selected node index.
 *  - adjacent: indices that should remain "bright" (the selected node itself).
 *  - sameUser: indices of OTHER nodes representing the same person (matched on email,
 *    falling back to id when email is unavailable). Used by both renderers to repaint
 *    duplicate-user instances with the selected node's color.
 */
function buildHighlightSet(
  selectedIndex: number,
  nodes: readonly SimNode[],
): { adjacent: Set<number>; sameUser: Set<number> } {
  const adjacent = new Set<number>();
  const sameUser = new Set<number>();
  if (selectedIndex < 0 || selectedIndex >= nodes.length) {
    return { adjacent, sameUser };
  }
  adjacent.add(selectedIndex);
  const selected = nodes[selectedIndex];
  // Match on email when available (the canonical "same person" key in ACC data).
  // Fall back to id-equality for nodes that lack an email field.
  const key = selected.email || selected.id;
  if (!key) return { adjacent, sameUser };
  for (let i = 0; i < nodes.length; i++) {
    if (i === selectedIndex) continue;
    const candidate = nodes[i];
    const candidateKey = candidate.email || candidate.id;
    if (candidateKey === key) sameUser.add(i);
  }
  return { adjacent, sameUser };
}

function nodeMatchesFilters(node: SimNode, filters: GraphFilters): boolean {
  if (filters.roles.length > 0 && !node.roles.some((role) => filters.roles.includes(role))) return false;
  if (filters.lastAddedBuckets.length > 0 && !filters.lastAddedBuckets.includes(node.lastAddedBucket || "Unknown")) return false;
  if (filters.adminAccess === "admin" && !node.isAdmin) return false;
  if (filters.adminAccess === "non-admin" && node.isAdmin) return false;
  if (filters.modules.length > 0 && !node.modules.some((m) => filters.modules.includes(m))) return false;
  return true;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function loadSavedView(): { x: number; y: number; scale: number } {
  if (typeof window === "undefined") return { x: 0.5, y: 0.5, scale: 600 };
  try {
    const raw = localStorage.getItem("acc-graph-view");
    if (!raw) return { x: 0.5, y: 0.5, scale: 600 };
    const parsed = JSON.parse(raw) as { x: number; y: number; scale: number };
    if (
      typeof parsed.x === "number" && isFinite(parsed.x) &&
      typeof parsed.y === "number" && isFinite(parsed.y) &&
      typeof parsed.scale === "number" && isFinite(parsed.scale) && parsed.scale > 0
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { x: 0.5, y: 0.5, scale: 600 };
}

function readPrecomputedPositions(raw: unknown, expectedLength: number): Float32Array | null {
  if (!Array.isArray(raw) || raw.length !== expectedLength) return null;
  const positions = new Float32Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) {
    const value = raw[i];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    positions[i] = value;
  }
  return positions;
}

export function AccUsersGraph({ users, onSelectUser }: AccUsersGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const cosmosContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const canvasRendererRef = useRef<CanvasGraphRenderer | null>(null);
  const cosmosRendererRef = useRef<CosmosGraphRenderer | null>(null);
  const activeRendererRef = useRef<GraphRenderer | null>(null);

  const organicWorkerRef = useRef<Worker | null>(null);
  const layoutSessionRef = useRef(0);
  const nodesRef = useRef<SimNode[]>([]);
  const seedPosRef = useRef<Float32Array>(new Float32Array(0));
  const posRef = useRef<Float32Array>(new Float32Array(0));
  const gridRef = useRef<SpatialGrid>({ size: 0.05, cells: new Map() });
  const nodeIndexMapRef = useRef(new Map<string, number>());
  const instIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const visibleNodeIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const visibleIndexSetRef = useRef<Set<number>>(new Set());
  const centroidRef = useRef({ x: 0.5, y: 0.5 });
  const needsRenderRef = useRef(true);
  const filtersRef = useRef<GraphFilters>(DEFAULT_FILTERS);
  const hasActiveFiltersRef = useRef(false);
  const graphControlsRef = useRef<GraphControlSettings>(DEFAULT_GRAPH_CONTROLS);

  const view = useRef(loadSavedView());
  const targetView = useRef(loadSavedView());
  const isDragging = useRef(false);
  const saveViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });
  const selectedNodeRef = useRef<SidePanelState | null>(null);
  const isRefreshingRef = useRef(false);
  const lastAutoFitHashRef = useRef<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("acc-graph-data-hash") : null
  );
  const lastMetricUpdateAtRef = useRef(0);
  const forceRenderUntilRef = useRef(0);

  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [positionCacheCorrupt, setPositionCacheCorrupt] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("acc-graph-cache-corrupt") === "true";
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [renderBackend, setRenderBackend] = useState<"canvas2d" | "cosmos">(() =>
    isWebGL2Available() ? "cosmos" : "canvas2d"
  );

  const [rendererFailureReason, setRendererFailureReason] = useState<string | null>(null);

  // Physics slider state — load from localStorage with defaults
  const [cosmosPhysics, setCosmosPhysics] = useState<PhysicsConfig>(() => {
    try {
      const raw = localStorage.getItem(COSMOS_PHYSICS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PhysicsConfig;
        if (
          typeof parsed.repulsion === "number" && isFinite(parsed.repulsion) &&
          typeof parsed.linkSpring === "number" && isFinite(parsed.linkSpring) &&
          typeof parsed.gravity === "number" && isFinite(parsed.gravity)
        ) return parsed;
      }
    } catch { /* ignore */ }
    return { ...COSMOS_PHYSICS_DEFAULTS };
  });
  // Stable ref so worker init message always sees the latest physics values
  const cosmosPhysicsRef = useRef<PhysicsConfig>(cosmosPhysics);

  // GPU renderer state
  const [isCosmosLoading, setIsCosmosLoading] = useState(false);
  const [graphControls, setGraphControls] = useState<GraphControlSettings>(DEFAULT_GRAPH_CONTROLS);
  const [pickMode, setPickMode] = useState(false);
  const pickModeRef = useRef(false);
  const isDraggingNodeRef = useRef(false);
  const draggedNodeIdxRef = useRef(-1);
  const linksRef = useRef<{ sources: Int32Array; targets: Int32Array }>({
    sources: new Int32Array(0),
    targets: new Int32Array(0),
  });
  const [motionMetric, setMotionMetric] = useState({ averageVelocity: 0, linkCount: 0 });
  const [layoutDiagnostics, setLayoutDiagnostics] = useState({
    lastWorkerTick: 0,
    activeNodeCount: 0,
    hiddenNodeCount: 0,
  });
  const [filters, setFilters] = useState<GraphFilters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    try {
      const raw = localStorage.getItem("acc-graph-filters");
      if (!raw) return DEFAULT_FILTERS;
      const parsed = JSON.parse(raw) as GraphFilters;
      if (
        Array.isArray(parsed.roles) &&
        Array.isArray(parsed.lastAddedBuckets) &&
        Array.isArray(parsed.modules) &&
        ["all", "admin", "non-admin"].includes(parsed.adminAccess)
      ) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_FILTERS;
  });
  const [visibleCount, setVisibleCount] = useState(0);
  const [showControls, setShowControls] = useState(false);

  // Perf HUD — visible only in dev or when ?perf=1 is in the URL. Diagnostic-only.
  const [perfHudEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (IS_DEV) return true;
    try { return new URLSearchParams(window.location.search).has("perf"); }
    catch { return false; }
  });
  const [perfFps, setPerfFps] = useState(0);
  const [perfTickMs, setPerfTickMs] = useState(0);
  const [perfLinkCount, setPerfLinkCount] = useState(0);
  const [perfGpu, setPerfGpu] = useState<string | null>(null);
  const perfFrameTimesRef = useRef<number[]>([]);
  const perfLastTickMsRef = useRef(0);

  const graphQuery = trpc.users.getPrecomputedGraph.useQuery(undefined, {
    enabled: users.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const rebuildGraph = trpc.users.rebuildAccGraphCache.useMutation();

  const markGraphDirty = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  const saveView = useCallback(() => {
    if (saveViewTimer.current) clearTimeout(saveViewTimer.current);
    saveViewTimer.current = setTimeout(() => {
      localStorage.setItem("acc-graph-view", JSON.stringify(view.current));
    }, 300);
  }, []);

  const rebuildGrid = useCallback(() => {
    const cellSize = Math.max(0.005, 60 / view.current.scale);
    gridRef.current = buildGrid(posRef.current, visibleNodeIdxRef.current, cellSize);
  }, []);

  const postVisibilityToWorker = useCallback(() => {
    const worker = organicWorkerRef.current;
    if (!worker) return;
    const visibleIndices = new Uint32Array(visibleNodeIdxRef.current);
    worker.postMessage(
      { type: "visibility", session: layoutSessionRef.current, visibleIndices },
      [visibleIndices.buffer],
    );
  }, []);

  const restartOrganicLayout = useCallback((mode: "restart" | "reflow" = "restart") => {
    const worker = organicWorkerRef.current;
    const nodes = nodesRef.current;
    if (!worker || !nodes.length) return;

    const seeds = computeTopologySeedPositions(nodes);
    if (mode === "reflow" || posRef.current.length !== seeds.length) {
      posRef.current = new Float32Array(seeds);
    }
    seedPosRef.current = new Float32Array(posRef.current);
    centroidRef.current = computeCentroid(seedPosRef.current);
    layoutSessionRef.current++;

    const visibleIndices = new Uint32Array(visibleNodeIdxRef.current);
    const topology = buildAccTopologyGraph(nodes);
    const positionsForWorker = new Float32Array(posRef.current);

    // Build cluster IDs from each user's primary role.
    // Cluster slider in worker pulls nodes with the same id toward a shared centroid.
    const clusterIds = new Int32Array(nodes.length);
    const roleToCluster = new Map<string, number>();
    let nextCluster = 0;
    for (let i = 0; i < nodes.length; i++) {
      const role = nodes[i].roles?.[0] ?? "";
      if (!role) { clusterIds[i] = -1; continue; }
      let cid = roleToCluster.get(role);
      if (cid === undefined) { cid = nextCluster++; roleToCluster.set(role, cid); }
      clusterIds[i] = cid;
    }

    worker.postMessage(
      {
        type: "init",
        session: layoutSessionRef.current,
        nodeIds: getOrderedNodeIds(nodes),
        positions: positionsForWorker,
        hiddenNodes: topology.hiddenNodes,
        topologyLinks: topology.links,
        visibleIndices,
        clusterIds,
        controls: graphControlsRef.current,
        physics: cosmosPhysicsRef.current,
        paused: false,
      },
      [positionsForWorker.buffer, visibleIndices.buffer, clusterIds.buffer],
    );

    rebuildGrid();
    markGraphDirty();
  }, [markGraphDirty, rebuildGrid]);

  const rebuildVisibleIndices = useCallback(() => {
    const nodes = nodesRef.current;
    const filters = filtersRef.current;
    const userIndices: number[] = [];
    const visibleIndices: number[] = [];
    const visibleSet = new Set<number>();
    for (let i = 0; i < nodes.length; i++) {
      if (nodeMatchesFilters(nodes[i], filters)) {
        userIndices.push(i);
        visibleIndices.push(i);
        visibleSet.add(i);
      }
    }

    instIdxRef.current = new Uint32Array(userIndices);
    visibleNodeIdxRef.current = new Uint32Array(visibleIndices);
    visibleIndexSetRef.current = visibleSet;
    setVisibleCount(userIndices.length);

    const selectedId = selectedNodeRef.current?.node.id;
    const selectedIndex = selectedId ? (nodeIndexMapRef.current.get(selectedId) ?? -1) : -1;
    if (selectedIndex >= 0 && !visibleSet.has(selectedIndex)) {
      selectedNodeRef.current = null;
      setSelectedNode(null);
      if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      setHoveredNode(null);
    }

    rebuildGrid();
    postVisibilityToWorker();
    markGraphDirty();
  }, [markGraphDirty, rebuildGrid, postVisibilityToWorker]);

  const scheduleGraphControlUpdate = useCallback((key: keyof GraphControlSettings, value: number) => {
    const nextControls = { ...graphControlsRef.current, [key]: value };
    graphControlsRef.current = nextControls;
    setGraphControls(nextControls);
    organicWorkerRef.current?.postMessage({ type: "controls", controls: nextControls });
    forceRenderUntilRef.current = performance.now() + 1200;
    markGraphDirty();
  }, [markGraphDirty]);

  const togglePickMode = useCallback(() => {
    const next = !pickModeRef.current;
    pickModeRef.current = next;
    setPickMode(next);
    // Release any in-progress node drag when toggling off
    if (!next && isDraggingNodeRef.current) {
      const idx = draggedNodeIdxRef.current;
      isDraggingNodeRef.current = false;
      draggedNodeIdxRef.current = -1;
      if (idx >= 0) organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
    }
  }, []);

  const handlePhysicsChange = useCallback((key: keyof PhysicsConfig, value: number) => {
    setCosmosPhysics(prev => {
      const next = { ...prev, [key]: value };
      cosmosPhysicsRef.current = next;
      // Apply to whichever renderer is active — both receive the same values
      cosmosRendererRef.current?.setPhysicsConfig(next);
      organicWorkerRef.current?.postMessage({ type: "physics", physics: next });
      return next;
    });
  }, []);

  const zoomToFit = useCallback((options?: { immediate?: boolean }) => {
    if (!posRef.current.length) return;

    const visibleIndices = visibleNodeIdxRef.current;
    const positions = posRef.current;
    if (!visibleIndices.length) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let offset = 0; offset < visibleIndices.length; offset++) {
      const i = visibleIndices[offset];
      const nx = positions[i * 2];
      const ny = positions[i * 2 + 1];
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }

    if (minX === Infinity) return;

    const { width, height } = getViewportSize(containerRef.current);
    const graphWidth = maxX - minX || 0.01;
    const graphHeight = maxY - minY || 0.01;
    const fitScale = Math.min(width / graphWidth, height / graphHeight) * 0.80;
    const nextView = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: Math.max(0.01, Math.min(500000, fitScale)),
    };
    targetView.current = nextView;
    if (options?.immediate) {
      view.current = { ...nextView };
    }
    markGraphDirty();
  }, [markGraphDirty]);

  const hitTest = useCallback((sx: number, sy: number): SimNode | null => {
    if (!posRef.current.length) return null;

    const { width, height } = getViewportSize(containerRef.current);
    const v = view.current;
    const wx = v.x + (sx - width / 2) / v.scale;
    const wy = v.y + (sy - height / 2) / v.scale;
    const grid = gridRef.current;
    if (!grid.cells.size) return null;

    const nodes = nodesRef.current;
    const positions = posRef.current;
    const gx = Math.floor(wx / grid.size);
    const gy = Math.floor(wy / grid.size);
    let bestDist = 15 / v.scale;
    let bestIndex = -1;

    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cell = grid.cells.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;
        for (const index of cell) {
          const dx = positions[index * 2] - wx;
          const dy = positions[index * 2 + 1] - wy;
          const dist = Math.hypot(dx, dy);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        }
      }
    }

    return bestIndex >= 0 ? nodes[bestIndex] : null;
  }, []);

  useEffect(() => {
    const canvas2d = canvas2dRef.current;
    const cosmosContainer = cosmosContainerRef.current;
    if (!canvas2d || !cosmosContainer) return;

    let disposed = false;
    const canvasRenderer = new CanvasGraphRenderer(canvas2d);
    canvasRendererRef.current = canvasRenderer;

    const fallBackToCanvas = (_reason: string) => {
      if (disposed) return;
      cosmosRendererRef.current?.destroy();
      cosmosRendererRef.current = null;
      activeRendererRef.current = canvasRendererRef.current;
      setRenderBackend("canvas2d");
      setPerfGpu(null);
      setIsCosmosLoading(false);
      // Unpause d3-force worker when falling back
      organicWorkerRef.current?.postMessage({ type: "pause", paused: false });
      toast.error("GPU renderer lost — switched back to Canvas 2D", { duration: 4000 });
      markGraphDirty();
    };

    if (renderBackend === "cosmos") {
      // Capture current view-state before Cosmos takes over
      const savedView = view.current ? { ...view.current } : null;

      // Canvas 2D is active while Cosmos loads
      activeRendererRef.current = canvasRenderer;
      setIsCosmosLoading(true);

      void CosmosGraphRenderer.create(cosmosContainer, fallBackToCanvas).then(({ renderer }) => {
        if (disposed) { renderer?.destroy(); return; }
        if (!renderer) {
          setRenderBackend("canvas2d");
          setIsCosmosLoading(false);
          organicWorkerRef.current?.postMessage({ type: "pause", paused: false });
          markGraphDirty();
          return;
        }
        cosmosRendererRef.current = renderer;
        activeRendererRef.current = renderer;

        // Wire click selection to side panel
        renderer.onNodeSelectCallback = (index: number | null) => {
          if (index === null) {
            setSelectedNode(null);
            selectedNodeRef.current = null;
          } else {
            const node = nodesRef.current[index] ?? null;
            if (node) {
              const state: SidePanelState = { node };
              setSelectedNode(state);
              selectedNodeRef.current = state;
            }
          }
          markGraphDirty();
        };

        // Wire hover labels via Cosmos onPointMouseOver / onPointMouseOut
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cosmosGraph = (renderer as any).graph;
        if (cosmosGraph) {
          cosmosGraph.setConfigPartial({
            onPointMouseOver: (index: number, position: [number, number], _event: MouseEvent) => {
              const node = nodesRef.current[index];
              if (node && hoverLabelRef.current) {
                hoverLabelRef.current.textContent = node.name || node.email || node.id;
                hoverLabelRef.current.style.left = `${position[0] + 12}px`;
                hoverLabelRef.current.style.top = `${position[1] - 8}px`;
                hoverLabelRef.current.style.display = "block";
              }
            },
            onPointMouseOut: () => {
              if (hoverLabelRef.current) {
                hoverLabelRef.current.style.display = "none";
              }
            },
          });
        }

        // Apply persisted physics config on init
        renderer.setPhysicsConfig(cosmosPhysics);

        // Restore view-state after Cosmos is ready
        if (savedView && cosmosGraph) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (cosmosGraph as any).zoom?.(savedView.scale, [savedView.x, savedView.y]);
          } catch { /* ignore — view restoration is best-effort */ }
        }

        setIsCosmosLoading(false);
        setRendererFailureReason(null);
        // Surface GPU vendor/renderer to the perf HUD. Captured during graph.ready
        // so the patched powerPreference path has already executed.
        setPerfGpu(renderer.getGpuRendererString());
        markGraphDirty();
      });
    } else {
      // Canvas 2D mode
      activeRendererRef.current = canvasRenderer;
      markGraphDirty();
    }

    return () => {
      disposed = true;
      // IMPORTANT: null activeRendererRef BEFORE calling destroy() so the RAF
      // loop's null-guard fires if a frame renders between cancelAnimationFrame
      // and destroy() completing.
      activeRendererRef.current = null;
      canvasRendererRef.current?.destroy();
      canvasRendererRef.current = null;
      cosmosRendererRef.current?.destroy();
      cosmosRendererRef.current = null;
      if (hoverLabelRef.current) hoverLabelRef.current.style.display = "none";
      // Always dismiss spinner on cleanup — prevents stuck spinner if Fast Refresh
      // fires while the dynamic import is in-flight (disposed=true makes .then() bail early)
      setIsCosmosLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderBackend]);

  useEffect(() => {
    void import("@cosmos.gl/graph").catch(() => { /* ignore pre-warm errors */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perf HUD FPS sampler — 1-second sliding window via rAF. Throttled state writes.
  useEffect(() => {
    if (!perfHudEnabled) return;
    let id = 0;
    let lastFlushAt = 0;
    const tick = (t: number) => {
      const arr = perfFrameTimesRef.current;
      arr.push(t);
      // Drop frames older than 1 second
      while (arr.length > 0 && t - arr[0] > 1000) arr.shift();
      if (t - lastFlushAt > 250) {
        lastFlushAt = t;
        setPerfFps(arr.length);
        setPerfTickMs(perfLastTickMsRef.current);
        setPerfLinkCount(linksRef.current.sources.length);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [perfHudEnabled]);

  useEffect(() => {
    if (rendererFailureReason) {
      console.debug(`[AccUsersGraph] renderer backend=${renderBackend}; failure=${rendererFailureReason}`);
      return;
    }
    console.debug(`[AccUsersGraph] renderer backend=${renderBackend}`);
  }, [renderBackend, rendererFailureReason]);

  useEffect(() => {
    const worker = new Worker(new URL("./accGraphOrganicLayout.worker.ts", import.meta.url), { type: "module" });
    organicWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<OrganicWorkerMessage>) => {
      const message = event.data;
      if (message.session !== layoutSessionRef.current) return;
      if (message.type === "links") {
        linksRef.current = { sources: message.sources, targets: message.targets };
        markGraphDirty();
        return;
      }
      if (message.type !== "tick") return;
      posRef.current = message.positions;
      const now = performance.now();
      // Capture latest tick duration for the perf HUD (every tick, cheap).
      if (typeof message.tickDurationMs === "number") {
        perfLastTickMsRef.current = message.tickDurationMs;
      }
      if (now - lastMetricUpdateAtRef.current > 250) {
        lastMetricUpdateAtRef.current = now;
        setMotionMetric({
          averageVelocity: message.averageVelocity,
          linkCount: message.linkCount,
        });
        if (IS_DEV) {
          setLayoutDiagnostics({
            lastWorkerTick: Math.round(now),
            activeNodeCount: message.diagnostics?.activeNodeCount ?? 0,
            hiddenNodeCount: message.diagnostics?.hiddenNodeCount ?? 0,
          });
        }
      }
      if (message.averageVelocity > 0.0005) {
        forceRenderUntilRef.current = Math.max(forceRenderUntilRef.current, now + 900);
      }
      rebuildGrid();
      markGraphDirty();
    };

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      if (organicWorkerRef.current === worker) organicWorkerRef.current = null;
    };
  }, [markGraphDirty, rebuildGrid]);

  useEffect(() => {
    if (!users.length) return;

    setIsReady(false);

    const graph = graphQuery.data;
    if (!graph?.hit) {
      nodesRef.current = [];
      seedPosRef.current = new Float32Array(0);
      posRef.current = new Float32Array(0);
      nodeIndexMapRef.current = new Map();
      instIdxRef.current = new Uint32Array(0);
      visibleNodeIdxRef.current = new Uint32Array(0);
      visibleIndexSetRef.current = new Set();
      setVisibleCount(0);
      setIsReady(false);
      markGraphDirty();
      return;
    }

    const rawNodes = (graph.nodes as AccGraphNode[])
      .map(graphNodeToSimNode);
    if (
      graph.nodeIds.length !== rawNodes.length ||
      !orderedNodeIdsMatch(graph.nodeIds, rawNodes)
    ) {
      nodesRef.current = [];
      seedPosRef.current = new Float32Array(0);
      posRef.current = new Float32Array(0);
      nodeIndexMapRef.current = new Map();
      instIdxRef.current = new Uint32Array(0);
      visibleNodeIdxRef.current = new Uint32Array(0);
      visibleIndexSetRef.current = new Set();
      setVisibleCount(0);
      setIsReady(false);
      markGraphDirty();
      return;
    }

    nodesRef.current = rawNodes;
    const cachedPositions = readPrecomputedPositions(graph.positions, rawNodes.length * 2);
    const hasCachedPositions = Array.isArray(graph.positions) && (graph.positions as unknown[]).length > 0;
    const cacheIsCorrupt = hasCachedPositions && cachedPositions === null;
    if (cacheIsCorrupt) {
      localStorage.setItem("acc-graph-cache-corrupt", "true");
      setPositionCacheCorrupt(true);
    } else {
      localStorage.removeItem("acc-graph-cache-corrupt");
      setPositionCacheCorrupt(false);
    }
    seedPosRef.current = computeTopologySeedPositions(rawNodes, cachedPositions);
    posRef.current = new Float32Array(seedPosRef.current);
    centroidRef.current = computeCentroid(seedPosRef.current);

    const nodeIndexMap = new Map<string, number>();
    rawNodes.forEach((node, index) => nodeIndexMap.set(node.id, index));
    nodeIndexMapRef.current = nodeIndexMap;

    // Build kind-specific indices; all rendered nodes are user/project instances.
    const uIdx: number[] = [];
    rawNodes.forEach((node, index) => {
      uIdx.push(index); // all nodes are user kind
    });
    instIdxRef.current = new Uint32Array(uIdx);

    rebuildVisibleIndices();
    restartOrganicLayout("restart");
    if (lastAutoFitHashRef.current !== graph.dataHash) {
      zoomToFit({ immediate: true });
      lastAutoFitHashRef.current = graph.dataHash;
      localStorage.setItem("acc-graph-data-hash", graph.dataHash);
      // Data changed — discard saved view so user sees the new full graph
      localStorage.removeItem("acc-graph-view");
    }
    rebuildGrid();
    isRefreshingRef.current = false;
    setIsReady(true);
    markGraphDirty();
  }, [users, graphQuery.data, refreshKey, rebuildVisibleIndices, rebuildGrid, zoomToFit, markGraphDirty, restartOrganicLayout]);

  useEffect(() => {
    filtersRef.current = filters;
    hasActiveFiltersRef.current = filters.roles.length > 0 || filters.lastAddedBuckets.length > 0 || filters.adminAccess !== "all" || filters.modules.length > 0;
    rebuildVisibleIndices();
  }, [filters, rebuildVisibleIndices]);

  useEffect(() => {
    localStorage.setItem("acc-graph-filters", JSON.stringify(filters));
  }, [filters]);

  // Keep physics ref in sync with state and persist to localStorage
  useEffect(() => {
    cosmosPhysicsRef.current = cosmosPhysics;
    try {
      localStorage.setItem(COSMOS_PHYSICS_KEY, JSON.stringify(cosmosPhysics));
    } catch { /* ignore */ }
  }, [cosmosPhysics]);

  useEffect(() => {
    if (isReady || !users.length) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadingTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [isReady, users.length]);

  useEffect(() => {
    const render = () => {
      rafId.current = requestAnimationFrame(render);

      const renderer = activeRendererRef.current;
      if (!renderer) return;

      const v = view.current;
      const tv = targetView.current;
      const dxCam = Math.abs(tv.x - v.x);
      const dyCam = Math.abs(tv.y - v.y);
      const dsCam = Math.abs(tv.scale - v.scale);
      const camLerping = dxCam > 0.00001 || dyCam > 0.00001 || dsCam > 0.01;
      const forceLiveLayoutRender = performance.now() < forceRenderUntilRef.current;
      if (!camLerping && !needsRenderRef.current && !forceLiveLayoutRender) return;

      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      const { width, height } = getViewportSize(containerRef.current);
      const nodes = nodesRef.current;
      const positions = posRef.current;
      const selectedId = selectedNodeRef.current?.node.id ?? null;
      const mappedSelectedIndex = selectedId ? (nodeIndexMapRef.current.get(selectedId) ?? -1) : -1;
      const selectedIndex = mappedSelectedIndex >= 0 && visibleIndexSetRef.current.has(mappedSelectedIndex)
        ? mappedSelectedIndex
        : -1;
      const { adjacent: highlightSet, sameUser: sameUserHighlightSet } = buildHighlightSet(
        selectedIndex,
        nodes,
      );
      const isInteracting =
        isDragging.current ||
        Math.abs(tv.x - v.x) > 0.0005 ||
        Math.abs(tv.y - v.y) > 0.0005 ||
        Math.abs(tv.scale - v.scale) > v.scale * 0.002;

      const frame: GraphRenderFrame = {
        nodes,
        positions,
        nodeIndexMap: nodeIndexMapRef.current,
        userIndices: instIdxRef.current,
        links: linksRef.current,
        selectedNodeId: selectedIndex >= 0 ? selectedId : null,
        selectedNodeIndex: selectedIndex,
        highlightSet,
        sameUserHighlightSet,
        filterActive: hasActiveFiltersRef.current,
        isInteracting,
        view: v,
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        backgroundColor: GRAPH_BACKGROUND,
      };

      const drawResult = renderer.draw(frame);
      needsRenderRef.current = forceLiveLayoutRender || camLerping || drawResult.needsContinuousRedraw;
    };

    rafId.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    clickStart.current = { x: event.clientX, y: event.clientY };
    lastMouse.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pickModeRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const lx = event.clientX - rect.left;
      const ly = event.clientY - rect.top;
      const node = hitTest(lx, ly);
      if (node) {
        const idx = nodeIndexMapRef.current.get(node.id) ?? -1;
        if (idx >= 0) {
          isDraggingNodeRef.current = true;
          draggedNodeIdxRef.current = idx;
          setIsDraggingState(true);
          return;
        }
      }
    }

    isDragging.current = true;
    setIsDraggingState(true);
  }, [hitTest]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const lx = event.clientX - rect.left;
    const ly = event.clientY - rect.top;

    if (isDraggingNodeRef.current && draggedNodeIdxRef.current >= 0) {
      const { width, height } = getViewportSize(containerRef.current);
      const v = view.current;
      const wx = v.x + (lx - width / 2) / v.scale;
      const wy = v.y + (ly - height / 2) / v.scale;
      const idx = draggedNodeIdxRef.current;
      posRef.current[idx * 2] = wx;
      posRef.current[idx * 2 + 1] = wy;
      organicWorkerRef.current?.postMessage({ type: "drag", nodeIndex: idx, x: wx, y: wy });
      rebuildGrid();
      markGraphDirty();
      return;
    }

    if (isDragging.current) {
      const dx = event.clientX - lastMouse.current.x;
      const dy = event.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: event.clientX, y: event.clientY };
      saveView();
      markGraphDirty();
      return;
    }

    const node = hitTest(lx, ly);
    setHoveredNode(node);
    if (tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly + 12}px)`;
      tooltipRef.current.style.opacity = node ? "1" : "0";
    }
  }, [hitTest, markGraphDirty, rebuildGrid, saveView]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;

    if (isDraggingNodeRef.current) {
      const idx = draggedNodeIdxRef.current;
      isDraggingNodeRef.current = false;
      draggedNodeIdxRef.current = -1;
      setIsDraggingState(false);
      if (idx >= 0) organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
      rebuildGrid();
      markGraphDirty();
      return;
    }

    isDragging.current = false;
    setIsDraggingState(false);
    rebuildGrid();
    markGraphDirty();

    const moved = Math.hypot(event.clientX - clickStart.current.x, event.clientY - clickStart.current.y);
    if (moved >= 5) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const node = hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (!node) {
      setSelectedNode(null);
      selectedNodeRef.current = null;
      markGraphDirty();
      return;
    }

    const state: SidePanelState = { node };
    setSelectedNode(state);
    selectedNodeRef.current = state;
    markGraphDirty();
  }, [hitTest, rebuildGrid, markGraphDirty]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const canvas = event.currentTarget as HTMLCanvasElement | null;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const v = view.current;
    const wx = v.x + (mx - cx) / v.scale;
    const wy = v.y + (my - cy) / v.scale;
    const nextScale = Math.max(0.01, Math.min(500000, v.scale * Math.pow(1.002, -event.deltaY)));
    view.current = {
      scale: nextScale,
      x: wx - (mx - cx) / nextScale,
      y: wy - (my - cy) / nextScale,
    };
    targetView.current = { ...view.current };
    saveView();
    rebuildGrid();
    markGraphDirty();
  }, [rebuildGrid, markGraphDirty, saveView]);

  useEffect(() => {
    const canvases = [canvas2dRef.current].filter(Boolean) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      for (const canvas of canvases) {
        canvas.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleWheel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      markGraphDirty();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [markGraphDirty]);

  const totalInstances = useMemo(
    () => graphQuery.data?.stats.totalProjectInstances ?? users.reduce((sum, user) => sum + (user.found ? user.projects.length : 0), 0),
    [graphQuery.data?.stats.totalProjectInstances, users],
  );
  const filterOptions = useMemo(() => {
    const roleCount = new Map<string, number>();
    const lastAddedCount = new Map<string, number>();
    const moduleCount = new Map<string, number>();

    const nodes = graphQuery.data?.hit ? (graphQuery.data.nodes as AccGraphNode[]) : [];
    for (const node of nodes) {
      if (node.kind !== "instance") continue;

      for (const role of node.roles ?? []) {
        roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
      }

      const lastAddedBucket = node.lastAddedBucket || "Unknown";
      lastAddedCount.set(lastAddedBucket, (lastAddedCount.get(lastAddedBucket) ?? 0) + 1);

      for (const mod of node.modules ?? []) {
        moduleCount.set(mod, (moduleCount.get(mod) ?? 0) + 1);
      }
    }

    const roles: FilterOption[] = [...roleCount.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const lastAddedBuckets: FilterOption[] = [...lastAddedCount.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => (
        a.value === "Unknown" ? 1 :
        b.value === "Unknown" ? -1 :
        b.value.localeCompare(a.value)
      ));
    const modules: FilterOption[] = [...moduleCount.entries()]
      .map(([value, count]) => ({ value, label: moduleLabel(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return { roles, lastAddedBuckets, modules };
  }, [graphQuery.data]);

  useEffect(() => {
    if (!graphQuery.data) return;
    setFilters(prev => {
      const validRoles = new Set(filterOptions.roles.map(o => o.value));
      const validModules = new Set(filterOptions.modules.map(o => o.value));
      const validBuckets = new Set(filterOptions.lastAddedBuckets.map(o => o.value));
      const nextRoles = prev.roles.filter(r => validRoles.has(r));
      const nextModules = prev.modules.filter(m => validModules.has(m));
      const nextBuckets = prev.lastAddedBuckets.filter(b => validBuckets.has(b));
      if (
        nextRoles.length === prev.roles.length &&
        nextModules.length === prev.modules.length &&
        nextBuckets.length === prev.lastAddedBuckets.length
      ) {
        return prev; // No change — avoid re-render
      }
      return { ...prev, roles: nextRoles, modules: nextModules, lastAddedBuckets: nextBuckets };
    });
  }, [graphQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilters = filters.roles.length > 0 || filters.lastAddedBuckets.length > 0 || filters.adminAccess !== "all" || filters.modules.length > 0;
  const displayVisibleCount = isReady ? visibleCount : totalInstances;
  const graphCacheNeedsBuild = !!users.length && graphQuery.isSuccess && !graphQuery.data?.hit;

  const renderCanvasClass = cn(
    "absolute inset-0 block w-full h-full",
    isDraggingState
      ? "cursor-grabbing"
      : pickMode && hoveredNode
        ? "cursor-grab"
        : hoveredNode
          ? "cursor-pointer"
          : "cursor-crosshair",
  );

  if (!users.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ACC data available. Load ACC data in the ACC Analysis tab first.
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div
        ref={containerRef}
        data-render-backend={renderBackend}
        data-renderer-failure-reason={rendererFailureReason ?? undefined}
        data-acc-graph-last-worker-tick={IS_DEV ? layoutDiagnostics.lastWorkerTick : undefined}
        data-acc-graph-active-node-count={IS_DEV ? layoutDiagnostics.activeNodeCount : undefined}
        data-acc-graph-hidden-node-count={IS_DEV ? layoutDiagnostics.hiddenNodeCount : undefined}
        className="flex-1 relative rounded-xl border border-border/30 overflow-hidden"
        style={{ background: GRAPH_BACKGROUND }}
      >
        {perfHudEnabled && (
          <div
            className="absolute top-2 right-2 z-50 pointer-events-none rounded-md bg-black/55 text-white px-2 py-1.5 leading-tight font-mono"
            style={{ fontSize: 11 }}
            data-testid="acc-graph-perf-hud"
          >
            <div style={{ color: perfFps >= 58 ? "#7ee787" : perfFps >= 50 ? "#f1e05a" : "#f85149" }}>
              FPS: {perfFps}
            </div>
            <div>Tick: {perfTickMs.toFixed(1)}ms / {perfLinkCount} springs</div>
            <div>GPU: {perfGpu ?? "n/a"}</div>
          </div>
        )}

        {positionCacheCorrupt && (
          <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
            <span className="text-xs text-amber-800 font-medium">
              Graph position cache contains invalid data — nodes may be mispositioned.
            </span>
            <button
              className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              disabled={rebuildGraph.isPending}
              onClick={() => {
                rebuildGraph.mutate(undefined, {
                  onSuccess: () => {
                    void graphQuery.refetch().then(() => {
                      // Only clear after refetch resolves — re-detection runs in the data useEffect
                    });
                  },
                });
              }}
            >
              {rebuildGraph.isPending ? "Rebuilding…" : "Rebuild Cache"}
            </button>
          </div>
        )}

        {graphQuery.isError && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm">
            <span className="text-sm font-semibold text-gray-900 text-center px-6">
              Could not load graph data.
            </span>
            <span className="mt-1 text-xs text-gray-500 text-center px-6">
              Check your connection and try again.
            </span>
            <button
              className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={graphQuery.isFetching}
              onClick={() => void graphQuery.refetch()}
            >
              {graphQuery.isFetching ? "Retrying…" : "Try Again"}
            </button>
          </div>
        )}

        {!isReady && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm">
            {graphCacheNeedsBuild ? (
              <>
                <span className="text-sm font-semibold text-gray-900">
                  {graphQuery.data?.stale ? "ACC graph cache is stale" : "ACC graph cache has not been built"}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {graphQuery.data?.stats.totalProjectInstances.toLocaleString() ?? 0} project-slots need a graph data snapshot.
                </span>
                <button
                  onClick={() => {
                    if (isRefreshingRef.current) return;
                    isRefreshingRef.current = true;
                    rebuildGraph.mutate(undefined, {
                      onSettled: () => {
                        setRefreshKey((value) => value + 1);
                        graphQuery.refetch().finally(() => {
                          isRefreshingRef.current = false;
                        });
                      },
                    });
                  }}
                  disabled={rebuildGraph.isPending}
                  className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white disabled:opacity-50"
                >
                  {rebuildGraph.isPending ? "Rebuilding..." : "Rebuild Graph Cache"}
                </button>
              </>
            ) : loadingTimedOut ? (
              <>
                <span className="text-sm font-semibold text-gray-900 text-center px-6">
                  This is taking longer than expected.
                </span>
                <span className="mt-1 text-xs text-gray-500 text-center px-6">
                  Try reloading the page.
                </span>
                <button
                  className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4" />
                <span className="text-sm font-medium text-emerald-700">Loading graph...</span>
              </>
            )}
          </div>
        )}

        {isCosmosLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#F8F7F4]/70 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
            <span className="text-sm font-medium text-violet-700">Initializing GPU renderer…</span>
          </div>
        )}

        <div className="absolute top-3 right-3 z-10">
          <div className="text-[10px] text-gray-400 pr-1 text-right">
            {displayVisibleCount.toLocaleString()} of {totalInstances.toLocaleString()} instances - {motionMetric.linkCount.toLocaleString()} springs - scroll to zoom - drag to pan
          </div>
        </div>

        <div className="absolute top-3 left-3 z-20">
          <button
            onClick={() => setShowControls((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all shadow-sm",
              showControls
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white/90 text-gray-600 border-gray-200 hover:text-gray-900 hover:border-gray-400",
            )}
          >
            <span>⚙</span>
            <span>Controls</span>
            {hasActiveFilters && (
              <span className="ml-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 leading-none">
                {[filters.roles.length, filters.lastAddedBuckets.length, filters.adminAccess !== "all" ? 1 : 0, filters.modules.length].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
        </div>

        {showControls && (
          <div className="absolute top-12 left-3 bottom-3 z-10 w-64 flex flex-col gap-2 overflow-y-auto">
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Layout</p>
              <SliderControl
                label="Separation"
                value={graphControls.spacing}
                onChange={(v) => scheduleGraphControlUpdate("spacing", v)}
              />
              <SliderControl
                label="Cluster"
                value={graphControls.clusterStrength}
                onChange={(v) => scheduleGraphControlUpdate("clusterStrength", v)}
              />
              <p className="text-[10px] text-gray-400 leading-tight pt-1">
                Separation = how far apart nodes sit. Cluster: 0 = organic, 100 = grouped by role.
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Filters</p>
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <FilterMenu
                label="Roles"
                options={filterOptions.roles}
                selected={filters.roles}
                onToggle={(value) => setFilters((current) => ({ ...current, roles: toggleValue(current.roles, value) }))}
                maxVisible={Infinity}
              />
              <FilterMenu
                label="Last Added"
                options={filterOptions.lastAddedBuckets}
                selected={filters.lastAddedBuckets}
                onToggle={(value) => setFilters((current) => ({ ...current, lastAddedBuckets: toggleValue(current.lastAddedBuckets, value) }))}
                maxVisible={Infinity}
              />
              <ToggleFilterControl
                label="Admin Access"
                value={filters.adminAccess}
                options={[
                  { value: "all", label: "All" },
                  { value: "admin", label: "Admin only" },
                  { value: "non-admin", label: "Non-admin" },
                ]}
                onChange={(value) => setFilters((current) => ({ ...current, adminAccess: value as GraphFilters["adminAccess"] }))}
              />
              <FilterMenu
                label="Modules"
                options={filterOptions.modules}
                selected={filters.modules}
                onToggle={(value) => setFilters((current) => ({ ...current, modules: toggleValue(current.modules, value) }))}
                maxVisible={Infinity}
              />
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-[10px] text-gray-500 font-medium">Colored by Primary Role</span>
          <div className="w-px h-3 bg-gray-200 shrink-0" />
          <button
            onClick={togglePickMode}
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-medium transition-colors rounded-md px-1.5 py-0.5",
              pickMode
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            <span>Pick {pickMode ? "On" : "Off"}</span>
          </button>
        </div>

        <div className="absolute bottom-3 right-3 z-10 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 flex flex-col gap-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Node Types</p>
          <LegendDot color="#E63946" label="User" />
          <LegendDot color="#2A9D8F" label="Project" />
          <LegendDot color="#9B5DE5" label="Role" />
          <LegendDot color="#F4A261" label="Module" />
        </div>

        <canvas
          ref={canvas2dRef}
          className={cn(renderCanvasClass, renderBackend === "canvas2d" ? "opacity-100" : "opacity-0 pointer-events-none")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (isDraggingNodeRef.current) {
              const idx = draggedNodeIdxRef.current;
              isDraggingNodeRef.current = false;
              draggedNodeIdxRef.current = -1;
              if (idx >= 0) organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
            }
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            markGraphDirty();
          }}
        />
        <div
          ref={cosmosContainerRef}
          className={cn(
            "absolute inset-0 w-full h-full",
            renderBackend === "cosmos" ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          // Cosmos manages its own canvas and pointer events internally
        />
        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg max-w-[240px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            <UserTooltip node={hoveredNode} />
          )}
        </div>

        {/* Cosmos hover label — shown on onPointMouseOver, hidden by default */}
        <div
          ref={hoverLabelRef}
          style={{ display: "none", position: "absolute", pointerEvents: "none", zIndex: 50 }}
          className="px-2 py-1 text-[11px] font-medium bg-gray-900/90 text-white rounded-lg shadow-md whitespace-nowrap"
        />

        {selectedNode && (
          <div className="absolute top-3 right-3 bottom-3 z-20 w-72 pointer-events-none">
            <div className="pointer-events-auto h-full">
              <SidePanel
                state={selectedNode}
                onClose={() => {
                  setSelectedNode(null);
                  selectedNodeRef.current = null;
                  markGraphDirty();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-2 py-1">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 flex-1 accent-gray-900"
        aria-label={label}
      />
      <span className="w-7 shrink-0 rounded bg-gray-100 px-1 py-0.5 text-right text-[10px] font-semibold tabular-nums text-gray-900">
        {value}
      </span>
    </label>
  );
}

function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  query,
  onQueryChange,
  placeholder,
  maxVisible = 6,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  maxVisible?: number;
}) {
  const shownOptions = options.slice(0, maxVisible);
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
            {selected.length}
          </span>
        )}
      </div>
      {onQueryChange && (
        <input
          value={query ?? ""}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={placeholder}
          className="mb-1.5 h-6 w-full rounded-md border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-gray-400"
        />
      )}
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-0.5">
        {shownOptions.length === 0 ? (
          <span className="text-[10px] text-gray-400">No options</span>
        ) : (
          shownOptions.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => onToggle(option.value)}
                title={option.label}
                className={cn(
                  "max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900",
                )}
              >
                {option.label}
                <span className={active ? "ml-1 opacity-70" : "ml-1 text-gray-400"}>{option.count}</span>
              </button>
            );
          })
        )}
        {options.length > shownOptions.length && (
          <span className="self-center text-[10px] text-gray-400">+{options.length - shownOptions.length}</span>
        )}
      </div>
    </div>
  );
}

function ToggleFilterControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2">
      <div className="mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
              value === option.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function UserTooltip({ node }: { node: UserNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500">{node.email}</p>
      {node.projectName && <p className="text-[10px] text-gray-600 font-medium">{node.projectName}</p>}
      {node.roles.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {node.roles.slice(0, 4).map((r) => (
            <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">
              {r}
            </span>
          ))}
          {node.roles.length > 4 && <span className="text-[9px] text-gray-400">+{node.roles.length - 4}</span>}
        </div>
      )}
      {node.isAdmin && <p className="text-[9px] text-emerald-600 font-semibold">Admin Access</p>}
      {node.individualAccess && <p className="text-[9px] text-sky-600 font-semibold">Individual Access Config</p>}
    </div>
  );
}

function SidePanel({
  state,
  onClose,
}: {
  state: SidePanelState;
  onClose: () => void;
}) {
  const node = state.node;
  const title = node.name || node.email;

  return (
    <div className="w-full h-full bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{title}</h3>
          <p className="text-[11px] text-gray-400 break-all mt-0.5">{node.email}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none mt-0.5">&times;</button>
      </div>

      <div className="space-y-3">
        {!node.found && (
          <p className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg px-2 py-1.5">
            Not yet synced to ACC.
          </p>
        )}
        {node.found && node.hasNoProjects && (
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
            Synced but no projects assigned.
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {node.isAdmin && <Tag color="emerald">Admin Access</Tag>}
          {node.individualAccess && <Tag color="gray">Individual Access</Tag>}
        </div>

        {node.projectName && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Project</p>
            <p className="text-[11px] text-gray-700 font-medium">{node.projectName}</p>
          </div>
        )}
        {!node.projectName && node.projectCount > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Projects</p>
            <p className="text-[11px] text-gray-700">{node.projectCount} project{node.projectCount > 1 ? "s" : ""}</p>
          </div>
        )}

        {node.lastAddedBucket && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
            <p className="text-[11px] text-gray-700">{node.lastAddedBucket}</p>
          </div>
        )}

        {node.roles.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Roles</p>
            <div className="flex flex-wrap gap-1">
              {node.roles.map((role) => (
                <span
                  key={role}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.modules.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Modules</p>
            <div className="flex flex-wrap gap-1">
              {node.modules.map((moduleName) => (
                <span
                  key={moduleName}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"
                >
                  {moduleLabel(moduleName)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ color, children }: { color: "emerald" | "amber" | "gray"; children: React.ReactNode }) {
  const styles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    gray: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[color]}`}>
      {children}
    </span>
  );
}
