// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGraphRafLoop, type UseGraphRafLoopOptions } from "./useGraphRafLoop";
import type { PhysicsLayer } from "./physicsLayer";

function makePhysics(buf: Float32Array): PhysicsLayer & { _maskVersion: number } {
  const mock = {
    alphaMask: new Float32Array(0),
    _maskVersion: 0,
    get maskVersion() { return this._maskVersion; },
    positionsVersion: 0,
    frozen: false,
    getPositions: vi.fn(() => buf),
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    updateSliders: vi.fn(),
    syncPositions: vi.fn(),
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    dispose: vi.fn(),
  };
  return mock as unknown as PhysicsLayer & { _maskVersion: number };
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

  it("routes override buffer to onTick3D when override returns non-null (3D)", async () => {
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
    expect(onTick3D.mock.calls[0][0]).toBe(fromOverride);
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

// ---------------------------------------------------------------------------
// skipPositionPump tests (Fix A — I-2)
// ---------------------------------------------------------------------------

describe("useGraphRafLoop — skipPositionPump", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Shared rAF drain helper (mirrors GraphCanvas.test.ts Test 7 pattern).
   * Collects RAF callbacks via stubGlobal and drains them synchronously.
   */
  function makeRafControl() {
    let rafCallbacks: FrameRequestCallback[] = [];
    let rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
      rafCallbacks = [];
    });
    function drainRaf(timestamp = 0): void {
      const pending = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of pending) cb(timestamp);
    }
    return { drainRaf };
  }

  it("2D + skipPositionPump:true — getPositions NOT called, onTick2D NOT called each frame", async () => {
    const buf = new Float32Array([1, 2, 3]);
    const physics = makePhysics(buf);
    const onTick2D = vi.fn();
    const onTick3D = vi.fn();
    const { drainRaf } = makeRafControl();

    const opts: UseGraphRafLoopOptions = {
      physics,
      mode: "2d",
      enabled: true,
      skipPositionPump: true,
      onTick2D,
      onTick3D,
    };

    await act(async () => {
      renderHook(() => useGraphRafLoop(opts));
    });

    // Drain several frames
    for (let i = 0; i < 5; i++) drainRaf(i * 16);

    expect(physics.getPositions).not.toHaveBeenCalled();
    expect(onTick2D).not.toHaveBeenCalled();
    expect(onTick3D).not.toHaveBeenCalled();
  });

  it("2D + skipPositionPump:true — onMaskChange IS called when maskVersion increments", async () => {
    const buf = new Float32Array([1, 2, 3]);
    const physics = makePhysics(buf);
    const onMaskChange = vi.fn();
    const { drainRaf } = makeRafControl();

    const opts: UseGraphRafLoopOptions = {
      physics,
      mode: "2d",
      enabled: true,
      skipPositionPump: true,
      onTick2D: vi.fn(),
      onTick3D: vi.fn(),
      onMaskChange,
    };

    await act(async () => {
      renderHook(() => useGraphRafLoop(opts));
    });

    // 5 frames with unchanged maskVersion — no call expected
    for (let i = 0; i < 5; i++) drainRaf(i * 16);
    expect(onMaskChange).not.toHaveBeenCalled();

    // Bump maskVersion
    physics._maskVersion = 1;
    drainRaf(6 * 16);
    expect(onMaskChange).toHaveBeenCalledTimes(1);
    expect(onMaskChange).toHaveBeenCalledWith(physics.alphaMask, 1);

    // Additional frames at same version — no more calls
    for (let i = 7; i < 10; i++) drainRaf(i * 16);
    expect(onMaskChange).toHaveBeenCalledTimes(1);
  });

  it("3D + skipPositionPump:true — pump STILL runs (getPositions called, onTick3D called)", async () => {
    const buf = new Float32Array([1, 2, 3]);
    const physics = makePhysics(buf);
    const onTick3D = vi.fn();
    const onTick2D = vi.fn();
    const { drainRaf } = makeRafControl();

    const opts: UseGraphRafLoopOptions = {
      physics,
      mode: "3d",
      enabled: true,
      skipPositionPump: true,
      onTick2D,
      onTick3D,
    };

    await act(async () => {
      renderHook(() => useGraphRafLoop(opts));
    });

    drainRaf(16);
    expect(physics.getPositions).toHaveBeenCalled();
    expect(onTick3D).toHaveBeenCalled();
    expect(onTick2D).not.toHaveBeenCalled();
  });

  it("2D + skipPositionPump absent — behavior unchanged (onTick2D called each frame)", async () => {
    const buf = new Float32Array([1, 2, 3]);
    const physics = makePhysics(buf);
    const onTick2D = vi.fn();
    const { drainRaf } = makeRafControl();

    const opts: UseGraphRafLoopOptions = {
      physics,
      mode: "2d",
      enabled: true,
      onTick2D,
      onTick3D: vi.fn(),
    };

    await act(async () => {
      renderHook(() => useGraphRafLoop(opts));
    });

    drainRaf(16);
    expect(physics.getPositions).toHaveBeenCalled();
    expect(onTick2D).toHaveBeenCalled();
  });

  it("2D + skipPositionPump:false — behavior unchanged (onTick2D called each frame)", async () => {
    const buf = new Float32Array([1, 2, 3]);
    const physics = makePhysics(buf);
    const onTick2D = vi.fn();
    const { drainRaf } = makeRafControl();

    const opts: UseGraphRafLoopOptions = {
      physics,
      mode: "2d",
      enabled: true,
      skipPositionPump: false,
      onTick2D,
      onTick3D: vi.fn(),
    };

    await act(async () => {
      renderHook(() => useGraphRafLoop(opts));
    });

    drainRaf(16);
    expect(physics.getPositions).toHaveBeenCalled();
    expect(onTick2D).toHaveBeenCalled();
  });
});
