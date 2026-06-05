/**
 * nodeSizes.ts — Pure per-node radius buffer for the 2D access map.
 * Bigger dot = broader access (admin / many projects / strong permission).
 * No React/DOM/IO. Returns world-unit radii consumed by GraphCanvas `nodeSizes`.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

const MIN_R = 2.0;
const MAX_R = 5.5;

/** Pure access-breadth weight: permission strength + admin bonus + log(projects). */
export function ACCESS_WEIGHT(f: NodeFeatureSnapshot): number {
  const perm = f.permissionStrength ?? 0;          // 0..5
  const admin = f.isAdmin ? 2 : 0;                 // governance bonus
  // Each (user,project) instance is on >=1 project, so unknown defaults to 1.
  const breadth = Math.log2(1 + (f.projectCount ?? 1)); // diminishing returns
  return perm + admin + breadth;
}

/** Float32Array(n) of per-node world-unit radii in [MIN_R, MAX_R]. */
export function buildNodeSizes(features: ReadonlyArray<NodeFeatureSnapshot>): Float32Array {
  const out = new Float32Array(features.length);
  let min = Infinity;
  let max = -Infinity;
  const weights = features.map((f) => ACCESS_WEIGHT(f));
  for (const w of weights) {
    if (w < min) min = w;
    if (w > max) max = w;
  }
  const range = max - min;
  for (let i = 0; i < features.length; i++) {
    const t = range > 0 ? (weights[i] - min) / range : 0;
    out[i] = MIN_R + (MAX_R - MIN_R) * t;
  }
  return out;
}
