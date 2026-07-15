import type { PhysicsLayer, TargetArrays } from "./physicsLayer";
import { activeGroupingDimension } from "./activeGrouping";
import { easeMorph } from "./layoutDescriptor";

const ORGANIC_RESIDUAL = 0.2;

/**
 * Project the similarity embedding toward one strongest catalog anchor field.
 * A small baseline residual preserves organic within-anchor texture at full strength.
 */
export function catalogAnchorTarget(opts: {
  baseline: Float32Array;
  targets: TargetArrays;
  dimWeights: Record<string, Float32Array>;
  live: Record<string, number>;
  order: readonly string[];
  out: Float32Array;
}): Float32Array {
  const { baseline, targets, dimWeights, live, order, out } = opts;
  if (out.length !== baseline.length) {
    throw new Error(`catalogAnchorTarget: length ${out.length} != ${baseline.length}`);
  }
  const dimId = activeGroupingDimension(live, order, "");
  const target = targets[dimId];
  const strength = easeMorph((live[dimId] ?? 0) / 100);
  if (!target || strength === 0) {
    out.set(baseline);
    return out;
  }

  const weights = dimWeights[dimId];
  const n = baseline.length / 3;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const influence = strength * Math.max(0, Math.min(1, weights?.[i] ?? 1));
    const anchorX = (target.x[i] ?? 0) + baseline[j] * ORGANIC_RESIDUAL;
    const anchorY = (target.y[i] ?? 0) + baseline[j + 1] * ORGANIC_RESIDUAL;
    const anchorZ = (target.z[i] ?? 0) + baseline[j + 2] * ORGANIC_RESIDUAL;
    out[j] = baseline[j] + (anchorX - baseline[j]) * influence;
    out[j + 1] = baseline[j + 1] + (anchorY - baseline[j + 1]) * influence;
    out[j + 2] = baseline[j + 2] + (anchorZ - baseline[j + 2]) * influence;
  }
  return out;
}

/**
 * A PhysicsLayer whose positions are FIXED (precomputed embedding coords). The
 * physics bus is inert (updateSliders/setActiveInput/syncPositions are no-ops);
 * only the MASK bus is live, so filter/search/lasso/click-highlight all work
 * exactly as in the simulated graph. `xy` is stride-2 [x0,y0,x1,y1,...]; the
 * 2D renderer drops z, but getPositions() returns stride-3 (z=0) to satisfy the
 * interface and the rAF pump.
 */
export function createStaticLayer(
  nodeIds: readonly string[],
  xy: Float32Array,
  targets: TargetArrays = {},
  dimWeights: Record<string, Float32Array> = {},
): PhysicsLayer {
  const n = nodeIds.length;
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    xyz[i * 3] = xy[i * 2] ?? 0;
    xyz[i * 3 + 1] = xy[i * 2 + 1] ?? 0;
    xyz[i * 3 + 2] = 0;
  }
  let _maskVersion = 0;
  const _alphaMask = new Float32Array(n).fill(1.0);
  return {
    get alphaMask() { return _alphaMask; },
    get maskVersion() { return _maskVersion; },
    get positionsVersion() { return 1; }, // constant: positions never change
    get frozen() { return true; },
    updateSliders(_values: Record<string, number>) {/* inert */},
    setMask(predicate: (nodeIndex: number) => number) {
      for (let i = 0; i < n; i++) _alphaMask[i] = predicate(i);
      _maskVersion++;
    },
    setActiveInput(_active: boolean) {/* inert */},
    getPositions() { return xyz; },
    getTargets() { return targets; },
    getDimWeights() { return dimWeights; },
    registerTargets(nextTargets, nextWeights) {
      Object.assign(targets, nextTargets);
      Object.assign(dimWeights, nextWeights);
    },
    getSliders() { return {}; },
    syncPositions(_xyz: Float32Array) {/* inert */},
    dispose() {/* nothing to release */},
  };
}
