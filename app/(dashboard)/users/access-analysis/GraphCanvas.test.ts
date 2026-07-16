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
 * Environment: jsdom (set via the vitest environment directive on line 1).
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
let _clusterCalls: Array<(number | undefined)[]> = [];
let _clusterPosCalls: Array<(number | undefined)[]> = [];
let _clusterStrengthCalls: Array<Float32Array> = [];
let _startCalls: Array<number | undefined> = [];
let _pauseCalls = 0;
let _zoomPointCalls: Array<{
  index: number;
  duration: number;
  scale: number;
  canZoomOut: boolean;
  enableSimulation: boolean;
}> = [];
let _zoomTransformCalls: Array<{
  positions: number[];
  duration: number;
  scale: number;
  padding: number;
  enableSimulation: boolean;
}> = [];

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
      (g as any).setPointClusters = vi.fn((c: (number | undefined)[]) => { _clusterCalls.push(c.slice()); });
      (g as any).setClusterPositions = vi.fn((p: (number | undefined)[]) => { _clusterPosCalls.push(p.slice()); });
      (g as any).setPointClusterStrength = vi.fn((s: Float32Array) => { _clusterStrengthCalls.push(s.slice()); });
      (g as any).start = vi.fn((a?: number) => { _startCalls.push(a); });
      (g as any).pause = vi.fn(() => { _pauseCalls++; });
      (g as any).unpause = vi.fn();
      (g as any).fitView = vi.fn();
      (g as any).fitViewByPointPositions = vi.fn();
      (g as any).screenToSpacePosition = vi.fn(([x, y]: [number, number]) => [x - 10, y - 20]);
      (g as any).getZoomLevel = vi.fn(() => 4);
      (g as any).zoomToPointByIndex = vi.fn(
        (
          index: number,
          duration: number,
          scale: number,
          canZoomOut: boolean,
          enableSimulation: boolean,
        ) => {
          _zoomPointCalls.push({ index, duration, scale, canZoomOut, enableSimulation });
        },
      );
      (g as any).setZoomTransformByPointPositions = vi.fn(
        (
          positions: Float32Array,
          duration: number,
          scale: number,
          padding: number,
          enableSimulation: boolean,
        ) => {
          _zoomTransformCalls.push({
            positions: Array.from(positions),
            duration,
            scale,
            padding,
            enableSimulation,
          });
        },
      );
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

