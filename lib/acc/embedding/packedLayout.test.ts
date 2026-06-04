import { describe, expect, it } from "vitest";
import { packedClusterLayout } from "./packedLayout";

describe("packedClusterLayout", () => {
  const assign = new Int32Array([0, 0, 0, 1, 1, 2]);
  const sizes = new Float64Array([1, 1, 1, 1, 1, 1]);

  it("places every node and keeps them inside the canvas", () => {
    const out = packedClusterLayout(assign, sizes, 3, { w: 1000, h: 700 });
    expect(out.nodes).toHaveLength(6);
    for (const n of out.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(700);
    }
  });

  it("separates clusters (different cluster centroids are far apart)", () => {
    const out = packedClusterLayout(assign, sizes, 3, { w: 1000, h: 700 });
    const cen = (c: number) => { const ns = out.nodes.filter((n) => n.cluster === c); return { x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length }; };
    const d = Math.hypot(cen(0).x - cen(1).x, cen(0).y - cen(1).y);
    expect(d).toBeGreaterThan(50);
  });
});
