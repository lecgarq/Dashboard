"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
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

export function RoleSimilarityGraph({ graph }: { graph: GraphData }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const ink = dark ? "#e4e4e7" : "#27272a";
  const sub = dark ? "#a1a1aa" : "#6b7280";
  const edgeColor = dark ? "rgba(161,161,170,0.55)" : "rgba(82,82,91,0.5)";
  const nodeStroke = dark ? "#09090b" : "#ffffff";

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

  const [, setTick] = useState(0);
  const simRef = useRef<Simulation<PNode, PEdge> | null>(null);
  useEffect(() => {
    const sim = forceSimulation<PNode>(pnodes)
      .force("link", forceLink<PNode, PEdge>(pedges).id((d) => d.roleId).distance((l) => 46 + (1 - l.weight) * 150).strength((l) => 0.12 + l.weight * 0.6))
      .force("charge", forceManyBody<PNode>().strength(-230))
      .force("center", forceCenter(width / 2, H / 2))
      .force("collide", forceCollide<PNode>().radius((d) => d.r + 5))
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => { sim.stop(); };
  }, [pnodes, pedges, width]);

  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ node: PNode | null }>({ node: null });

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };
  const onNodeDown = (n: PNode) => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current.node = n;
    n.fx = n.x; n.fy = n.y;
    simRef.current?.alphaTarget(0.3).restart();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const n = drag.current.node;
    if (!n) return;
    const p = toSvg(e.clientX, e.clientY);
    n.fx = p.x; n.fy = p.y;
  };
  const onUp = () => {
    const n = drag.current.node;
    if (n) { n.fx = null; n.fy = null; }
    drag.current.node = null;
    simRef.current?.alphaTarget(0);
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-xs text-muted-foreground">
          Each dot is a role; lines join roles with similar folder access (thicker/closer = more similar). Size = folders reached, colour = highest tier. Drag a dot; hover to isolate.
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
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
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
                strokeWidth={0.6 + e.weight * 2.4}
                strokeOpacity={lit ? 0.55 * (0.4 + e.weight * 0.6) : 0.06}
              />
            );
          })}
          {pnodes.map((n) => {
            const lit = isLit(n.roleId);
            return (
              <g key={n.roleId} style={{ cursor: "grab" }}
                 onPointerDown={onNodeDown(n)}
                 onMouseEnter={() => setHover(n.roleId)}
                 onMouseLeave={() => setHover((h) => (h === n.roleId ? null : h))}
              >
                <circle cx={n.x} cy={n.y} r={n.r} fill={TIER_COLORS[n.maxRank]} stroke={nodeStroke} strokeWidth={1.5} opacity={lit ? 1 : 0.18} />
                <text x={n.x} y={(n.y ?? 0) + n.r + 9} textAnchor="middle" fontSize={9} fill={ink} opacity={lit ? 0.9 : 0.12} pointerEvents="none">
                  {n.roleName.length > 18 ? n.roleName.slice(0, 17) + "…" : n.roleName}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[260px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <div className="font-semibold text-foreground">{hovered.roleName}</div>
            <div className="text-muted-foreground">{hovered.folderCount} folders</div>
            {hoverNeighbors && hoverNeighbors.size > 0 && (
              <div className="mt-1 text-muted-foreground">
                Most similar: <span className="text-foreground/90">{[...hoverNeighbors].map((id) => pnodes.find((p) => p.roleId === id)?.roleName ?? id).slice(0, 5).join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
