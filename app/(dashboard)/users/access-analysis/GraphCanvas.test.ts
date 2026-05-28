// @vitest-environment jsdom
/**
 * GraphCanvas.test.ts — Invariant suite for the render layer.
 *
 * Tests cover:
 *   REND-01 (Tests 1, 3, 4): cosmos.gl frozen-mode init + alpha mask path
 *   REND-04 (Test 6):        Source-text purity — no math/data/dimension-control imports
 *   REND-05 (Tests 2, 8):    stride-2 downproject + dontRescale=true + no per-frame allocation
 *   rAF mask change-detection (Test 7): onMaskChange fires only on version change
 *   Pitfall 1 guard (Test 5): setConfig never called outside constructor
 *
 * Environment: jsdom (set via @vitest-environment comment above).
 * cosmos.gl is fully mocked — no GPU context required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGraphRafLoop } from "./useGraphRafLoop";
import type { PhysicsLayer } from "./physicsLayer";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Mock @cosmos.gl/graph
// ---------------------------------------------------------------------------

let _capturedGraph: any = null;
let _capturedConfig: any = null;
let _setPointPositionsCalls: Array<{ xy: Float32Array; dontRescale: boolean }> = [];
let _setConfigPartialCalls: any[] = [];
let _setConfigCalls: any[] = [];

vi.mock("@cosmos.gl/graph", () => {
  class MockGraph {
    constructor(_div: any, config: any) {
      _capturedConfig = { ...config };
      const g = this;
      (g as any).setPointPositions = vi.fn((xy: Float32Array, dontRescale?: boolean) => {
        _setPointPositionsCalls.push({ xy: xy.slice(), dontRescale: !!dontRescale });
      });
      (g as any).setPointColors = vi.fn();
      (g as any).setPointSizes = vi.fn();
      (g as any).setConfigPartial = vi.fn((p: any) => {
        _setConfigPartialCalls.push({ ...p });
      });
      (g as any).setConfig = vi.fn((p: any) => {
        _setConfigCalls.push({ ...p });
      });
      (g as any).render = vi.fn();
      (g as any).destroy = vi.fn();
      (g as any).ready = Promise.resolve();
      _capturedGraph = g;
    }
  }
  return { Graph: MockGraph };
});

// Also mock next-themes since GraphCanvas.tsx imports it
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PhysicsLayer mock. */
function makeFakePhysics(opts?: {
  nodeCount?: number;
  maskVersion?: number;
}): PhysicsLayer & { _alphaMask: Float32Array; _maskVersion: number } {
  const n = opts?.nodeCount ?? 3;
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) xyz[i] = i * 1.0;

  const mock = {
    _alphaMask: new Float32Array(n).fill(1.0),
    _maskVersion: opts?.maskVersion ?? 0,
    get alphaMask() {
      return this._alphaMask;
    },
    get maskVersion() {
      return this._maskVersion;
    },
    getPositions: vi.fn(() => xyz.slice()),
    updateSliders: vi.fn(),
    setMask: vi.fn(),
    dispose: vi.fn(),
  };
  return mock as unknown as PhysicsLayer & {
    _alphaMask: Float32Array;
    _maskVersion: number;
  };
}

/**
 * Create a fake ref that GraphCanvas2D accepts.
 * React 19's createRef makes 'current' non-configurable so we use a plain object.
 */
function makeFakeRef(): { current: HTMLDivElement } {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return { current: div };
}

// ---------------------------------------------------------------------------
// Reset captured state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  _capturedGraph = null;
  _capturedConfig = null;
  _setPointPositionsCalls = [];
  _setConfigPartialCalls = [];
  _setConfigCalls = [];
});

// ---------------------------------------------------------------------------
// Test 1 (REND-01): cosmos.gl initialized with frozen-mode config
// ---------------------------------------------------------------------------

describe("GraphCanvas2D — REND-01 frozen-mode initialization", () => {
  it("Test 1 (REND-01): cosmos.gl initialized with frozen-mode config", async () => {
    const { GraphCanvas2D } = await import("./GraphCanvas2D");
    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");

    const fakeRef = makeFakeRef();
    const physics = makeFakePhysics({ nodeCount: 2 });
    const rgba = new Float32Array(8); // 2 nodes × 4 channels

    render(
      createElement(GraphCanvas2D, {
        containerRef: fakeRef as any,
        physics,
        nodeColors: rgba,
        backgroundColor: "#09090B",
        onHandleReady: vi.fn(),
      })
    );

    // Let the async IIFE (graph.ready await) settle
    await Promise.resolve();
    await Promise.resolve();

    expect(_capturedConfig).not.toBeNull();
    expect(_capturedConfig.enableSimulation).toBe(false);
    // WS2: link rendering is enabled to draw same-user footprint edges.
    expect(_capturedConfig.renderLinks).toBe(true);
    expect(_capturedConfig.transitionDuration).toBe(0);
    expect(_capturedConfig.pointGreyoutOpacity).toBe(0.15);
    expect(_capturedConfig.backgroundColor).toBe("#09090B");
  });
});

