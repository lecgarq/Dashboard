"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useReducedMotion } from "framer-motion";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type Simulation, type SimulationNodeDatum, type SimulationLinkDatum,
} from "d3-force";
import { TIER_COLORS, TIER_LEGEND } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { RoleSimilarityGraph as GraphData, SimNode } from "../roleSimilarity";

interface PNode extends SimNode, SimulationNodeDatum {
  r: number;
}
interface PEdge extends SimulationLinkDatum<PNode> {
  weight: number;
}

const H = 500;
const CLICK_THRESHOLD_PX = 6;
const CLICK_DURATION_MS = 250;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function RoleSimilarityGraph({
  graph,
  onNodeClick,
}: {
  graph: GraphData;
  onNodeClick?: (roleId: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const ink = dark ? "#e4e4e7" : "#27272a";
  const sub = dark ? "#a1a1aa" : "#6b7280";
  const edgeColor = dark ? "rgba(161,161,170,0.55)" : "rgba(82,82,91,0.5)";
  const nodeStroke = dark ? "#09090b" : "#ffffff";

  const reducedMotion = useReducedMotion();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(920);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth((w) => { const nw = Math.max(360, el.clientWidth || 920); return w === nw ? w : nw; });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxFolders = useMemo(() => Math.max(1, ...graph.nodes.map((n) => n.folderCount)), [graph]);
  const radius = useMemo(() => (fc: number) => 6 + 16 * Math.sqrt(fc / maxFolders), [maxFolders]);

  // Deterministic circle seed so the first paint isn't a pile; d3 then settles it.
  // NOTE: Do NOT add theme/dark to these deps — colors are read at render time (Pitfall 6).
  const { pnodes, pedges, neighbors } = useMemo(() => {
    const N = graph.nodes.length;
    const pnodes: PNode[] = graph.nodes.map((n, i) => ({
      ...n, r: radius(n.folderCount),
      x: width / 2 + Math.cos((2 * Math.PI * i) / Math.max(1, N)) * 190,
      y: H / 2 + Math.sin((2 * Math.PI * i) / Math.max(1, N)) * 190,
    }));
    const pedges: PEdge[] = graph.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }));
    const neighbors = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      (neighbors.get(e.source) ?? neighbors.set(e.source, new Set()).get(e.source)!).add(e.target);
      (neighbors.get(e.target) ?? neighbors.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return { pnodes, pedges, neighbors };
  }, [graph, width, radius]);

  // One render counter drives both sim ticks and view (pan/zoom) updates.
  const [, setFrame] = useState(0);
  const frame = () => setFrame((f) => f + 1);

  const simRef = useRef<Simulation<PNode, PEdge> | null>(null);
  useEffect(() => {
    const sim = forceSimulation<PNode>(pnodes)
      .force("link", forceLink<PNode, PEdge>(pedges).id((d) => d.roleId).distance((l) => 46 + (1 - l.weight) * 150).strength((l) => 0.12 + l.weight * 0.6))
      .force("charge", forceManyBody<PNode>().strength(-230))
      .force("center", forceCenter(width / 2, H / 2))
      .force("collide", forceCollide<PNode>().radius((d) => d.r + 5))
      .on("tick", frame)
      .on("end", () => { sim.stop(); }); // settle-and-freeze: stop after alphaMin reached

    // Under reduced-motion: skip animation entirely — use seed positions as final layout
    if (reducedMotion) {
      sim.stop();
    }

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [pnodes, pedges, width, reducedMotion]);

  // Pan/zoom view transform (translate in screen px, then scale). Kept in a ref so
  // the imperative wheel/pointer handlers read the latest without stale closures.
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const setView = (next: { x: number; y: number; k: number }) => { viewRef.current = next; frame(); };
  const resetView = () => setView({ x: 0, y: 0, k: 1 });

  const screenToGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    const v = viewRef.current;
    return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k };
  };

  // Wheel zoom toward the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const v = viewRef.current;
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0012), 0.2, 5);
      viewRef.current = { x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k), k };
      setFrame((f) => f + 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const [hover, setHover] = useState<string | null>(null);
  // Extend ix to track totalMovement and downTime for click-vs-drag detection
  const ix = useRef<{
    mode: "none" | "node" | "pan";
    node: PNode | null;
    lastX: number;
    lastY: number;
    totalMovement: number;
    downTime: number;
  }>({ mode: "none", node: null, lastX: 0, lastY: 0, totalMovement: 0, downTime: 0 });

  const onNodeDown = (n: PNode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // don't also start a background pan
    ix.current = {
      mode: "node",
      node: n,
      lastX: e.clientX,
      lastY: e.clientY,
      totalMovement: 0,
      downTime: performance.now(),
    };
    const g = screenToGraph(e.clientX, e.clientY);
    n.fx = g.x; n.fy = g.y;
    simRef.current?.alphaTarget(0.3).restart();
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSvgDown = (e: React.PointerEvent) => {
    ix.current = { mode: "pan", node: null, lastX: e.clientX, lastY: e.clientY, totalMovement: 0, downTime: performance.now() };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = ix.current;
    if (s.mode === "node" && s.node) {
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.totalMovement += Math.hypot(dx, dy);
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      const g = screenToGraph(e.clientX, e.clientY);
      s.node.fx = g.x; s.node.fy = g.y;
    } else if (s.mode === "pan") {
      const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
      s.lastX = e.clientX; s.lastY = e.clientY;
      const v = viewRef.current;
      setView({ x: v.x + dx, y: v.y + dy, k: v.k });
    }
  };
  const onUp = (e?: React.PointerEvent) => {
    const s = ix.current;
    if (s.mode === "node" && s.node) {
      const elapsed = performance.now() - s.downTime;
      // Click-vs-drag: small movement AND short duration → treat as click
      if (s.totalMovement < CLICK_THRESHOLD_PX && elapsed < CLICK_DURATION_MS) {
        // Release fix before firing click (so layout stays stable)
        s.node.fx = null; s.node.fy = null;
        simRef.current?.alphaTarget(0);
        onNodeClick?.(s.node.roleId);
      } else {
        // It was a drag — release and let sim coast to freeze
        s.node.fx = null; s.node.fy = null;
        simRef.current?.alphaTarget(0);
      }
    }
    ix.current = { mode: "none", node: null, lastX: 0, lastY: 0, totalMovement: 0, downTime: 0 };
  };

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No roles to compare for this template.
      </div>
    );
  }

  const hoverNeighbors = hover ? neighbors.get(hover) ?? new Set<string>() : null;
  const isLit = (id: string) => !hover || id === hover || (hoverNeighbors?.has(id) ?? false);
  const hovered = hover ? pnodes.find((n) => n.roleId === hover) ?? null : null;
  const v = viewRef.current;

  // Label margin for in-bounds clamping
  const LABEL_MARGIN_X = 40;

  return (
    <div className="panel-elevated p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-xs text-muted-foreground">
          Each dot is a role; lines join roles with similar folder access (thicker/closer = more similar). Size = folders reached, colour = highest tier. Scroll to zoom, drag the background to pan, drag a dot to move it. Click a dot to see role details.
        </p>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: sub }}>
          {TIER_LEGEND.map((t) => (
            <span key={t.rank} className="flex items-center gap-1" title={t.label}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLORS[t.rank] }} />
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          ref={svgRef}
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          className="block touch-none select-none"
          style={{ cursor: ix.current.mode === "pan" ? "grabbing" : "grab" }}
          onPointerDown={onSvgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
            {pedges.map((e, i) => {
              const s = e.source as PNode;
              const t = e.target as PNode;
              if (typeof s !== "object" || typeof t !== "object") return null;
              const lit = !hover || (isLit(s.roleId) && isLit(t.roleId) && (s.roleId === hover || t.roleId === hover));
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={edgeColor}
                  strokeWidth={(0.6 + e.weight * 2.4) / v.k}
                  strokeOpacity={lit ? 0.55 * (0.4 + e.weight * 0.6) : 0.06}
                />
              );
            })}
            {pnodes.map((n) => {
              const lit = isLit(n.roleId);
              // In-bounds clamping for label position
              const labelX = clamp(n.x ?? (width / 2), LABEL_MARGIN_X, width - LABEL_MARGIN_X);
              const labelY = clamp((n.y ?? (H / 2)) + n.r + 9 / v.k, 12, H - 12);
              return (
                <g
                  key={n.roleId}
                  data-role-node={n.roleId}
                  style={{ cursor: "pointer" }}
                  onPointerDown={onNodeDown(n)}
                  onMouseEnter={() => setHover(n.roleId)}
                  onMouseLeave={() => setHover((h) => (h === n.roleId ? null : h))}
                >
                  <circle cx={n.x} cy={n.y} r={n.r} fill={TIER_COLORS[n.maxRank]} stroke={nodeStroke} strokeWidth={1.5 / v.k} opacity={lit ? 1 : 0.18} />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={9 / v.k}
                    fill={ink}
                    opacity={lit ? 0.9 : 0.12}
                    pointerEvents="none"
                  >
                    {n.roleName.length > 18 ? n.roleName.slice(0, 17) + "…" : n.roleName}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <button
          type="button"
          onClick={resetView}
          className="absolute bottom-3 right-3 rounded-full border border-border bg-card/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
          title="Reset zoom & pan"
        >
          Reset view
        </button>

        {hovered && (
          <div
            className="pointer-events-none absolute left-3 top-3 max-w-[260px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            // Tooltip stays pinned top-left (already in-bounds). If it ever follows a node,
            // clamp via CSS: left/top must not exceed panel - card dimensions.
          >
            <div className="font-semibold text-foreground">{hovered.roleName}</div>
            <div className="text-muted-foreground">{hovered.folderCount} folders</div>
            {hoverNeighbors && hoverNeighbors.size > 0 && (
              <div className="mt-1 text-muted-foreground">
                Most similar: <span className="text-foreground/90">{[...hoverNeighbors].map((id) => pnodes.find((p) => p.roleId === id)?.roleName ?? id).slice(0, 5).join(", ")}</span>
              </div>
            )}
            {onNodeClick && (
              <div className="mt-1.5 text-[10px] text-primary/70">Click to open role details</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
