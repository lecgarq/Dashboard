import { describe, it, expect } from "vitest";
import { selectVisibleLabels, liveLabelCenter, labelCandidateClusters } from "./clusterLabelLayout";
import { easeMorph } from "./layoutDescriptor";

describe("labelCandidateClusters", () => {
  it("ranks ALL clusters by member count desc — small clusters included, not just the colored ones", () => {
    // counts by cluster index: c0=5, c1=900, c2=50, c3=1 → 1,2,0,3
    expect(labelCandidateClusters([5, 900, 50, 1], 10)).toEqual([1, 2, 0, 3]);
  });

  it("caps at max, keeping the largest", () => {
    expect(labelCandidateClusters([5, 900, 50, 1], 2)).toEqual([1, 2]);
  });

  it("returns every cluster when there are fewer than max", () => {
    expect(labelCandidateClusters([3, 7], 10)).toEqual([1, 0]);
  });

  it("preserves original order for equal counts (stable)", () => {
    expect(labelCandidateClusters([0, 0, 0], 10)).toEqual([0, 1, 2]);
  });
});

describe("liveLabelCenter", () => {
  it("anchors at the rest centroid at progress 0", () => {
    expect(liveLabelCenter(5, -3, 100, 60, 0)).toEqual([5, -3]);
  });

  it("anchors at the footprint center at progress 1", () => {
    expect(liveLabelCenter(5, -3, 100, 60, 1)).toEqual([100, 60]);
  });

  it("lerps on the SAME easeMorph curve the node morph uses (not raw/linear)", () => {
    const [x, y] = liveLabelCenter(0, 0, 100, 200, 0.25);
    const s = easeMorph(0.25); // ≈0.156, NOT 0.25 → proves the curve is applied
    expect(x).toBeCloseTo(100 * s, 6);
    expect(y).toBeCloseTo(200 * s, 6);
    expect(x).not.toBeCloseTo(25, 1); // 25 would mean it used raw (linear) progress
  });

  it("clamps progress outside 0..1 to the endpoints", () => {
    expect(liveLabelCenter(5, -3, 100, 60, -1)).toEqual([5, -3]);
    expect(liveLabelCenter(5, -3, 100, 60, 2)).toEqual([100, 60]);
  });
});

describe("selectVisibleLabels", () => {
  it("hides labels whose on-screen blob radius is below the reveal threshold", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 40, count: 500 },
        { i: 1, screenX: 400, screenY: 400, screenRadius: 4, count: 5 },
      ],
      { minScreenRadius: 12, sepX: 120, sepY: 22 },
    );
    expect(out.map((o) => o.i)).toEqual([0]); // small blob withheld
  });

  it("reveals more labels as on-screen radius grows (zoom-in)", () => {
    const cands = [
      { i: 0, screenX: 100, screenY: 100, screenRadius: 30, count: 500 },
      { i: 1, screenX: 400, screenY: 100, screenRadius: 14, count: 50 },
    ];
    expect(selectVisibleLabels(cands, { minScreenRadius: 20, sepX: 120, sepY: 22 }).length).toBe(1);
    expect(selectVisibleLabels(cands, { minScreenRadius: 10, sepX: 120, sepY: 22 }).length).toBe(2);
  });

  it("declutters: drops a label colliding with an already-placed bigger one", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 40, count: 999 },
        { i: 1, screenX: 110, screenY: 105, screenRadius: 38, count: 10 }, // within sep of #0
      ],
      { minScreenRadius: 5, sepX: 120, sepY: 22 },
    );
    expect(out.map((o) => o.i)).toEqual([0]); // bigger wins the slot
  });

  it("prioritizes bigger blobs for the label slot (sorted by count desc)", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 30, count: 10 },
        { i: 1, screenX: 105, screenY: 100, screenRadius: 30, count: 900 },
      ],
      { minScreenRadius: 5, sepX: 120, sepY: 22 },
    );
    expect(out[0].i).toBe(1); // the 900-member blob is placed
  });
});
