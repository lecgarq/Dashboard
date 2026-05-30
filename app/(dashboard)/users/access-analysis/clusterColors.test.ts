import { describe, it, expect } from "vitest";
import { clusterColorBuffer } from "./clusterColors";

describe("clusterColorBuffer", () => {
  it("returns RGBA in [0,1] with alpha 1 for every node", () => {
    const ids = new Int32Array([0, 1, 2, 0]);
    const buf = clusterColorBuffer(ids, 3);
    expect(buf.length).toBe(16); // 4 nodes * 4
    for (let i = 0; i < 4; i++) expect(buf[i * 4 + 3]).toBe(1); // alpha
    for (let i = 0; i < buf.length; i++) { expect(buf[i]).toBeGreaterThanOrEqual(0); expect(buf[i]).toBeLessThanOrEqual(1); }
  });

  it("gives nodes in the same cluster the same color", () => {
    const ids = new Int32Array([0, 1, 0]);
    const buf = clusterColorBuffer(ids, 2);
    expect([buf[0], buf[1], buf[2]]).toEqual([buf[8], buf[9], buf[10]]);
  });

  it("gives different clusters different colors (within palette range)", () => {
    const ids = new Int32Array([0, 1]);
    const buf = clusterColorBuffer(ids, 2);
    expect([buf[0], buf[1], buf[2]]).not.toEqual([buf[4], buf[5], buf[6]]);
  });

  it("covers high cluster counts without crashing (interpolator beyond palette size)", () => {
    const k = 200;
    const ids = new Int32Array(Array.from({ length: k }, (_, i) => i));
    const buf = clusterColorBuffer(ids, k);
    expect(buf.length).toBe(k * 4);
  });

  it("colors unclustered nodes (id < 0) a neutral grey", () => {
    const ids = new Int32Array([-1]);
    const buf = clusterColorBuffer(ids, 0);
    expect(buf[0]).toBeCloseTo(buf[1], 6);
    expect(buf[1]).toBeCloseTo(buf[2], 6);
  });
});
