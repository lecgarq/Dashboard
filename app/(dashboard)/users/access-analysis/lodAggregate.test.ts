import { describe, it, expect } from "vitest";
import { buildClusterAggregates, aggregatePositions } from "./lodAggregate";
import { footprintRadius, type ClusterFootprints } from "./clusterPacking";

function footprints(cx: number[], cy: number[], r: number[]): ClusterFootprints {
  return { cx: Float32Array.from(cx), cy: Float32Array.from(cy), r: Float32Array.from(r) };
}

describe("buildClusterAggregates", () => {
  it("aligns rest/clump/size per cluster; size = footprintRadius(count)", () => {
    const restX = Float32Array.from([100, -50, 0]);
    const restY = Float32Array.from([0, 80, -30]);
    const fp = footprints([0, 10, 20], [0, -10, 5], [8, 8, 8]);
    const counts = [40, 5, 1];
    const agg = buildClusterAggregates(restX, restY, fp, counts);

    expect(agg.count).toBe(3);
    expect(Array.from(agg.restX)).toEqual([100, -50, 0]);
    expect(Array.from(agg.clumpX)).toEqual([0, 10, 20]);
    expect(Array.from(agg.clumpY)).toEqual([0, -10, 5]);
    for (let c = 0; c < 3; c++) expect(agg.size[c]).toBeCloseTo(footprintRadius(counts[c]));
    // Bigger cluster → bigger dot.
    expect(agg.size[0]).toBeGreaterThan(agg.size[2]);
  });
});

describe("aggregatePositions — morph lerp (rest→clump)", () => {
  const restX = Float32Array.from([100, -40]);
  const restY = Float32Array.from([0, 60]);
  const fp = footprints([0, 0], [0, 0], [8, 8]); // both clumps at origin
  const agg = buildClusterAggregates(restX, restY, fp, [10, 4]);

  const at = (s: number): Float32Array => aggregatePositions(agg, s, new Float32Array(agg.count * 2));

  it("progress 0 → rest centroids", () => {
    expect(Array.from(at(0))).toEqual([100, 0, -40, 60]);
  });

  it("progress 1 → clump centers (origin)", () => {
    const p = at(1);
    for (let i = 0; i < p.length; i++) expect(p[i]).toBeCloseTo(0);
  });

  it("progress 0.5 → halfway", () => {
    const p = at(0.5);
    expect(p[0]).toBeCloseTo(50);
    expect(p[1]).toBeCloseTo(0);
    expect(p[2]).toBeCloseTo(-20);
    expect(p[3]).toBeCloseTo(30);
  });

  it("clamps progress and is allocation-free into the provided buffer", () => {
    const buf = new Float32Array(agg.count * 2);
    const ret = aggregatePositions(agg, 5, buf);
    expect(ret).toBe(buf); // same buffer, no allocation
    for (let i = 0; i < buf.length; i++) expect(buf[i]).toBeCloseTo(0); // clamped to 1 → clumps
  });
});
