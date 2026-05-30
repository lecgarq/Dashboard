import { describe, it, expect } from "vitest";
import { selectVisibleLabels } from "./clusterLabelLayout";

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
