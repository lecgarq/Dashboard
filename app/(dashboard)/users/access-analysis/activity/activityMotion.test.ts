/**
 * activityMotion.test.ts — the PERF-02 frozen-handle invariant, EVOLVED for the
 * activity universe (PERF-07). These pins replace the instance-era contract on
 * this path (the instance physicsLayer tests keep pinning that module):
 *   - morph = ONE upload per commit via morphPointSet (GPU transition), never
 *     per-frame CPU writes during the transition window
 *   - ambient mutates ONLY its deterministic subset, around the current base
 *   - the layer can never reach a force-sim surface (handle slice is push/morph)
 *   - prefers-reduced-motion → fully static (no ambient, snap morphs)
 */
import { describe, expect, it } from "vitest";
import {
  createActivityMotion,
  createActivityPhysicsStub,
  toStride3,
  type ActivityMotionHandle,
} from "./activityMotion";

interface Harness {
  handle: ActivityMotionHandle & {
    pushes: Float32Array[];
    morphs: { positions: Float32Array; durationMs: number }[];
  };
  step(nowMs: number): void;
  clock: { now: number };
  raf: { queue: ((nowMs: number) => void)[] };
}

function harness(): Harness {
  const pushes: Float32Array[] = [];
  const morphs: { positions: Float32Array; durationMs: number }[] = [];
  const queue: ((nowMs: number) => void)[] = [];
  const clock = { now: 0 };
  return {
    handle: {
      pushes,
      morphs,
      pushPointSet(p: Float32Array): void {
        pushes.push(Float32Array.from(p)); // copy — the layer reuses its buffer
      },
      morphPointSet(p: Float32Array, durationMs: number): void {
        morphs.push({ positions: Float32Array.from(p), durationMs });
      },
    },
    step(nowMs: number): void {
      clock.now = nowMs;
      const cbs = queue.splice(0);
      for (const cb of cbs) cb(nowMs);
    },
    clock,
    raf: { queue },
  };
}

function motionWith(h: Harness, base: Float32Array, opts?: { reducedMotion?: boolean; subsetCap?: number }) {
  return createActivityMotion({
    handle: h.handle,
    base2: base,
    reducedMotion: opts?.reducedMotion ?? false,
    subsetCap: opts?.subsetCap ?? 3,
    raf: (cb) => {
      h.raf.queue.push(cb);
      return h.raf.queue.length;
    },
    cancelRaf: () => {},
    now: () => h.clock.now,
  });
}

const base10 = (): Float32Array => {
  const b = new Float32Array(20);
  for (let i = 0; i < 20; i++) b[i] = i * 10;
  return b;
};

describe("activityMotion contract pins (PERF-07 / evolved PERF-02)", () => {
  it("morphTo = exactly ONE morphPointSet upload; ambient pushes are suspended for the transition window", () => {
    const h = harness();
    const m = motionWith(h, base10());
    m.startAmbient();
    h.step(0); // first ambient frame
    const pushesBefore = h.handle.pushes.length;

    const target = new Float32Array(20).fill(500);
    h.clock.now = 100;
    m.morphTo(target, 600);
    expect(h.handle.morphs).toHaveLength(1);
    expect(h.handle.morphs[0].durationMs).toBe(600);

    // Frames inside the transition window: NO CPU position pushes.
    h.step(116);
    h.step(300);
    h.step(699);
    expect(h.handle.pushes.length).toBe(pushesBefore);
    expect(h.handle.morphs).toHaveLength(1);

    // After the window, ambient resumes around the NEW base.
    h.step(750);
    h.step(800);
    const resumed = h.handle.pushes[h.handle.pushes.length - 1];
    expect(resumed).toBeDefined();
    // Non-subset entries sit exactly on the morph target (new base).
    expect(resumed[2]).toBe(500);
  });

  it("ambient mutates ONLY the deterministic subset around the current base", () => {
    const h = harness();
    const base = base10();
    const m = motionWith(h, base, { subsetCap: 3 }); // n=10 → stride 4 → indices 0,4,8
    m.startAmbient();
    h.step(0);
    h.step(16);
    const frame = h.handle.pushes[h.handle.pushes.length - 1];
    const subset = new Set([0, 4, 8]);
    let changed = 0;
    for (let i = 0; i < 10; i++) {
      const moved = frame[i * 2] !== base[i * 2] || frame[i * 2 + 1] !== base[i * 2 + 1];
      if (moved) {
        changed += 1;
        expect(subset.has(i)).toBe(true);
        // Drift is bounded by the choreography amplitude.
        expect(Math.abs(frame[i * 2] - base[i * 2])).toBeLessThanOrEqual(2.4 + 1e-6);
        expect(Math.abs(frame[i * 2 + 1] - base[i * 2 + 1])).toBeLessThanOrEqual(2.4 * 0.72 + 1e-6);
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(3);
  });

  it("can never reach a force-sim surface: only pushPointSet/morphPointSet are touched", () => {
    const h = harness();
    const guarded = new Proxy(h.handle, {
      get(target, prop) {
        if (prop !== "pushPointSet" && prop !== "morphPointSet") {
          throw new Error(`activityMotion touched forbidden handle member: ${String(prop)}`);
        }
        return Reflect.get(target, prop);
      },
    }) as ActivityMotionHandle;
    const m = createActivityMotion({
      handle: guarded,
      base2: base10(),
      reducedMotion: false,
      subsetCap: 3,
      raf: (cb) => {
        h.raf.queue.push(cb);
        return 1;
      },
      cancelRaf: () => {},
      now: () => h.clock.now,
    });
    m.startAmbient();
    h.step(0);
    h.step(16);
    m.morphTo(new Float32Array(20), 200);
    m.stopAmbient();
    m.dispose();
    expect(h.handle.pushes.length).toBeGreaterThan(0);
  });

  it("prefers-reduced-motion → fully static: no ambient, morphs snap (duration 0)", () => {
    const h = harness();
    const m = motionWith(h, base10(), { reducedMotion: true });
    m.startAmbient();
    expect(m.isAmbientRunning()).toBe(false);
    h.step(0);
    h.step(16);
    expect(h.handle.pushes).toHaveLength(0);
    m.morphTo(new Float32Array(20).fill(7), 600);
    expect(h.handle.morphs).toHaveLength(1);
    expect(h.handle.morphs[0].durationMs).toBe(0);
  });

  it("stopAmbient settles the field back onto the base layout", () => {
    const h = harness();
    const base = base10();
    const m = motionWith(h, base);
    m.startAmbient();
    h.step(0);
    h.step(16);
    m.stopAmbient();
    const last = h.handle.pushes[h.handle.pushes.length - 1];
    expect(Array.from(last)).toEqual(Array.from(base));
    expect(m.isAmbientRunning()).toBe(false);
  });

  it("setBase length-guards against cross-set reuse", () => {
    const h = harness();
    const m = motionWith(h, base10());
    expect(() => m.setBase(new Float32Array(6))).toThrow(/per-rendered-set/);
  });

  it("Phase-39 init stub compat: frozen PhysicsLayer + stride-3 expansion", () => {
    const xyz = toStride3(Float32Array.from([1, 2, 3, 4]));
    expect(Array.from(xyz)).toEqual([1, 2, 0, 3, 4, 0]);
    const stub = createActivityPhysicsStub(xyz);
    expect(stub.frozen).toBe(true);
    expect(stub.getPositions()).toBe(xyz);
    expect(stub.getSliders()).toEqual({});
  });
});
