/**
 * clusterForceLayout.ts — Organic footprint layout for ALL cluster counts. d3-force
 * (forceManyBody + weak center gravity, plus forceCollide for separation) gives an
 * irregular, breathing outer shape — NEVER the rigid packSiblings→packEnclose circle.
 *
 * Two tunings, same {cx,cy,r} output:
 *   - few clusters (≤ ORGANIC_MAX_CLUSTERS): rich settle — strong collide (strict
 *     non-overlap), 280 ticks. Fast at small n, prettiest for roles/tiers.
 *   - many clusters (> threshold, e.g. ~3,367 users): FAST organic — size-scaled
 *     repulsion (big blobs claim more room), single-iteration light collide (gentle
 *     overlap allowed → blended at low slider, like the reference), capped repulsion
 *     range, fewer ticks. ~1s one-time instead of ~8s; the silhouette is irregular,
 *     not a packed disc.
 *
 * DATA DEFINES THE SHAPE (no fixed circle): settled coords kept at their NATURAL
 * extent, recentered on the centroid; only scaled DOWN if they'd overflow the GPU
 * space (never up to a disc). Pure & deterministic: fixed phyllotaxis seed (NO RNG),
 * fixed synchronous tick count. Drop-in for packMemberPositions / GPU anchors.
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

/**
 * Above this cluster count we switch from the rich settle to the FAST organic tuning
 * (size-scaled repulsion + single-iteration collide + fewer ticks). Both are organic
 * force layouts — neither is a packed circle. The split is purely about keeping the
 * one-time layout cost ~1s instead of ~8s at thousands of clusters.
 */
export const ORGANIC_MAX_CLUSTERS = 150;

/**
 * Footprint layout — always organic (force-directed), at any cluster count. Small
 * counts get the rich settle; large counts (users/projects) get the fast tuning. Both
 * yield an irregular silhouette, never a packed disc. Drop-in {cx,cy,r}.
 */
export function layoutClusterFootprints(counts: ReadonlyArray<number>): ClusterFootprints {
  return layoutClusterFootprintsOrganic(counts);
}

export function layoutClusterFootprintsOrganic(counts: ReadonlyArray<number>): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };
  for (let i = 0; i < k; i++) r[i] = footprintRadius(counts[i]);
  if (k === 1) return { cx, cy, r };

  const large = k > ORGANIC_MAX_CLUSTERS;

  // Deterministic spiral seed; bigger blobs nearer the centre (count order).
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  const nodes: FNode[] = order.map((idx, rank) => {
    const rr = SEED_RADIUS * Math.sqrt((rank + 0.5) / k);
    const th = rank * GOLDEN_ANGLE;
    return { r: r[idx], x: Math.cos(th) * rr, y: Math.sin(th) * rr, index: idx };
  });

  // Large: size-scaled charge (big blobs claim more room) + capped range + single-pass
  // light collide (gentle overlap → blended at low slider). Small: strong strict-
  // non-overlap collide + uniform charge (the proven rich settle).
  const charge = large
    ? forceManyBody<FNode>().strength((d) => -(d.r + 20)).distanceMax(1100)
    : forceManyBody<FNode>().strength(-12);
  const sim = forceSimulation<FNode>(nodes)
    .velocityDecay(large ? 0.5 : 0.4)
    .force(
      "collide",
      large
        ? forceCollide<FNode>((d) => d.r + 4).strength(0.5).iterations(1)
        : forceCollide<FNode>((d) => d.r * 1.25 + GAP).strength(1).iterations(3),
    )
    .force("charge", charge)
    .force("x", forceX<FNode>(0).strength(CENTER_STRENGTH * (large ? 2 : 1)))
    .force("y", forceY<FNode>(0).strength(CENTER_STRENGTH * (large ? 2 : 1)))
    .stop();
  const ticks = large ? 90 : TICKS;
  for (let t = 0; t < ticks; t++) sim.tick();

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