// ---------------------------------------------------------------------------
// Shared handle setup helper
// ---------------------------------------------------------------------------

async function setupHandle(nodeCount = 4): Promise<any> {
  const { GraphCanvas2D } = await import("./GraphCanvas2D");
  const { render } = await import("@testing-library/react");
  const { createElement } = await import("react");

  let capturedHandle: any = null;
  const fakeRef = makeFakeRef();
  const physics = makeFakePhysics({ nodeCount });
  const rgba = new Float32Array(nodeCount * 4);

  render(
    createElement(GraphCanvas2D, {
      containerRef: fakeRef as any,
      physics,
      nodeColors: rgba,
      backgroundColor: "#09090B",
      onHandleReady: (h) => {
        capturedHandle = h;
      },
    })
  );

  await Promise.resolve();
  await Promise.resolve();
  return capturedHandle;
}

// ---------------------------------------------------------------------------
// Test 2 (REND-05): stride-2 downproject + dontRescale=true
// ---------------------------------------------------------------------------

describe("GraphCanvas2DHandle — REND-05 tick path", () => {
  it("Test 2 (REND-05): pushPositions downprojects stride-3→stride-2 with dontRescale=true", async () => {
    const handle = await setupHandle(2);
    expect(handle).not.toBeNull();

    // Clear previous calls from the initial mount setPointPositions
    _setPointPositionsCalls = [];

    const xyz = new Float32Array([10, 20, 30, 40, 50, 60]); // 2 nodes stride-3
    handle.pushPositions(xyz);

    const call = _setPointPositionsCalls.at(-1);
    expect(call).toBeDefined();
    // Length should be 4 (stride-2 for 2 nodes)
    expect(call!.xy.length).toBe(4);
    // x0=10, y0=20, x1=40, y1=50 (z dropped)
    expect(call!.xy[0]).toBe(10);
    expect(call!.xy[1]).toBe(20);
    expect(call!.xy[2]).toBe(40);
    expect(call!.xy[3]).toBe(50);
    // dontRescale must be true on tick path
    expect(call!.dontRescale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests 3, 4, 5: alpha mask + setConfig guard
// ---------------------------------------------------------------------------

describe("GraphCanvas2DHandle — REND-01 alpha mask", () => {
  it("Test 3 (REND-01): applyAlphaMask routes lit indices to highlightedPointIndices via setConfigPartial", async () => {
    const handle = await setupHandle(4);
    expect(handle).not.toBeNull();

    _setConfigPartialCalls = [];
    const mask = new Float32Array([1, 1, 0.15, 1]); // nodes 0,1,3 lit; node 2 dimmed
    handle.applyAlphaMask(mask, 1);

    const call = _setConfigPartialCalls.at(-1);
    expect(call).toBeDefined();
    expect(Array.isArray(call!.highlightedPointIndices)).toBe(true);
    expect(call!.highlightedPointIndices).toEqual(expect.arrayContaining([0, 1, 3]));
    expect(call!.highlightedPointIndices).toHaveLength(3);
    // Node 2 (dimmed) must NOT be in the array
    expect(call!.highlightedPointIndices).not.toContain(2);
  });

  it("Test 4 (REND-01): all-lit mask passes undefined for highlightedPointIndices", async () => {
    const handle = await setupHandle(4);
    expect(handle).not.toBeNull();

    _setConfigPartialCalls = [];
    const mask = new Float32Array([1, 1, 1, 1]); // all lit
    handle.applyAlphaMask(mask, 2);

    const call = _setConfigPartialCalls.at(-1);
    expect(call).toBeDefined();
    expect(call!.highlightedPointIndices).toBeUndefined();
  });

  it("Test 5 (Pitfall 1 guard): setConfig is never called outside the constructor", async () => {
    const handle = await setupHandle(4);
    expect(handle).not.toBeNull();

    // Clear any calls from mount
    _setConfigCalls = [];

    // Perform multiple operations that should only use setConfigPartial
    const mask1 = new Float32Array([1, 0.15, 1, 0.15]);
    handle.applyAlphaMask(mask1, 1);
    const mask2 = new Float32Array([1, 1, 1, 1]);
    handle.applyAlphaMask(mask2, 2);
    handle.pushPositions(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));

    // setConfig (not setConfigPartial) must have been called 0 times after mount
    expect(_setConfigCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 6 (REND-04): source purity
// ---------------------------------------------------------------------------

describe("GraphCanvas.tsx + GraphCanvas2D.tsx — REND-04 source purity", () => {
  it("Test 6 (REND-04): source files contain no forbidden imports or references", () => {
    const dir = path.resolve(__dirname);
    const filesToCheck = [
      path.join(dir, "GraphCanvas.tsx"),
      path.join(dir, "GraphCanvas2D.tsx"),
      path.join(dir, "useGraphRafLoop.ts"),
    ];

    const forbidden = [
      "mathLayer",
      "dataLayer",
      "featureColumns",
      "roleId",
      "permissionTier",
      "isAdmin",
      "isExternal",
      "computeTargetPositions",
    ];

    for (const filePath of filesToCheck) {
      const src = fs.readFileSync(filePath, "utf8");
      for (const term of forbidden) {
        expect(src, `${path.basename(filePath)} must not contain "${term}"`).not.toContain(term);
      }
    }

    // GraphCanvas2D import check: only @cosmos.gl/graph, react, ./physicsLayer
    const gc2d = fs.readFileSync(path.join(dir, "GraphCanvas2D.tsx"), "utf8");
    const gc2dImportLines = gc2d.split("\n").filter((l) => l.trimStart().startsWith("import"));
    for (const line of gc2dImportLines) {
      expect(line, "GraphCanvas2D imports must not reference math/data layers").not.toMatch(
        /mathLayer|dataLayer/
      );
    }

    // GraphCanvas.tsx allowed imports
    const gcSrc = fs.readFileSync(path.join(dir, "GraphCanvas.tsx"), "utf8");
    const gcImportLines = gcSrc.split("\n").filter((l) => l.trimStart().startsWith("import"));
    for (const line of gcImportLines) {
      expect(line, "GraphCanvas.tsx has unexpected import: " + line).toMatch(
        /react|next-themes|physicsLayer|GraphCanvas2D|GraphCanvas3D|useGraphRafLoop|SliderContext|previewLayer/i
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: useGraphRafLoop mask change-detection
// ---------------------------------------------------------------------------

describe("useGraphRafLoop — mask change-detection", () => {
  it("Test 7: onMaskChange fires only when maskVersion changes", async () => {
    vi.useFakeTimers();

    let rafCallbacks: FrameRequestCallback[] = [];
    let rafId = 0;

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
      rafCallbacks = [];
    });

    const physics = makeFakePhysics({ nodeCount: 3 });
    const onTick2D = vi.fn();
    const onMaskChange = vi.fn();

    const { unmount } = renderHook(() =>
      useGraphRafLoop({
        physics,
        mode: "2d",
        enabled: true,
        onTick2D,
        onTick3D: vi.fn(),
        onMaskChange,
      })
    );

    /** Drain all queued rAF callbacks (simulates one frame) */
    function drainRaf(timestamp = 0): void {
      const pending = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of pending) cb(timestamp);
    }

    // Tick 5 frames with maskVersion unchanged (= 0)
    // The hook initializes lastMaskVersion to physics.maskVersion (0) on start,
    // so no onMaskChange should fire.
    for (let i = 0; i < 5; i++) drainRaf(i * 16);
    expect(onMaskChange).not.toHaveBeenCalled();

    // Mutate maskVersion to 1
    physics._maskVersion = 1;
    drainRaf(6 * 16);
    expect(onMaskChange).toHaveBeenCalledTimes(1);
    expect(onMaskChange).toHaveBeenCalledWith(physics.alphaMask, 1);

    // 3 more ticks — still version 1, no new calls
    for (let i = 0; i < 3; i++) drainRaf((7 + i) * 16);
    expect(onMaskChange).toHaveBeenCalledTimes(1);

    unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Test 8: no per-frame allocation in the 2D push path
// ---------------------------------------------------------------------------

describe("GraphCanvas2D — REND-05 no per-frame allocation", () => {
  it("Test 8: pushPositions does not allocate new Float32Array(n*2) on repeated calls", async () => {
    const nodeCount = 10;
    const handle = await setupHandle(nodeCount);
    expect(handle).not.toBeNull();

    const stride2Length = nodeCount * 2;
    let stride2AllocCount = 0;
    const OrigFloat32Array = Float32Array;

    // Patch global Float32Array to count stride-2 sized allocations
    function PatchedFloat32Array(this: any, arg: any) {
      const result = new OrigFloat32Array(arg);
      if (result.length === stride2Length) {
        stride2AllocCount++;
      }
      return result;
    }
    Object.setPrototypeOf(PatchedFloat32Array, OrigFloat32Array);
    PatchedFloat32Array.prototype = OrigFloat32Array.prototype;
    vi.stubGlobal("Float32Array", PatchedFloat32Array);

    // Run 100 simulated ticks through the handle
    const xyz = new OrigFloat32Array(nodeCount * 3);
    for (let i = 0; i < 100; i++) {
      handle.pushPositions(xyz);
    }

    vi.unstubAllGlobals();

    // The persistent xy2 buffer was allocated at mount time (before the spy was installed).
    // After mount, pushPositions should make ZERO new stride-2 allocations.
    expect(stride2AllocCount).toBe(0);
  });
});
