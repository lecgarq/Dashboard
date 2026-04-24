"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { moduleLabel } from "@/lib/acc/modules";
import type { AccGraphNode } from "@/lib/acc/graphSnapshot";
import {
  CanvasGraphRenderer,
  WebGpuGraphRenderer,
  type GraphRenderFrame,
  type GraphRenderer,
} from "./graphRenderers";
import { type BulkAccUser } from "./AccAnalysisPanel";

interface UserNode {
  kind: "user";
  id: string;
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
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type SimNode = UserNode;

interface SidePanelState {
  node: SimNode;
}

interface SpatialGrid {
  size: number;
  cells: Map<string, number[]>;
}

export interface AccUsersGraphProps {
  users: BulkAccUser[];
  onSelectUser?: (email: string) => void;
}

const GRAPH_BACKGROUND = "#F8F7F4";

function buildGrid(pos: Float32Array, count: number, cellSize: number): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
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

function buildHighlightSet(selectedIndex: number): Set<number> {
  const highlightSet = new Set<number>();
  if (selectedIndex >= 0) highlightSet.add(selectedIndex);
  return highlightSet;
}

export function AccUsersGraph({ users, onSelectUser }: AccUsersGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const canvasRendererRef = useRef<CanvasGraphRenderer | null>(null);
  const webgpuRendererRef = useRef<WebGpuGraphRenderer | null>(null);
  const activeRendererRef = useRef<GraphRenderer | null>(null);

  const nodesRef = useRef<SimNode[]>([]);
  const posRef = useRef<Float32Array>(new Float32Array(0));
  const gridRef = useRef<SpatialGrid>({ size: 0.05, cells: new Map() });
  const nodeIndexMapRef = useRef(new Map<string, number>());
  const instIdxRef = useRef<Uint32Array>(new Uint32Array(0));
  const needsRenderRef = useRef(true);

  const view = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const targetView = useRef({ x: 0.5, y: 0.5, scale: 600 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });
  const selectedNodeRef = useRef<SidePanelState | null>(null);
  const isRefreshingRef = useRef(false);
  const lastAutoFitHashRef = useRef<string | null>(null);

  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SidePanelState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renderBackend, setRenderBackend] = useState<"canvas2d" | "webgpu">("canvas2d");
  const [rendererFailureReason, setRendererFailureReason] = useState<string | null>(null);

