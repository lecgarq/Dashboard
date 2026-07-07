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
/** Edge weight above which two roles are treated as one tightly-linked cluster (blob). */
const CLUSTER_WEIGHT = 0.6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Lighten a hex color by mixing it toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round((255 - ((n >> 16) & 0xff)) * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * amt));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Monotone-chain convex hull; returns points in CCW order. */
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length <= 2) return pts;
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

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
  const labelHalo = dark ? "#09090b" : "#ffffff";
  const shadowColor = dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.22)";

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

  const byId = useMemo(() => new Map(pnodes.map((n) => [n.roleId, n])), [pnodes]);

  // Pair weight lookup — feeds the hover tooltip's "Most similar N%" rows.
  const weightByPair = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of graph.edges) m.set(e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`, e.weight);
    return m;
  }, [graph]);
  const pairWeight = (a: string, b: string) => weightByPair.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;

  // Tightly-linked clusters (union-find over edges ≥ CLUSTER_WEIGHT) — drawn as
  // soft hull blobs behind the graph so "effectively interchangeable" is visible.
  const clusters = useMemo(() => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
      let c = x;
      while ((parent.get(c) ?? c) !== c) { const next = parent.get(c)!; parent.set(c, r); c = next; }
      return r;
    };
    for (const n of graph.nodes) parent.set(n.roleId, n.roleId);
    for (const e of graph.edges) {
      if (e.weight < CLUSTER_WEIGHT) continue;
      const ra = find(e.source), rb = find(e.target);
      if (ra !== rb) parent.set(ra, rb);
    }
    const groups = new Map<string, string[]>();
    for (const n of graph.nodes) {
      const r = find(n.roleId);
      (groups.get(r) ?? groups.set(r, []).get(r)!).push(n.roleId);
    }
    return [...groups.values()].filter((g) => g.length >= 2);
  }, [graph]);

  const clusterOf = useMemo(() => {
    const m = new Map<string, number>();
    clusters.forEach((ids, i) => ids.forEach((id) => m.set(id, i)));
    return m;
  }, [clusters]);

  // One render counter drives both sim ticks and view (pan/zoom) updates.
  const [, setFrame] = useState(0);
  const frame = () => setFrame((f) => f + 1);

  const simRef = useRef<Simulation<PNode, PEdge> | null>(null);
  useEffect(() => {
    const sim = forceSimulation<PNode>(pnodes)
      .force("link", forceLink<PNode, PEdge>(pedges).id((d) => d.roleId).distance((l) => 46 + (1 - l.weight) * 150).strength((l) => 0.12 + l.weight * 0.6))
      .force("charge", forceManyBody<PNode>().strength(-230))
      .force("center", forceCenter(width / 2, H / 2))
      .force("collide", forceCollide<PNode>().radius((d) => d.r + 13)) // +13 reserves room for the label line under each node
      .on("tick", () => {
        // Keep nodes inside the canvas so labels never need to detach from
        // their node — extra bottom room because labels sit below the circle.
        for (const n of pnodes) {
          n.x = clamp(n.x ?? width / 2, n.r + 10, width - n.r - 10);
          n.y = clamp(n.y ?? H / 2, n.r + 10, H - n.r - 20);
        }
        frame();
      })
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
  const hovered = hover ? byId.get(hover) ?? null : null;
  const v = viewRef.current;

  // Hover tooltip rows: neighbors sorted by similarity desc, with percentages.
  const hoveredNeighborRows = hovered && hoverNeighbors
    ? [...hoverNeighbors]
        .map((id) => ({ id, name: byId.get(id)?.roleName ?? id, w: pairWeight(hovered.roleId, id) }))
        .sort((a, b) => b.w - a.w)
        .slice(0, 5)
    : [];
  const hoveredClusterSize = hovered ? clusters[clusterOf.get(hovered.roleId) ?? -1]?.length ?? 0 : 0;

  return (
    <div className="panel-elevated p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-xs text-muted-foreground">
            Each dot is a role; curved lines join roles with similar folder access (thicker/closer = more similar). Size = folders reached, colour = highest tier. Shaded blobs group near-interchangeable roles (≥{Math.round(CLUSTER_WEIGHT * 100)}% similar). Scroll to zoom, drag the background to pan, drag a dot to move it. Click a dot for role details.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]" style={{ color: sub }}>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">{graph.nodes.length} roles</span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">{graph.edges.length} similarity links</span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">{clusters.length} tight {clusters.length === 1 ? "cluster" : "clusters"}</span>
          </div>
        </div>
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
          <defs>
            {/* One radial gradient per tier — gives every node a soft top-left sheen. */}
            {TIER_LEGEND.map((t) => (
              <radialGradient key={t.rank} id={`rsg-tier-${t.rank}`} cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor={lighten(TIER_COLORS[t.rank], 0.4)} />
                <stop offset="100%" stopColor={TIER_COLORS[t.rank]} />
              </radialGradient>
            ))}
            <filter id="rsg-shadow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor={shadowColor} />
            </filter>
          </defs>

          <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
            {/* Cluster blobs — padded convex hulls behind everything, tinted by the
                cluster's highest tier. Recomputed per frame from live positions. */}
            {clusters.map((ids, i) => {
              const members = ids.map((id) => byId.get(id)).filter((n): n is PNode => !!n);
              if (members.length < 2) return null;
              const pts = members.map((n) => [n.x ?? width / 2, n.y ?? H / 2] as [number, number]);
              const hull = convexHull(pts);
              const d = `M${hull.map((p) => `${p[0]},${p[1]}`).join("L")}Z`;
              const pad = Math.max(...members.map((n) => n.r)) + 16;
              const color = TIER_COLORS[Math.max(...members.map((n) => n.maxRank))] ?? "#71717a";
              const dim = hover !== null && !ids.includes(hover);
              return (
                <path
                  key={`hull-${i}`}
                  d={d}
                  fill={color}
                  stroke={color}
                  strokeWidth={pad * 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={dim ? 0.03 : dark ? 0.08 : 0.07}
                  pointerEvents="none"
                />
              );
            })}

            {/* Edges — quadratic arcs; hovered node's edges take its tier colour. */}
            {pedges.map((e, i) => {
              const s = e.source as PNode;
              const t = e.target as PNode;
              if (typeof s !== "object" || typeof t !== "object") return null;
              const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
              const dx = tx - sx, dy = ty - sy;
              const len = Math.hypot(dx, dy) || 1;
              const off = Math.min(26, len * 0.16);
              const cx = (sx + tx) / 2 - (dy / len) * off;
              const cy = (sy + ty) / 2 + (dx / len) * off;
              const touchesHover = hover !== null && (s.roleId === hover || t.roleId === hover);
              const lit = !hover || touchesHover;
              const stroke = touchesHover && hovered ? TIER_COLORS[hovered.maxRank] ?? edgeColor : edgeColor;
              // Midpoint of the quadratic at t=0.5 — anchor for the similarity % label.
              const qx = 0.25 * sx + 0.5 * cx + 0.25 * tx;
              const qy = 0.25 * sy + 0.5 * cy + 0.25 * ty;
              return (
                <g key={i} pointerEvents="none">
                  <path
                    d={`M${sx},${sy} Q${cx},${cy} ${tx},${ty}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={(0.6 + e.weight * 2.6) / v.k}
                    strokeOpacity={lit ? (touchesHover ? 0.85 : 0.55 * (0.4 + e.weight * 0.6)) : 0.05}
                    strokeLinecap="round"
                  />
                  {touchesHover && (
                    <text
                      x={qx}
                      y={qy - 4 / v.k}
                      textAnchor="middle"
                      fontSize={8.5 / v.k}
                      fontWeight={600}
                      fill={ink}
                      stroke={labelHalo}
                      strokeWidth={3 / v.k}
                      style={{ paintOrder: "stroke" }}
                    >
                      {Math.round(e.weight * 100)}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes — gradient fill, crisp rim, drop shadow; hover ring on the active node. */}
            {pnodes.map((n) => {
              const lit = isLit(n.roleId);
              const isHover = hover === n.roleId;
              const tierColor = TIER_COLORS[n.maxRank] ?? "#71717a";
              // Labels are glued to their node (bounds are enforced on the node
              // positions in the sim tick, not by relocating labels).
              const labelX = n.x ?? width / 2;
              const labelY = (n.y ?? H / 2) + n.r + 10 / v.k;
              return (
                <g
                  key={n.roleId}
                  data-role-node={n.roleId}
                  style={{ cursor: "pointer" }}
                  onPointerDown={onNodeDown(n)}
                  onMouseEnter={() => setHover(n.roleId)}
                  onMouseLeave={() => setHover((h) => (h === n.roleId ? null : h))}
                >
                  {isHover && (
                    <circle
                      cx={n.x} cy={n.y} r={n.r + 5 / v.k}
                      fill="none"
                      stroke={tierColor}
                      strokeWidth={1.5 / v.k}
                      strokeOpacity={0.65}
                    />
                  )}
                  <circle
                    cx={n.x} cy={n.y} r={n.r}
                    fill={`url(#rsg-tier-${n.maxRank})`}
                    stroke={nodeStroke}
                    strokeWidth={1.5 / v.k}
                    opacity={lit ? 1 : 0.16}
                    filter={lit ? "url(#rsg-shadow)" : undefined}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={9.5 / v.k}
                    fontWeight={isHover ? 600 : 400}
                    fill={ink}
                    stroke={labelHalo}
                    strokeWidth={3 / v.k}
                    style={{ paintOrder: "stroke" }}
                    opacity={lit ? 0.92 : 0.1}
                    pointerEvents="none"
                  >
                    {n.roleName.length > 20 ? n.roleName.slice(0, 19) + "…" : n.roleName}
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
            className="pointer-events-none absolute left-3 top-3 max-w-[280px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            // Tooltip stays pinned top-left (already in-bounds). If it ever follows a node,
            // clamp via CSS: left/top must not exceed panel - card dimensions.
          >
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TIER_COLORS[hovered.maxRank] }} aria-hidden />
              {hovered.roleName}
            </div>
            <div className="text-muted-foreground">
              {hovered.folderCount} folders
              {hoveredClusterSize >= 2 && (
                <> · in a cluster of {hoveredClusterSize} near-interchangeable roles</>
              )}
            </div>
            {hoveredNeighborRows.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Most similar</div>
                {hoveredNeighborRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-foreground/90">{r.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(r.w * 100)}%</span>
                  </div>
                ))}
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
