/**
 * clusterForceLayout.ts — Organic, non-overlapping footprint layout (the general
 * placement). Replaces the rigid packSiblings→packEnclose circle: uses d3-force
 * forceCollide to GUARANTEE non-overlap (the blobs-don't-touch invariant) while
 * forceManyBody + weak center gravity give an irregular, breathing outer shape.
 *
 * Pure & deterministic: nodes are seeded on a fixed phyllotaxis spiral (NO RNG) and
 * the simulation is ticked a FIXED number of times synchronously (sim.stop()), so
 * the same counts always yield the same layout (no per-render jitter). Output is the
 * SAME ClusterFootprints {cx,cy,r} shape as packClusterFootprints → drop-in for
 * packMemberPositions / ClusterLabels / the transition layer.
 */
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import { footprintRadius, type ClusterFootprints } from "./clusterPacking";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GAP = 6; // breathing room (space units) added to each collide radius
const TICKS = 280; // fixed iteration count → deterministic settle
const SEED_RADIUS = 1200; // initial spiral spread (pre-relaxation)
const TARGET_EXTENT = 1700; // keep camera framing comparable to the old packed layout

interface FNode {
  r: number;
  x: number;
  y: number;
  index: number;
}

export function layoutClusterFootprintsOrganic(counts: ReadonlyArray<number>): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };
  for (let i = 0; i < k; i++) r[i] = footprintRadius(counts[i]);
  if (k === 1) return { cx, cy, r };

  // Deterministic spiral seed; bigger blobs nearer the centre (count order).
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  const nodes: FNode[] = order.map((idx, rank) => {
    const rr = SEED_RADIUS * Math.sqrt((rank + 0.5) / k);
    const th = rank * GOLDEN_ANGLE;
    return { r: r[idx], x: Math.cos(th) * rr, y: Math.sin(th) * rr, index: idx };
  });

  const sim = forceSimulation<FNode>(nodes)
    .force("collide", forceCollide<FNode>((d) => d.r + GAP).strength(1).iterations(3))
    .force("charge", forceManyBody<FNode>().strength(-12))
    .force("x", forceX<FNode>(0).strength(0.045))
    .force("y", forceY<FNode>(0).strength(0.045))
    .stop();
  for (let t = 0; t < TICKS; t++) sim.tick();

  // Recenter on the centroid and scale so the max reach ≈ TARGET_EXTENT (stable framing).
  let mx = 0;
  let my = 0;
  for (const n of nodes) {
    mx += n.x;
    my += n.y;
  }
  mx /= k;
  my /= k;
  let maxReach = 1;
  for (const n of nodes) maxReach = Math.max(maxReach, Math.hypot(n.x - mx, n.y - my) + n.r);
  const scale = TARGET_EXTENT / maxReach;
  for (const n of nodes) {
    cx[n.index] = (n.x - mx) * scale;
    cy[n.index] = (n.y - my) * scale;
    r[n.index] = n.r * scale;
  }
  return { cx, cy, r };
}
