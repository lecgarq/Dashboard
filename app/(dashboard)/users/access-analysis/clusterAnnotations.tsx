"use client";

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
