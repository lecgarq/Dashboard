import { describe, it, expect } from "vitest";
import { createStaticLayer } from "./staticLayer";

describe("createStaticLayer", () => {
  it("reports frozen and returns stride-3 positions with z=0", () => {
    const xy = new Float32Array([1, 2, 3, 4]); // 2 nodes
    const layer = createStaticLayer(["a", "b"], xy);
    expect(layer.frozen).toBe(true);
    const p = layer.getPositions();
    expect(Array.from(p)).toEqual([1, 2, 0, 3, 4, 0]);
  });
  it("setMask mutates alphaMask + bumps maskVersion (mask bus works)", () => {
    const layer = createStaticLayer(["a", "b"], new Float32Array([0, 0, 0, 0]));
    const v0 = layer.maskVersion;
    layer.setMask((i) => (i === 0 ? 1.0 : 0.5));
    expect(layer.alphaMask[0]).toBe(1.0);
    expect(layer.alphaMask[1]).toBe(0.5);
    expect(layer.maskVersion).toBe(v0 + 1);
  });
  it("updateSliders / setActiveInput are no-ops (positionsVersion unchanged)", () => {
    const layer = createStaticLayer(["a"], new Float32Array([0, 0]));
    const pv = layer.positionsVersion;
    layer.updateSliders({ role: 1 });
    layer.setActiveInput(true);
    expect(layer.positionsVersion).toBe(pv);
  });
});
