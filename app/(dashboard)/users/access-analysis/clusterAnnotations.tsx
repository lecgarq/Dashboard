"use client";

import { useMemo } from "react";

export interface ClusterMemberRow {
  node_id: string;
  cluster: string;
  label: string;
  x: number;
  y: number;
}

export interface ClusterCentroid {
  cluster: string;
  label: string;
  cx: number;
  cy: number;
  count: number;
}

export function computeCentroidsFromMemory(
  rows: readonly ClusterMemberRow[],
  minMembers = 1,
): ClusterCentroid[] {
  const acc = new Map<string, { label: string; sx: number; sy: number; n: number }>();
  for (const row of rows) {
    const cur = acc.get(row.cluster) ?? { label: row.label, sx: 0, sy: 0, n: 0 };
    cur.sx += row.x;
    cur.sy += row.y;
    cur.n += 1;
    acc.set(row.cluster, cur);
  }
  const out: ClusterCentroid[] = [];
  for (const [cluster, v] of acc) {
    if (v.n < minMembers) continue;
    out.push({ cluster, label: v.label, cx: v.sx / v.n, cy: v.sy / v.n, count: v.n });
  }
  return out;
}

interface ClusterAnnotationsProps {
  centroids: readonly ClusterCentroid[];
  /** Convert world (cosmos) coords to screen pixels. */
  worldToScreen: (x: number, y: number) => { sx: number; sy: number };
  /** Pixel dims of the canvas — used for clipping off-screen labels. */
  width: number;
  height: number;
}

export function ClusterAnnotations({
  centroids,
  worldToScreen,
  width,
  height,
}: ClusterAnnotationsProps) {
  const items = useMemo(() => {
    return centroids
      .map((c) => {
        const { sx, sy } = worldToScreen(c.cx, c.cy);
        const fontPx = Math.max(11, Math.min(22, 11 + Math.log2(Math.max(2, c.count)) * 1.2));
        const visible = sx > -50 && sx < width + 50 && sy > -20 && sy < height + 20;
        return { ...c, sx, sy, fontPx, visible };
      })
      .filter((c) => c.visible);
  }, [centroids, worldToScreen, width, height]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {items.map((c) => (
        <span
          key={c.cluster}
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none rounded bg-white/70 px-1.5 py-0.5 font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:bg-slate-900/70 dark:text-slate-100"
          style={{ left: `${c.sx}px`, top: `${c.sy}px`, fontSize: `${c.fontPx}px` }}
        >
          {c.label}
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            {c.count.toLocaleString()}
          </span>
        </span>
      ))}
    </div>
  );
}
