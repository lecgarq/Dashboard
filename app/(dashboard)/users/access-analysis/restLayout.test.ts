import { describe, it, expect } from "vitest";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { buildRestLayout } from "./restLayout";

function feat(project: string, i: number): NodeFeatureSnapshot {
  return { nodeId: `${project}:${i}`, project } as unknown as NodeFeatureSnapshot;
}

describe("buildRestLayout", () => {
  it("returns stride-3 positions, finite, z=0", () => {
    const features = Array.from({ length: 200 }, (_, i) => feat(`P${i % 10}`, i));
    const xyz = buildRestLayout(features);
    expect(xyz.length).toBe(features.length * 3);
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(xyz[i * 3])).toBe(true);
      expect(Number.isFinite(xyz[i * 3 + 1])).toBe(true);
      expect(xyz[i * 3 + 2]).toBe(0);
    }
  });

  it("is deterministic (same input → identical output)", () => {
    const features = Array.from({ length: 120 }, (_, i) => feat(`P${i % 6}`, i));
    const a = buildRestLayout(features);
    const b = buildRestLayout(features);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("is not rescaled to a constant extent (shape varies with input)", () => {
    const few = buildRestLayout(Array.from({ length: 40 }, (_, i) => feat(`P${i % 2}`, i)));
    const many = buildRestLayout(Array.from({ length: 600 }, (_, i) => feat(`P${i % 30}`, i)));
    const reach = (xyz: Float32Array): number => {
      let r = 0;
      for (let i = 0; i < xyz.length / 3; i++) r = Math.max(r, Math.hypot(xyz[i * 3], xyz[i * 3 + 1]));
      return r;
    };
    expect(reach(many)).toBeGreaterThan(reach(few));
  });

  it("clumps same-project nodes nearer than cross-project (soft grouping)", () => {
    const features = Array.from({ length: 300 }, (_, i) => feat(`P${i % 5}`, i));
    const xyz = buildRestLayout(features);
    const dist = (i: number, j: number) =>
      Math.hypot(xyz[i * 3] - xyz[j * 3], xyz[i * 3 + 1] - xyz[j * 3 + 1]);
    let intra = 0;
    let inter = 0;
    let k = 0;
    for (let i = 0; i + 5 < features.length; i += 5) {
      intra += dist(i, i + 5); // share project (i and i+5 → same i%5)
      inter += dist(i, i + 1); // different project
      k++;
    }
    expect(intra / k).toBeLessThan(inter / k);
  });
});
