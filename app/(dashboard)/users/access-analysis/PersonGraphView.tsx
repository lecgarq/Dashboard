"use client";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/core/trpc";

type Node = { id: string; name: string; x: number; y: number; cluster: number; size: number };
type Edge = { a: number; b: number; tier: 1 | 2 | 3; reason: string };
type Cluster = { idx: number; label: string; color: string; count: number };

export function PersonGraphView() {
  const [k, setK] = useState(8);
  const { data } = trpc.accPersonGraph.snapshot.useQuery({ k });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !data) return;
    const nodes = data.nodes as Node[]; const edges = data.edges as Edge[]; const clusters = data.clusters as Cluster[];
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.fillStyle = "#070709"; ctx.fillRect(0, 0, W, H);
    const al: Record<number, number> = { 1: 0.24, 2: 0.07, 3: 0.025 }, lw: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.4 };
    for (const t of [3, 2, 1] as const) { ctx.lineWidth = lw[t]; ctx.strokeStyle = `rgba(200,210,225,${al[t]})`; ctx.beginPath(); for (const e of edges) { if (e.tier !== t) continue; const a = nodes[e.a], b = nodes[e.b]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } ctx.stroke(); }
    for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, n.size, 0, 6.2832); ctx.fillStyle = clusters[n.cluster].color; ctx.globalAlpha = n.size > 2.4 ? 0.95 : 0.8; ctx.fill(); ctx.globalAlpha = 1; }
    (window as unknown as { __ACC_PERSON_GRAPH_TEST__?: object }).__ACC_PERSON_GRAPH_TEST__ = { isReady: () => true, getNodeCount: () => nodes.length, getK: () => data.k };
  }, [data]);

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    if (!data) return; const nodes = data.nodes as Node[]; const edges = data.edges as Edge[];
    const cv = ev.currentTarget; const rect = cv.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * cv.width;
    const my = ((ev.clientY - rect.top) / rect.height) * cv.height;
    let best: Edge | null = null, bd = 12;
    for (const e of edges) { const a = nodes[e.a], b = nodes[e.b]; const d = pointToSeg(mx, my, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = e; } }
    setHover(best ? best.reason : null);
  }

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} width={1320} height={840} onMouseMove={onMove} data-testid="person-graph-canvas" className="h-full w-full" />
      <div className="absolute left-3 top-3 flex items-center gap-2 text-xs text-zinc-300">
        <span>Clusters: {k}</span>
        <input type="range" min={6} max={16} step={2} value={k} onChange={(e) => setK(+e.target.value)} data-testid="cluster-slider" />
      </div>
      {data?.clusters && (
        <div className="absolute right-3 top-3 flex max-w-[40%] flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-300">
          {(data.clusters as Cluster[]).map((c) => (
            <span key={c.idx} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.label} ({c.count})</span>
          ))}
        </div>
      )}
      {hover && <div className="absolute bottom-3 left-3 rounded bg-zinc-900/90 px-2 py-1 text-xs text-zinc-100">{hover}</div>}
    </div>
  );
}

function pointToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1; const l2 = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
