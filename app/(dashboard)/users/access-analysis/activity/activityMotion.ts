/**
 * activityMotion.ts — v2.7 Phase 40 (PERF-07). Evolves Phase 39's
 * activityPhysicsStub ("Phase 40 owns motion") into the activity universe's
 * motion layer.
 *
 * ── THE MOTION CONTRACT (PERF-02 frozen-handle invariant, evolved) ──────────
 * What MAY mutate cosmos state on the activity path:
 *   1. The morph seam — morphTo(): ONE CPU target upload per group-by/strength
 *      commit via handle.morphPointSet; cosmos's built-in GPU position
 *      transition interpolates every frame shader-side.
 *   2. Ambient — a deterministic ~100k subset (owner decision 1) of the
 *      rendered set drifts via the 37-BASELINE-proven CPU choreography;
 *      each frame writes ONLY subset entries into the working buffer, pushed
 *      whole via handle.pushPointSet.
 *   3. The LOD seam — setPointSet on zoom-detail flips (owned by the shell).
 * What may NOT (37-BASELINE: dead paths):
 *   - Per-rAF-frame FULL-buffer CPU position writes (28.8 fps @≥250k).
 *   - The cosmos force simulation (20.4 fps @500k; never started here).
 * prefers-reduced-motion → fully static: no ambient, morphs snap (duration 0).
 * Pinned by activityMotion.test.ts. Never weaken silently.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { PhysicsLayer } from "../physicsLayer";
import { createAmbientFpsController } from "../ambientMotion";

// ---------------------------------------------------------------------------
// Phase 39 init stub (absorbed from activityPhysicsStub.ts) — GraphCanvas2D
// reads only getPositions() (stride-3), getSliders() and `frozen` on this path.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Motion layer
// ---------------------------------------------------------------------------

/** The slice of GraphCanvas2DHandle this layer is allowed to touch. */
export interface ActivityMotionHandle {
  pushPointSet?(positions2: Float32Array): void;
  morphPointSet?(positions2: Float32Array, durationMs: number): void;
}

export interface ActivityMotion {
  /** Replace the base layout (rest positions or a committed morph target). */
  setBase(positions2: Float32Array): void;
  /** GPU-animated morph of the current set; suspends ambient for the duration. */
  morphTo(target2: Float32Array, durationMs: number): void;
  startAmbient(): void;
  stopAmbient(): void;
  isAmbientRunning(): boolean;
  dispose(): void;
}

/** Owner decision 1: ~100k of the rendered subset drift; the rest stay still. */
export const AMBIENT_SUBSET_CAP = 100_000;
/** 37-BASELINE choreography constants (73 fps @106k proven). */
const DRIFT_AMP = 2.4;
const TIER_1_FRAME_MS = 1_000 / 30;

export interface CreateActivityMotionOpts {
  handle: ActivityMotionHandle;
  /** Stride-2 base layout of the rendered set. Copied — caller keeps ownership. */
  base2: Float32Array;
  reducedMotion: boolean;
  subsetCap?: number;
  /** Test seams — default to window rAF / performance.now. */
  raf?: (cb: (nowMs: number) => void) => number;
  cancelRaf?: (id: number) => void;
  now?: () => number;
}

export function createActivityMotion(opts: CreateActivityMotionOpts): ActivityMotion {
  const raf =
    opts.raf ??
    ((cb: (nowMs: number) => void): number => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((id: number): void => cancelAnimationFrame(id));
  const now = opts.now ?? ((): number => performance.now());
  const subsetCap = opts.subsetCap ?? AMBIENT_SUBSET_CAP;

  const n = opts.base2.length / 2;
  const base = Float32Array.from(opts.base2);
  const working = Float32Array.from(opts.base2);
  // Deterministic ambient subset: every k-th rendered index (≤ subsetCap).
  const subsetStride = Math.max(1, Math.ceil(n / subsetCap));
  const subsetSize = Math.ceil(n / subsetStride);

  const fps = createAmbientFpsController(0);
  let rafId: number | null = null;
  let running = false;
  let disposed = false;
  let startedAt: number | null = null;
  let lastPushAt = -Infinity;
  /** Ambient stays parked until this timestamp while a morph transition runs. */
  let morphUntil = -Infinity;

  const frame = (nowMs: number): void => {
    if (!running || disposed) return;
    rafId = raf(frame);
    if (nowMs < morphUntil) return; // GPU transition owns positions right now
    const tier = fps.observeFrame(nowMs);
    if (tier === 2) return; // fps floor — park, controller may recover later
    startedAt ??= nowMs;
    if (tier === 1 && nowMs - lastPushAt < TIER_1_FRAME_MS) return;
    lastPushAt = nowMs;
    const t = (nowMs - startedAt) / 1000;
    // 37-spike choreography on the SUBSET ONLY — the contract's ambient bound.
    for (let s = 0; s < n; s += subsetStride) {
      const j = s * 2;
      const phase = (s % 628) * 0.01;
      working[j] = base[j] + Math.cos(phase + t) * DRIFT_AMP;
      working[j + 1] = base[j + 1] + Math.sin(phase * 0.83 + t) * DRIFT_AMP * 0.72;
    }
    opts.handle.pushPointSet?.(working);
  };

  return {
    setBase(positions2: Float32Array): void {
      if (positions2.length !== base.length) {
        throw new Error(
          `activityMotion.setBase: length ${positions2.length} != ${base.length} — the layer is per-rendered-set`,
        );
      }
      base.set(positions2);
      working.set(positions2);
    },

    morphTo(target2: Float32Array, durationMs: number): void {
      if (disposed) return;
      const d = opts.reducedMotion ? 0 : durationMs;
      opts.handle.morphPointSet?.(target2, d);
      // Ambient drifts around the NEW layout once the transition lands.
      base.set(target2);
      working.set(target2);
      morphUntil = now() + d;
    },

    startAmbient(): void {
      if (disposed || running || opts.reducedMotion) return; // reduced-motion: fully static
      running = true;
      startedAt = null;
      fps.resetSampling(now());
      rafId = raf(frame);
    },

    stopAmbient(): void {
      running = false;
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
      // Settle the field back onto the base layout (no dangling drift offsets).
      if (!disposed) {
        working.set(base);
        opts.handle.pushPointSet?.(working);
      }
    },

    isAmbientRunning(): boolean {
      return running;
    },

    dispose(): void {
      disposed = true;
      running = false;
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
    },
  };
}
