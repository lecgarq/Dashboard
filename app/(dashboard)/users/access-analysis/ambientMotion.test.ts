import { describe, expect, it } from "vitest";
import {
  ambientRecencyProfile,
  createAmbientFpsController,
  createAmbientMotionLayer,
  type AmbientRecency,
} from "./ambientMotion";

const BUCKETS: AmbientRecency[] = ["0-7d", "8-14d", "15-30d", "31-60d", "60d+", "none"];

describe("ambient recency motion", () => {
  it("keeps amplitude and speed monotonic from recent to unknown", () => {
    const profiles = BUCKETS.map(ambientRecencyProfile);
    for (let i = 1; i < profiles.length; i++) {
      expect(profiles[i - 1].amplitude).toBeGreaterThan(profiles[i].amplitude);
      expect(profiles[i - 1].speed).toBeGreaterThan(profiles[i].speed);
    }
  });

  it("is deterministic, anchor-relative, z-stable, and reuses one output buffer", () => {
    const make = () => createAmbientMotionLayer({ nodeIds: ["a", "b"], recency: ["0-7d", "none"] });
    const a = make();
    const b = make();
    const anchors = new Float32Array([10, 20, 7, -10, -20, 9]);
    a.frame({ anchors, nowMs: 0, paused: false, reducedMotion: false });
    b.frame({ anchors, nowMs: 0, paused: false, reducedMotion: false });
    const a1 = a.frame({ anchors, nowMs: 180, paused: false, reducedMotion: false });
    const b1 = b.frame({ anchors, nowMs: 180, paused: false, reducedMotion: false });
    expect(Array.from(a1)).toEqual(Array.from(b1));
    expect(a1[2]).toBe(7);
    expect(a1[5]).toBe(9);
    expect(Math.abs(a1[0] - anchors[0])).toBeLessThanOrEqual(3.2);
    expect(a.frame({ anchors, nowMs: 360, paused: false, reducedMotion: false })).toBe(a1);
  });

  it("freezes foreground, softens focus background, pauses, and resumes from zero", () => {
    const anchors = new Float32Array(6);
    const freeze = Uint8Array.from([1, 0]);
    const focused = createAmbientMotionLayer({ nodeIds: ["a", "b"], recency: ["0-7d", "0-7d"] });
    const normal = createAmbientMotionLayer({ nodeIds: ["a", "b"], recency: ["0-7d", "0-7d"] });
    focused.frame({ anchors, nowMs: 0, paused: false, reducedMotion: false, freezeMask: freeze, focusActive: true });
    normal.frame({ anchors, nowMs: 0, paused: false, reducedMotion: false });
    const focusFrame = focused.frame({ anchors, nowMs: 180, paused: false, reducedMotion: false, freezeMask: freeze, focusActive: true });
    const normalFrame = normal.frame({ anchors, nowMs: 180, paused: false, reducedMotion: false });
    expect(focusFrame[0]).toBe(0);
    expect(focusFrame[1]).toBe(0);
    expect(Math.hypot(focusFrame[3], focusFrame[4])).toBeLessThan(Math.hypot(normalFrame[3], normalFrame[4]));

    expect(Array.from(focused.frame({ anchors, nowMs: 200, paused: true, reducedMotion: false }))).toEqual(Array.from(anchors));
    expect(Array.from(focused.frame({ anchors, nowMs: 250, paused: false, reducedMotion: false }))).toEqual(Array.from(anchors));
    expect(focused.frame({ anchors, nowMs: 430, paused: false, reducedMotion: false })[3]).not.toBe(0);
    expect(Array.from(focused.frame({ anchors, nowMs: 450, paused: false, reducedMotion: true }))).toEqual(Array.from(anchors));
  });

  it("Tier 1 animates only <=60d nodes at 30Hz and Tier 2 is static", () => {
    const anchors = new Float32Array(9);
    const tier1 = createAmbientMotionLayer({
      nodeIds: ["recent", "dormant", "unknown"],
      recency: ["31-60d", "60d+", "none"],
      initialTier: 1,
    });
    tier1.frame({ anchors, nowMs: 0, paused: false, reducedMotion: false });
    const first = tier1.frame({ anchors, nowMs: 180, paused: false, reducedMotion: false }).slice();
    const skipped = tier1.frame({ anchors, nowMs: 190, paused: false, reducedMotion: false }).slice();
    expect(skipped).toEqual(first);
    expect(Math.hypot(first[0], first[1])).toBeGreaterThan(0);
    expect(first.slice(3)).toEqual(new Float32Array(6));
    expect(tier1.getStats().animatedNodeCount).toBe(1);

    const tier2 = createAmbientMotionLayer({ nodeIds: ["a"], recency: ["0-7d"], initialTier: 2 });
    expect(Array.from(tier2.frame({ anchors: new Float32Array([1, 2, 0]), nowMs: 100, paused: false, reducedMotion: false }))).toEqual([1, 2, 0]);
    expect(tier2.getStats().animatedNodeCount).toBe(0);
  });
});

describe("ambient FPS controller", () => {
  it("downgrades after two low windows and recovers one tier only after >=10 good seconds", () => {
    const fps = createAmbientFpsController();
    expect(fps.observeWindow(49, 3_000)).toBe(0);
    expect(fps.observeWindow(49, 3_000)).toBe(1);
    expect(fps.observeWindow(50, 3_000)).toBe(1);
    expect(fps.observeWindow(49, 3_000)).toBe(1);
    expect(fps.observeWindow(49, 3_000)).toBe(2);
    for (let i = 0; i < 3; i++) expect(fps.observeWindow(55, 3_000)).toBe(2);
    expect(fps.observeWindow(55, 3_000)).toBe(1);
    for (let i = 0; i < 3; i++) expect(fps.observeWindow(60, 3_000)).toBe(1);
    expect(fps.observeWindow(60, 3_000)).toBe(0);
  });

  it("resetSampling clears a partial low streak without changing the active tier", () => {
    const fps = createAmbientFpsController();
    expect(fps.observeWindow(40)).toBe(0);
    fps.resetSampling();
    expect(fps.observeWindow(40)).toBe(0);
    expect(fps.observeWindow(40)).toBe(1);
  });
});
