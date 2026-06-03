/**
 * layoutDescriptor.ts — The seam between the shell (which decides the GROUPING, once
 * per active-set change) and the renderer (which computes per-frame POSITIONS from the
 * live slider value). Keeping the two apart is the lag fix: structure is computed in
 * React on a regroup; `descriptorTarget` runs every frame, allocation-free, off the
 * React path. Pure: no React/DOM/IO.
 *
 *   0 active sliders → "rest"  (static organic cloud)
 *   1 active slider  → "blob"  (PROGRESSIVE morph: at 0 every node sits at its resting-
 *                               cloud position; at 100 it sits in its dominant-value clump
 *                               core. The slider linearly interpolates between the two, so
 *                               dragging gathers each value's members out of the cloud into
 *                               their own clump — proportional motion, no 0→1 jump.)
 *   2+ active        → "grid"  (cross-tab: strongest = columns, next = rows)
 */
import type { ClusterFootprints } from "./clusterPacking";
import { gridPositions, type GridStructure } from "./gridLayout";
import type { DominantClustering } from "./dominantClusters";

export type LayoutDescriptor =
  | { kind: "rest"; xyz: Float32Array }
  | {
      kind: "blob";
      dimId: string;
      clustering: DominantClustering;
      footprints: ClusterFootprints;
      /** Per-node LOOSE grouped position (stride-2, aligned to clustering.ids) — the s=0 end. */
      loose: Float32Array;
      /** Per-node packed clump-core position (stride-2, aligned to clustering.ids) — the s=1 end. */
      packed: Float32Array;
    }
  | { kind: "grid"; xId: string; yId: string; structure: GridStructure };

/**
 * Slider value (0..1) → morph progress (0..1), SMOOTHSTEP (ease-in-out): endpoints
 * are exact (0→0, 1→1) and the slope is 0 at both ends, so a small nudge off 0 moves
 * only a little — no 0→1 jump — and motion stays proportional across the whole range.
 * MUST be the single source of the curve — used by both the node morph (descriptorTarget)
 * and any per-frame follow logic so everything stays locked together.
 */
export function easeMorph(s: number): number {
  const t = Math.min(1, Math.max(0, s));
  return t * t * (3 - 2 * t);
}

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
      // s = smoothstep progress 0→1. Morph each node from its LOOSE grouped position
      // (s=0, organic) to its packed clump core (s=1, tight). Both endpoints share the
      // fixed footprint centers, so only member spread changes. Allocation-free.
      const s = easeMorph((live[desc.dimId] ?? 0) / 100);
      const n = desc.clustering.ids.length;
      const loose = desc.loose; // stride-2
      const packed = desc.packed; // stride-2
      for (let i = 0; i < n; i++) {
        const lx = loose[i * 2];
        const ly = loose[i * 2 + 1];
        out[i * 3] = lx + (packed[i * 2] - lx) * s;
        out[i * 3 + 1] = ly + (packed[i * 2 + 1] - ly) * s;
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
