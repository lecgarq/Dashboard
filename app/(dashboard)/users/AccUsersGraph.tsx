"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Filter, RotateCcw } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  nodeMatchesFilters,
  type GraphFilters,
  DEFAULT_FILTERS,
} from "./accGraphFilters";
import { trpc } from "@/lib/core/trpc";
import { moduleLabel } from "@/lib/acc/modules";
import type { AccGraphNode } from "@/lib/acc/graphSnapshot";
import {
  CanvasGraphRenderer,
  CosmosGraphRenderer,
  type GraphRenderFrame,
  type GraphRenderer,
} from "./graphRenderers";
import { ThreeGraphRenderer } from "./threeGraphRenderer";
import {
  readGraphDisplayMode,
  selectInitialGraphBackend,
  shouldInitializeLayoutWorker,
  writeGraphDisplayMode,
  type GraphDisplayMode,
  type GraphRendererBackend,
} from "./accGraph3d";
import {
  isWebGL2Available,
  buildClusterIdsFromNodes,
  controlsToSimulationConfig,
  pointInPolygon,
  projectTopologyLinksToIndexPairs,
} from "./cosmosUtils";
import { toast } from "sonner";
import { type BulkAccUser } from "./AccAnalysisPanel";
import { adminTierFor, adminTierShapeEnum } from "./adminTierShape";
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
  companyRole: string | null;
  lastSignIn: string | null;
  // UI-01: optional label + degree consumed by the Canvas2D late-zoom label pass.
  // Populated alongside the render-node assembly; safe to leave undefined.
  label?: string;
  degree?: number;
  // Phase 5.1 enriched fields (from accMembers.enrichedUsers, may be undefined)
  perProjectRoleNames?: string[];
  aggregatedStatus?: "active" | "pending" | "deleted";
  projectAdmin?: boolean;
  executive?: boolean;
  isAccountAdmin?: boolean;
  companyName?: string | null;
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

// GraphFilters interface and nodeMatchesFilters are imported from ./accGraphFilters

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
// DEFAULT_FILTERS is imported from ./accGraphFilters
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
    companyRole: node.companyRole ?? null,
    lastSignIn: node.lastSignIn ?? null,
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

// nodeMatchesFilters is imported from ./accGraphFilters

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

function readFiltersFromUrl(params: URLSearchParams): GraphFilters {
  const adminRaw = params.get("admin") ?? "";
  const adminAccess: GraphFilters["adminAccess"] = (["all", "admin", "non-admin"] as const).includes(
    adminRaw as GraphFilters["adminAccess"]
  )
    ? (adminRaw as GraphFilters["adminAccess"])
    : "all";

  const rolesRaw = params.get("roles") ?? "";
  const moffRaw = params.get("moff") ?? "";
  const companyRolesRaw = params.get("croles") ?? "";
  const projRolesRaw = params.get("proles") ?? "";

  return {
    ...DEFAULT_FILTERS, // Phase 7: pick up showFolders/permTiers/simDims/simMin/viewMode defaults
    roles: rolesRaw ? rolesRaw.split(",").filter(Boolean) : [],
    lastAddedBuckets: [], // not persisted to URL — volatile derived state
    adminAccess,
    disabledModules: moffRaw ? moffRaw.split(",").filter(Boolean) : [],
    companyRoles: companyRolesRaw ? companyRolesRaw.split(",").filter(Boolean) : [],
    dateFrom: params.get("from") ?? "",
    dateTo: params.get("to") ?? "",
    perProjectRoles: projRolesRaw ? projRolesRaw.split(",").filter(Boolean) : [],
  };
}

