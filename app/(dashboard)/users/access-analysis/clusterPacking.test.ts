import { describe, it, expect } from "vitest";
import { fillFactor, packClusterFootprints } from "./clusterPacking";

describe("fillFactor", () => {
  // The slider behaves as CLUSTER STRENGTH: low → a full blob that FILLS its footprint
  // (never spills past it → clusters stay clean & distinct); high → a tight dense core.
  it("fills the footprint at low strength (never spills) and a tight core at high strength", () => {
    expect(fillFactor(0)).toBeLessThanOrEqual(1); // members stay within the footprint → clean
    expect(fillFactor(0)).toBeGreaterThan(0.5); // but still a full blob at low strength
    expect(fillFactor(1)).toBeLessThan(0.3); // tight dense core
  });
  it("varies dramatically across the slider range (slider 1 must NOT look like slider 100)", () => {
    // Regression guard for the reported bug: tightness was 1.0→0.45, so slider 1
    // (t≈0.01) and slider 100 (t=1) looked identical. Require a large spread.
    expect(fillFactor(0.01) / fillFactor(1)).toBeGreaterThan(4);
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
    expect(fillFactor(-1)).toBeCloseTo(fillFactor(0), 5);
    expect(fillFactor(2)).toBeCloseTo(fillFactor(1), 5);
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

import { clusterMemberCentroids, packMemberPositions } from "./clusterPacking";

describe("clusterMemberCentroids", () => {
  const fp = packClusterFootprints([2, 2]); // two clusters

  it("returns one centroid per cluster (aligned to footprints)", () => {
    const ids = new Int32Array([0, 0, 1, 1]);
    const pos = Float32Array.from([0, 0, 10, 0, 100, 50, 100, 70]);
    const c = clusterMemberCentroids(ids, pos, fp);
    expect(c.cx.length).toBe(2);
    expect(c.cy.length).toBe(2);
  });

  it("averages each cluster's member positions", () => {
    // cluster 0: (0,0) & (10,0) → (5,0); cluster 1: (100,50) & (100,70) → (100,60)
    const ids = new Int32Array([0, 0, 1, 1]);
    const pos = Float32Array.from([0, 0, 10, 0, 100, 50, 100, 70]);
    const c = clusterMemberCentroids(ids, pos, fp);
    expect(c.cx[0]).toBeCloseTo(5, 6);
    expect(c.cy[0]).toBeCloseTo(0, 6);
    expect(c.cx[1]).toBeCloseTo(100, 6);
    expect(c.cy[1]).toBeCloseTo(60, 6);
  });

  it("falls back to the footprint center for a cluster with no members", () => {
    // No node belongs to cluster 1 → its centroid must be the footprint center,
    // NOT the origin (which would yank the label to mid-map).
    const ids = new Int32Array([0, 0]);
    const pos = Float32Array.from([0, 0, 10, 0]);
    const c = clusterMemberCentroids(ids, pos, fp);
    expect(c.cx[1]).toBeCloseTo(fp.cx[1], 6);
    expect(c.cy[1]).toBeCloseTo(fp.cy[1], 6);
  });

  it("ignores unclustered nodes (id < 0)", () => {
    const ids = new Int32Array([-1, 0, 0]);
    const pos = Float32Array.from([999, 999, 0, 0, 4, 0]);
    const c = clusterMemberCentroids(ids, pos, fp);
    expect(c.cx[0]).toBeCloseTo(2, 6); // mean of (0,0) & (4,0); the -1 node excluded
    expect(c.cy[0]).toBeCloseTo(0, 6);
  });
});

describe("packMemberPositions", () => {
  const fp = packClusterFootprints([3, 2]); // cluster 0 has 3, cluster 1 has 2

  it("returns stride-2 positions for every node", () => {
    const ids = new Int32Array([0, 0, 0, 1, 1]);
    const pos = packMemberPositions(ids, fp, 1, 5);
    expect(pos.length).toBe(10);
  });

  it("packs a tight core within the footprint at high strength", () => {
    const ids = new Int32Array([0, 0, 0, 1, 1]);
    const pos = packMemberPositions(ids, fp, 1, 5);
    for (let n = 0; n < 5; n++) {
      const c = ids[n];
      const dx = pos[n * 2] - fp.cx[c];
      const dy = pos[n * 2 + 1] - fp.cy[c];
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(fp.r[c] + 1e-6);
    }
  });

  it("keeps members within the footprint at low strength (clean blob, never spills)", () => {
    const ids = new Int32Array([0, 0, 0, 1, 1]);
    const pos = packMemberPositions(ids, fp, 0, 5);
    for (let n = 0; n < 5; n++) {
      const c = ids[n];
      const dx = pos[n * 2] - fp.cx[c];
      const dy = pos[n * 2 + 1] - fp.cy[c];
      // Members fill the footprint but never spill past it → blobs stay distinct.
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(fp.r[c] + 1e-6);
    }
  });

  it("packs tighter at high tightness than low (mean radius from center shrinks)", () => {
    const ids = new Int32Array([0, 0, 0]);
    const meanR = (t: number): number => {
      const pos = packMemberPositions(ids, fp, t, 3);
      let s = 0;
      for (let n = 0; n < 3; n++) s += Math.hypot(pos[n * 2] - fp.cx[0], pos[n * 2 + 1] - fp.cy[0]);
      return s / 3;
    };
    expect(meanR(1)).toBeLessThan(meanR(0));
  });

  it("is deterministic", () => {
    const ids = new Int32Array([0, 1, 0, 1, 0]);
    const a = packMemberPositions(ids, fp, 0.7, 5);
    const b = packMemberPositions(ids, fp, 0.7, 5);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("places unclustered nodes (id < 0) at the origin", () => {
    const ids = new Int32Array([-1, 0]);
    const pos = packMemberPositions(ids, fp, 1, 2);
    expect(pos[0]).toBe(0);
    expect(pos[1]).toBe(0);
  });
});
