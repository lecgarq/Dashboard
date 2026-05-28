// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGraphRafLoop, type UseGraphRafLoopOptions } from "./useGraphRafLoop";
import type { PhysicsLayer } from "./physicsLayer";

function makePhysics(buf: Float32Array): PhysicsLayer {
  return {
    alphaMask: new Float32Array(0),
    maskVersion: 0,
    positionsVersion: 0,
    frozen: false,
    getPositions: () => buf,
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    updateSliders: vi.fn(),
    syncPositions: vi.fn(),
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    dispose: vi.fn(),
  } as unknown as PhysicsLayer;
}

async function waitOneFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });
}

describe("useGraphRafLoop — getPositionsOverride", () => {
  it("routes override buffer to onTick2D when override returns non-null (2D)", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const fromOverride = new Float32Array([9, 9, 9]);
    const onTick2D = vi.fn();
    const opts: UseGraphRafLoopOptions = {
      physics: makePhysics(fromPhysics),
      mode: "2d",
      enabled: true,
      onTick2D,
      onTick3D: vi.fn(),
      getPositionsOverride: () => fromOverride,
    };
    renderHook(() => useGraphRafLoop(opts));
    await waitOneFrame();
    expect(onTick2D).toHaveBeenCalled();
    expect(onTick2D.mock.calls[0][0]).toBe(fromOverride);
  });

  it("falls back to physics.getPositions when override returns null (2D)", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const onTick2D = vi.fn();
    const opts: UseGraphRafLoopOptions = {
      physics: makePhysics(fromPhysics),
      mode: "2d",
      enabled: true,
      onTick2D,
      onTick3D: vi.fn(),
      getPositionsOverride: () => null,
    };
    renderHook(() => useGraphRafLoop(opts));
    await waitOneFrame();
    expect(onTick2D).toHaveBeenCalled();
    expect(onTick2D.mock.calls[0][0]).toBe(fromPhysics);
  });

  it("ignores override in 3D mode (always uses physics)", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const fromOverride = new Float32Array([9, 9, 9]);
    const onTick3D = vi.fn();
    const opts: UseGraphRafLoopOptions = {
      physics: makePhysics(fromPhysics),
      mode: "3d",
      enabled: true,
      onTick2D: vi.fn(),
      onTick3D,
      getPositionsOverride: () => fromOverride,
    };
    renderHook(() => useGraphRafLoop(opts));
    await waitOneFrame();
    expect(onTick3D).toHaveBeenCalled();
    expect(onTick3D.mock.calls[0][0]).toBe(fromPhysics);
  });

  it("with no override at all, 2D uses physics (B.1 behavior preserved)", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const onTick2D = vi.fn();
    const opts: UseGraphRafLoopOptions = {
      physics: makePhysics(fromPhysics),
      mode: "2d",
      enabled: true,
      onTick2D,
      onTick3D: vi.fn(),
    };
    renderHook(() => useGraphRafLoop(opts));
    await waitOneFrame();
    expect(onTick2D).toHaveBeenCalled();
    expect(onTick2D.mock.calls[0][0]).toBe(fromPhysics);
  });
});
