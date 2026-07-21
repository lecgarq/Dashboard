import { describe, expect, it } from "vitest";
import {
  buildGroupLayout,
  categoryCentroids,
  LAYOUT_RADIUS,
  mixPositions,
} from "./activityGroupLayout";

describe("activityGroupLayout (DIM-07, organic never grid)", () => {
  it("is deterministic: identical inputs → byte-identical buffers", () => {
    const rest = Float32Array.from([0, 0, 10, 10, -5, 3, 8, -2]);
    const ids = Uint16Array.from([0, 1, 1, 2]);
    const a = buildGroupLayout(rest, ids, 3);
    const b = buildGroupLayout(rest, ids, 3);
    expect(Array.from(a.targets)).toEqual(Array.from(b.targets));
    expect(Array.from(a.centersX)).toEqual(Array.from(b.centersX));
  });

  it("every category gets its own distinct centroid at K=957 (archipelago, no Other-bucketing)", () => {
    const counts = new Uint32Array(957);
    for (let c = 0; c < 957; c++) counts[c] = 1 + ((c * 37) % 500);
    const { centersX, centersY, radii } = categoryCentroids(counts);
    const seen = new Set<string>();
    for (let c = 0; c < 957; c++) {
      expect(Number.isFinite(centersX[c])).toBe(true);
      expect(Number.isFinite(centersY[c])).toBe(true);
      expect(radii[c]).toBeGreaterThan(0);
      seen.add(`${centersX[c]}:${centersY[c]}`);
    }
    expect(seen.size).toBe(957);
    // Everything lands inside the layout space (with jitter slack).
    for (let c = 0; c < 957; c++) {
      expect(Math.hypot(centersX[c], centersY[c])).toBeLessThan(LAYOUT_RADIUS * 1.2);
    }
  });

  it("never reads as a grid: no two consecutive-rank centroids share an axis line", () => {
    const counts = new Uint32Array(40).fill(10);
    const { centersX, centersY } = categoryCentroids(counts);
    let sameX = 0;
    let sameY = 0;
    for (let c = 1; c < 40; c++) {
      if (Math.abs(centersX[c] - centersX[c - 1]) < 1e-3) sameX += 1;
      if (Math.abs(centersY[c] - centersY[c - 1]) < 1e-3) sameY += 1;
    }
    expect(sameX).toBe(0);
    expect(sameY).toBe(0);
  });

  it("rest centroids are member means and targets preserve texture inside the footprint", () => {
    // Category 1: two members around (10, 0); category 0: one at origin.
    const rest = Float32Array.from([0, 0, 8, 0, 12, 0]);
    const ids = Uint16Array.from([0, 1, 1]);
    const layout = buildGroupLayout(rest, ids, 2);
    expect(layout.restCentersX[1]).toBeCloseTo(10);
    expect(layout.restCentersY[1]).toBeCloseTo(0);
    expect(Array.from(layout.counts)).toEqual([1, 2]);
    // Members of category 1 stay distinct (texture, not a pile) and land near
    // their centroid within ~footprint.
    const d0 = Math.hypot(
      layout.targets[2] - layout.centersX[1],
      layout.targets[3] - layout.centersY[1],
    );
    const d1 = Math.hypot(
      layout.targets[4] - layout.centersX[1],
      layout.targets[5] - layout.centersY[1],
    );
    expect(layout.targets[2]).not.toBeCloseTo(layout.targets[4]);
    expect(d0).toBeLessThanOrEqual(layout.radii[1] * 1.2);
    expect(d1).toBeLessThanOrEqual(layout.radii[1] * 1.2);
    for (const v of layout.targets) expect(Number.isFinite(v)).toBe(true);
  });

  it("mixPositions blends rest→target and clamps s", () => {
    const rest = Float32Array.from([0, 0, 10, 10]);
    const targets = Float32Array.from([100, 0, 10, 30]);
    const out = new Float32Array(4);
    mixPositions(out, rest, targets, 0.5);
    expect(Array.from(out)).toEqual([50, 0, 10, 20]);
    mixPositions(out, rest, targets, 2);
    expect(Array.from(out)).toEqual([100, 0, 10, 30]);
    mixPositions(out, rest, targets, 0);
    expect(Array.from(out)).toEqual([0, 0, 10, 10]);
  });
});
