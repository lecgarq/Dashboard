/**
 * activityPhysicsStub.ts — v2.7 Phase 39 (ACT-01).
 *
 * Frozen PhysicsLayer stub for the activity universe: positions are computed
 * offline (PaCMAP) and never simulated client-side this phase (Phase 40 owns
 * motion). GraphCanvas2D reads only getPositions() (stride-3, init),
 * getSliders() and `frozen` on this path; everything else is an inert no-op.
 */

import type { PhysicsLayer } from "../physicsLayer";

/** Wrap a stride-3 position buffer in a frozen, no-op PhysicsLayer. */
export function createActivityPhysicsStub(positionsXyz: Float32Array): PhysicsLayer {
  const stub = {
    alphaMask: new Float32Array(0),
    maskVersion: 0,
    positionsVersion: 1,
    frozen: true,
    updateSliders(): void {},
    setMask(): void {},
    setActiveInput(): void {},
    getPositions: () => positionsXyz,
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    syncPositions(): void {},
    dispose(): void {},
  };
  // TargetArrays' concrete member shape is never read on this path — one
  // documented escape hatch instead of importing the full type (spike-proven).
  return stub as unknown as PhysicsLayer;
}

/** Expand stride-2 positions to the stride-3 buffer GraphCanvas2D init expects (z = 0). */
export function toStride3(positions2: Float32Array): Float32Array {
  const n = positions2.length / 2;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = positions2[i * 2];
    out[i * 3 + 1] = positions2[i * 2 + 1];
  }
  return out;
}
