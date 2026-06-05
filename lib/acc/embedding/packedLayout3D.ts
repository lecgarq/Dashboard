// Static 3D cluster-packed layout (the projector model): one ball per cluster, balls separated
// by 3D collision relaxation, members fibonacci-sphere-filled inside (large `size` toward centre).
// Pure + deterministic → positions are precomputed once and rendered as a static, orbit-able point
// cloud (zero physics → zero lag). 3D analog of packedLayout.ts.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Deterministic per-index pseudo-random triple in [0,1) — used to jitter the fibonacci lattice
 *  into an organic point cloud (projector look) without breaking determinism. */
function hash3(i: number): [number, number, number] {
  let h = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0; const a = (h & 1023) / 1023;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; const b = (h & 1023) / 1023;
  h = Math.imul(h ^ (h >>> 11), 2246822519) >>> 0; const c = (h & 1023) / 1023;
  return [a, b, c];
}

export interface PackedNode3D { index: number; x: number; y: number; z: number; cluster: number; size: number; }
export interface PackedLayout3D { nodes: PackedNode3D[]; spheres: { x: number; y: number; z: number; r: number; cluster: number; count: number }[] }

/**
 * @param assign cluster index per person (0..k-1)
 * @param sizes  per-person render size (access breadth)
 * @param k      cluster count
 * @param opts   cube edge length + packing params
 */
export function packedClusterLayout3D(
  assign: Int32Array,
  sizes: Float64Array,
  k: number,
  opts: { size?: number; base?: number; gap?: number; fill?: number } = {},
): PackedLayout3D {
  const { size = 1000, base = 26, gap = 24, fill = 0.95 } = opts;
  const members: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < assign.length; i++) members[assign[i]].push(i);
  // ball radius ∝ cbrt(count) so volume scales with membership (3D analog of √ in 2D)
  const R = members.map((m) => base * Math.cbrt(Math.max(1, m.length)));

  // pack cluster balls in 3D: collision relaxation on a deterministic fibonacci-sphere seed + pull to origin
  const cx = new Float64Array(k), cy = new Float64Array(k), cz = new Float64Array(k);
  const ring = R.reduce((s, r) => s + r, 0) + gap * k;
  for (let c = 0; c < k; c++) {
    const t = (c + 0.5) / k;
    const phi = Math.acos(1 - 2 * t);
    const theta = GOLDEN * c;
    cx[c] = ring * 0.5 * Math.sin(phi) * Math.cos(theta);
    cy[c] = ring * 0.5 * Math.sin(phi) * Math.sin(theta);
    cz[c] = ring * 0.5 * Math.cos(phi);
  }
  for (let it = 0; it < 600; it++) {
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      let dx = cx[j] - cx[i], dy = cy[j] - cy[i], dz = cz[j] - cz[i];
      let d = Math.hypot(dx, dy, dz) || 1e-6; const need = R[i] + R[j] + gap;
      if (d < need) {
        const push = (need - d) / 2; dx /= d; dy /= d; dz /= d;
        cx[i] -= dx * push; cy[i] -= dy * push; cz[i] -= dz * push;
        cx[j] += dx * push; cy[j] += dy * push; cz[j] += dz * push;
      }
    }
    for (let c = 0; c < k; c++) { cx[c] *= 0.992; cy[c] *= 0.992; cz[c] *= 0.992; }
  }

  // fill each ball: fibonacci-sphere direction + cbrt radial distribution (uniform ball fill),
  // largest `size` nearest the centre.
  const X = new Float64Array(assign.length), Y = new Float64Array(assign.length), Z = new Float64Array(assign.length);
  for (let c = 0; c < k; c++) {
    const ms = members[c].slice().sort((a, b) => sizes[b] - sizes[a]); const M = ms.length;
    const jitter = (R[c] / Math.max(1, Math.cbrt(M))) * 0.6; // ~local spacing → organic cloud
    for (let m = 0; m < M; m++) {
      const rr = R[c] * fill * Math.cbrt((m + 0.5) / M);
      const phi = Math.acos(1 - 2 * ((m + 0.5) / M));
      const theta = GOLDEN * m;
      const [j0, j1, j2] = hash3(ms[m] + 1);
      X[ms[m]] = cx[c] + rr * Math.sin(phi) * Math.cos(theta) + (j0 - 0.5) * jitter;
      Y[ms[m]] = cy[c] + rr * Math.sin(phi) * Math.sin(theta) + (j1 - 0.5) * jitter;
      Z[ms[m]] = cz[c] + rr * Math.cos(phi) + (j2 - 0.5) * jitter;
    }
  }

  // center + scale to fit a cube of edge `size` centred at origin (good for a three.js camera)
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < assign.length; i++) {
    if (X[i] < minx) minx = X[i]; if (X[i] > maxx) maxx = X[i];
    if (Y[i] < miny) miny = Y[i]; if (Y[i] > maxy) maxy = Y[i];
    if (Z[i] < minz) minz = Z[i]; if (Z[i] > maxz) maxz = Z[i];
  }
  const span = Math.max(maxx - minx, maxy - miny, maxz - minz) || 1;
  const s = size / span;
  const ox = (minx + maxx) / 2, oy = (miny + maxy) / 2, oz = (minz + maxz) / 2;
  const tx = (v: number) => (v - ox) * s, ty = (v: number) => (v - oy) * s, tz = (v: number) => (v - oz) * s;

  const nodes: PackedNode3D[] = [];
  for (let i = 0; i < assign.length; i++) nodes.push({ index: i, x: tx(X[i]), y: ty(Y[i]), z: tz(Z[i]), cluster: assign[i], size: sizes[i] });
  const spheres = Array.from({ length: k }, (_, c) => ({ x: tx(cx[c]), y: ty(cy[c]), z: tz(cz[c]), r: R[c] * s, cluster: c, count: members[c].length }));
  return { nodes, spheres };
}
