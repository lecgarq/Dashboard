import { describe, it, expect } from "vitest";
import { createClusterTransitionLayer } from "./clusterTransitionLayer";

describe("clusterTransitionLayer", () => {
  it("eases toward the target without overshooting", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    layer.step(16);
    const x1 = layer.snapshot()[0];
    expect(x1).toBeGreaterThan(0);
    expect(x1).toBeLessThan(100); // partial move, no teleport
  });

  it("converges to the target over many steps", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    for (let i = 0; i < 200; i++) layer.step(16);
    expect(layer.snapshot()[0]).toBeCloseTo(100, 1);
  });

  it("re-targets from the CURRENT position (no restart/jump on retarget)", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    for (let i = 0; i < 5; i++) layer.step(16);
    const mid = layer.snapshot()[0];
    layer.setTarget(new Float32Array([0, 0, 0])); // reverse mid-flight
    layer.step(16);
    const after = layer.snapshot()[0];
    expect(after).toBeLessThan(mid);   // moved back toward 0
    expect(after).toBeGreaterThan(0);  // but did not jump to 0
  });

  it("caps dt so a long pause does not lurch (clamped step)", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    layer.step(100000); // huge dt (tab backgrounded)
    expect(layer.snapshot()[0]).toBeLessThan(100); // did not snap to target
  });

  it("reports settled=false while moving and true once at rest", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    expect(layer.step(16)).toBe(false);          // moved → not settled
    for (let i = 0; i < 500; i++) layer.step(16);
    expect(layer.step(16)).toBe(true);           // at rest → settled
  });
});
