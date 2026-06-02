import { describe, it, expect } from "vitest";
import { deriveEmergentBlobs } from "./emergentBlobs";

// positions stride-2 [x,y,...]; signatures[i] = group key; labels maps key->human label
describe("deriveEmergentBlobs", () => {
  it("is deterministic and groups by signature centroid", () => {
    const pos = new Float32Array([0, 0, 1, 0, 100, 100, 101, 100]);
    const sig = ["A", "A", "B", "B"];
    const labels = { A: "Admins", B: "Guests" };
    const a = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 10 });
    const b = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 10 });
    expect(a).toEqual(b);
    expect(a.length).toBe(2);
    expect(a[0].count).toBe(2);
    expect(a.map((x) => x.label).sort()).toEqual(["Admins", "Guests"]);
  });

  it("merges co-located signatures into one similarity blob", () => {
    const pos = new Float32Array([0, 0, 2, 0, 1, 1, 200, 200]);
    const sig = ["A", "B", "C", "D"]; // A,B,C all near origin → merge; D far
    const labels = { A: "a", B: "b", C: "c", D: "d" };
    const out = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 20 });
    expect(out.length).toBe(2);
    const big = out.find((b) => b.count === 3);
    expect(big).toBeTruthy();
  });

  it("caps to topN by count and never NaNs on a single-member blob", () => {
    const pos = new Float32Array([0, 0]);
    const out = deriveEmergentBlobs(pos, ["X"], { X: "x" }, { topN: 1, mergeDist: 5 });
    expect(out.length).toBe(1);
    expect(Number.isFinite(out[0].radius)).toBe(true);
    expect(Number.isFinite(out[0].centroidX)).toBe(true);
  });

  it("returns empty for empty input", () => {
    const out = deriveEmergentBlobs(new Float32Array([]), [], {}, { topN: 8, mergeDist: 10 });
    expect(out).toEqual([]);
  });
});
