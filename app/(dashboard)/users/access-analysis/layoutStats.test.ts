import { describe, it, expect } from "vitest";
import { computeAxisRanges, computeClusteringRatio } from "./layoutStats";

// ---------------------------------------------------------------------------
// computeAxisRanges
// ---------------------------------------------------------------------------

describe("computeAxisRanges", () => {
  it("computes per-axis range and node count for a stride-3 buffer", () => {
    // 3 nodes: x in [0,10], y in [-2,2], z in [5,5]
    const xyz = new Float32Array([0, -2, 5, 10, 2, 5, 5, 0, 5]);
    const s = computeAxisRanges(xyz);
    expect(s.nodeCount).toBe(3);
    expect(s.xRange).toBeCloseTo(10, 5);
    expect(s.yRange).toBeCloseTo(4, 5);
    expect(s.zRange).toBeCloseTo(0, 5);
    expect(s.anyNaN).toBe(false);
  });

  it("flags NaN / Infinity", () => {
    expect(computeAxisRanges(new Float32Array([0, 0, 0, NaN, 1, 2])).anyNaN).toBe(true);
    expect(computeAxisRanges(new Float32Array([0, 0, 0, Infinity, 1, 2])).anyNaN).toBe(true);
  });

  it("handles an empty buffer", () => {
    const s = computeAxisRanges(new Float32Array(0));
    expect(s.nodeCount).toBe(0);
    expect(s.xRange).toBe(0);
    expect(s.yRange).toBe(0);
    expect(s.zRange).toBe(0);
    expect(s.anyNaN).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeClusteringRatio
// ---------------------------------------------------------------------------

/** Build a clustered fixture: category A near origin, category B near (D,0,0). */
function clusteredFixture(perCat: number, separation: number) {
  const n = perCat * 2;
  const xyz = new Float32Array(n * 3);
  const categories: string[] = [];
  for (let i = 0; i < n; i++) {
    const isB = i >= perCat;
    // tiny deterministic jitter within a cluster
    const j = (i % perCat) * 0.01;
    xyz[i * 3] = (isB ? separation : 0) + j;
    xyz[i * 3 + 1] = j;
    xyz[i * 3 + 2] = j;
    categories.push(isB ? "B" : "A");
  }
  return { xyz, categories };
}

/** Build a uniform fixture: positions by index, categories alternate (no spatial grouping). */
function uniformFixture(n: number) {
  const xyz = new Float32Array(n * 3);
  const categories: string[] = [];
  for (let i = 0; i < n; i++) {
    xyz[i * 3] = i;
    xyz[i * 3 + 1] = 0;
    xyz[i * 3 + 2] = 0;
    categories.push(i % 2 === 0 ? "A" : "B");
  }
  return { xyz, categories };
}

describe("computeClusteringRatio", () => {
  it("reports ratio >> 1 when same-category nodes are spatially grouped", () => {
    const { xyz, categories } = clusteredFixture(50, 100);
    const r = computeClusteringRatio(xyz, categories);
    expect(r.sameMean).toBeLessThan(r.crossMean);
    expect(r.ratio).toBeGreaterThan(3);
    expect(r.sampledPairs).toBeGreaterThan(0);
  });

  it("reports ratio ≈ 1 when categories are not spatially grouped", () => {
    const { xyz, categories } = uniformFixture(100);
    const r = computeClusteringRatio(xyz, categories);
    expect(r.ratio).toBeGreaterThan(0.5);
    expect(r.ratio).toBeLessThan(1.5);
  });

  it("is deterministic across runs", () => {
    const { xyz, categories } = clusteredFixture(40, 50);
    const a = computeClusteringRatio(xyz, categories);
    const b = computeClusteringRatio(xyz, categories);
    expect(a).toEqual(b);
  });

  it("returns ratio 1 when only one category is present (no separation possible)", () => {
    const n = 20;
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) xyz[i * 3] = i;
    const categories = Array.from({ length: n }, () => "only");
    expect(computeClusteringRatio(xyz, categories).ratio).toBe(1);
  });

  it("never returns NaN / Infinity for the ratio", () => {
    const { xyz, categories } = clusteredFixture(30, 80);
    const r = computeClusteringRatio(xyz, categories);
    expect(Number.isFinite(r.ratio)).toBe(true);
  });
});
