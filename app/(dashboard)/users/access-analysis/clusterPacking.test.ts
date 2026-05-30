import { describe, it, expect } from "vitest";
import { fillFactor, packClusterFootprints } from "./clusterPacking";

describe("fillFactor", () => {
  it("is loose (fills footprint) at low tightness and tight at high tightness", () => {
    expect(fillFactor(0)).toBeCloseTo(1.0, 5);
    expect(fillFactor(1)).toBeCloseTo(0.45, 5);
  });
  it("is monotonically non-increasing in tightness", () => {
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const f = fillFactor(t);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      prev = f;
    }
  });
  it("clamps out-of-range tightness", () => {
    expect(fillFactor(-1)).toBeCloseTo(1.0, 5);
    expect(fillFactor(2)).toBeCloseTo(0.45, 5);
  });
});

describe("packClusterFootprints", () => {
  it("returns one center+radius per cluster", () => {
    const fp = packClusterFootprints([100, 50, 10]);
    expect(fp.cx.length).toBe(3);
    expect(fp.cy.length).toBe(3);
    expect(fp.r.length).toBe(3);
  });

  it("radius grows with member count (area-proportional)", () => {
    const fp = packClusterFootprints([400, 100]);
    expect(fp.r[0]).toBeGreaterThan(fp.r[1]);
  });

  it("NEVER overlaps: every pair is separated by >= sum of radii (the core invariant)", () => {
    const counts = [3000, 1200, 800, 50, 50, 40, 12, 5, 5, 5, 4, 3, 2, 1];
    const fp = packClusterFootprints(counts);
    for (let i = 0; i < counts.length; i++) {
      for (let j = i + 1; j < counts.length; j++) {
        const dx = fp.cx[i] - fp.cx[j];
        const dy = fp.cy[i] - fp.cy[j];
        const dist = Math.hypot(dx, dy);
        expect(dist).toBeGreaterThanOrEqual(fp.r[i] + fp.r[j] - 1e-6);
      }
    }
  });

  it("is recentered near the origin (cosmos space is centered at 0)", () => {
    const fp = packClusterFootprints([100, 100, 100, 100]);
    let mx = 0, my = 0;
    for (let i = 0; i < 4; i++) { mx += fp.cx[i]; my += fp.cy[i]; }
    expect(Math.abs(mx / 4)).toBeLessThan(50);
    expect(Math.abs(my / 4)).toBeLessThan(50);
  });

  it("fits within the target extent (does not blow past cosmos bounds)", () => {
    const fp = packClusterFootprints(new Array(200).fill(20));
    for (let i = 0; i < fp.cx.length; i++) {
      expect(Math.hypot(fp.cx[i], fp.cy[i]) + fp.r[i]).toBeLessThanOrEqual(1701);
    }
  });

  it("is deterministic (same input → identical output)", () => {
    const a = packClusterFootprints([10, 20, 30]);
    const b = packClusterFootprints([10, 20, 30]);
    expect(Array.from(a.cx)).toEqual(Array.from(b.cx));
    expect(Array.from(a.cy)).toEqual(Array.from(b.cy));
  });

  it("handles a single cluster (centered at origin)", () => {
    const fp = packClusterFootprints([500]);
    expect(fp.cx[0]).toBeCloseTo(0, 6);
    expect(fp.cy[0]).toBeCloseTo(0, 6);
    expect(fp.r[0]).toBeGreaterThan(0);
  });
});
