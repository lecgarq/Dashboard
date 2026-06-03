/**
 * lodAggregate.ts — Per-cluster aggregate "super-dots" for the LOD view (pure; no React/DOM/IO).
 *
 * One dot per dominant-attribute value (e.g. per user), so the renderer can draw ~3,367 dots
 * during a drag instead of ~16,942 instances. Each dot MORPHS on the same rest→clump eased path
 * as the nodes and labels — position = lerp(rest centroid → clump center, easedProgress) — so the
 * gathering stays visible at the cluster level. Size scales with member count.
 *
 * Structure is built ONCE per regroup (buildClusterAggregates); positions are written per frame
 * into a reused buffer (aggregatePositions), allocation-free, off the React path.
 */
import type { ClusterFootprints } from "./clusterPacking";
import { footprintRadius } from "./clusterPacking";

export interface ClusterAggregates {
  /** Number of clusters (aggregate dots). */
  count: number;
  /** Per-cluster resting-cloud centroid (the easedProgress=0 end). */
  restX: Float32Array;
  restY: Float32Array;
  /** Per-cluster clump (footprint) center (the easedProgress=1 end). */
  clumpX: Float32Array;
  clumpY: Float32Array;
  /** Per-cluster dot size (world units), ∝ √(member count). */
  size: Float32Array;
  /** Per-cluster member count (for sizing/labels). */
  memberCount: Float32Array;
}

/**
 * Assemble the aggregate dots from the already-computed clustering pieces:
 *   - restCentersX/Y: per-cluster mean of member rest positions (shell's blobRestCenters)
 *   - footprints:     per-cluster clump center (cx/cy) + radius
 *   - counts:         per-cluster member count
 * All inputs are aligned by cluster index. Pure & deterministic.
 */
export function buildClusterAggregates(
  restCentersX: Float32Array,
  restCentersY: Float32Array,
  footprints: ClusterFootprints,
  counts: ReadonlyArray<number>,
): ClusterAggregates {
  const k = counts.length;
  const restX = new Float32Array(k);
  const restY = new Float32Array(k);
  const clumpX = new Float32Array(k);
  const clumpY = new Float32Array(k);
  const size = new Float32Array(k);
  const memberCount = new Float32Array(k);
  for (let c = 0; c < k; c++) {
    restX[c] = restCentersX[c] ?? 0;
    restY[c] = restCentersY[c] ?? 0;
    clumpX[c] = footprints.cx[c] ?? 0;
    clumpY[c] = footprints.cy[c] ?? 0;
    // Reuse footprintRadius so an aggregate dot is sized like its blob's footprint.
    size[c] = footprintRadius(counts[c]);
    memberCount[c] = counts[c];
  }
  return { count: k, restX, restY, clumpX, clumpY, size, memberCount };
}

/**
 * Per-frame stride-2 positions for the K aggregate dots: lerp(rest → clump, easedProgress).
 * Writes into `out` (length must be count*2); returns it. Allocation-free. `easedProgress`
 * is the SAME eased value (easeMorph) the nodes use, so dots and nodes stay in lockstep.
 */
export function aggregatePositions(
  agg: ClusterAggregates,
  easedProgress: number,
  out: Float32Array,
): Float32Array {
  const s = Math.min(1, Math.max(0, easedProgress));
  const k = agg.count;
  for (let c = 0; c < k; c++) {
    const rx = agg.restX[c];
    const ry = agg.restY[c];
    out[c * 2] = rx + (agg.clumpX[c] - rx) * s;
    out[c * 2 + 1] = ry + (agg.clumpY[c] - ry) * s;
  }
  return out;
}