  const graphQuery = trpc.users.getPrecomputedGraph.useQuery(undefined, {
    enabled: users.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const rebuildGraph = trpc.users.rebuildAccGraphCache.useMutation();

  const markGraphDirty = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  const buildLayoutBuffers = useCallback((nodes: SimNode[]) => {
    const userIndices: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].kind === "user") userIndices.push(i);
    }

    instIdxRef.current = new Uint32Array(userIndices);
    markGraphDirty();
  }, [markGraphDirty]);

  const zoomToFit = useCallback((options?: { immediate?: boolean }) => {
    if (!posRef.current.length) return;

    const nodes = nodesRef.current;
    const positions = posRef.current;
    if (!nodes.length) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < nodes.length; i++) {
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

  const rebuildGrid = useCallback(() => {
    const cellSize = Math.max(0.005, 60 / view.current.scale);
    gridRef.current = buildGrid(posRef.current, nodesRef.current.length, cellSize);
  }, []);

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
    const webgpuCanvas = webgpuCanvasRef.current;
    if (!canvas2d || !webgpuCanvas) return;

    let disposed = false;
    const canvasRenderer = new CanvasGraphRenderer(canvas2d);
    canvasRendererRef.current = canvasRenderer;
    activeRendererRef.current = canvasRenderer;
    setRenderBackend("canvas2d");
    setRendererFailureReason(null);
    markGraphDirty();

    const fallBackToCanvas = (reason: string) => {
      if (disposed) return;
      webgpuRendererRef.current?.destroy();
      webgpuRendererRef.current = null;
      activeRendererRef.current = canvasRendererRef.current;
      setRenderBackend("canvas2d");
      setRendererFailureReason(reason);
      markGraphDirty();
    };

    void (async () => {
      const { renderer, failureReason } = await WebGpuGraphRenderer.create(webgpuCanvas, fallBackToCanvas);
      if (disposed) {
        renderer?.destroy();
        return;
      }
      if (!renderer) {
        setRenderBackend("canvas2d");
        setRendererFailureReason(failureReason ?? "WebGPU initialization failed");
        markGraphDirty();
        return;
      }

      webgpuRendererRef.current = renderer;
      activeRendererRef.current = renderer;
      setRenderBackend("webgpu");
      setRendererFailureReason(null);
      markGraphDirty();
    })();

    return () => {
      disposed = true;
      activeRendererRef.current = null;
      canvasRendererRef.current?.destroy();
      canvasRendererRef.current = null;
      webgpuRendererRef.current?.destroy();
      webgpuRendererRef.current = null;
    };
  }, [markGraphDirty]);

  useEffect(() => {
    if (rendererFailureReason) {
      console.debug(`[AccUsersGraph] renderer backend=${renderBackend}; fallback=${rendererFailureReason}`);
      return;
    }
    console.debug(`[AccUsersGraph] renderer backend=${renderBackend}`);
  }, [renderBackend, rendererFailureReason]);

  useEffect(() => {
    if (!users.length) return;

    setIsReady(false);

    const graph = graphQuery.data;
    if (!graph?.hit || !graph.positions) {
      nodesRef.current = [];
      posRef.current = new Float32Array(0);
      nodeIndexMapRef.current = new Map();
      setIsReady(false);
      markGraphDirty();
      return;
    }

    const rawNodes = (graph.nodes as AccGraphNode[])
      .filter((node) => node.kind === "instance")
      .map(graphNodeToSimNode);
    const positions = new Float32Array(graph.positions as number[]);
    if (
      positions.length !== rawNodes.length * 2 ||
      graph.nodeIds.length !== rawNodes.length ||
      !orderedNodeIdsMatch(graph.nodeIds, rawNodes)
    ) {
      nodesRef.current = [];
      posRef.current = new Float32Array(0);
      nodeIndexMapRef.current = new Map();
      setIsReady(false);
      markGraphDirty();
      return;
    }

    nodesRef.current = rawNodes;
    posRef.current = positions;

    const nodeIndexMap = new Map<string, number>();
    rawNodes.forEach((node, index) => nodeIndexMap.set(node.id, index));
    nodeIndexMapRef.current = nodeIndexMap;

    buildLayoutBuffers(rawNodes);
    if (lastAutoFitHashRef.current !== graph.dataHash) {
      zoomToFit({ immediate: true });
      lastAutoFitHashRef.current = graph.dataHash;
    }
    gridRef.current = buildGrid(posRef.current, rawNodes.length, Math.max(0.01, 60 / view.current.scale));
    isRefreshingRef.current = false;
    setIsReady(true);
    markGraphDirty();
  }, [users, graphQuery.data, refreshKey, buildLayoutBuffers, zoomToFit, markGraphDirty]);

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
      if (!camLerping && !needsRenderRef.current) return;

      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      const { width, height } = getViewportSize(containerRef.current);
      const nodes = nodesRef.current;
      const positions = posRef.current;
      const selectedId = selectedNodeRef.current?.node.id ?? null;
      const selectedIndex = selectedId ? (nodeIndexMapRef.current.get(selectedId) ?? -1) : -1;
      const highlightSet = buildHighlightSet(selectedIndex);
      const isInteracting =
        isDragging.current ||
        Math.abs(tv.x - v.x) > 0.0005 ||
        Math.abs(tv.y - v.y) > 0.0005 ||
        Math.abs(tv.scale - v.scale) > v.scale * 0.002;

      const frame: GraphRenderFrame = {
        nodes,
        positions,
        edges: [],
        particles: [],
        nodeIndexMap: nodeIndexMapRef.current,
        userIndices: instIdxRef.current,
        selectedNodeId: selectedId,
        selectedNodeIndex: selectedIndex,
        highlightSet,
        showRoles: false,
        showModules: false,
        isInteracting,
        view: v,
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        backgroundColor: GRAPH_BACKGROUND,
      };

      const drawResult = renderer.draw(frame);
      needsRenderRef.current = camLerping || drawResult.needsContinuousRedraw;
    };

    rafId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    isDragging.current = true;
    setIsDraggingState(true);
    clickStart.current = { x: event.clientX, y: event.clientY };
    lastMouse.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const lx = event.clientX - rect.left;
    const ly = event.clientY - rect.top;

    if (isDragging.current) {
      const dx = event.clientX - lastMouse.current.x;
      const dy = event.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: event.clientX, y: event.clientY };
      markGraphDirty();
      return;
    }

    const node = hitTest(lx, ly);
    setHoveredNode(node);
    if (tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${lx + 14}px, ${ly + 12}px)`;
      tooltipRef.current.style.opacity = node ? "1" : "0";
    }
  }, [hitTest, markGraphDirty]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
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
    const nextScale = Math.max(10, Math.min(500000, v.scale * Math.pow(1.002, -event.deltaY)));
    view.current = {
      scale: nextScale,
      x: wx - (mx - cx) / nextScale,
      y: wy - (my - cy) / nextScale,
    };
    targetView.current = { ...view.current };
    rebuildGrid();
    markGraphDirty();
  }, [rebuildGrid, markGraphDirty]);

  useEffect(() => {
    const canvases = [canvas2dRef.current, webgpuCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      for (const canvas of canvases) {
        canvas.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleWheel]);

  const totalInstances = useMemo(
    () => graphQuery.data?.stats.totalProjectInstances ?? users.reduce((sum, user) => sum + (user.found ? user.projects.length : 0), 0),
    [graphQuery.data?.stats.totalProjectInstances, users],
  );
  const graphCacheNeedsBuild = !!users.length && graphQuery.isSuccess && !graphQuery.data?.hit;

  const renderCanvasClass = cn(
    "absolute inset-0 block w-full h-full",
    isDraggingState ? "cursor-grabbing" : hoveredNode ? "cursor-pointer" : "cursor-crosshair",
  );

  if (!users.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ACC data available. Load ACC data in the ACC Analysis tab first.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 relative">
      <div
        ref={containerRef}
        data-render-backend={renderBackend}
        data-renderer-failure-reason={rendererFailureReason ?? undefined}
        className="flex-1 relative rounded-xl border border-border/30 overflow-hidden"
        style={{ background: GRAPH_BACKGROUND }}
      >
        {!isReady && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F8F7F4]/80 backdrop-blur-sm">
            {graphCacheNeedsBuild ? (
              <>
                <span className="text-sm font-semibold text-gray-900">
                  {graphQuery.data?.stale ? "ACC graph cache is stale" : "ACC graph cache has not been built"}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {graphQuery.data?.stats.totalProjectInstances.toLocaleString() ?? 0} project-slots need a backend layout.
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
            ) : (
              <>
                <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4" />
                <span className="text-sm font-medium text-emerald-700">Loading precomputed graph...</span>
              </>
            )}
          </div>
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <div className="flex gap-1">
            <ControlButton active={false} onClick={() => zoomToFit()}>Fit</ControlButton>
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
                  onError: () => {
                    isRefreshingRef.current = false;
                  },
                });
              }}
              disabled={rebuildGraph.isPending}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
                "bg-white/80 text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-400",
                rebuildGraph.isPending && "opacity-50 cursor-not-allowed",
              )}
            >
              {rebuildGraph.isPending ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                  {" "}Rebuilding...
                </>
              ) : (
                "Rebuild Layout"
              )}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 pr-1">
            {totalInstances.toLocaleString()} instances - scroll to zoom - drag to pan
          </div>
        </div>

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2">
          <LegendDot color="#10B981" label="Project Admin" />
          <span className="text-[10px] text-gray-400">- colored by primary role</span>
        </div>

        <canvas
          ref={canvas2dRef}
          className={cn(renderCanvasClass, renderBackend === "canvas2d" ? "opacity-100" : "opacity-0 pointer-events-none")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            markGraphDirty();
          }}
        />
        <canvas
          ref={webgpuCanvasRef}
          className={cn(renderCanvasClass, renderBackend === "webgpu" ? "opacity-100" : "opacity-0 pointer-events-none")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            isDragging.current = false;
            setIsDraggingState(false);
            setHoveredNode(null);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            markGraphDirty();
          }}
        />
        <div
          ref={tooltipRef}
          className="absolute top-0 left-0 z-30 pointer-events-none bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg max-w-[240px] opacity-0 transition-opacity duration-75 will-change-transform"
          style={{ transform: "translate(0,0)" }}
        >
          {hoveredNode && (
            <UserTooltip node={hoveredNode as UserNode} />
          )}
        </div>
      </div>

      {selectedNode && (
        <SidePanel
          state={selectedNode}
          onClose={() => {
            setSelectedNode(null);
            selectedNodeRef.current = null;
            markGraphDirty();
          }}
          onViewProfile={() => {
            onSelectUser?.(selectedNode.node.email);
            setSelectedNode(null);
            selectedNodeRef.current = null;
            markGraphDirty();
          }}
        />
      )}
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all",
        active
          ? "bg-gray-900/10 text-gray-900 border-gray-400/40"
          : "bg-white/80 text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-400",
      )}
    >
      {children}
    </button>
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
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500">{node.email}</p>
      {node.projectName && <p className="text-[10px] text-gray-600">{node.projectName}</p>}
    </div>
  );
}

function SidePanel({
  state,
  onClose,
  onViewProfile,
}: {
  state: SidePanelState;
  onClose: () => void;
  onViewProfile?: () => void;
}) {
  const node = state.node;
  const title = node.name || node.email;

  return (
    <div className="w-64 shrink-0 ml-3 bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">&times;</button>
      </div>

      {(() => {
        const user = node;
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 break-all">{user.email}</p>
            {!user.found && (
              <p className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg px-2 py-1.5">
                Not yet synced to ACC.
              </p>
            )}
            {user.found && user.hasNoProjects && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                Synced but no projects assigned.
              </p>
            )}
            {user.projectCount > 0 && (
              <p className="text-[10px] text-gray-400 italic">
                {user.projectName ?? `In ${user.projectCount} project${user.projectCount > 1 ? "s" : ""}`}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {user.isAdmin && <Tag color="emerald">Admin Access</Tag>}
            </div>
            {user.roles.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
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
            {user.modules.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Modules</p>
                <div className="flex flex-wrap gap-1">
                  {user.modules.map((moduleName) => (
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
            {onViewProfile && (
              <button
                onClick={onViewProfile}
                className="w-full text-xs font-medium py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all"
              >
                View Profile
              </button>
            )}
          </div>
        );
      })()}
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
