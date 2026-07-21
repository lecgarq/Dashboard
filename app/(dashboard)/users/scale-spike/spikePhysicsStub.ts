/**
 * spikePhysicsStub.ts — minimal PhysicsLayer for the Phase-37 scale spike.
 *
 * GraphCanvas2D only reads `getPositions()` (init), `getSliders()` (GPU config),
 * and `frozen` (upload gate) on the spike path. Everything else is an inert
 * no-op: the spike never runs d3, never masks, never drags. `frozen: true` keeps
 * pushPositions on its frozen upload branch (the CPU-ambient measurement path).
 */

import type { PhysicsLayer } from "../access-analysis/physicsLayer";

export function createSpikePhysicsStub(positions: Float32Array): PhysicsLayer {
  const stub = {
    alphaMask: new Float32Array(0),
    maskVersion: 0,
    positionsVersion: 1,
    frozen: true,
    updateSliders(): void {},
    setMask(): void {},
    setActiveInput(): void {},
    getPositions: () => positions,
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    syncPositions(): void {},
    dispose(): void {},
  };
  // TargetArrays' concrete member shape is irrelevant here (never read on the
  // spike path) — one documented escape hatch instead of importing the full type.
  return stub as unknown as PhysicsLayer;
}
