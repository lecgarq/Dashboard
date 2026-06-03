import { describe, it, expect } from "vitest";
import {
  layoutClusterFootprintsOrganic,
  layoutClusterFootprints,
  ORGANIC_MAX_CLUSTERS,
} from "./clusterForceLayout";
import { packClusterFootprints } from "./clusterPacking";

describe("layoutClusterFootprintsOrganic", () => {
  it("k=0 → empty; k=1 → single blob at origin", () => {
    const z = layoutClusterFootprintsOrganic([]);
    expect(z.cx.length).toBe(0);
    const one = layoutClusterFootprintsOrganic([10]);
    expect(one.cx.length).toBe(1);
    expect(Math.hypot(one.cx[0], one.cy[0])).toBeLessThan(1);
  });

  it("footprints never overlap after relaxation (collide invariant)", () => {
    const f = layoutClusterFootprintsOrganic([100, 50, 50, 20, 20, 5, 5, 5]);
    for (let i = 0; i < f.r.length; i++) {
      for (let j = i + 1; j < f.r.length; j++) {
        const d = Math.hypot(f.cx[i] - f.cx[j], f.cy[i] - f.cy[j]);
        expect(d).toBeGreaterThan((f.r[i] + f.r[j]) * 0.98); // small tolerance
      }
    }
  });

  it("is deterministic — same input → identical output", () => {
    const a = layoutClusterFootprintsOrganic([30, 20, 10, 10, 5]);
    const b = layoutClusterFootprintsOrganic([30, 20, 10, 10, 5]);
    expect(Array.from(a.cx)).toEqual(Array.from(b.cx));
    expect(Array.from(a.cy)).toEqual(Array.from(b.cy));
    expect(Array.from(a.r)).toEqual(Array.from(b.r));
  });

  it("all coords finite and radii positive", () => {
    const f = layoutClusterFootprintsOrganic([7, 7, 7, 7]);
    for (let i = 0; i < f.r.length; i++) {
      expect(Number.isFinite(f.cx[i]) && Number.isFinite(f.cy[i])).toBe(true);
      expect(f.r[i]).toBeGreaterThan(0);
    }
  });

  // DATA DEFINES THE SHAPE: the overall extent must scale with the data, not be
  // normalized to a constant disc. A few tiny clusters → compact; many big → wide.
  function extent(f: ReturnType<typeof layoutClusterFootprintsOrganic>): number {
    let m = 0;
    for (let i = 0; i < f.r.length; i++) m = Math.max(m, Math.hypot(f.cx[i], f.cy[i]) + f.r[i]);
    return m;
  }
  it("extent grows with the data (not a fixed circle)", () => {
    const small = extent(layoutClusterFootprintsOrganic([5, 5, 5]));
    const big = extent(layoutClusterFootprintsOrganic([4000, 4000, 4000, 4000, 4000, 4000]));
    expect(big).toBeGreaterThan(small * 2); // clearly data-dependent, not constant
    expect(big).toBeLessThanOrEqual(1900 + 1); // but never overflows the safety ceiling
  });
});

describe("layoutClusterFootprints (count-routed, no slider-lag)", () => {
  const small = [30, 20, 10, 10, 5];

  it("≤ threshold → organic force layout (identical output)", () => {
    expect(small.length).toBeLessThanOrEqual(ORGANIC_MAX_CLUSTERS);
    const auto = layoutClusterFootprints(small);
    const organic = layoutClusterFootprintsOrganic(small);
    expect(Array.from(auto.cx)).toEqual(Array.from(organic.cx));
    expect(Array.from(auto.cy)).toEqual(Array.from(organic.cy));
  });

  it("> threshold → fast packSiblings path (identical to packClusterFootprints)", () => {
    const big = Array.from({ length: ORGANIC_MAX_CLUSTERS + 50 }, (_, i) => (i % 7) + 1);
    const auto = layoutClusterFootprints(big);
    const packed = packClusterFootprints(big);
    expect(Array.from(auto.cx)).toEqual(Array.from(packed.cx));
    expect(Array.from(auto.cy)).toEqual(Array.from(packed.cy));
  });

  it("stays fast at user scale (~3,367 clusters) — the slider-lag regression guard", () => {
    // The organic force layout takes ~9s here; the routed packer is ~20ms. A generous
    // 1s budget (≈50× margin) flags a regression without flaking on slow CI.
    const counts = Array.from({ length: 3367 }, (_, i) => (i < 30 ? 40 : (i % 3) + 1));
    const t0 = performance.now();
    const f = layoutClusterFootprints(counts);
    const ms = performance.now() - t0;
    expect(f.cx.length).toBe(counts.length);
    expect(ms).toBeLessThan(1000);
  });
});
