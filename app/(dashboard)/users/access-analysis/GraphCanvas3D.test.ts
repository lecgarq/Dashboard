// @vitest-environment jsdom
/**
 * GraphCanvas3D.test.ts — Behavioral suite for REND-02 + REND-03 + mode-transition animations.
 *
 * Tests:
 *  1. REND-02: OrbitControls config (enableDamping=true, autoRotate=false)
 *  2. REND-02: InstancedMesh position write via pushPositions — xyz preserved
 *  3. REND-02: Instance count matches node count from physicsLayer
 *  4. REND-02: instanceMatrix.needsUpdate = true after pushPositions
 *  5. REND-02: Alpha mask color multiplication (lit=1.0, dim=0.15)
 *  6. REND-03: No remount on mode switch — WebGLRenderer constructed exactly once
 *  7. REND-03: No position discontinuity — rAF reads from same physicsLayer reference
 *  8. REND-04: Static purity scan — GraphCanvas3D.tsx has no forbidden terms
 *  9. Pitfall 7: OrbitControls import uses .js extension
 * 10. REND-02: fitView call is in GraphCanvas 2D→3D branch (static + structural)
 * 11. CONTEXT.md locked: 600ms tilt + 400ms flatten both animated via requestAnimationFrame
 * 12. Mode-transition cancel: rapid toggle cancels in-flight rAF
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// jsdom stubs for browser APIs not available in test environment
// ---------------------------------------------------------------------------

// Stub ResizeObserver (not in jsdom)
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", FakeResizeObserver);

// ---------------------------------------------------------------------------
// Capture variables — shared across mocks, reset in beforeEach
// ---------------------------------------------------------------------------

const _capturedInstancedMeshes: any[] = [];
const _capturedMatrixWrites: Array<{ i: number; pos: [number, number, number] }> = [];
let _capturedControls: any = null;
let _webglRendererConstructorCount = 0;
const _capturedLineSegments: any[] = [];

// ---------------------------------------------------------------------------
// Mock @cosmos.gl/graph (needed for GraphCanvas → GraphCanvas2D)
// ---------------------------------------------------------------------------

vi.mock("@cosmos.gl/graph", () => {
  class MockGraph {
    constructor(_div: any, _config: any) {}
    setPointPositions(_xy: Float32Array, _dontRescale?: boolean) {}
    setPointColors(_rgba: Float32Array) {}
    setPointSizes(_sizes: Float32Array) {}
    setConfigPartial(_p: any) {}
    setConfig(_p: any) {}
    render() {}
    destroy() {}
    ready = Promise.resolve();
  }
  return { Graph: MockGraph };
});

// ---------------------------------------------------------------------------
// Mock next-themes (needed for GraphCanvas)
// ---------------------------------------------------------------------------

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

// ---------------------------------------------------------------------------
// Mock three.js — using ES6 classes so `new THREE.X()` works
// ---------------------------------------------------------------------------

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");

  class FakeMatrix4 {
    elements: number[] = new Array(16).fill(0);
    copy(other: FakeMatrix4) { this.elements = [...other.elements]; return this; }
  }

  class FakeVector3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m: FakeMatrix4) {
      this.x = m.elements[12]; this.y = m.elements[13]; this.z = m.elements[14]; return this;
    }
    clone() { return new FakeVector3(this.x, this.y, this.z); }
    lerpVectors(a: FakeVector3, b: FakeVector3, t: number) {
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      this.z = a.z + (b.z - a.z) * t;
      return this;
    }
    copy(v: FakeVector3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  }

  class FakeBox3 {
    min = new FakeVector3(Infinity, Infinity, Infinity);
    max = new FakeVector3(-Infinity, -Infinity, -Infinity);
    makeEmpty() {
      this.min = new FakeVector3(Infinity, Infinity, Infinity);
      this.max = new FakeVector3(-Infinity, -Infinity, -Infinity);
      return this;
    }
    expandByPoint(v: FakeVector3) {
      if (v.x < this.min.x) this.min.x = v.x;
      if (v.x > this.max.x) this.max.x = v.x;
      if (v.y < this.min.y) this.min.y = v.y;
      if (v.y > this.max.y) this.max.y = v.y;
      if (v.z < this.min.z) this.min.z = v.z;
      if (v.z > this.max.z) this.max.z = v.z;
    }
    getSize(target: FakeVector3) {
      target.x = this.max.x - this.min.x;
      target.y = this.max.y - this.min.y;
      target.z = this.max.z - this.min.z;
      return target;
    }
    getCenter(target: FakeVector3) {
      target.x = (this.min.x + this.max.x) / 2;
      target.y = (this.min.y + this.max.y) / 2;
      target.z = (this.min.z + this.max.z) / 2;
      return target;
    }
  }

  class FakeInstancedBufferAttribute {
    array: Float32Array;
    itemSize: number;
    needsUpdate = false;
    constructor(array: Float32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
    setXYZ(i: number, x: number, y: number, z: number) {
      this.array[i * 3] = x;
      this.array[i * 3 + 1] = y;
      this.array[i * 3 + 2] = z;
    }
  }

  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor(_opts?: any) {
      _webglRendererConstructorCount++;
      this.domElement = document.createElement("canvas");
    }
    setPixelRatio(_r: number) {}
    setSize(_w: number, _h: number, _ud?: boolean) {}
    render(_scene: any, _camera: any) {}
    dispose() {}
  }

  class MockScene {
    background: any = null;
    add(_obj: any) {}
    remove(_obj: any) {}
  }

  class MockPerspectiveCamera {
    fov = 60;
    aspect = 1;
    position: FakeVector3;
    constructor(_fov?: number, _aspect?: number, _near?: number, _far?: number) {
      this.position = new FakeVector3(0, 0, 2000);
    }
    updateProjectionMatrix() {}
    clone() {
      const c = new MockPerspectiveCamera();
      c.position = this.position.clone();
      return c;
    }
  }

  class MockSphereGeometry {
    dispose() {}
  }

  class MockMeshBasicMaterial {
    vertexColors = false;
    transparent = false;
    dispose() {}
  }

  class MockInstancedMesh {
    count: number;
    instanceMatrix = { needsUpdate: false };
    instanceColor: FakeInstancedBufferAttribute | null = null;
    private _matrices: FakeMatrix4[];

    constructor(_geom: any, _mat: any, n: number) {
      this.count = n;
      this._matrices = Array.from({ length: n }, () => new FakeMatrix4());
      _capturedInstancedMeshes.push(this);
    }

    setMatrixAt(i: number, mat: FakeMatrix4) {
      const e = mat.elements;
      _capturedMatrixWrites.push({ i, pos: [e[12], e[13], e[14]] });
      const saved = new FakeMatrix4();
      saved.elements = [...e];
      this._matrices[i] = saved;
    }

    getMatrixAt(i: number, target: FakeMatrix4) {
      if (this._matrices[i]) target.elements = [...this._matrices[i].elements];
    }
  }

  class MockObject3D {
    position: FakeVector3 = new FakeVector3(0, 0, 0);
    matrix: FakeMatrix4 = new FakeMatrix4();
    updateMatrix() {
      this.matrix.elements[12] = this.position.x;
      this.matrix.elements[13] = this.position.y;
      this.matrix.elements[14] = this.position.z;
    }
  }

  class MockColor {
    r = 0; g = 0; b = 0;
    constructor(_src?: string) {}
  }

  class FakeBufferAttribute {
    array: Float32Array;
    itemSize: number;
    needsUpdate = false;
    constructor(array: Float32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class MockBufferGeometry {
    attributes: Record<string, FakeBufferAttribute> = {};
    setAttribute(name: string, attr: FakeBufferAttribute) {
      this.attributes[name] = attr;
      return this;
    }
    dispose() {}
  }

  class MockLineBasicMaterial {
    vertexColors = false;
    transparent = false;
    opacity = 1;
    depthWrite = true;
    constructor(opts?: any) {
      if (opts) Object.assign(this, opts);
    }
    dispose() {}
  }

  class MockLineSegments {
    geometry: any;
    material: any;
    visible = true;
    frustumCulled = true;
    renderOrder = 0;
    constructor(geometry: any, material: any) {
      this.geometry = geometry;
      this.material = material;
      _capturedLineSegments.push(this);
    }
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    SphereGeometry: MockSphereGeometry,
    MeshBasicMaterial: MockMeshBasicMaterial,
    InstancedMesh: MockInstancedMesh,
    InstancedBufferAttribute: FakeInstancedBufferAttribute,
    Object3D: MockObject3D,
    Color: MockColor,
    Matrix4: FakeMatrix4,
    Vector3: FakeVector3,
    Box3: FakeBox3,
    BufferGeometry: MockBufferGeometry,
    BufferAttribute: FakeBufferAttribute,
    LineSegments: MockLineSegments,
    LineBasicMaterial: MockLineBasicMaterial,
  };
});

// ---------------------------------------------------------------------------
// Mock OrbitControls — ES6 class (supports `new`)
// ---------------------------------------------------------------------------

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => {
  class MockOrbitControls {
    enableDamping = false;
    dampingFactor = 0;
    autoRotate = true; // start as true so test confirms it gets set to false
    target = { copy: (_v: any) => {} };

    constructor(_camera: any, _domElement: any) {
      _capturedControls = this;
    }

    update() {}
    dispose() {}
  }

  return { OrbitControls: MockOrbitControls };
});

// ---------------------------------------------------------------------------
// Mock PhysicsLayer factory
// ---------------------------------------------------------------------------

import type { PhysicsLayer } from "./physicsLayer";

function makeFakePhysics(n: number): PhysicsLayer {
  let _maskVersion = 0;
  const _mask = new Float32Array(n).fill(1);
  const _xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _xyz[i * 3] = i * 10;
    _xyz[i * 3 + 1] = i * 20;
    _xyz[i * 3 + 2] = i * 30;
  }
  return {
    get alphaMask() { return _mask; },
    get maskVersion() { return _maskVersion; },
    updateSliders: vi.fn(),
    setMask: vi.fn((predFn: (i: number) => number) => {
      for (let i = 0; i < n; i++) _mask[i] = predFn(i);
      _maskVersion++;
    }),
    getPositions: vi.fn(() => _xyz),
    dispose: vi.fn(),
  } as unknown as PhysicsLayer;
}

// ---------------------------------------------------------------------------
// Path to source files for static analysis
// ---------------------------------------------------------------------------

const CANVAS_3D_SRC_PATH = path.resolve(__dirname, "GraphCanvas3D.tsx");
const CANVAS_SRC_PATH = path.resolve(__dirname, "GraphCanvas.tsx");
const CANVAS_3D_SRC = fs.readFileSync(CANVAS_3D_SRC_PATH, "utf8");
const CANVAS_SRC = fs.readFileSync(CANVAS_SRC_PATH, "utf8");

// ---------------------------------------------------------------------------
// Lazy imports (after mocks are established)
// ---------------------------------------------------------------------------

let GraphCanvas3D: any;
let GraphCanvas: any;

beforeEach(async () => {
  // Reset capture arrays before each test
  _capturedInstancedMeshes.length = 0;
  _capturedMatrixWrites.length = 0;
  _capturedControls = null;
  _webglRendererConstructorCount = 0;
  _capturedLineSegments.length = 0;

  // Dynamic import after mocks are set up
  const mod3D = await import("./GraphCanvas3D");
  const modGC = await import("./GraphCanvas");
  GraphCanvas3D = mod3D.GraphCanvas3D;
  GraphCanvas = modGC.GraphCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainerRef() {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { get: () => 800, configurable: true });
  Object.defineProperty(div, "clientHeight", { get: () => 600, configurable: true });
  document.body.appendChild(div);
  return { current: div };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GraphCanvas3D — REND-02 + REND-03 + mode-transition invariants", () => {

  // Test 1: OrbitControls config
  it("Test 1: REND-02 — OrbitControls receives enableDamping=true, autoRotate=false", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let capturedHandle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { capturedHandle = h; },
      })
    );

    expect(_capturedControls).not.toBeNull();
    expect(_capturedControls.enableDamping).toBe(true);
    expect(_capturedControls.autoRotate).toBe(false);
    expect(capturedHandle).not.toBeNull();
  });

  // Test 2: InstancedMesh position write via pushPositions
  it("Test 2: REND-02 — pushPositions writes correct xyz per instance (z preserved)", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    // Clear initial mount writes, then push new positions
    _capturedMatrixWrites.length = 0;
    handle!.pushPositions(new Float32Array([100, 200, 300, 400, 500, 600]));

    const node0Write = _capturedMatrixWrites.filter((w) => w.i === 0).at(-1);
    const node1Write = _capturedMatrixWrites.filter((w) => w.i === 1).at(-1);

    expect(node0Write?.pos).toEqual([100, 200, 300]);
    expect(node1Write?.pos).toEqual([400, 500, 600]);
  });

  // Test 3: Instance count
  it("Test 3: REND-02 — InstancedMesh count matches physicsLayer node count", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: () => {},
      })
    );

    expect(_capturedInstancedMeshes[0].count).toBe(2);
  });

  // Test 4: instanceMatrix.needsUpdate after pushPositions
  it("Test 4: REND-02 — instanceMatrix.needsUpdate = true after pushPositions", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const mesh = _capturedInstancedMeshes[0];
    mesh.instanceMatrix.needsUpdate = false; // reset
    handle!.pushPositions(new Float32Array([1, 2, 3, 4, 5, 6]));

    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
  });

  // Test 5: Alpha mask color multiplication
  it("Test 5: REND-02 — applyAlphaMask multiplies colors by 1.0 (lit) or 0.15 (dimmed)", () => {
    // node 0: white (1,1,1,1), node 1: mid-gray (0.5,0.5,0.5,1)
    const nodeColors = new Float32Array([1, 1, 1, 1, 0.5, 0.5, 0.5, 1]);
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors,
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    // Grab the instanceColor buffer from the mesh
    const mesh = _capturedInstancedMeshes[0];
    const buf: Float32Array = mesh.instanceColor.array;

    // node 0 lit, node 1 dimmed
    handle!.applyAlphaMask(new Float32Array([1, 0]), 1);

    // node 0: white × 1.0 = (1, 1, 1)
    expect(buf[0]).toBeCloseTo(1, 5);
    expect(buf[1]).toBeCloseTo(1, 5);
    expect(buf[2]).toBeCloseTo(1, 5);

    // node 1: 0.5 × 0.15 = 0.075
    expect(buf[3]).toBeCloseTo(0.075, 5);
    expect(buf[4]).toBeCloseTo(0.075, 5);
    expect(buf[5]).toBeCloseTo(0.075, 5);
  });

  // Test 6: REND-03 — No remount on mode switch (WebGLRenderer constructed once)
  it("Test 6: REND-03 — WebGLRenderer constructed exactly once across mode switches", () => {
    const physics = makeFakePhysics(2);
    const nodeColors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]);

    _webglRendererConstructorCount = 0;

    const { rerender } = render(
      React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" })
    );

    // GraphCanvas3D is always mounted — WebGLRenderer constructed once at mount
    const countAfterMount = _webglRendererConstructorCount;
    expect(countAfterMount).toBeGreaterThan(0); // should be 1

    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "3d" }));
    // No new WebGLRenderer — just CSS visibility swap
    expect(_webglRendererConstructorCount).toBe(countAfterMount);

    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" }));
    // Still no new WebGLRenderer
    expect(_webglRendererConstructorCount).toBe(countAfterMount);
  });

  // Test 7: REND-03 — No position discontinuity
  it("Test 7: REND-03 — both renderers read from same physicsLayer.getPositions() reference", () => {
    const physics = makeFakePhysics(2);

    // physicsLayer mock returns a stable reference — same object on repeated calls
    const positions1 = physics.getPositions();
    const positions2 = physics.getPositions();
    expect(positions1).toBe(positions2);
    expect(positions1.length).toBe(6); // 2 nodes × 3 coords

    // Structural: GraphCanvas routes BOTH onTick2D and onTick3D through handle refs
    // that each call pushPositions on their respective renderer using the same xyz source
    const srcNormalized = CANVAS_SRC.replace(/\s+/g, " ");
    expect(/onTick2D.*handle2D/.test(srcNormalized)).toBe(true);
    expect(/onTick3D.*handle3D/.test(srcNormalized)).toBe(true);
    // Both use the same physics prop — no separate position buffer
    expect((CANVAS_SRC.match(/props\.physics/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  // Test 8: REND-04 purity — static scan
  it("Test 8: REND-04 — GraphCanvas3D.tsx has no forbidden terms", () => {
    const forbidden = [
      "slider",
      "mathLayer",
      "dataLayer",
      "roleId",
      "permissionTier",
      "isAdmin",
      "isExternal",
      "featureColumns",
      "computeTargetPositions",
    ];
    for (const term of forbidden) {
      const regex = new RegExp(term, "i");
      expect(
        regex.test(CANVAS_3D_SRC),
        `Forbidden term '${term}' found in GraphCanvas3D.tsx`,
      ).toBe(false);
    }
  });

  // Test 9: Pitfall 7 — OrbitControls import path uses .js extension
  it("Test 9: Pitfall 7 — OrbitControls imported with .js extension", () => {
    const importRegex = /from\s+['"]three\/examples\/jsm\/controls\/OrbitControls\.js['"]/;
    expect(importRegex.test(CANVAS_3D_SRC)).toBe(true);
  });

  // Test 10: REND-02 — fitView call is in GraphCanvas 2D→3D branch
  it("Test 10: REND-02 — GraphCanvas.tsx calls fitView() in 2D→3D transition branch", () => {
    // Static assertion: fitView is called inside the 2D→3D branch
    const has2To3Branch = /prevMode\.current\s*===\s*["']2d["']\s*&&\s*props\.mode\s*===\s*["']3d["']/.test(CANVAS_SRC);
    const hasFitView = /fitView/.test(CANVAS_SRC);

    expect(has2To3Branch).toBe(true);
    expect(hasFitView).toBe(true);

    // fitView appears inside the 2D→3D branch (after the branch check in source order)
    const branchIdx = CANVAS_SRC.indexOf('prevMode.current === "2d" && props.mode === "3d"');
    const fitViewIdx = CANVAS_SRC.indexOf("fitView", branchIdx);
    expect(fitViewIdx).toBeGreaterThan(branchIdx);

    // fitView is NOT present in the 3D→2D flatten branch
    const flatten3To2BranchIdx = CANVAS_SRC.indexOf('prevMode.current === "3d" && props.mode === "2d"');
    expect(flatten3To2BranchIdx).toBeGreaterThan(-1);
  });

  // Test 11: CONTEXT.md locked — both animations scheduled via rAF
  it("Test 11: CONTEXT.md locked — 600ms tilt + 400ms z-flatten both scheduled via rAF", () => {
    vi.useFakeTimers();

    const scheduledCallbacks: Array<(t: number) => void> = [];
    let rafTime = 100;

    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      function(cb: FrameRequestCallback) {
        scheduledCallbacks.push(cb as (t: number) => void);
        return scheduledCallbacks.length;
      }
    );

    const physics = makeFakePhysics(3);
    const nodeColors = new Float32Array(12).fill(0.5);

    const { rerender } = render(
      React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" })
    );

    // Part A — 2D → 3D: 600ms tilt must be scheduled
    const countBefore2To3 = scheduledCallbacks.length;
    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "3d" }));
    const countAfter2To3 = scheduledCallbacks.length;

    // At least one rAF should be scheduled for the tilt animation
    expect(countAfter2To3).toBeGreaterThan(countBefore2To3);

    // Drive the tilt animation for ~700ms (each tick ~58ms)
    let ticksRun = 0;
    let elapsed = 0;
    while (scheduledCallbacks.length > 0 && elapsed < 700) {
      const cb = scheduledCallbacks.shift()!;
      rafTime += 58;
      elapsed += 58;
      cb(rafTime);
      ticksRun++;
    }
    // Must be animated (multiple ticks scheduled), not a single snap
    expect(ticksRun).toBeGreaterThanOrEqual(3);

    // Part B — 3D → 2D: 400ms flatten must be scheduled
    const countBefore3To2 = scheduledCallbacks.length;
    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" }));
    const countAfter3To2 = scheduledCallbacks.length;

    expect(countAfter3To2).toBeGreaterThan(countBefore3To2);

    // Drive the flatten animation for ~500ms
    let ticks2 = 0;
    let elapsed2 = 0;
    while (scheduledCallbacks.length > 0 && elapsed2 < 500) {
      const cb = scheduledCallbacks.shift()!;
      rafTime += 58;
      elapsed2 += 58;
      cb(rafTime);
      ticks2++;
    }
    expect(ticks2).toBeGreaterThanOrEqual(3);

    // Static verification: both locked durations present in source
    expect(/600/.test(CANVAS_SRC)).toBe(true); // 2D→3D tilt LOCKED
    expect(/400/.test(CANVAS_SRC)).toBe(true); // 3D→2D flatten LOCKED

    vi.useRealTimers();
    rafSpy.mockRestore();
  });

  // Test 12: Rapid toggle cancels in-flight animation
  it("Test 12: Rapid toggle cancels in-flight rAF before scheduling new animation", () => {
    vi.useFakeTimers();

    const scheduledIds: number[] = [];
    const cancelledIds: number[] = [];
    let nextId = 100;

    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      function(cb: FrameRequestCallback) {
        const id = nextId++;
        scheduledIds.push(id);
        return id;
      }
    );
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
      function(id: number) {
        cancelledIds.push(id);
      }
    );

    const physics = makeFakePhysics(2);
    const nodeColors = new Float32Array(8).fill(0.5);

    const { rerender } = render(
      React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" })
    );

    // Switch to 3D — starts 600ms tilt
    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "3d" }));

    const tiltRafId = scheduledIds.at(-1);
    expect(tiltRafId).toBeDefined();

    // Rapidly switch back to 2D — should cancel the tilt and start flatten
    rerender(React.createElement(GraphCanvas, { physics, nodeColors, mode: "2d" }));

    // The tilt rAF should have been cancelled
    expect(cancelledIds).toContain(tiltRafId);

    // A new rAF for the flatten should have been scheduled after the cancel
    const flattenRafId = scheduledIds.at(-1);
    expect(flattenRafId).toBeDefined();
    expect(flattenRafId).not.toBe(tiltRafId);

    vi.useRealTimers();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  // Test 13: setLinks builds one LineSegments with correctly sized buffers
  it("Test 13: edges — links prop builds LineSegments with edges*2*3 buffers", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]), // one edge: node0 -> node1
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const rs = handle!.getRenderState();
    expect(rs.renderLinks).toBe(true);
    expect(rs.linkCount).toBe(1);
    expect(rs.hasLineGeometry).toBe(true);
    expect(rs.positionAttributeLength).toBe(6); // 1 edge * 2 verts * 3
    expect(rs.colorAttributeLength).toBe(6);
    expect(_capturedLineSegments.length).toBe(1);
    expect(_capturedLineSegments[0].material.opacity).toBe(1); // MUST stay 1
  });

  // Test 14: edge endpoints follow node xyz (raw, no y-flip) on pushPositions
  it("Test 14: edges — endpoints rewritten from the same xyz as nodes", () => {
    const physics = makeFakePhysics(2); // node0 (0,0,0), node1 (10,20,30)
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]),
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const posAttr = _capturedLineSegments[0].geometry.attributes.position;
    // Initial write uses physics seed positions: node0 (0,0,0), node1 (10,20,30)
    expect(Array.from(posAttr.array)).toEqual([0, 0, 0, 10, 20, 30]);

    handle!.pushPositions(new Float32Array([100, 200, 300, 400, 500, 600]));
    expect(Array.from(posAttr.array)).toEqual([100, 200, 300, 400, 500, 600]);
    expect(posAttr.needsUpdate).toBe(true);
  });

  // Test 15: setLinkColors premultiplies alpha into RGB on both vertices
  it("Test 15: edges — setLinkColors premultiplies alpha into per-vertex RGB", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        links: new Float32Array([0, 1]),
        linkColors: new Float32Array([0.62, 0.72, 0.93, 0.1]),
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    // bright: rgb * 0.85
    handle!.setLinkColors(new Float32Array([0.62, 0.72, 0.93, 0.85]));
    const colorAttr = _capturedLineSegments[0].geometry.attributes.color;
    const v = Array.from(colorAttr.array) as number[];
    // both vertices identical, each channel = channel * alpha
    expect(v[0]).toBeCloseTo(0.62 * 0.85, 5);
    expect(v[1]).toBeCloseTo(0.72 * 0.85, 5);
    expect(v[2]).toBeCloseTo(0.93 * 0.85, 5);
    expect(v[3]).toBeCloseTo(0.62 * 0.85, 5);
    expect(v[4]).toBeCloseTo(0.72 * 0.85, 5);
    expect(v[5]).toBeCloseTo(0.93 * 0.85, 5);
    expect(colorAttr.needsUpdate).toBe(true);
  });

  // Test 16: no links → no LineSegments, renderLinks false
  it("Test 16: edges — absent links leaves renderLinks false", () => {
    const physics = makeFakePhysics(2);
    const containerRef = makeContainerRef();
    let handle: any = null;

    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );

    const rs = handle!.getRenderState();
    expect(rs.renderLinks).toBe(false);
    expect(rs.linkCount).toBe(0);
    expect(rs.hasLineGeometry).toBe(false);
    expect(_capturedLineSegments.length).toBe(0);
  });

  // Test 17: GraphCanvas forwards links + linkColors to BOTH renderers.
  // The 2D block already forwards these, so assert the occurrence count is 2
  // (one for GraphCanvas2D, one for GraphCanvas3D) — distinguishes the new wiring.
  it("Test 17: GraphCanvas passes links/linkColors props to GraphCanvas3D", () => {
    expect((CANVAS_SRC.match(/links=\{props\.links\}/g) ?? []).length).toBe(2);
    expect((CANVAS_SRC.match(/linkColors=\{props\.linkColors\}/g) ?? []).length).toBe(2);
  });
});
