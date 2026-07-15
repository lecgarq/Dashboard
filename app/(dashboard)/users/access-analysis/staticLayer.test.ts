import { describe, it, expect } from "vitest";
import * as staticLayer from "./staticLayer";

const { createStaticLayer } = staticLayer;

const baseline = new Float32Array([10, 20, 0, -10, -20, 0]);
const targets = {
  role: {
    x: new Float32Array([100, 100]),
    y: new Float32Array([0, 0]),
    z: new Float32Array([0, 0]),
  },
  project: {
    x: new Float32Array([-100, -100]),
    y: new Float32Array([0, 0]),
    z: new Float32Array([0, 0]),
  },
};
const dimWeights = {
  role: new Float32Array([1, 0]),
  project: new Float32Array([1, 1]),
};

function anchorTarget(live: Record<string, number>, order = ["role", "project"]): Float32Array {
  return staticLayer.catalogAnchorTarget({
    baseline,
    targets,
    dimWeights,
    live,
    order,
    out: new Float32Array(6),
  });
}

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

  it("returns the exact similarity baseline when every layout strength is zero", () => {
    expect(Array.from(anchorTarget({ role: 0, project: 0 }))).toEqual(Array.from(baseline));
  });

  it("uses only the strongest dimension and breaks ties by catalog order", () => {
    expect(anchorTarget({ role: 60, project: 80 })[0]).toBeLessThan(0);
    expect(anchorTarget({ role: 80, project: 80 })[0]).toBeGreaterThan(0);
    expect(anchorTarget({ role: 80, project: 80 }, ["project", "role"])[0]).toBeLessThan(0);
  });

  it("gates movement by per-node weight and retains organic similarity texture", () => {
    const result = anchorTarget({ role: 100 });
    expect(result[0]).toBeGreaterThan(100);
    expect(result[3]).toBe(baseline[3]);

    const bothWeighted = anchorTarget({ project: 100 });
    expect(bothWeighted[0]).not.toBe(bothWeighted[3]);
  });

  it("retains and lazily registers target/weight maps", () => {
    const layer = createStaticLayer(["a", "b"], new Float32Array([0, 0, 0, 0]), targets, dimWeights);
    expect(layer.getTargets().role).toBe(targets.role);
    layer.registerTargets?.(
      { action: { x: new Float32Array(2), y: new Float32Array(2), z: new Float32Array(2) } },
      { action: new Float32Array([1, 1]) },
    );
    expect(layer.getTargets().action).toBeDefined();
    expect(layer.getDimWeights().action).toEqual(new Float32Array([1, 1]));
  });
});
