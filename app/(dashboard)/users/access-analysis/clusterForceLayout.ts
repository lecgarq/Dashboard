/**
 * clusterForceLayout.ts — Organic, non-overlapping footprint layout (the general
 * placement). Replaces the rigid packSiblings→packEnclose circle: uses d3-force
 * forceCollide to GUARANTEE non-overlap (the blobs-don't-touch invariant) while
 * forceManyBody + weak center gravity give an irregular, breathing outer shape.
 *
 * DATA DEFINES THE SHAPE (no fixed circle): the settled coordinates are kept at
 * their NATURAL collide extent — which already scales with cluster count and sizes
 * (footprintRadius ∝ √count) — recentered on the centroid. We do NOT rescale up to
 * a constant disc (the old "fixed shape that fits the data"); few/small clusters
 * stay compact, many/large clusters spread wider, and the camera auto-fits whatever
 * silhouette emerges. We only scale DOWN if the natural extent would overflow the
 * GPU space (safety), never up.
 *
 * Pure & deterministic: nodes are seeded on a fixed phyllotaxis spiral (NO RNG) and
 * the simulation is ticked a FIXED number of times synchronously (sim.stop()), so
 * the same counts always yield the same layout (no per-render jitter). Output is the
 * SAME ClusterFootprints {cx,cy,r} shape as packClusterFootprints → drop-in for
 * packMemberPositions / ClusterLabels / the transition layer / GPU anchors.
 */
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import { footprintRadius, type ClusterFootprints } from "./clusterPacking";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GAP = 6; // breathing room (space units) added to each collide radius
const TICKS = 280; // fixed iteration count → deterministic settle
const SEED_RADIUS = 1200; // initial spiral spread (pre-relaxation)
/** Weak centering keeps the cloud near the origin WITHOUT pulling it into a round
 *  disc; lower than the old 0.045 so collide relationships shape the silhouette. */
const CENTER_STRENGTH = 0.015;
/** Safety ceiling only: scale DOWN if the natural extent would exceed this so the
 *  anchors stay inside the GPU spaceSize (4096). Never scales the layout UP. */
const MAX_EXTENT = 1900;

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
    .force("x", forceX<FNode>(0).strength(CENTER_STRENGTH))
    .force("y", forceY<FNode>(0).strength(CENTER_STRENGTH))
    .stop();
  for (let t = 0; t < TICKS; t++) sim.tick();

  // Recenter on the centroid. Keep the NATURAL collide extent (data-defined shape +
  // size); only scale DOWN if it would overflow the GPU space — never up to a disc.
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
  const scale = Math.min(1, MAX_EXTENT / maxReach);
  for (const n of nodes) {
    cx[n.index] = (n.x - mx) * scale;
    cy[n.index] = (n.y - my) * scale;
    r[n.index] = n.r * scale;
  }
  return { cx, cy, r };
}
