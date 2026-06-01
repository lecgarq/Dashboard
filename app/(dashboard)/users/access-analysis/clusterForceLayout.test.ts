import { describe, it, expect } from "vitest";
import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";

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
});
