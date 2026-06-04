const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface PackedNode { index: number; x: number; y: number; cluster: number; size: number; }
export interface PackedLayout { nodes: PackedNode[]; discs: { x: number; y: number; r: number; cluster: number; count: number }[]; }

/**
 * One disc per cluster (radius ∝ √count), discs separated by collision relaxation,
 * members phyllotaxis-packed inside (largest `size` toward the centre). Pure + deterministic.
 */
export function packedClusterLayout(
  assign: Int32Array, sizes: Float64Array, k: number,
  opts: { w: number; h: number; base?: number; gap?: number; fill?: number } = { w: 1320, h: 840 },
): PackedLayout {
  const { w, h, base = 7, gap = 30, fill = 0.96 } = opts;
  const members: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < assign.length; i++) members[assign[i]].push(i);
  const R = members.map((m) => base * Math.sqrt(Math.max(1, m.length)));

  // pack discs: collision relaxation + pull to origin
  const cx = new Float64Array(k), cy = new Float64Array(k);
  for (let c = 0; c < k; c++) { const a = (2 * Math.PI * c) / k; const ring = R.reduce((s, r) => s + r, 0); cx[c] = Math.cos(a) * ring * 0.5; cy[c] = Math.sin(a) * ring * 0.5; }
  for (let it = 0; it < 600; it++) {
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      let dx = cx[j] - cx[i], dy = cy[j] - cy[i]; let d = Math.hypot(dx, dy) || 1e-6; const need = R[i] + R[j] + gap;
      if (d < need) { const push = (need - d) / 2; dx /= d; dy /= d; cx[i] -= dx * push; cy[i] -= dy * push; cx[j] += dx * push; cy[j] += dy * push; }
    }
    for (let c = 0; c < k; c++) { cx[c] *= 0.992; cy[c] *= 0.992; }
  }

  // phyllotaxis fill (largest size toward centre)
  const X = new Float64Array(assign.length), Y = new Float64Array(assign.length);
  for (let c = 0; c < k; c++) {
    const ms = members[c].slice().sort((a, b) => sizes[b] - sizes[a]); const M = ms.length;
    for (let m = 0; m < M; m++) { const rho = R[c] * fill * Math.sqrt((m + 0.5) / M); const th = m * GOLDEN; X[ms[m]] = cx[c] + rho * Math.cos(th); Y[ms[m]] = cy[c] + rho * Math.sin(th); }
  }

  // fit to canvas (preserve aspect)
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < assign.length; i++) { if (X[i] < minx) minx = X[i]; if (X[i] > maxx) maxx = X[i]; if (Y[i] < miny) miny = Y[i]; if (Y[i] > maxy) maxy = Y[i]; }
  const pad = 20; const s = Math.min((w - 2 * pad) / ((maxx - minx) || 1), (h - 2 * pad) / ((maxy - miny) || 1));
  const offx = (w - (maxx - minx) * s) / 2, offy = (h - (maxy - miny) * s) / 2;
  const px = (x: number) => offx + (x - minx) * s, py = (y: number) => offy + (y - miny) * s;

  const nodes: PackedNode[] = [];
  for (let i = 0; i < assign.length; i++) nodes.push({ index: i, x: px(X[i]), y: py(Y[i]), cluster: assign[i], size: sizes[i] });
  const discs = Array.from({ length: k }, (_, c) => ({ x: px(cx[c]), y: py(cy[c]), r: R[c] * s, cluster: c, count: members[c].length }));
  return { nodes, discs };
}