function writeFiltersToUrl(
  filters: GraphFilters,
  pathname: string,
  router: { replace: (url: string, opts?: { scroll?: boolean }) => void },
): void {
  const qs = new URLSearchParams();
  if (filters.roles.length > 0) qs.set("roles", filters.roles.join(","));
  if (filters.disabledModules.length > 0) qs.set("moff", filters.disabledModules.join(","));
  if (filters.companyRoles.length > 0) qs.set("croles", filters.companyRoles.join(","));
  if (filters.dateFrom) qs.set("from", filters.dateFrom);
  if (filters.dateTo) qs.set("to", filters.dateTo);
  if (filters.adminAccess !== "all") qs.set("admin", filters.adminAccess);
  if (filters.perProjectRoles.length > 0) qs.set("proles", filters.perProjectRoles.join(","));
  const qsStr = qs.toString();
  router.replace(`${pathname}${qsStr ? `?${qsStr}` : ""}`, { scroll: false });
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const cosmosContainerRef = useRef<HTMLDivElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  // UI-01 (gap closure 03-04): screen-space label overlay above the Cosmos GL
  // canvas. Driven by CosmosGraphRenderer.drawLabelOverlay each rAF tick on
  // the Cosmos path. Replaces the legacy DOM hover-label.
  const cosmosLabelOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const canvasRendererRef = useRef<CanvasGraphRenderer | null>(null);
  const cosmosRendererRef = useRef<CosmosGraphRenderer | null>(null);
  const threeRendererRef = useRef<ThreeGraphRenderer | null>(null);
  const activeRendererRef = useRef<GraphRenderer | null>(null);
  // True when the active Cosmos renderer owns physics on the GPU (TD-005).
  // When false, slider/drag/cluster routes through the d3-force worker.
  const usePhysicsRef = useRef<boolean>(false);

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
  const threeCameraMovingRef = useRef(false);

  const view = useRef(loadSavedView());
  const targetView = useRef(loadSavedView());
  // Tracks the most recent fit-to-view scale so the late-zoom label band
  // (UI-01) can be expressed relative to the current graph extent rather
  // than a fixed zoom number. Updated inside zoomToFit().
  const lastFitScaleRef = useRef<number>(view.current.scale ?? 600);
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
  // UI-01: tracks the linksRef reference last consumed for degree-recompute,
  // so per-frame degree assignment only runs when links actually change.
  const lastLinksForDegreeRef = useRef<{ sources: Int32Array; targets: Int32Array } | null>(null);

  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  // Mirror hoveredNode for the rAF render loop (closure captures from useEffect[[]]
  // would otherwise be stale). Updated alongside every setHoveredNode.
  const hoveredNodeRef = useRef<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [positionCacheCorrupt, setPositionCacheCorrupt] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("acc-graph-cache-corrupt") === "true";
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [graphDisplayMode, setGraphDisplayMode] = useState<GraphDisplayMode>(() => {
    const savedMode = readGraphDisplayMode();
    return savedMode === "3d" && isWebGL2Available() ? "3d" : "2d";
  });
  const [renderBackend, setRenderBackend] = useState<GraphRendererBackend>(() =>
    selectInitialGraphBackend(readGraphDisplayMode(), isWebGL2Available())
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
  const [isThreeLoading, setIsThreeLoading] = useState(false);
  // UI-02 (gap 4 fix): cosmosReady promotes "renderer ref is assigned" to React
  // state so the Cosmos stability-polling effect re-runs once the async
  // CosmosGraphRenderer.create(...).then(...) resolves. Previously the polling
  // effect bailed silently when isReady flipped before init completed.
  const [cosmosReady, setCosmosReady] = useState(false);
  const [graphControls, setGraphControls] = useState<GraphControlSettings>(DEFAULT_GRAPH_CONTROLS);
  const [pickMode, setPickMode] = useState(false);
  const pickModeRef = useRef(false);
  // 02-04: Lasso multi-select. lassoActive guards pointer routing on the lasso
  // overlay; lassoPathRef holds screen-space points for the rAF-cheap path,
  // while lassoPath drives the SVG re-render on pointermove.
  const [lassoActive, setLassoActive] = useState(false);
  const lassoActiveRef = useRef(false);
  const lassoPathRef = useRef<number[]>([]);
  const [lassoPath, setLassoPath] = useState<number[]>([]);
  // Selection summary set by Task 3 (Polygon-close → selection → side panel).
  const [polygonSelection, setPolygonSelection] = useState<{
    indices: number[];
    summary: {
      count: number;
      byRole: { value: string; count: number }[];
      byModule: { value: string; count: number }[];
      sampleIds: string[];
    };
  } | null>(null);
  const polygonSelectionRef = useRef<typeof polygonSelection>(null);
  // GRAPH-03: admin tier overlay toggle. Persisted via URL param ?admt=1.
  // OFF by default — matching the must_have truths in the plan.
  const [showAdminTiers, setShowAdminTiers] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return new URLSearchParams(window.location.search).get("admt") === "1"; }
    catch { return false; }
  });
  const showAdminTiersRef = useRef(showAdminTiers);

  const isDraggingNodeRef = useRef(false);
  const draggedNodeIdxRef = useRef(-1);
  const pendingFiltersRef = useRef<GraphFilters | null>(null);
  const linksRef = useRef<{ sources: Int32Array; targets: Int32Array }>({
    sources: new Int32Array(0),
    targets: new Int32Array(0),
  });
  const [motionMetric, setMotionMetric] = useState({ averageVelocity: 0, linkCount: 0 });

  // UI-02: Stability badge state. `isSimStable` flips true after sustained
  // below-threshold velocity (Canvas2D path) or alpha (Cosmos path) for
  // STABLE_DURATION_MS. `stableStartedAtRef` tracks the first moment we
  // crossed below threshold; `hasReceivedTickRef` guards against the badge
  // appearing during initial warm-up before any tick has arrived.
  const [isSimStable, setIsSimStable] = useState(false);
  const stableStartedAtRef = useRef<number | null>(null);
  const hasReceivedTickRef = useRef(false);
  const [showStableDiagnostics, setShowStableDiagnostics] = useState(false);

  // UI-02: Reset stability whenever the user takes a graph-modifying action
  // (drag a node, change filters, select a node). Pan/zoom MUST NOT call this.
  const resetStability = useCallback(() => {
    stableStartedAtRef.current = null;
    setIsSimStable(false);
  }, []);
  const [layoutDiagnostics, setLayoutDiagnostics] = useState({
    lastWorkerTick: 0,
    activeNodeCount: 0,
    hiddenNodeCount: 0,
  });
  const [filters, setFilters] = useState<GraphFilters>(() => readFiltersFromUrl(searchParams));
  const [visibleCount, setVisibleCount] = useState(0);
  // UI-03: filter panel collapse state. When collapsed, the panel renders as
  // a thin (44px) icon rail; when expanded, it renders at 240px alongside the
  // graph canvas. Default open at first paint; auto-collapses when the detail
  // panel opens at narrow viewports (see effect below).
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);

  // UI-03: auto-collapse the filter panel when the detail panel opens AND the
  // viewport is ≤1280px. At wider viewports both panels fit alongside a
  // ≥720px graph (per RESEARCH.md width math), so no auto-collapse needed.
  // We only auto-collapse on selection events — a user who manually expands
  // the filter while detail is open keeps that state (no resize-driven fight).
  useEffect(() => {
    if (!selectedNode) return;
    if (typeof window === "undefined") return;
    const isNarrow = window.matchMedia("(max-width: 1280px)").matches;
    if (isNarrow && !isFilterCollapsed) {
      setIsFilterCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  // GRAPH-02: sync hoverEmail from hoveredNode so the lazy file-activity query
  // activates when a node is hovered and clears when the cursor leaves.
  useEffect(() => {
    setHoverEmail(hoveredNode?.email ?? null);
  }, [hoveredNode]);

  // GRAPH-03: toggle admin tier overlay. Writes to URL param ?admt=1.
  const toggleAdminTiers = useCallback(() => {
    setShowAdminTiers((prev) => {
      const next = !prev;
      showAdminTiersRef.current = next;
      // Persist to URL
      try {
        const qs = new URLSearchParams(window.location.search);
        if (next) qs.set("admt", "1"); else qs.delete("admt");
        const qsStr = qs.toString();
        router.replace(`${pathname}${qsStr ? `?${qsStr}` : ""}`, { scroll: false });
      } catch { /* ignore */ }
      return next;
    });
  }, [router, pathname]);

  // GRAPH-03: apply/revert admin tier shapes+sizes on the cosmos renderer
  // whenever the toggle or node list changes.
  useEffect(() => {
    showAdminTiersRef.current = showAdminTiers;
    const cosmosRenderer = cosmosRendererRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cosmosGraph = (cosmosRenderer as any)?.graph;
    if (!cosmosGraph) return;
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    if (showAdminTiers) {
      // Build new typed arrays for shapes and sizes
      const shapes = new Float32Array(nodes.length);
      const baseSizes = new Float32Array(nodes.length);
      // Get baseline size (reuse cosmos default: ~7 or from the existing buffer)
      const baseSize = 7;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const visual = adminTierFor({
          isAccountAdmin: node.isAccountAdmin,
          projectAdmin: node.projectAdmin,
          executive: node.executive,
        });
        shapes[i] = adminTierShapeEnum(visual.tier);
        baseSizes[i] = baseSize * visual.sizeMultiplier;
      }
      if (typeof cosmosGraph.setPointShapes === "function") cosmosGraph.setPointShapes(shapes);
      if (typeof cosmosGraph.setPointSizes === "function") cosmosGraph.setPointSizes(baseSizes);
    } else {
      // Revert to baseline: circle shapes, uniform base size
      const shapes = new Float32Array(nodes.length); // all 0 = Circle
      const sizes = new Float32Array(nodes.length).fill(7);
      if (typeof cosmosGraph.setPointShapes === "function") cosmosGraph.setPointShapes(shapes);
      if (typeof cosmosGraph.setPointSizes === "function") cosmosGraph.setPointSizes(sizes);
    }
    needsRenderRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdminTiers]);

  // CSS fade-out: plays a 150ms opacity dip on the canvas wrapper when the
  // visible set shrinks (filter change). Zero GPU/shader cost — purely CSS.
  const [isFilterTransitioning, setIsFilterTransitioning] = useState(false);

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
  // GPU-physics HUD: simulation alpha (1=hot, 0=cool) replaces worker tick ms when active.
  const [perfSimAlpha, setPerfSimAlpha] = useState(0);
  const [perfNodeCount, setPerfNodeCount] = useState(0);
  const [perfUsePhysics, setPerfUsePhysics] = useState(false);
  const perfFrameTimesRef = useRef<number[]>([]);
  const perfLastTickMsRef = useRef(0);

  const graphQuery = trpc.users.getPrecomputedGraph.useQuery(undefined, {
    enabled: users.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  // GRAPH-01: per-project role facets for filter sidebar
  const roleFacetsQuery = trpc.accGraph.perProjectRoleFacets.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  // GRAPH-02: lazy file-activity fetch for hover tooltip card (never eager-loaded)
  const [hoverEmail, setHoverEmail] = useState<string | null>(null);
  const fileActivityQuery = trpc.accActivity.getFileActivityForUser.useQuery(
    { email: hoverEmail ?? "" },
    {
      enabled: !!hoverEmail,
      staleTime: 300_000,
      retry: false,
    }
  );

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
      hoveredNodeRef.current = null;
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
    if (usePhysicsRef.current) {
      // GPU-physics path (TD-005): apply slider directly to Cosmos's GPU simulation.
      // Worker stays paused — no postMessage round-trip.
      cosmosRendererRef.current?.setSimulationConfig(controlsToSimulationConfig(nextControls));
    } else {
      organicWorkerRef.current?.postMessage({ type: "controls", controls: nextControls });
    }
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
      if (idx >= 0 && !usePhysicsRef.current) {
        organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
      }
    }
  }, []);

  // 02-04: Toggle lasso mode. While active, the lasso overlay swallows pointer
  // events so pan/zoom on the underlying canvas is suspended. Exiting lasso
  // mode also clears any in-progress path so toggling off mid-draw doesn't
  // leave a stale SVG trace.
  const toggleLassoMode = useCallback(() => {
    const next = !lassoActiveRef.current;
    lassoActiveRef.current = next;
    setLassoActive(next);
    if (!next) {
      lassoPathRef.current = [];
      setLassoPath([]);
    }
  }, []);

  const handleLassoPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!lassoActiveRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    lassoPathRef.current = [x, y];
    setLassoPath([x, y]);
  }, []);

  const handleLassoPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoActiveRef.current) return;
    const path = lassoPathRef.current;
    if (path.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const lastX = path[path.length - 2];
    const lastY = path[path.length - 1];
    const dx = x - lastX;
    const dy = y - lastY;
    if (dx * dx + dy * dy < 16) return; // < 4px move
    path.push(x, y);
    setLassoPath([...path]);
  }, []);

  const handleLassoPointerUp = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoActiveRef.current) return;
    const path = lassoPathRef.current;
    // Need at least a triangle (3 points = 6 floats) to define a polygon.
    if (path.length >= 6) {
      // Polygon stays in SCREEN space — we project each node forward to screen
      // coordinates instead of the polygon backward to world. This is the only
      // formulation that works in both renderers: the Canvas2D `view.current`
      // does NOT track Cosmos's internal camera, and `posRef.current` holds
      // only seed positions in Cosmos GPU-physics mode (Cosmos has since moved
      // the points on the GPU). Original 02-04 used inverse-view + posRef and
      // produced zero matches in Cosmos mode → the panel never opened.
      const polyScreen = new Float32Array(path);

      const visible = visibleNodeIdxRef.current;
      const nodes = nodesRef.current;
      const matchedIndices: number[] = [];

      const cosmosRenderer = cosmosRendererRef.current;
      const usePhysics = usePhysicsRef.current === true && !!cosmosRenderer && cosmosRenderer.isUsingPhysics();

      if (usePhysics && cosmosRenderer) {
        // Cosmos GPU-physics path: project each visible node from Cosmos space
        // to screen pixels using Cosmos's own camera.
        const cosmosPositions = cosmosRenderer.getPointPositionsArray();
        if (cosmosPositions && cosmosPositions.length >= 2) {
          for (let i = 0; i < visible.length; i++) {
            const idx = visible[i];
            const cx = cosmosPositions[idx * 2];
            const cy = cosmosPositions[idx * 2 + 1];
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
            const screen = cosmosRenderer.spaceToScreen(cx, cy);
            if (!screen) continue;
            if (pointInPolygon(screen[0], screen[1], polyScreen)) {
              matchedIndices.push(idx);
            }
          }
        }
      } else {
        // Canvas2D path: forward-project posRef world coords using view.current.
        const { width, height } = getViewportSize(containerRef.current);
        const v = view.current;
        const positions = posRef.current;
        for (let i = 0; i < visible.length; i++) {
          const idx = visible[i];
          const wx = positions[idx * 2];
          const wy = positions[idx * 2 + 1];
          const sx = (wx - v.x) * v.scale + width / 2;
          const sy = (wy - v.y) * v.scale + height / 2;
          if (pointInPolygon(sx, sy, polyScreen)) {
            matchedIndices.push(idx);
          }
        }
      }
      if (matchedIndices.length > 0) {
        // Build summary: top 5 roles, top 10 modules, first 10 ids.
        const roleCounts = new Map<string, number>();
        const moduleCounts = new Map<string, number>();
        const sampleIds: string[] = [];
        for (const idx of matchedIndices) {
          const node = nodes[idx];
          if (!node) continue;
          if (sampleIds.length < 10) sampleIds.push(node.id);
          for (const r of node.roles ?? []) {
            roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
          }
          for (const m of node.modules ?? []) {
            moduleCounts.set(m, (moduleCounts.get(m) ?? 0) + 1);
          }
        }
        const byRole = [...roleCounts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, 5);
        const byModule = [...moduleCounts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, 10);
        const next = {
          indices: matchedIndices,
          summary: {
            count: matchedIndices.length,
            byRole,
            byModule,
            sampleIds,
          },
        };
        polygonSelectionRef.current = next;
        setPolygonSelection(next);
        markGraphDirty();
      }
    }
    // Exit lasso mode regardless of selection success — single-shot tool.
    lassoActiveRef.current = false;
    setLassoActive(false);
    lassoPathRef.current = [];
    setLassoPath([]);
  }, [markGraphDirty]);

  const clearPolygonSelection = useCallback(() => {
    polygonSelectionRef.current = null;
    setPolygonSelection(null);
    markGraphDirty();
  }, [markGraphDirty]);

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

  const setGraphMode = useCallback((mode: GraphDisplayMode) => {
    setGraphDisplayMode(mode);
    writeGraphDisplayMode(mode);
    if (mode === "3d") {
      pickModeRef.current = false;
      setPickMode(false);
      lassoActiveRef.current = false;
      setLassoActive(false);
      lassoPathRef.current = [];
      setLassoPath([]);
      if (!isWebGL2Available()) {
        setRendererFailureReason("WebGL2 is not supported in this browser");
        setRenderBackend("canvas2d");
        return;
      }
      setRenderBackend("three3d");
      return;
    }
    setRenderBackend(isWebGL2Available() ? "cosmos" : "canvas2d");
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
    const clampedFitScale = Math.max(0.01, Math.min(500000, fitScale));
    const nextView = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      scale: clampedFitScale,
    };
    targetView.current = nextView;
    // UI-01: snapshot the fit-scale so the per-frame label fade band can be
    // expressed relative to the current graph extent.
    lastFitScaleRef.current = clampedFitScale;
    if (options?.immediate) {
      view.current = { ...nextView };
    }
    markGraphDirty();
  }, [markGraphDirty]);

  const resetActiveView = useCallback(() => {
    if (renderBackend === "three3d") {
      threeRendererRef.current?.resetCamera();
      markGraphDirty();
      return;
    }
    zoomToFit({ immediate: true });
  }, [markGraphDirty, renderBackend, zoomToFit]);

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
    const threeContainer = threeContainerRef.current;
    if (!canvas2d || !cosmosContainer || !threeContainer) return;

    let disposed = false;
    const canvasRenderer = new CanvasGraphRenderer(canvas2d);
    canvasRendererRef.current = canvasRenderer;

    const fallBackToCanvas = (_reason: string) => {
      if (disposed) return;
      cosmosRendererRef.current?.destroy();
      cosmosRendererRef.current = null;
      threeRendererRef.current?.destroy();
      threeRendererRef.current = null;
      activeRendererRef.current = canvasRendererRef.current;
      usePhysicsRef.current = false;
      setRenderBackend("canvas2d");
      setCosmosReady(false);  // GPU context lost mid-session — same flag-reset, different trigger
      setPerfGpu(null);
      setIsCosmosLoading(false);
      setIsThreeLoading(false);
      // Unpause d3-force worker when falling back
      organicWorkerRef.current?.postMessage({ type: "pause", paused: false });
      toast.error("GPU renderer lost — switched back to Canvas 2D", { duration: 4000 });
      markGraphDirty();
    };

    if (renderBackend === "three3d") {
      activeRendererRef.current = canvasRenderer;
      setIsThreeLoading(true);
      usePhysicsRef.current = false;
      organicWorkerRef.current?.postMessage({ type: "pause", paused: false });

      void ThreeGraphRenderer.create(threeContainer).then(({ renderer, failureReason }) => {
        if (disposed) { renderer?.destroy(); return; }
        if (!renderer) {
          setRendererFailureReason(failureReason ?? "3D renderer initialization failed");
          setRenderBackend(isWebGL2Available() ? "cosmos" : "canvas2d");
          setGraphDisplayMode("2d");
          writeGraphDisplayMode("2d");
          setIsThreeLoading(false);
          markGraphDirty();
          return;
        }
        threeRendererRef.current = renderer;
        activeRendererRef.current = renderer;
        setRendererFailureReason(null);
        setPerfGpu("Three.js WebGL");

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
              resetStability();
            }
          }
          markGraphDirty();
        };

        renderer.onNodeHoverCallback = (index: number | null, event?: MouseEvent) => {
          const node = index == null ? null : nodesRef.current[index] ?? null;
          hoveredNodeRef.current = node;
          setHoveredNode(node);
          if (tooltipRef.current) {
            if (node && event && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              tooltipRef.current.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 12}px)`;
              tooltipRef.current.style.opacity = "1";
            } else {
              tooltipRef.current.style.opacity = "0";
            }
          }
          markGraphDirty();
        };

        renderer.onCameraMoveCallback = (moving: boolean) => {
          threeCameraMovingRef.current = moving;
          markGraphDirty();
        };

        setIsThreeLoading(false);
        markGraphDirty();
      });
    } else if (renderBackend === "cosmos") {
      // Capture current view-state before Cosmos takes over
      const savedView = view.current ? { ...view.current } : null;

      // Canvas 2D is active while Cosmos loads
      activeRendererRef.current = canvasRenderer;
      setIsCosmosLoading(true);

      void CosmosGraphRenderer.create(cosmosContainer, fallBackToCanvas, { usePhysics: true }).then(({ renderer }) => {
        if (disposed) { renderer?.destroy(); return; }
        if (!renderer) {
          if (perfHudEnabled) console.log("[02-05-DEBUG] cosmos-create: renderer=null (init failed)");
          usePhysicsRef.current = false;
          setRenderBackend("canvas2d");
          setCosmosReady(false);  // ensure flag is false in the synchronous-init-failure case
          setIsCosmosLoading(false);
          organicWorkerRef.current?.postMessage({ type: "pause", paused: false });
          markGraphDirty();
          return;
        }
        cosmosRendererRef.current = renderer;
        activeRendererRef.current = renderer;
        setCosmosReady(true);  // UI-02 fix (gap 4): signal stability-polling effect to re-run
        usePhysicsRef.current = renderer.isUsingPhysics();
        // FILT-01: apply the current visibility filter the moment the renderer is
        // available, so a filter that was already active (URL-seeded or set during
        // Cosmos init) is honored on the first frame instead of waiting for the
        // user to toggle a filter — at which point draw()'s nodeCount-change
        // branch would otherwise have already overwritten any zeroed sizes.
        if (visibleIndexSetRef.current.size > 0) {
          renderer.setVisibleIndices(visibleIndexSetRef.current);
        }
        if (perfHudEnabled) {
          console.log("[02-05-DEBUG] cosmos-create.then: usePhysics=", usePhysicsRef.current,
            "nodesRef.length=", nodesRef.current.length,
            "nodeIndexMap.size=", nodeIndexMapRef.current.size,
            "posRef.length=", posRef.current.length);
        }
        // GPU-physics path drives sliders directly — pause the worker so it
        // doesn't fight Cosmos's simulation when it's already running.
        if (usePhysicsRef.current) {
          organicWorkerRef.current?.postMessage({ type: "pause", paused: true });
          // Push the precomputed cache as the initial position seed so the very
          // first frame is recognizable instead of random Cosmos noise.
          if (posRef.current.length > 0) {
            renderer.setInitialPositions(posRef.current);
            if (perfHudEnabled) console.log("[02-05-DEBUG] cosmos-create.then: setInitialPositions count=", posRef.current.length / 2);
          } else if (perfHudEnabled) {
            console.log("[02-05-DEBUG] cosmos-create.then: SKIPPED setInitialPositions — posRef empty");
          }
          // Cluster ids are stable for the dataset — strength is sliderized.
          const clusterIds = buildClusterIdsFromNodes(nodesRef.current, "role");
          if (clusterIds.length > 0) renderer.setPointClusters(clusterIds);
          // CRITICAL: project topology links on the main thread because the
          // worker (which normally posts to linksRef) is gated off here. Without
          // this, Cosmos receives 0 springs and the simulation collapses
          // (Sim α: 0.000, grey canvas — observed during 25k-node verification).
          if (nodesRef.current.length > 0 && nodeIndexMapRef.current.size > 0) {
            const topology = buildAccTopologyGraph(nodesRef.current);
            linksRef.current = projectTopologyLinksToIndexPairs(
              topology.links,
              nodeIndexMapRef.current,
            );
            if (perfHudEnabled) {
              console.log("[02-05-DEBUG] cosmos-create.then: PATH-A built links sources=", linksRef.current.sources.length,
                "topology.links=", topology.links.length);
            }
          } else if (perfHudEnabled) {
            console.log("[02-05-DEBUG] cosmos-create.then: PATH-A SKIPPED — nodesRef empty (data not loaded yet)");
          }
          // Apply the current slider values immediately so visit-after-reload picks up persisted state.
          renderer.setSimulationConfig(controlsToSimulationConfig(graphControlsRef.current));
        }

        // Wire click selection to side panel
        renderer.onNodeSelectCallback = (index: number | null) => {
          if (index === null) {
            setSelectedNode(null);
            selectedNodeRef.current = null;
            // UI-02: deselection (null) does NOT reheat — only positive selects do.
          } else {
            const node = nodesRef.current[index] ?? null;
            if (node) {
              const state: SidePanelState = { node };
              setSelectedNode(state);
              selectedNodeRef.current = state;
              // UI-02: selecting a node reheats — hide the stable badge.
              resetStability();
            }
          }
          markGraphDirty();
        };

        // UI-01 (gap closure 03-04): hover labels are drawn by the Cosmos
        // label overlay (CosmosGraphRenderer.drawLabelOverlay) via the
        // labelOverrideIndices channel. The frame builder reads
        // hoveredNodeRef.current and adds its index to the override set, so
        // hover handlers just update the ref + state and mark dirty so the
        // rAF tick rebuilds the frame.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cosmosGraph = (renderer as any).graph;
        if (cosmosGraph) {
          cosmosGraph.setConfigPartial({
            onPointMouseOver: (index: number, _position: [number, number], _event: MouseEvent) => {
              const node = nodesRef.current[index];
              if (node) {
                hoveredNodeRef.current = node;
                setHoveredNode(node);
                markGraphDirty();
              }
            },
            onPointMouseOut: () => {
              hoveredNodeRef.current = null;
              setHoveredNode(null);
              markGraphDirty();
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
      setPerfGpu(null);
      markGraphDirty();
    }

    return () => {
      disposed = true;
      // IMPORTANT: null activeRendererRef BEFORE calling destroy() so the RAF
      // loop's null-guard fires if a frame renders between cancelAnimationFrame
      // and destroy() completing.
      activeRendererRef.current = null;
      usePhysicsRef.current = false;
      canvasRendererRef.current?.destroy();
      canvasRendererRef.current = null;
      cosmosRendererRef.current?.destroy();
      cosmosRendererRef.current = null;
      threeRendererRef.current?.destroy();
      threeRendererRef.current = null;
      setCosmosReady(false);  // UI-02 fix (gap 4): renderer torn down, polling effect should stop
      // Always dismiss spinner on cleanup — prevents stuck spinner if Fast Refresh
      // fires while the dynamic import is in-flight (disposed=true makes .then() bail early)
      setIsCosmosLoading(false);
      setIsThreeLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderBackend]);

  useEffect(() => {
    void import("@cosmos.gl/graph").catch(() => { /* ignore pre-warm errors */ });
    void import("three").catch(() => { /* ignore pre-warm errors */ });
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
        const onPhysics = usePhysicsRef.current === true;
        setPerfUsePhysics(onPhysics);
        if (onPhysics) {
          setPerfSimAlpha(cosmosRendererRef.current?.getSimulationAlpha() ?? 0);
          setPerfNodeCount(nodesRef.current.length);
        } else {
          setPerfTickMs(perfLastTickMsRef.current);
          setPerfLinkCount(linksRef.current.sources.length);
        }
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
    // GPU-physics path (TD-005): the d3-force worker is only needed for the
    // Canvas2D fallback. Skipping the spawn avoids a 25k-node initial tick
    // (~287ms) that would otherwise compete with Cosmos for the main thread
    // before being told to pause.
    if (renderBackend === "cosmos") {
      organicWorkerRef.current = null;
      return;
    }

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
      // UI-02: mark that at least one tick has arrived so the stability
      // detector won't fire during the pre-warm-up window.
      hasReceivedTickRef.current = true;
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

    if (shouldInitializeLayoutWorker(renderBackend, nodesRef.current.length)) {
      restartOrganicLayout("restart");
    }

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      if (organicWorkerRef.current === worker) organicWorkerRef.current = null;
    };
  }, [markGraphDirty, rebuildGrid, renderBackend, restartOrganicLayout]);

  // UI-02: Stability detection — Canvas2D path.
  // Watches motionMetric.averageVelocity (updated from worker ticks). When
  // sustained below STABLE_THRESHOLD for STABLE_DURATION_MS, flip isSimStable
  // to true. Worker is NOT terminated; this is a UI signal only.
  useEffect(() => {
    if (!isReady || !hasReceivedTickRef.current) return;
    const STABLE_THRESHOLD = 0.0001;
    const STABLE_DURATION_MS = 500;
    const v = motionMetric.averageVelocity;

    if (v < STABLE_THRESHOLD) {
      if (stableStartedAtRef.current === null) {
        stableStartedAtRef.current = Date.now();
      }
      
      if (Date.now() - stableStartedAtRef.current >= STABLE_DURATION_MS) {
        setIsSimStable(true);
      } else {
        // Schedule a re-check in case no further ticks arrive (worker self-pauses).
        // If another sub-threshold tick arrives, this timeout is cleared and
        // rescheduled for the remaining duration.
        const elapsed = Date.now() - stableStartedAtRef.current;
        const remaining = Math.max(0, STABLE_DURATION_MS - elapsed);
        const handle = setTimeout(() => {
          if (
            stableStartedAtRef.current !== null &&
            Date.now() - stableStartedAtRef.current >= STABLE_DURATION_MS
          ) {
            setIsSimStable(true);
          }
        }, remaining + 20);
        return () => clearTimeout(handle);
      }
    } else {
      stableStartedAtRef.current = null;
      if (isSimStable) setIsSimStable(false);
    }
  }, [motionMetric.averageVelocity, isReady, isSimStable]);

  // UI-02: Stability detection — Cosmos GPU-physics path.
  // Polls getSimulationAlpha() and isSimulationRunning() at 100ms cadence.
  // Stable = alpha < 0.005 AND simulation not running for STABLE_DURATION_MS.
  // UI-02 (gap 4 fix): cosmosReady is in deps so the effect re-runs once the
  // async CosmosGraphRenderer.create() resolves and assigns the ref. Previously
  // [isReady, isSimStable] alone left the effect inert when isReady flipped
  // before Cosmos init completed (the common case).
  useEffect(() => {
    if (!isReady || !cosmosReady) return;
    const cosmos = cosmosRendererRef.current;
    if (!cosmos) return; // belt-and-suspenders; cosmosReady true implies ref non-null
    const STABLE_DURATION_MS = 500;
    const id = window.setInterval(() => {
      const alpha = cosmos.getSimulationAlpha?.() ?? 1;
      const running = cosmos.isSimulationRunning?.() ?? true;
      const stableNow = alpha < 0.005 && !running;
      if (stableNow) {
        // Cosmos path: a successful alpha read counts as a "tick" for the
        // warm-up guard.
        hasReceivedTickRef.current = true;
        if (stableStartedAtRef.current === null) {
          stableStartedAtRef.current = Date.now();
        } else if (Date.now() - stableStartedAtRef.current >= STABLE_DURATION_MS) {
          setIsSimStable(true);
        }
      } else {
        stableStartedAtRef.current = null;
        if (isSimStable) setIsSimStable(false);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [isReady, isSimStable, cosmosReady]);

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

    // UI-01: populate display label so the Canvas2D late-zoom label pass has
    // text to render. Degree is filled in once links arrive (see updateNodeDegrees).
    // Phase 5.1: merge enriched v2.0 fields from the users prop (populated by
    // DashboardClient from accMembers.enrichedUsers). These fields are optional —
    // safe to skip if enriched query hasn't resolved yet.
    const userEnrichMap = new Map<string, BulkAccUser>();
    for (const u of users) userEnrichMap.set(u.email.toLowerCase(), u);
    for (const n of rawNodes) {
      n.label = n.name || n.email || n.id;
      n.degree = 0;
      const enriched = userEnrichMap.get(n.email.toLowerCase());
      if (enriched) {
        n.perProjectRoleNames = enriched.perProjectRoleNames;
        n.aggregatedStatus = enriched.aggregatedStatus;
        n.projectAdmin = enriched.projectAdmin;
        n.executive = enriched.executive;
        n.isAccountAdmin = enriched.isAccountAdmin;
        n.companyName = enriched.companyName;
      }
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
    // GPU-physics path: seed Cosmos with the precomputed positions and cluster ids.
    // restartOrganicLayout above is a no-op in this path (no worker spawned).
    if (perfHudEnabled) {
      console.log("[02-05-DEBUG] data-load: rawNodes=", rawNodes.length,
        "usePhysicsRef=", usePhysicsRef.current,
        "cosmosRenderer=", !!cosmosRendererRef.current,
        "posRef.length=", posRef.current.length);
    }
    if (usePhysicsRef.current && cosmosRendererRef.current) {
      if (posRef.current.length > 0) {
        cosmosRendererRef.current.setInitialPositions(posRef.current);
      }
      const clusterIds = buildClusterIdsFromNodes(rawNodes, "role");
      if (clusterIds.length > 0) {
        cosmosRendererRef.current.setPointClusters(clusterIds);
      }
      // CRITICAL: the d3-force worker (which posts links to linksRef) is gated off
      // in the GPU-physics path. Build the spoke→spoke link projection directly
      // on the main thread so Cosmos receives a non-empty link buffer — without
      // this, simulationLinkSpring has nothing to act on, the simulation collapses
      // to alpha=0 immediately, and the canvas renders empty (TD-005 follow-up bug
      // surfaced during 25k-node verification).
      const topology = buildAccTopologyGraph(rawNodes);
      const projected = projectTopologyLinksToIndexPairs(topology.links, nodeIndexMap);
      linksRef.current = projected;
      if (perfHudEnabled) {
        console.log("[02-05-DEBUG] data-load: PATH-B built links topology=", topology.links.length,
          "projected=", projected.sources.length);
      }
      cosmosRendererRef.current.setSimulationConfig(
        controlsToSimulationConfig(graphControlsRef.current),
      );
    } else if (perfHudEnabled) {
      console.log("[02-05-DEBUG] data-load: PATH-B SKIPPED — usePhysicsRef=", usePhysicsRef.current,
        "cosmosRenderer=", !!cosmosRendererRef.current);
    }
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
    hasActiveFiltersRef.current =
      filters.roles.length > 0 ||
      filters.lastAddedBuckets.length > 0 ||
      filters.adminAccess !== "all" ||
      filters.disabledModules.length > 0 ||
      filters.companyRoles.length > 0 ||
      !!filters.dateFrom ||
      !!filters.dateTo;

    // Drag-defer guard: if a node drag is in progress, store the pending filter
    // change and apply it after pointerup clears isDraggingNodeRef.
    if (isDraggingNodeRef.current) {
      pendingFiltersRef.current = filters;
      return;
    }
    pendingFiltersRef.current = null;
    // CSS fade-out: trigger a brief opacity dip on the canvas wrapper before
    // the visible set changes so the transition feels intentional rather than abrupt.
    setIsFilterTransitioning(true);
    rebuildVisibleIndices();
    // Notify Cosmos renderer of the new visible set so it can zero-size excluded points.
    cosmosRendererRef.current?.setVisibleIndices(visibleIndexSetRef.current);
    // UI-02: filter changes alter graph membership — reheat. We accept the
    // slightly-eager reset on no-op filter changes (stability re-establishes
    // within 500ms) rather than computing membership diffs.
    resetStability();
    const fadeTimer = setTimeout(() => setIsFilterTransitioning(false), 150);
    return () => clearTimeout(fadeTimer);
  }, [filters, rebuildVisibleIndices, resetStability]);

  // URL persistence: write non-default filter values to query params (debounced).
  // Skip the very first call so the initial mount seed doesn't echo back.
  const isFirstUrlWriteRef = useRef(true);
  useEffect(() => {
    if (isFirstUrlWriteRef.current) {
      isFirstUrlWriteRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      writeFiltersToUrl(filters, pathname, router);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, pathname, router]);

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
      // UI-01 (gap closure follow-on): the Cosmos label overlay must redraw every
      // rAF tick so labels track nodes during Cosmos's own smooth zoom/pan
      // animation (which runs independently of markGraphDirty). Canvas2D still
      // uses the dirty-flag gate since a full scene redraw is expensive.
      const isCosmosRenderer = renderer instanceof CosmosGraphRenderer;
      const isThreeRenderer = renderer instanceof ThreeGraphRenderer;
      const needsFullDraw = camLerping || needsRenderRef.current || forceLiveLayoutRender;
      if (!needsFullDraw && !isCosmosRenderer && !isThreeRenderer) return;

      if (needsFullDraw) {
        v.x += (tv.x - v.x) * 0.2;
        v.y += (tv.y - v.y) * 0.2;
        v.scale += (tv.scale - v.scale) * 0.2;
      }

      const { width, height } = getViewportSize(containerRef.current);
      const nodes = nodesRef.current;
      const positions = posRef.current;
      const selectedId = selectedNodeRef.current?.node.id ?? null;
      const mappedSelectedIndex = selectedId ? (nodeIndexMapRef.current.get(selectedId) ?? -1) : -1;
      const selectedIndex = mappedSelectedIndex >= 0 && visibleIndexSetRef.current.has(mappedSelectedIndex)
        ? mappedSelectedIndex
        : -1;
      const { adjacent: highlightSetBase, sameUser: sameUserHighlightSet } = buildHighlightSet(
        selectedIndex,
        nodes,
      );
      // 02-04: When a polygon selection is active, override the per-node
      // highlight set so the existing dim/bright pipeline (Canvas2D
      // CanvasGraphRenderer + Cosmos same-user path) emphasizes the selected
      // cluster identically across both renderers — no new render path needed.
      const polygonSel = polygonSelectionRef.current;
      const highlightSet = polygonSel
        ? new Set<number>(polygonSel.indices)
        : highlightSetBase;
      const isInteracting =
        isDragging.current ||
        Math.abs(tv.x - v.x) > 0.0005 ||
        Math.abs(tv.y - v.y) > 0.0005 ||
        Math.abs(tv.scale - v.scale) > v.scale * 0.002;

      // UI-01: recompute per-node degree when the links reference changes.
      // Cheap (O(linkCount)) and only runs on worker output / topology rebuilds.
      const currentLinks = linksRef.current;
      if (currentLinks !== lastLinksForDegreeRef.current && nodes.length > 0) {
        for (let i = 0; i < nodes.length; i++) {
          // node.degree is optional on GraphRenderNode — UserNode declares it.
          (nodes[i] as { degree?: number }).degree = 0;
        }
        if (currentLinks) {
          const { sources, targets } = currentLinks;
          for (let i = 0; i < sources.length; i++) {
            const s = sources[i];
            const t = targets[i];
            if (s >= 0 && s < nodes.length) {
              (nodes[s] as { degree?: number }).degree = ((nodes[s] as { degree?: number }).degree ?? 0) + 1;
            }
            if (t >= 0 && t < nodes.length) {
              (nodes[t] as { degree?: number }).degree = ((nodes[t] as { degree?: number }).degree ?? 0) + 1;
            }
          }
        }
        lastLinksForDegreeRef.current = currentLinks;
      }

      // UI-01: late-zoom label fade band. Multipliers (2.0× / 3.5× of fit-scale)
      // come from RESEARCH.md — band starts at "comfortable cluster" zoom and
      // saturates by the "individual node" zoom.
      const fitScale = lastFitScaleRef.current || 600;
      const labelFadeStartScale = fitScale * 2.0;
      const labelFadeEndScale = fitScale * 3.5;

      // UI-01 (gap closure 03-04): Cosmos fade band in zoom-level units
      // (Cosmos's getZoomLevel returns 1.0 ≈ fit, independent of Canvas2D
      // scale units). 2.0..3.5 mirrors the Canvas2D band semantics. Tune
      // empirically via UAT if labels feel too eager / too late.
      const cosmosLabelFadeStartZoom = 2.0;
      const cosmosLabelFadeEndZoom = 3.5;

      // UI-01: assemble the override set from current hover + selection so
      // those nodes' labels render regardless of zoom.
      const overrides = new Set<number>();
      const hovered = hoveredNodeRef.current;
      if (hovered) {
        const hi = nodeIndexMapRef.current.get(hovered.id) ?? -1;
        if (hi >= 0) overrides.add(hi);
      }
      if (selectedIndex >= 0) {
        overrides.add(selectedIndex);
        // Isolated-view: when a node is selected, label every same-user
        // instance too so the user sees the full identity cluster at once
        // (the normal-fade pass is suppressed downstream — see
        // CosmosGraphRenderer.drawLabelOverlay).
        for (const i of sameUserHighlightSet) overrides.add(i);
      }

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
        isInteracting: isThreeRenderer ? (isInteracting || forceLiveLayoutRender) : isInteracting,
        view: v,
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        backgroundColor: GRAPH_BACKGROUND,
        cameraMode: isThreeRenderer ? "orbit" : undefined,
        isCameraMoving: isThreeRenderer ? threeCameraMovingRef.current : false,
        labelFadeStartScale,
        labelFadeEndScale,
        labelOverrideIndices: overrides,
        cosmosLabelFadeStartZoom,
        cosmosLabelFadeEndZoom,
      };

      // Full scene draw only when dirty (GPU upload cost on Canvas2D / Cosmos data paths).
      let drawResult: { needsContinuousRedraw: boolean } = { needsContinuousRedraw: false };
      if (needsFullDraw || isThreeRenderer) {
        drawResult = renderer.draw(frame);
      }
      // UI-01 (gap closure 03-04): on the Cosmos path, draw the screen-space
      // label overlay on top of the GL canvas. Runs every tick (not gated by
      // needsFullDraw) so labels track Cosmos's own smooth zoom/pan animation.
      // Gated by isCosmosRenderer so the canvas2d path is unaffected.
      if (isCosmosRenderer) {
        const overlay = cosmosLabelOverlayRef.current;
        if (overlay) {
          const ctx2d = overlay.getContext("2d");
          if (ctx2d) {
            renderer.drawLabelOverlay(ctx2d, frame, window.devicePixelRatio || 1);
          }
        }
      }
      needsRenderRef.current = (needsFullDraw || isThreeRenderer) && (forceLiveLayoutRender || camLerping || drawResult.needsContinuousRedraw);
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
          // UI-02: dragging a node reheats the simulation — hide the badge.
          resetStability();
          return;
        }
      }
    }

    // NOTE: Pan must NOT reheat — UI-02 contract (CONTEXT.md). View transforms
    // (pan/zoom) are display-only and never trigger resetStability().
    isDragging.current = true;
    setIsDraggingState(true);
  }, [hitTest, resetStability]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const lx = event.clientX - rect.left;
    const ly = event.clientY - rect.top;

    if (isDraggingNodeRef.current && draggedNodeIdxRef.current >= 0) {
      // GPU-physics path: Cosmos owns drag natively via onDragStart/End. The
      // canvas2d handler is reachable only when the canvas2d backend is active,
      // but guard explicitly so we never post to a paused worker.
      if (usePhysicsRef.current) {
        return;
      }
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
    const hoverChanged = hoveredNodeRef.current?.id !== (node?.id ?? null);
    hoveredNodeRef.current = node;
    setHoveredNode(node);
    if (tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly + 12}px)`;
      tooltipRef.current.style.opacity = node ? "1" : "0";
    }
    // UI-01: hover acts as a label override; trigger a redraw so the override
    // label appears immediately (the rAF gate would otherwise skip steady frames).
    if (hoverChanged) markGraphDirty();
  }, [hitTest, markGraphDirty, rebuildGrid, saveView]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;

    if (isDraggingNodeRef.current) {
      const idx = draggedNodeIdxRef.current;
      isDraggingNodeRef.current = false;
      draggedNodeIdxRef.current = -1;
      setIsDraggingState(false);
      // Skip worker release in GPU-physics path — Cosmos handles drag end via onDragEnd.
      if (idx >= 0 && !usePhysicsRef.current) {
        organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
      }
      // Apply any filter change that was deferred while dragging.
      if (pendingFiltersRef.current !== null) {
        filtersRef.current = pendingFiltersRef.current;
        pendingFiltersRef.current = null;
        rebuildVisibleIndices();
      }
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
    // UI-02: selecting a node reheats the simulation — hide the badge.
    resetStability();
    markGraphDirty();
  }, [hitTest, rebuildGrid, markGraphDirty, resetStability]);

  const handleWheel = useCallback((event: WheelEvent) => {
    // NOTE: Zoom must NOT reheat — UI-02 contract (CONTEXT.md). Wheel events
    // only mutate view.current (scale/x/y); they never call resetStability().
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

  // UI-01 (gap closure 03-04): the Cosmos GL canvas owns its own wheel-zoom
  // (we do NOT call preventDefault — Cosmos still receives the event). We
  // only need to mark the graph dirty so the rAF tick wakes up to redraw the
  // label overlay at the new Cosmos zoom level. NOT a reheat — just a redraw
  // signal. UI-02 contract preserved (no resetStability call here).
  useEffect(() => {
    if (renderBackend !== "cosmos") return;
    const container = cosmosContainerRef.current;
    if (!container) return;
    const onWheel = () => { markGraphDirty(); };
    container.addEventListener("wheel", onWheel, { passive: true });
    return () => { container.removeEventListener("wheel", onWheel); };
  }, [renderBackend, markGraphDirty]);

  // UI-01 (gap closure 03-04): clear the overlay canvas when the backend
  // switches away from Cosmos so stale labels do not linger after a
  // Cosmos→Canvas2D fallback. CSS opacity-0 also hides the overlay, but
  // clearing the backing store is defensive — DevTools / future code paths
  // that flip opacity back would otherwise expose stale pixels.
  useEffect(() => {
    if (renderBackend === "cosmos") return;
    const overlay = cosmosLabelOverlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
  }, [renderBackend]);

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
    const companyRoleCount = new Map<string, number>();

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

      // companyRole: null maps to "Unspecified" bucket
      const crBucket = (node as { companyRole?: string | null }).companyRole ?? "Unspecified";
      companyRoleCount.set(crBucket, (companyRoleCount.get(crBucket) ?? 0) + 1);
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
    // Renamed: moduleOptions (was modules) — every option starts ON (exclude-list semantics)
    const moduleOptions: FilterOption[] = [...moduleCount.entries()]
      .map(([value, count]) => ({ value, label: moduleLabel(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    // companyRoleOptions — distinct companyRole buckets, sorted alphabetically
    const companyRoleOptions: FilterOption[] = [...companyRoleCount.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { roles, lastAddedBuckets, moduleOptions, companyRoleOptions };
  }, [graphQuery.data]);

  useEffect(() => {
    if (!graphQuery.data) return;
    setFilters(prev => {
      const validRoles = new Set(filterOptions.roles.map(o => o.value));
      const validModules = new Set(filterOptions.moduleOptions.map(o => o.value));
      const validBuckets = new Set(filterOptions.lastAddedBuckets.map(o => o.value));
      const validCompanyRoles = new Set(filterOptions.companyRoleOptions.map(o => o.value));
      const nextRoles = prev.roles.filter(r => validRoles.has(r));
      const nextDisabledModules = prev.disabledModules.filter(m => validModules.has(m));
      const nextBuckets = prev.lastAddedBuckets.filter(b => validBuckets.has(b));
      const nextCompanyRoles = prev.companyRoles.filter(cr => validCompanyRoles.has(cr));
      if (
        nextRoles.length === prev.roles.length &&
        nextDisabledModules.length === prev.disabledModules.length &&
        nextBuckets.length === prev.lastAddedBuckets.length &&
        nextCompanyRoles.length === prev.companyRoles.length
      ) {
        return prev; // No change — avoid re-render
      }
      return { ...prev, roles: nextRoles, disabledModules: nextDisabledModules, lastAddedBuckets: nextBuckets, companyRoles: nextCompanyRoles };
    });
  }, [graphQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilters =
    filters.roles.length > 0 ||
    filters.lastAddedBuckets.length > 0 ||
    filters.adminAccess !== "all" ||
    filters.disabledModules.length > 0 ||
    filters.companyRoles.length > 0 ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    filters.perProjectRoles.length > 0;

  // activeFilterCount: number of filter dimensions that are non-default.
  // Used by plan 04's "Showing X of Y" header and "Clear all" button.
  const activeFilterCount =
    (filters.roles.length > 0 ? 1 : 0) +
    (filters.lastAddedBuckets.length > 0 ? 1 : 0) +
    (filters.adminAccess !== "all" ? 1 : 0) +
    (filters.disabledModules.length > 0 ? 1 : 0) +
    (filters.companyRoles.length > 0 ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.perProjectRoles.length > 0 ? 1 : 0);
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
    <div className="flex h-full overflow-hidden">
      {/* UI-03: filter panel — flex sibling of the graph canvas. Collapses
          to a 44px icon rail with active-filter badge; expands to 240px. */}
      <div
        className={cn(
          "relative flex-shrink-0 flex flex-col border-r border-border/30 bg-white/95 backdrop-blur-sm",
          "transition-[width] duration-200 motion-reduce:transition-none overflow-hidden",
        )}
        style={{ width: isFilterCollapsed ? 44 : 240 }}
        aria-label="Filter panel"
      >
        <button
          type="button"
          onClick={() => setIsFilterCollapsed((v) => !v)}
          className="flex items-center justify-center h-10 w-full border-b border-border/30 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none shrink-0"
          aria-label={isFilterCollapsed ? "Expand filter panel" : "Collapse filter panel"}
          aria-expanded={!isFilterCollapsed}
        >
          {isFilterCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {!isFilterCollapsed && (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
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
              {/* Filter panel header: count summary + clear-all */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Filters</p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 bg-white text-[11px] font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                  >
                    <span aria-hidden="true">×</span>
                    <span>Clear all</span>
                  </button>
                )}
              </div>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                  Showing <span className="font-bold">{displayVisibleCount.toLocaleString()}</span> of {totalInstances.toLocaleString()} users
                </span>
              )}

              {/* Existing controls */}
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

              {/* FILT-02: Date range — uses lastSignIn field (label reflects field; falls back to addedOn if
                  lastSignIn is unavailable from the ACC API — see 02.5-01 diagnostic log for confirmation) */}
              <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2 space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Last Activity</span>
                <label className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-7 shrink-0">From</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => {
                      // Capture value synchronously — React 19 nulls e.currentTarget
                      // by the time the setState updater runs.
                      const value = e.target.value;
                      setFilters((current) => ({ ...current, dateFrom: value }));
                    }}
                    className="flex-1 min-w-0 h-6 rounded-md border border-gray-200 bg-white px-1.5 text-[10px] text-gray-700 outline-none focus:border-gray-400"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-7 shrink-0">To</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilters((current) => ({ ...current, dateTo: value }));
                    }}
                    className="flex-1 min-w-0 h-6 rounded-md border border-gray-200 bg-white px-1.5 text-[10px] text-gray-700 outline-none focus:border-gray-400"
                  />
                </label>
              </div>

              {/* FILT-03: Module toggles — exclude-list semantics (all ON by default) */}
              {filterOptions.moduleOptions.length > 0 && (
                <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2 space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Modules</span>
                  <p className="text-[9px] text-gray-400 leading-tight">Toggle off to filter users with access only to that module.</p>
                  <div className="pt-0.5 space-y-0.5">
                    {filterOptions.moduleOptions.map((option) => (
                      <ModuleToggle
                        key={option.value}
                        label={option.label}
                        enabled={!filters.disabledModules.includes(option.value)}
                        onToggle={() => setFilters((current) => ({
                          ...current,
                          disabledModules: toggleValue(current.disabledModules, option.value),
                        }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* DATA-01: companyRole multi-select with search */}
              {filterOptions.companyRoleOptions.length > 0 && (
                <CompanyRoleFilter
                  options={filterOptions.companyRoleOptions}
                  selected={filters.companyRoles}
                  onToggle={(value) => setFilters((current) => ({
                    ...current,
                    companyRoles: toggleValue(current.companyRoles, value),
                  }))}
                />
              )}

              {/* GRAPH-01: Per-project role filter group */}
              {(roleFacetsQuery.data?.length ?? 0) > 0 && (
                <FilterMenu
                  label="Per-Project Roles"
                  options={(roleFacetsQuery.data ?? []).map((r) => ({
                    value: r.name,
                    label: r.name,
                    count: r.memberCount,
                  }))}
                  selected={filters.perProjectRoles}
                  onToggle={(value) => setFilters((current) => ({
                    ...current,
                    perProjectRoles: toggleValue(current.perProjectRoles, value),
                  }))}
                  maxVisible={Infinity}
                />
              )}
            </div>
          </div>
        )}
        {isFilterCollapsed && (
          <div className="flex-1 flex flex-col items-center pt-2 gap-2" aria-hidden="true">
            <Filter size={16} className="text-muted-foreground" />
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        data-render-backend={renderBackend}
        data-renderer-failure-reason={rendererFailureReason ?? undefined}
        data-acc-graph-last-worker-tick={IS_DEV ? layoutDiagnostics.lastWorkerTick : undefined}
        data-acc-graph-active-node-count={IS_DEV ? layoutDiagnostics.activeNodeCount : undefined}
        data-acc-graph-hidden-node-count={IS_DEV ? layoutDiagnostics.hiddenNodeCount : undefined}
        className="flex-1 relative overflow-hidden"
        style={{ background: GRAPH_BACKGROUND, minWidth: 0 }}
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
            {perfUsePhysics ? (
              <div>Sim α: {perfSimAlpha.toFixed(3)} / {perfNodeCount.toLocaleString()} nodes</div>
            ) : (
              <div>Tick: {perfTickMs.toFixed(1)}ms / {perfLinkCount} springs</div>
            )}
            <div>GPU: {perfGpu ?? "n/a"}</div>
          </div>
        )}

        {/* UI-02: Stable badge — fades in once the simulation has settled. */}
        <div
          role="status"
          aria-live="polite"
          aria-label={isSimStable ? "Graph stable" : "Graph updating"}
          data-testid="acc-graph-stable-badge"
          className={cn(
            "absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full",
            "text-[11px] font-medium border shadow-sm cursor-pointer select-none",
            "bg-white/90 border-emerald-200 text-emerald-700",
            "transition-opacity duration-200 motion-reduce:transition-none",
            isSimStable ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          onClick={() => setShowStableDiagnostics((v) => !v)}
        >
          <Check size={10} className="shrink-0" aria-hidden="true" />
          <span>Stable</span>
        </div>

        {/* UI-02: Stability diagnostics popover. Click the Stable badge to toggle. */}
        {isSimStable && showStableDiagnostics && (
          <div
            className="absolute top-12 right-3 z-30 w-56 rounded-md border bg-white p-3 shadow-md text-[11px]"
            role="dialog"
            aria-label="Stability diagnostics"
            data-testid="acc-graph-stable-diagnostics"
          >
            <div className="font-medium text-foreground mb-1">Simulation diagnostics</div>
            <dl className="space-y-0.5 text-muted-foreground">
              <div className="flex justify-between">
                <dt>Avg velocity</dt>
                <dd>{motionMetric.averageVelocity.toFixed(6)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Visible nodes</dt>
                <dd>{visibleCount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Links</dt>
                <dd>{motionMetric.linkCount.toLocaleString()}</dd>
              </div>
              {cosmosRendererRef.current && (
                <div className="flex justify-between">
                  <dt>Cosmos alpha</dt>
                  <dd>
                    {(cosmosRendererRef.current.getSimulationAlpha?.() ?? 0).toFixed(4)}
                  </dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              className="mt-2 text-[10px] text-muted-foreground underline"
              onClick={() => setShowStableDiagnostics(false)}
            >
              Close
            </button>
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
            {loadingTimedOut ? (
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

        {isThreeLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#F8F7F4]/70 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-4 border-gray-900 border-t-transparent animate-spin mb-4" />
            <span className="text-sm font-medium text-gray-800">Initializing 3D orbit renderer...</span>
          </div>
        )}

        {/* FILT-01 empty-state overlay: shown when filters are active but zero users match */}
        {isReady && visibleCount === 0 && hasActiveFilters && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#F8F7F4]/95">
            <span className="text-3xl mb-2" aria-hidden="true">🔍</span>
            <p className="text-base font-semibold text-gray-800">No users match these filters</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters to see results</p>
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-700 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="absolute top-3 right-3 z-10">
          <div className="text-[10px] text-gray-400 pr-1 text-right">
            {displayVisibleCount.toLocaleString()} of {totalInstances.toLocaleString()} instances - {motionMetric.linkCount.toLocaleString()} springs - {renderBackend === "three3d" ? "orbit / pan / zoom" : "scroll to zoom - drag to pan"}
          </div>
        </div>

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-[10px] text-gray-500 font-medium">Colored by Primary Role</span>
          <div className="w-px h-3 bg-gray-200 shrink-0" />
          <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setGraphMode("2d")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                graphDisplayMode === "2d"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              2D Spatial
            </button>
            <button
              type="button"
              onClick={() => setGraphMode("3d")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                graphDisplayMode === "3d"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              3D Orbit
            </button>
          </div>
          <button
            type="button"
            onClick={resetActiveView}
            title={renderBackend === "three3d" ? "Reset 3D camera" : "Fit graph"}
            aria-label={renderBackend === "three3d" ? "Reset 3D camera" : "Fit graph"}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <RotateCcw size={12} aria-hidden="true" />
          </button>
          <div className="w-px h-3 bg-gray-200 shrink-0" />
          <button
            onClick={togglePickMode}
            disabled={renderBackend === "three3d"}
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-medium transition-colors rounded-md px-1.5 py-0.5",
              renderBackend === "three3d"
                ? "text-gray-300 cursor-not-allowed"
                : pickMode
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            <span>Pick {pickMode ? "On" : "Off"}</span>
          </button>
          <button
            onClick={toggleLassoMode}
            disabled={renderBackend === "three3d"}
            data-testid="acc-graph-lasso-toggle"
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-medium transition-colors rounded-md px-1.5 py-0.5",
              renderBackend === "three3d"
                ? "text-gray-300 cursor-not-allowed"
                : lassoActive
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            <span>Lasso {lassoActive ? "On" : "Off"}</span>
          </button>
          {/* GRAPH-03: Admin tier toggle — off by default */}
          <button
            onClick={toggleAdminTiers}
            disabled={renderBackend === "three3d"}
            data-testid="acc-graph-admin-tiers-toggle"
            title="Show hub admins (★), project admins (◆), and executives (◯) with distinct shapes"
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-medium transition-colors rounded-md px-1.5 py-0.5",
              renderBackend === "three3d"
                ? "text-gray-300 cursor-not-allowed"
                : showAdminTiers
                ? "bg-amber-500 text-white"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            <span>Admin tiers {showAdminTiers ? "On" : "Off"}</span>
          </button>
        </div>

        <div className="absolute bottom-3 right-3 z-10 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 flex flex-col gap-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Node Types</p>
          <LegendDot color="#E63946" label="User" />
          <LegendDot color="#2A9D8F" label="Project" />
          <LegendDot color="#9B5DE5" label="Role" />
          <LegendDot color="#F4A261" label="Module" />
        </div>

        {/* GRAPH-03: Admin tier legend — shown only when toggle is ON */}
        {showAdminTiers && (
          <div
            className="absolute bottom-3 right-48 z-10 bg-white/90 backdrop-blur-sm border border-amber-200 rounded-xl px-3 py-2 flex flex-col gap-1"
            data-testid="acc-graph-admin-tier-legend"
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 mb-0.5">
              Admin Tiers
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
              <span className="text-amber-500 font-bold">★</span>
              <span>Hub admin</span>
              <span className="text-[9px] text-gray-400">(1.5× size)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
              <span className="text-blue-500 font-bold">◆</span>
              <span>Project admin</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
              <span className="text-purple-500 font-bold">◯</span>
              <span>Executive</span>
            </div>
          </div>
        )}

        {/* 02.5-03: CSS fade wrapper — plays a 150ms opacity dip when the visible
            set shrinks on filter change. Zero shader cost; purely CSS transition. */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-150 ease-out",
            isFilterTransitioning ? "opacity-60" : "opacity-100"
          )}
        >
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
                if (idx >= 0 && !usePhysicsRef.current) {
                  organicWorkerRef.current?.postMessage({ type: "release", nodeIndex: idx });
                }
              }
              isDragging.current = false;
              setIsDraggingState(false);
              hoveredNodeRef.current = null;
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
            ref={threeContainerRef}
            className={cn(
              "absolute inset-0 w-full h-full",
              renderBackend === "three3d" ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          />
          {/* UI-01 (gap closure 03-04): screen-space label overlay above the
              Cosmos GL canvas. pointer-events-none so wheel/click pass through
              to Cosmos. Drawn each rAF tick by CosmosGraphRenderer.drawLabelOverlay. */}
          <canvas
            ref={cosmosLabelOverlayRef}
            className={cn(
              "absolute inset-0 w-full h-full pointer-events-none",
              renderBackend === "cosmos" ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
        </div>
        {/* 02-04: Lasso overlay. When lassoActive it captures pointer events
            (suspending pan/zoom on the underlying canvas) and renders the
            in-progress polygon trace as an SVG polyline. The overlay stays
            mounted (with pointer-events-none) while a lasso path is non-empty
            so the polyline remains visible until pointerup. */}
        <div
          data-testid="acc-graph-lasso-overlay"
          onPointerDown={handleLassoPointerDown}
          onPointerMove={handleLassoPointerMove}
          onPointerUp={handleLassoPointerUp}
          onPointerCancel={handleLassoPointerUp}
          className={cn(
            "absolute inset-0 z-[15]",
            lassoActive ? "cursor-crosshair" : "",
            lassoActive ? "pointer-events-auto" : "pointer-events-none",
            (lassoActive || lassoPath.length > 0) ? "block" : "hidden",
          )}
        >
          {lassoPath.length >= 4 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polyline
                points={(() => {
                  let s = "";
                  for (let i = 0; i < lassoPath.length; i += 2) {
                    s += `${lassoPath[i]},${lassoPath[i + 1]} `;
                  }
                  return s.trim();
                })()}
                fill="rgba(59, 130, 246, 0.10)"
                stroke="rgb(59, 130, 246)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg max-w-[240px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            <UserTooltip
              node={hoveredNode}
              fileActivity={fileActivityQuery.data ?? null}
              fileActivityLoading={fileActivityQuery.isLoading}
            />
          )}
        </div>

      </div>

      {/* UI-03: detail panel — flex sibling of the graph canvas. Renders only
          when a single node is selected (and not during a lasso multi-select). */}
      {selectedNode && !polygonSelection && (
        <div className="relative flex-shrink-0 w-[280px] border-l border-border/30 overflow-y-auto bg-white">
          <SidePanel
            state={selectedNode}
            onClose={() => {
              setSelectedNode(null);
              selectedNodeRef.current = null;
              markGraphDirty();
            }}
          />
        </div>
      )}

      {/* UI-03: polygon (lasso) summary panel — flex sibling, same slot as
          the detail panel. polygonSelection is mutually exclusive with
          selectedNode (gated by the conditional above). */}
      {polygonSelection && (
        <div
          data-testid="acc-graph-polygon-panel"
          className="relative flex-shrink-0 w-[280px] border-l border-border/30 overflow-y-auto bg-white"
        >
          <div className="h-full p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Lasso Selection
                </span>
                <span className="text-base font-bold text-gray-900">
                  {polygonSelection.summary.count} nodes
                </span>
              </div>
              <button
                onClick={clearPolygonSelection}
                data-testid="acc-graph-polygon-clear"
                className="text-[10px] font-medium px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Clear selection
              </button>
            </div>

            {polygonSelection.summary.byRole.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Top roles
                </span>
                <ul className="flex flex-col gap-0.5">
                  {polygonSelection.summary.byRole.map((entry) => (
                    <li
                      key={entry.value}
                      className="flex items-center justify-between gap-2 text-xs text-gray-800"
                    >
                      <span className="truncate">{entry.value}</span>
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {polygonSelection.summary.byModule.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Top modules
                </span>
                <ul className="flex flex-col gap-0.5">
                  {polygonSelection.summary.byModule.map((entry) => (
                    <li
                      key={entry.value}
                      className="flex items-center justify-between gap-2 text-xs text-gray-800"
                    >
                      <span className="truncate">{moduleLabel(entry.value)}</span>
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {polygonSelection.summary.sampleIds.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Sample ids
                </span>
                <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-gray-600">
                  {polygonSelection.summary.sampleIds.map((id) => (
                    <li key={id} className="truncate">{id}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// FILT-03: iOS-style module toggle — single toggle row
// Renders ON/OFF text alongside the switch so the state is unambiguous without
// relying on color alone. Disabled modules render the label struck-through.
function ModuleToggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span
        className={cn(
          "text-[11px] truncate max-w-[120px]",
          enabled ? "text-gray-700" : "text-gray-400 line-through",
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            "text-[9px] font-semibold tracking-wide w-6 text-right",
            enabled ? "text-emerald-600" : "text-gray-400",
          )}
        >
          {enabled ? "ON" : "OFF"}
        </span>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-emerald-500" : "bg-gray-300",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-3 w-3 rounded-full shadow transform transition-transform duration-200",
              enabled ? "translate-x-3 bg-white" : "translate-x-0 bg-gray-50",
            )}
          />
        </button>
      </div>
    </div>
  );
}

// DATA-01: companyRole multi-select rendered as a dropdown popover.
// Click the trigger to open; click outside or press Escape to dismiss.
// Selecting an option keeps the panel open so the user can multi-select.
function CompanyRoleFilter({ options, selected, onToggle }: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const triggerLabel =
    selected.length === 0
      ? "All roles"
      : `${selected.length} role${selected.length === 1 ? "" : "s"} selected`;

  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Company Role</span>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[11px] transition-colors",
            open
              ? "border-gray-400 bg-white"
              : "border-gray-200 bg-white hover:bg-gray-50",
          )}
        >
          <span className={cn("truncate", selected.length === 0 ? "text-gray-500" : "text-gray-800 font-medium")}>
            {triggerLabel}
          </span>
          <span className={cn("text-[10px] text-gray-500 transition-transform", open && "rotate-180")}>▾</span>
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg p-2 space-y-1.5">
            <input
              type="text"
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              autoFocus
              className="h-6 w-full rounded-md border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-gray-400"
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
              {filtered.length === 0 ? (
                <span className="block px-1 py-1 text-[10px] text-gray-400">No matching roles</span>
              ) : (
                filtered.map((option) => {
                  const active = selected.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      onClick={() => onToggle(option.value)}
                      className={cn(
                        "w-full flex items-center justify-between gap-1 px-2 py-0.5 rounded text-left text-[10px] transition-colors",
                        active
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-100",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className={cn("shrink-0 text-[9px] font-mono", active ? "opacity-70" : "text-gray-400")}>
                        {option.count}
                      </span>
                    </button>
                  );
                })
              )}
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

/** Format a Date or ISO string as a relative time (e.g. "3 days ago") */
function fmtRelative(dt: Date | string | null | undefined): string {
  if (!dt) return "—";
  try {
    const d = dt instanceof Date ? dt : new Date(dt);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days < 1) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return "—";
  }
}

type FileActivity = {
  lastView: Date | null;
  lastUpload: Date | null;
  lastEdit: Date | null;
  lastDelete: Date | null;
} | null;

function UserTooltip({
  node,
  fileActivity,
  fileActivityLoading,
}: {
  node: UserNode;
  fileActivity: FileActivity;
  fileActivityLoading: boolean;
}) {
  // Derive display status: prefer aggregated status from v2.0 data, fall back to isAdmin badge
  const statusPill = node.aggregatedStatus ?? null;
  const statusColor =
    statusPill === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : statusPill === "pending" ? "bg-amber-50 text-amber-700 border-amber-200"
    : statusPill === "deleted" ? "bg-red-50 text-red-600 border-red-200"
    : null;

  // Last file activity: pick the most recent across all categories
  const lastFileAt = fileActivity
    ? ([fileActivity.lastView, fileActivity.lastUpload, fileActivity.lastEdit, fileActivity.lastDelete]
        .filter((d): d is Date => d != null) as Date[])
        .map((d) => new Date(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    : null;

  return (
    <div className="space-y-1.5 min-w-[180px]">
      {/* Name + email */}
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500 break-all">{node.email}</p>

      {/* Status pill (text, never bare color) */}
      {statusPill && statusColor && (
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold", statusColor)}>
          {statusPill.charAt(0).toUpperCase() + statusPill.slice(1)}
        </span>
      )}

      {/* Company name */}
      {(node.companyName ?? node.companyRole) && (
        <p className="text-[10px] text-gray-600 font-medium truncate">
          {node.companyName ?? node.companyRole}
        </p>
      )}

      {/* Access level badges (text + color — color is NEVER the sole signal) */}
      {(node.isAccountAdmin || node.projectAdmin || node.executive) && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {node.isAccountAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 font-semibold">
              Hub Admin
            </span>
          )}
          {node.projectAdmin && !node.isAccountAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
              Project Admin
            </span>
          )}
          {node.executive && !node.isAccountAdmin && !node.projectAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
              Executive
            </span>
          )}
          {node.isAdmin && !node.isAccountAdmin && !node.projectAdmin && !node.executive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              Admin Access
            </span>
          )}
        </div>
      )}
      {!node.isAccountAdmin && !node.projectAdmin && !node.executive && node.isAdmin && (
        <p className="text-[9px] text-emerald-600 font-semibold">Admin Access</p>
      )}

      {/* Last sign-in */}
      {node.lastSignIn && (
        <p className="text-[9px] text-gray-400">
          Sign-in: {fmtRelative(node.lastSignIn)}
        </p>
      )}

      {/* Last file activity (lazy — shown only when loaded) */}
      {fileActivityLoading ? (
        <p className="text-[9px] text-gray-400 animate-pulse">File activity…</p>
      ) : lastFileAt ? (
        <p className="text-[9px] text-gray-400">
          File activity: {fmtRelative(lastFileAt)}
        </p>
      ) : null}

      {/* Roles (capped at 4) */}
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