// Mock GraphCanvas3D as a trivial pass-through. The top-level GraphCanvas always
// mounts GraphCanvas3D (visibility-swap pattern), which would otherwise pull in
// real three.js + WebGLRenderer (no GL context in jsdom). Only the REND-cluster
// test below mounts the top-level GraphCanvas; the other tests mount GraphCanvas2D
// directly and are unaffected by this mock.
vi.mock("./GraphCanvas3D", async () => {
  const React = await import("react");
  return {
    GraphCanvas3D: function MockGC3D(props: any): null {
      React.useEffect(() => {
        props.onHandleReady?.({
          pushPositions: () => {},
          applyAlphaMask: () => {},
          setColors: () => {},
          setBackground: () => {},
          getCamera: () => null,
          fitView: () => {},
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PhysicsLayer mock. */
function makeFakePhysics(opts?: {
  nodeCount?: number;
  maskVersion?: number;
  frozen?: boolean;
}): PhysicsLayer & {
  _alphaMask: Float32Array;
  _maskVersion: number;
  _frozen: boolean;
} {
  const n = opts?.nodeCount ?? 3;
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) xyz[i] = i * 1.0;

  const mock = {
    _alphaMask: new Float32Array(n).fill(1.0),
    _maskVersion: opts?.maskVersion ?? 0,
    _frozen: opts?.frozen ?? false,
    get alphaMask() {
      return this._alphaMask;
    },
    get maskVersion() {
      return this._maskVersion;
    },
    get frozen() {
      return this._frozen;
    },
    getPositions: vi.fn(() => xyz.slice()),
    getTargets: vi.fn(() => ({
      d1: { x: new Float32Array(n).fill(100), y: new Float32Array(n), z: new Float32Array(n) },
    })),
    getDimWeights: vi.fn(() => ({ d1: new Float32Array(n).fill(1) })),
    getSliders: vi.fn(() => ({ d1: 0 })),
    updateSliders: vi.fn(),
    setMask: vi.fn(),
    dispose: vi.fn(),
  };
  return mock as unknown as PhysicsLayer & {
    _alphaMask: Float32Array;
    _maskVersion: number;
    _frozen: boolean;
  };
}

/**
 * Create a fake ref that GraphCanvas2D accepts.
 * React 19's createRef makes 'current' non-configurable so we use a plain object.
 */
function makeFakeRef(): { current: HTMLDivElement } {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { value: 800 });
  Object.defineProperty(div, "clientHeight", { value: 600 });
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
  _clusterCalls = [];
  _clusterPosCalls = [];
  _clusterStrengthCalls = [];
  _startCalls = [];
  _pauseCalls = 0;
  _zoomPointCalls = [];
  _zoomTransformCalls = [];
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

describe("GraphCanvas2DHandle — reversible frozen camera focus", () => {
  it("captures center+zoom and focuses/restores with simulation disabled", async () => {
    const handle = await setupHandle(3);
    const view = handle.captureView();
    expect(view).toEqual({ center: [390, 280], zoom: 4 });

    handle.focusPoint(2, 180);
    handle.restoreView(view, 180);

    expect(_zoomPointCalls).toEqual([
      { index: 2, duration: 180, scale: 2.25, canZoomOut: false, enableSimulation: false },
    ]);
    expect(_zoomTransformCalls).toEqual([
      {
        positions: [390, 280],
        duration: 180,
        scale: 4,
        padding: 0,
        enableSimulation: false,
      },
    ]);
    expect(_startCalls).toEqual([]);
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

  it("frozen slider and clustering methods cannot reheat or mutate Cosmos", async () => {
    const handle = await setupHandle(3);
    _startCalls = [];
    _setPointPositionsCalls = [];
    _clusterCalls = [];
    _clusterPosCalls = [];
    _clusterStrengthCalls = [];
    _setConfigPartialCalls = [];

    handle.applySliders({ role: 1 });
    handle.setClustering(new Int32Array([0, 1, 0]), new Float32Array([10, 0, 20, 0]));
    handle.setClusters([0, 1, 0]);
    handle.setClusterPositions([10, 0, 20, 0]);

    expect(_startCalls).toEqual([]);
    expect(_setPointPositionsCalls).toEqual([]);
    expect(_clusterCalls).toEqual([]);
    expect(_clusterPosCalls).toEqual([]);
    expect(_clusterStrengthCalls).toEqual([]);
    expect(_setConfigPartialCalls).toEqual([]);
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
        // lodState is a PURE renderer-control resolver (no math/data/dimension layer) — the
        // LOD mode decision (aggregate vs full) belongs with the renderer, like the loop hook.
        /react|next-themes|physicsLayer|GraphCanvas2D|GraphCanvas3D|useGraphRafLoop|SliderContext|previewLayer|clusterTransitionLayer|gpuLayout2D|lodState|graphModeFlag/i
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

// ---------------------------------------------------------------------------
// Tests 9–12: frozen-branch position upload (P0 — B.2 preview cadence fix)
//
// Bug: pushPositions rewrites xy2 every rAF, but the frozen branch could
// return without calling setPointPositions/render when the overall coordinate
// spread stayed stable. B.2 preview interpolation produces fresh per-frame
// coordinates while physics.frozen===true, so the early-return silently
// dropped preview motion and 2D appeared static between settle windows.
//
// Fix: the frozen branch always uploads xy2 + calls render at the top.
// Spread-change detection and the deferred fitView remain a separate concern.
// ---------------------------------------------------------------------------

/** Variant of setupHandle that accepts an explicit physics mock. */
async function setupHandleWith(
  physics: PhysicsLayer,
  nodeCount: number,
): Promise<any> {
  const { GraphCanvas2D } = await import("./GraphCanvas2D");
  const { render } = await import("@testing-library/react");
  const { createElement } = await import("react");

  let capturedHandle: any = null;
  const fakeRef = makeFakeRef();
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
    }),
  );

  await Promise.resolve();
  await Promise.resolve();
  return capturedHandle;
}

describe("GraphCanvas2DHandle — frozen-branch position upload (P0 fix)", () => {
  it("Test 9: frozen + scale-stable still calls setPointPositions with the latest xy2", async () => {
    const physics = makeFakePhysics({ nodeCount: 2, frozen: true });
    const handle = await setupHandleWith(physics, 2);
    expect(handle).not.toBeNull();

    // First push primes fittedScaleRef (scaleChanged=true on first frozen frame).
    handle.pushPositions(new Float32Array([10, 20, 0, 30, 40, 0]));
    _setPointPositionsCalls = [];

    // Second push at the SAME spread is the "scale-stable" case the bug missed.
    // xy values shift slightly (mirroring a preview lerp tick) but max|coord|
    // does not move enough to trip the scaleChanged gate.
    handle.pushPositions(new Float32Array([10.1, 20.1, 0, 30.1, 40.1, 0]));

    expect(_setPointPositionsCalls).toHaveLength(1);
    const call = _setPointPositionsCalls[0];
    expect(call.xy.length).toBe(4); // stride-2 for 2 nodes
    expect(call.xy[0]).toBeCloseTo(10.1, 5);
    expect(call.xy[1]).toBeCloseTo(20.1, 5);
    expect(call.xy[2]).toBeCloseTo(30.1, 5);
    expect(call.xy[3]).toBeCloseTo(40.1, 5);
    expect(call.dontRescale).toBe(true);
  });

  it("Test 10: frozen + scale-stable still calls render every push (preview cadence)", async () => {
    const physics = makeFakePhysics({ nodeCount: 2, frozen: true });
    const handle = await setupHandleWith(physics, 2);
    const g: any = _capturedGraph;
    // Mock the deferred-fit call so the fit frame is deterministic in this test.
    g.fitViewByPointPositions = vi.fn();

    // Prime the scale; this arms fitPendingRef=4. We then drain it across 4
    // scale-stable frames so the extra fit-frame render no longer fires
    // during the measurement window below.
    handle.pushPositions(new Float32Array([100, 100, 0, 100, 100, 0]));
    for (let i = 0; i < 4; i++) {
      handle.pushPositions(new Float32Array([100, 100, 0, 100, 100, 0]));
    }
    expect(g.fitViewByPointPositions).toHaveBeenCalledTimes(1);
    g.render.mockClear();
    g.fitViewByPointPositions.mockClear();

    // 5 scale-stable frames simulating B.2 preview interpolation while frozen.
    // Each frame's coords are DISTINCT (real interpolation never repeats a frame),
    // so every push gets past the no-op dirty-check and drives exactly one render.
    // Base 100.5 keeps them distinct from the primed [100,100] (which the dirty-check
    // would otherwise skip) while staying within the <2-unit scale-stable window.
    for (let i = 0; i < 5; i++) {
      handle.pushPositions(
        new Float32Array([100.5 + i * 0.1, 100.5 + i * 0.1, 0, 100, 100, 0]),
      );
    }

    // Each scale-stable frozen push with fresh coords must drive a render.
    expect(g.render).toHaveBeenCalledTimes(5);
    // the deferred fit must NOT have re-fired — spread did not change materially.
    expect(g.fitViewByPointPositions).not.toHaveBeenCalled();
  });

  it("Test 11: frozen + scale-changed preserves fitPending → deferred fit frames the actual cloud", async () => {
    const physics = makeFakePhysics({ nodeCount: 2, frozen: true });
    const handle = await setupHandleWith(physics, 2);
    const g: any = _capturedGraph;
    g.fitViewByPointPositions = vi.fn();

    // Prime: small spread sets fittedScaleRef=10, arms fitPending=4.
    handle.pushPositions(new Float32Array([10, 10, 0, 10, 10, 0]));
    // Material spread change to ~350 re-arms fitPending=4 (>2% gate).
    handle.pushPositions(new Float32Array([350, 350, 0, 350, 350, 0]));
    expect(g.fitViewByPointPositions).not.toHaveBeenCalled();

    // 4 scale-stable frames: fitPending counts 4→3→2→1→0; the fit fires at 0.
    handle.pushPositions(new Float32Array([350, 350, 0, 350, 350, 0]));
    expect(g.fitViewByPointPositions).not.toHaveBeenCalled();
    handle.pushPositions(new Float32Array([350, 350, 0, 350, 350, 0]));
    expect(g.fitViewByPointPositions).not.toHaveBeenCalled();
    handle.pushPositions(new Float32Array([350, 350, 0, 350, 350, 0]));
    expect(g.fitViewByPointPositions).not.toHaveBeenCalled();
    handle.pushPositions(new Float32Array([350, 350, 0, 350, 350, 0]));
    expect(g.fitViewByPointPositions).toHaveBeenCalledTimes(1);
    // Frames the ACTUAL uploaded stride-2 cloud (not cosmos's stale committed bbox):
    // (positions, duration=0, padding=0.12, enableSimulation=false).
    const [positions, duration, padding, enableSim] = g.fitViewByPointPositions.mock.calls[0];
    expect(Array.from(positions as Float32Array)).toEqual([350, 350, 350, 350]);
    expect(duration).toBe(0);
    expect(padding).toBeCloseTo(0.12, 5);
    expect(enableSim).toBe(false);
  });

  it("Test 12: non-frozen path unchanged — uploads xy2 with dontRescale=true and renders", async () => {
    const physics = makeFakePhysics({ nodeCount: 2, frozen: false });
    const handle = await setupHandleWith(physics, 2);
    const g: any = _capturedGraph;

    _setPointPositionsCalls = [];
    g.render.mockClear();

    handle.pushPositions(new Float32Array([1, 2, 3, 4, 5, 6]));

    expect(_setPointPositionsCalls).toHaveLength(1);
    const call = _setPointPositionsCalls[0];
    expect(call.dontRescale).toBe(true);
    expect(call.xy[0]).toBe(1);
    expect(call.xy[1]).toBe(2);
    expect(call.xy[2]).toBe(4);
    expect(call.xy[3]).toBe(5);
    expect(g.render).toHaveBeenCalledTimes(1);
  });
});

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

// ---------------------------------------------------------------------------
// GPU-1/2/3: cosmos.gl GPU cluster-anchor simulation mode (gpuSimulation=true)
// ---------------------------------------------------------------------------

async function setupGpuHandle(
  nodeCount = 3,
  clusterProps?: {
    clusterIds?: Int32Array;
    clusterAnchors?: Float32Array;
  },
): Promise<any> {
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
      gpuSimulation: true,
      ...(clusterProps ?? {}),
      onHandleReady: (h: any) => { capturedHandle = h; },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
  return capturedHandle;
}

describe("GraphCanvas2D — GPU simulation mode", () => {
  it("GPU-1: constructs cosmos with enableSimulation:true and is unclustered at slider 0 (calm scatter)", async () => {
    await setupGpuHandle(3);
    expect(_capturedConfig.enableSimulation).toBe(true);
    // No clusterIds (all sliders 0) → init does not assign clusters or pin positions.
    expect(_clusterCalls.length).toBe(0);
    expect(_clusterPosCalls.length).toBe(0);
    // Cluster pull is off at slider 0 (mapDominantForceConfig(0)).
    expect(_capturedConfig.simulationCluster).toBe(0);
  });

  it("GPU-2: applySliders ramps tightness only (no re-group, no pinning)", async () => {
    const handle = await setupGpuHandle(3);
    _clusterCalls = [];
    _clusterPosCalls = [];
    _setConfigPartialCalls = [];
    _startCalls = [];
    handle.applySliders({ d1: 1 });
    // Tightness ramps to the engaged value (mapDominantForceConfig(1) → 0.8).
    expect(_setConfigPartialCalls.at(-1)!.simulationCluster).toBeCloseTo(0.8, 5);
    // applySliders NEVER touches membership or positions.
    expect(_clusterCalls.length).toBe(0);
    expect(_clusterPosCalls.length).toBe(0);
    expect(_startCalls).toEqual([0.3]); // gentle, controlled reheat
  });

  it("GPU-3: pushPositions is a no-op in GPU mode (cosmos owns positions)", async () => {
    const handle = await setupGpuHandle(3);
    _setPointPositionsCalls = [];
    handle.pushPositions(new Float32Array(9));
    expect(_setPointPositionsCalls).toHaveLength(0);
  });

  it("GPU-4: clusterIds + clusterAnchors → grouped, PINNED at the supplied anchors, full per-node pull", async () => {
    const handle = await setupGpuHandle(3, {
      clusterIds: new Int32Array([0, 1, 0]),
      clusterAnchors: new Float32Array([10, 0, 20, 0]),
    });
    expect(handle).not.toBeNull();

    // Nodes are grouped by their cluster ids.
    expect(_clusterCalls.at(-1)).toEqual([0, 1, 0]);
    // Anchors are PINNED as-is (pre-separated 2D sunflower), never centermass.
    expect(_clusterPosCalls.at(-1)).toEqual([10, 0, 20, 0]);
    // Clustered nodes get full per-node pull (global coeff scales tightness).
    expect(Array.from(_clusterStrengthCalls.at(-1)!)).toEqual([1, 1, 1]);
    // Force config is the dominant-attribute config (sliders 0 here → cluster 0).
    expect(_capturedConfig.simulationCluster).toBe(0);

    // setClusterPositions handle method re-pins fresh anchors + reheats.
    _clusterPosCalls = [];
    _startCalls = [];
    handle.setClusterPositions([30, 0, 40, 0]);
    expect(_clusterPosCalls.at(-1)).toEqual([30, 0, 40, 0]);
    expect(_startCalls.length).toBeGreaterThan(0);
  });

  it("GPU-decouple: with NO clusterIds, 2D stays unclustered with cluster pull off", async () => {
    await setupGpuHandle(3); // no clusterProps → clusterIds undefined
    expect(_capturedConfig.simulationCluster).toBe(0);
    expect(_clusterCalls.length).toBe(0);
  });

  it("GPU-4b: setClusters re-assigns ids + full-pull strength + reheats (re-group path)", async () => {
    const handle = await setupGpuHandle(3, {
      clusterIds: new Int32Array([0, 1, 0]),
      clusterAnchors: new Float32Array([10, 0, 20, 0]),
    });
    expect(handle).not.toBeNull();

    _clusterCalls = [];
    _clusterStrengthCalls = [];
    _startCalls = [];

    handle.setClusters([1, 0, 1]);

    expect(_clusterCalls.at(-1)).toEqual([1, 0, 1]);
    expect(Array.from(_clusterStrengthCalls.at(-1)!)).toEqual([1, 1, 1]);
    expect(_startCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("GPU-clear: setClusters with all-undefined clears membership and zeroes pull (scatter)", async () => {
    const handle = await setupGpuHandle(3, {
      clusterIds: new Int32Array([0, 1, 0]),
      clusterAnchors: new Float32Array([10, 0, 20, 0]),
    });
    _clusterCalls = [];
    _clusterStrengthCalls = [];
    handle.setClusters([undefined, undefined, undefined]);
    expect(_clusterCalls.at(-1)).toEqual([undefined, undefined, undefined]);
    expect(Array.from(_clusterStrengthCalls.at(-1)!)).toEqual([0, 0, 0]);
  });

  it("GPU-6: setClustering SEEDS at anchors, groups, full-pull, and PINS in one call", async () => {
    const handle = await setupGpuHandle(3);
    _clusterCalls = [];
    _clusterPosCalls = [];
    _clusterStrengthCalls = [];
    _setPointPositionsCalls = [];
    _startCalls = [];
    handle.setClustering(new Int32Array([0, 1, 0]), new Float32Array([10, 0, 20, 0]));
    // Grouped, full per-node pull, and PINNED at the supplied anchors.
    expect(_clusterCalls.at(-1)).toEqual([0, 1, 0]);
    expect(Array.from(_clusterStrengthCalls.at(-1)!)).toEqual([1, 1, 1]);
    expect(_clusterPosCalls.at(-1)).toEqual([10, 0, 20, 0]);
    // Nodes are re-seeded near their cluster anchor (stride-2 → length 6 for 3).
    expect(_setPointPositionsCalls.at(-1)!.xy.length).toBe(6);
    // node 0 → cluster 0 anchor (10,0) ± small jitter (< 12 each axis).
    expect(_setPointPositionsCalls.at(-1)!.xy[0]).toBeGreaterThan(10 - 12);
    expect(_setPointPositionsCalls.at(-1)!.xy[0]).toBeLessThan(10 + 12);
    expect(_startCalls.length).toBeGreaterThan(0);
  });

  it("GPU-6b: setClustering(null, null) clears membership + zeroes pull (scatter)", async () => {
    const handle = await setupGpuHandle(3, {
      clusterIds: new Int32Array([0, 1, 0]),
      clusterAnchors: new Float32Array([10, 0, 20, 0]),
    });
    _clusterCalls = [];
    _clusterStrengthCalls = [];
    handle.setClustering(null, null);
    expect(_clusterCalls.at(-1)).toEqual([undefined, undefined, undefined]);
    expect(Array.from(_clusterStrengthCalls.at(-1)!)).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// REND-cluster: deterministic packed-position cluster view (Task 10)
//
// When the shell supplies clusterPackedPositions, the top-level GraphCanvas eases
// node positions toward the packed target via the cluster transition layer with
// the GPU force sim PAUSED. This test mounts the TOP-LEVEL GraphCanvas (the
// sibling tests mount GraphCanvas2D directly) wrapped in <SliderProvider> — the
// same composition production uses — and proves both halves of the contract:
//   1. positions are pushed to cosmos (setPointPositions called), and
//   2. the GPU simulation is paused (graph.pause() called).
// GraphCanvas3D is mocked above to a pass-through so no GL context is needed.
// ---------------------------------------------------------------------------

describe("GraphCanvas — REND-cluster deterministic packed positions", () => {
  // Helper: mount GraphCanvas with packed positions at a given GPU mode, drive one
  // rAF, and return. Caller asserts on the shared _pauseCalls/_setPointPositionsCalls.
  async function mountPacked(
    gpuSimulation: boolean,
    reducedMotion = false,
  ): Promise<{ cleanup: () => void; packed: Float32Array }> {
    const { GraphCanvas } = await import("./GraphCanvas");
    const { SliderProvider } = await import("./SliderContext");
    const { render, act } = await import("@testing-library/react");
    const { createElement } = await import("react");

    let rafCallbacks: FrameRequestCallback[] = [];
    let rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      rafCallbacks = [];
    });
    vi.stubGlobal("matchMedia", () => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const drainRaf = (timestamp = 16): void => {
      const pending = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of pending) cb(timestamp);
    };

    const nodeCount = 3;
    const physics = makeFakePhysics({ nodeCount });
    const packed = new Float32Array(nodeCount * 3); // stride-3, z=0
    packed.set([10, 5, 0, -10, 5, 0, 0, -10, 0]);

    _pauseCalls = 0;
    _setPointPositionsCalls = [];

    await act(async () => {
      render(
        createElement(
          SliderProvider,
          { physics, catalog: [], children:
            createElement(GraphCanvas, {
              physics,
              nodeColors: new Float32Array(nodeCount * 4),
              mode: "2d",
              gpuSimulation,
              // A static layout target stands in for the old packed positions: the
              // renderer eases toward it with the GPU sim paused (same contract).
              layoutTarget: () => packed,
            }),
          },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      drainRaf();
      await Promise.resolve();
    });
    return { cleanup: () => vi.unstubAllGlobals(), packed };
  }

  // GPU-OFF fallback (e2e + WebGL-incapable machines): packed positions ARE the
  // source of truth and get uploaded (dontRescale=true upload from the cluster path).
  it("GPU-OFF: packed positions are pushed to cosmos (deterministic fallback)", async () => {
    const { cleanup } = await mountPacked(false);
    expect(_setPointPositionsCalls.some((c) => c.dontRescale === true)).toBe(true);
    cleanup();
  });

  // GPU-ON contract (the user's default): the deterministic packed layout is
  // authoritative for the labelled-cluster view — it GUARANTEES clean, non-
  // overlapping blobs (a force sim cannot). So packed positions PAUSE the GPU
  // force sim and are uploaded with dontRescale=true (keeps spaceToScreen correct
  // so ClusterLabels track the blobs).
  it("GPU-ON: packed positions pause the force sim (packed layout authoritative)", async () => {
    const { cleanup } = await mountPacked(true);
    expect(_pauseCalls).toBeGreaterThanOrEqual(1);
    expect(_setPointPositionsCalls.some((c) => c.dontRescale === true)).toBe(true);
    cleanup();
  });

  it("reduced motion pushes the settled target on the first frame", async () => {
    const { cleanup, packed } = await mountPacked(false, true);
    const pushed = _setPointPositionsCalls.find((call) => call.dontRescale)?.xy;
    expect(Array.from(pushed ?? [])).toEqual([
      packed[0], packed[1], packed[3], packed[4], packed[6], packed[7],
    ]);
    cleanup();
  });
});
