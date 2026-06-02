/**
 * layoutDescriptor.ts — The seam between the shell (which decides the GROUPING, once
 * per active-set change) and the renderer (which computes per-frame POSITIONS from the
 * live slider value). Keeping the two apart is the lag fix: structure is computed in
 * React on a regroup; `descriptorTarget` runs every frame, allocation-free, off the
 * React path. Pure: no React/DOM/IO.
 *
 *   0 active sliders → "rest"  (static organic cloud)
 *   1 active slider  → "blob"  (one packed blob per value; slider = tightness)
 *   2+ active        → "grid"  (cross-tab: strongest = columns, next = rows)
 */
import { packMemberPositions, type ClusterFootprints } from "./clusterPacking";
import { gridPositions, type GridStructure } from "./gridLayout";
import type { DominantClustering } from "./dominantClusters";

export type LayoutDescriptor =
  | { kind: "rest"; xyz: Float32Array }
  | { kind: "blob"; dimId: string; clustering: DominantClustering; footprints: ClusterFootprints }
  | { kind: "grid"; xId: string; yId: string; structure: GridStructure };

/** Per-node node count a descriptor positions (for buffer sizing). */
export function descriptorNodeCount(desc: LayoutDescriptor): number {
  switch (desc.kind) {
    case "rest":
      return desc.xyz.length / 3;
    case "blob":
      return desc.clustering.ids.length;
    case "grid":
      return desc.structure.colOf.length;
  }
}

/**
 * Compute the target stride-3 positions for the current live slider values, writing
 * into `out` (length must be nodeCount*3) where possible. `live` is 0..100 keyed by
 * dim id. Returns the buffer holding the result ("rest" returns its static buffer).
 */
export function descriptorTarget(
  desc: LayoutDescriptor,
  live: Record<string, number>,
  out: Float32Array,
): Float32Array {
  switch (desc.kind) {
    case "rest":
      return desc.xyz; // static — no per-frame work
    case "blob": {
      const t = Math.min(1, Math.max(0, (live[desc.dimId] ?? 0) / 100));
      const n = desc.clustering.ids.length;
      const xy = packMemberPositions(desc.clustering.ids, desc.footprints, t, n); // stride-2
      for (let i = 0; i < n; i++) {
        out[i * 3] = xy[i * 2];
        out[i * 3 + 1] = xy[i * 2 + 1];
        out[i * 3 + 2] = 0;
      }
      return out;
    }
    case "grid": {
      const valueX = Math.min(1, Math.max(0, (live[desc.xId] ?? 0) / 100));
      const valueY = Math.min(1, Math.max(0, (live[desc.yId] ?? 0) / 100));
      return gridPositions(desc.structure, { valueX, valueY }, out);
    }
  }
}
