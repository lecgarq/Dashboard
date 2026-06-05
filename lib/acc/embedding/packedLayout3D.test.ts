import { describe, expect, it } from "vitest";
import { packedClusterLayout3D } from "./packedLayout3D";

describe("packedClusterLayout3D", () => {
  const assign = new Int32Array([0, 0, 0, 1, 1, 2]);
  const sizes = new Float64Array([1, 1, 1, 1, 1, 1]);

  it("places every node with finite x/y/z inside the cube", () => {
    const out = packedClusterLayout3D(assign, sizes, 3, { size: 1000 });
    expect(out.nodes).toHaveLength(6);
    for (const n of out.nodes) {
      for (const v of [n.x, n.y, n.z]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(560); // half-edge + margin
      }
    }
  });

  it("separates clusters in 3D (different cluster centroids are far apart)", () => {
    const out = packedClusterLayout3D(assign, sizes, 3, { size: 1000 });
    const cen = (c: number) => {
      const ns = out.nodes.filter((n) => n.cluster === c);
      return {
        x: ns.reduce((s, n) => s + n.x, 0) / ns.length,
        y: ns.reduce((s, n) => s + n.y, 0) / ns.length,
        z: ns.reduce((s, n) => s + n.z, 0) / ns.length,
      };
    };
    const d = Math.hypot(cen(0).x - cen(1).x, cen(0).y - cen(1).y, cen(0).z - cen(1).z);
    expect(d).toBeGreaterThan(50);
  });

  it("is deterministic (same input → identical output)", () => {
    const a = packedClusterLayout3D(assign, sizes, 3);
    const b = packedClusterLayout3D(assign, sizes, 3);
    expect(a.nodes.map((n) => [n.x, n.y, n.z])).toEqual(b.nodes.map((n) => [n.x, n.y, n.z]));
  });
});
