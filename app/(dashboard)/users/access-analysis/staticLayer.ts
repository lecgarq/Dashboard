import type { PhysicsLayer } from "./physicsLayer";

/**
 * A PhysicsLayer whose positions are FIXED (precomputed embedding coords). The
 * physics bus is inert (updateSliders/setActiveInput/syncPositions are no-ops);
 * only the MASK bus is live, so filter/search/lasso/click-highlight all work
 * exactly as in the simulated graph. `xy` is stride-2 [x0,y0,x1,y1,...]; the
 * 2D renderer drops z, but getPositions() returns stride-3 (z=0) to satisfy the
 * interface and the rAF pump.
 */
export function createStaticLayer(nodeIds: readonly string[], xy: Float32Array): PhysicsLayer {
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
    getTargets() { return {}; },
    getDimWeights() { return {}; },
    getSliders() { return {}; },
    syncPositions(_xyz: Float32Array) {/* inert */},
    dispose() {/* nothing to release */},
  };
}
