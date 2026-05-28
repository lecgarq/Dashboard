/**
 * physicsLayer.test.ts
 *
 * Behavioral test suite for physicsLayer.ts covering PHYS-01..05 + cache-hit + no-reheat.
 * Runs in Vitest node environment (no jsdom, no real DuckDB Worker).
 *
 * Strategy: Partial vi.mock of "d3-force-3d" that wraps real exports and captures
 * the simulation + manyBody references for test inspection. This avoids touching
 * production code (no _unsafe_internals needed).
 *
 * Pitfall 6 mitigated: All synchronous control uses simulation.tick(N) — no rAF, no awaits
 * on d3 timer callbacks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- DuckDB mocks (hoisted via vi.hoisted so they are available inside vi.mock factories) ----

const { mockSavePositions, mockLoadCachedPositions, mockHashNodeSetAndSliders } = vi.hoisted(() => ({
  mockSavePositions: vi.fn(async () => undefined),
  mockLoadCachedPositions: vi.fn(async () => null as Float32Array | null),
  mockHashNodeSetAndSliders: vi.fn(() => "test-key"),
}));

vi.mock("./duckdbClient", () => ({
  getDuckDbClient: vi.fn(async () => ({ connection: {} as any, db: {} as any })),
}));

vi.mock("./positionsCache", () => ({
  savePositions: mockSavePositions,
  loadCachedPositions: mockLoadCachedPositions,
  hashNodeSetAndSliders: mockHashNodeSetAndSliders,
}));

// ---- Partial mock of d3-force-3d: wraps real exports, captures sim + manyBody ----
// We intercept forceSimulation and forceManyBody so tests can get references to the
// internal objects without modifying production code.

let _capturedSim: any = null;
let _capturedManyBody: any = null;
let _registeredForceNames: string[] = [];

vi.mock("d3-force-3d", async (importOriginal) => {
  const real = await importOriginal<typeof import("d3-force-3d")>();

  return {
    ...real,
    forceSimulation: (...args: any[]) => {
      const sim = (real.forceSimulation as any)(...args);
      // Wrap sim.force() to record registered force names.
      // IMPORTANT: d3 uses argument count (not undefined check) to distinguish get vs set.
      // Calling origForce(name, undefined) would be a SET (remove), not a GET.
      // We must pass exactly 1 argument for GET and exactly 2 for SET.
      const origForce = sim.force.bind(sim);
      sim.force = function (name: string, f?: any) {
        if (arguments.length >= 2) {
          // SET path
          if (name && f !== undefined && !_registeredForceNames.includes(name)) {
            _registeredForceNames.push(name);
          }
          return origForce(name, f);
        } else {
          // GET path — pass exactly 1 argument
          return origForce(name);
        }
      };
      _capturedSim = sim;
      return sim;
    },
    forceManyBody: (...args: any[]) => {
      const mb = (real.forceManyBody as any)(...args);
      _capturedManyBody = mb;
      return mb;
    },
  };
});

// ---- Import subject under test AFTER mocks are registered -------------------

import { createPhysicsLayer, type SimNode, type TargetArrays } from "./physicsLayer";

// ---- Fixture helper ---------------------------------------------------------

function makeFixture(n = 4) {
  const dimNames = ["dim-activity", "dim-recency"];
  const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`);
  const nodes: SimNode[] = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, index: i }));
  const targets: TargetArrays = {
    "dim-activity": {
      x: new Float32Array(n).fill(100),
      y: new Float32Array(n).fill(0),
      z: new Float32Array(n).fill(0),
    },
    "dim-recency": {
      x: new Float32Array(n).fill(0),
      y: new Float32Array(n).fill(100),
      z: new Float32Array(n).fill(0),
    },
  };
  const initialSliders = { "dim-activity": 0, "dim-recency": 0 };
  return { nodeIds, nodes, targets, dimNames, initialSliders };
}

/** Flush microtask queue (used after manually dispatching "end" event). */
function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ---- beforeEach: reset all captures -----------------------------------------

beforeEach(() => {
  _capturedSim = null;
  _capturedManyBody = null;
  _registeredForceNames = [];
  // Use mockClear (clears call history only) then re-establish default implementations.
  // mockReset would clear implementations too, causing mockSavePositions to return undefined (not a Promise).
  mockSavePositions.mockClear();
  mockSavePositions.mockResolvedValue(undefined); // restore: async () => undefined
  mockLoadCachedPositions.mockClear();
  mockLoadCachedPositions.mockResolvedValue(null); // default: cache miss
  mockHashNodeSetAndSliders.mockClear();
  mockHashNodeSetAndSliders.mockReturnValue("test-key");
});

// =============================================================================
// PHYS-01: Named forces registered
// =============================================================================

describe("PHYS-01: Named per-dimension forces registered", () => {
  it("registers forceX/Y/Z triplet for each dim + repulsion, all with initial strength 0", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);

    const sim = _capturedSim;
    expect(sim, "simulation was captured").not.toBeNull();

    // PHYS-01: All per-dim forces must be registered
    const expectedForces = [
      "dim-activity-x", "dim-activity-y", "dim-activity-z",
      "dim-recency-x",  "dim-recency-y",  "dim-recency-z",
      "repulsion",
    ];
    for (const name of expectedForces) {
      const f = sim.force(name);
      expect(f, `force "${name}" must be registered`).not.toBeNull();
      expect(f, `force "${name}" must be registered`).toBeDefined();
    }

    // PHYS-01: Per-dim forces must have initial strength = 0
    // In d3-force-3d, force.strength() returns the constant() accessor; call it again to get the number.
    const perDimForces = expectedForces.filter((n) => n !== "repulsion");
    for (const name of perDimForces) {
      const f = sim.force(name);
      expect(f.strength()(), `force "${name}" initial strength must be 0`).toBe(0);
    }
  });

  it("registers forces for each dim ID as passed in dimNames", async () => {
    const n = 3;
    const dimNames = ["dim-alpha", "dim-beta", "dim-gamma"];
    const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`);
    const nodes: SimNode[] = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, index: i }));
    const targets: TargetArrays = Object.fromEntries(
      dimNames.map((d) => [
        d,
        {
          x: new Float32Array(n).fill(50),
          y: new Float32Array(n).fill(50),
          z: new Float32Array(n).fill(0),
        },
      ]),
    );
    const initialSliders = Object.fromEntries(dimNames.map((d) => [d, 0]));

    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);

    const sim = _capturedSim;
    for (const d of dimNames) {
      expect(sim.force(`${d}-x`), `${d}-x missing`).toBeDefined();
      expect(sim.force(`${d}-y`), `${d}-y missing`).toBeDefined();
      expect(sim.force(`${d}-z`), `${d}-z missing`).toBeDefined();
    }
  });

  // A.1: assert that the manyBody config has the tuned values applied. These
  // are pure configuration calls; if a future refactor accidentally drops
  // either, the per-tick CPU regression would silently return. Plan
  // `docs/superpowers/plans/2026-05-26-p0-realtime-graph-motion-throughput.md`, §3.A.
  it("A.1: forceManyBody is configured with the tuned distanceMax and theta", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);

    expect(_capturedManyBody, "manyBody was captured").not.toBeNull();
    // d3-force-3d stores the squared values internally and returns the sqrt
    // from the getter (`manyBody.js:127, 131, 135`); compare to within float
    // tolerance.
    expect(_capturedManyBody.distanceMax(), "distanceMax cap").toBeCloseTo(200, 5);
    expect(_capturedManyBody.theta(), "Barnes-Hut theta").toBeCloseTo(1.5, 5);
  });
});

// =============================================================================
// PHYS-02: Slider change uses .alpha(target).restart()
// =============================================================================

describe("PHYS-02: updateSliders calls alpha(target).restart() — never bare restart()", () => {
  it("calls sim.alpha(positive ≤ 0.3) immediately before sim.restart()", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);

    const sim = _capturedSim;
    // Spy on alpha() and restart() calls — order matters
    const calls: string[] = [];
    let lastAlphaArg: number | undefined;
    const origAlpha = sim.alpha.bind(sim);
    sim.alpha = (v?: number) => {
      if (v !== undefined) {
        calls.push(`alpha(${v})`);
        lastAlphaArg = v;
        return origAlpha(v);
      }
      return origAlpha();
    };

    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      calls.push("restart");
      return origRestart();
    };

    // Manually stop to prevent actual simulation running during test
    sim.stop();

    // Create a fresh physics layer to test updateSliders in isolation
    const { nodeIds: nids2, nodes: n2, targets: t2, dimNames: d2 } = makeFixture(4);
    // Reset capture state so we get a new sim
    _capturedSim = null;
    _capturedManyBody = null;
    _registeredForceNames = [];
    const physics = await createPhysicsLayer(nids2, n2, t2, d2, { "dim-activity": 0, "dim-recency": 0 });
    const sim2 = _capturedSim;

    const calls2: string[] = [];
    let alphaArg2: number | undefined;
    const origAlpha2 = sim2.alpha.bind(sim2);
    sim2.alpha = (v?: number) => {
      if (v !== undefined) {
        calls2.push(`alpha(${v})`);
        alphaArg2 = v;
        return origAlpha2(v);
      }
      return origAlpha2();
    };
    const origRestart2 = sim2.restart.bind(sim2);
    sim2.restart = () => {
      calls2.push("restart");
      return origRestart2();
    };
    sim2.stop(); // prevent actual timer

    // PHYS-02: Call updateSliders
    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0 });

    // alpha(positive) must appear before restart in the call sequence
    const alphaIdx = calls2.findIndex((c) => c.startsWith("alpha("));
    const restartIdx = calls2.indexOf("restart");

    expect(alphaIdx, "sim.alpha() must be called").toBeGreaterThanOrEqual(0);
    expect(restartIdx, "sim.restart() must be called").toBeGreaterThanOrEqual(0);
    expect(alphaIdx, "alpha() must precede restart()").toBeLessThan(restartIdx);

    // The alpha value must be > 0 and <= 0.3
    expect(alphaArg2!, "reheat alpha must be > 0").toBeGreaterThan(0);
    expect(alphaArg2!, "reheat alpha must be <= 0.3").toBeLessThanOrEqual(0.3);
  });

  it("restart is NEVER called without a preceding alpha(positive) in the same updateSliders call", async () => {
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;
    sim.stop();

    let alphaSetPositive = false;
    let restartCalledWithoutAlpha = false;
    const origAlpha = sim.alpha.bind(sim);
    sim.alpha = (v?: number) => {
      if (v !== undefined) {
        if (v > 0) alphaSetPositive = true;
        else alphaSetPositive = false;
        return origAlpha(v);
      }
      return origAlpha();
    };
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      if (!alphaSetPositive) restartCalledWithoutAlpha = true;
      return origRestart();
    };

    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0.2 });

    expect(restartCalledWithoutAlpha, "restart must never be called without prior alpha(positive)").toBe(false);
  });
});

// =============================================================================
// PHYS-03: Slider sweep produces monotonic engine params
// =============================================================================

describe("PHYS-03: Slider sweep [0→1] produces monotonic alphaDecay and |manyBody.strength|", () => {
  it("alphaDecay is non-increasing and |manyBody.strength| is non-decreasing across sweep", async () => {
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;
    const mb = _capturedManyBody;
    sim.stop();

    const steps = [0, 0.25, 0.5, 0.75, 1.0];
    const decays: number[] = [];
    const repulsions: number[] = [];
    const reheats: number[] = [];

    // Track alpha() calls to capture reheat values
    const origAlpha = sim.alpha.bind(sim);
    let lastReheatAlpha: number = 0;
    sim.alpha = (v?: number) => {
      if (v !== undefined) {
        lastReheatAlpha = v;
        return origAlpha(v);
      }
      return origAlpha();
    };

    for (const v of steps) {
      physics.updateSliders({ "dim-activity": v, "dim-recency": 0 });
      decays.push(sim.alphaDecay());
      // d3-force-3d: mb.strength() returns the constant() accessor; call it again to get the number
      repulsions.push(Math.abs(mb.strength()()));
      reheats.push(lastReheatAlpha);
    }

    // PHYS-03: alphaDecay must be monotonically non-increasing
    for (let i = 1; i < decays.length; i++) {
      expect(
        decays[i],
        `alphaDecay[${i}]=${decays[i]} must be <= alphaDecay[${i - 1}]=${decays[i - 1]}`,
      ).toBeLessThanOrEqual(decays[i - 1] + 1e-10);
    }

    // PHYS-03: |manyBody.strength| must be monotonically non-decreasing
    for (let i = 1; i < repulsions.length; i++) {
      expect(
        repulsions[i],
        `|repulsion[${i}]|=${repulsions[i]} must be >= |repulsion[${i - 1}]|=${repulsions[i - 1]}`,
      ).toBeGreaterThanOrEqual(repulsions[i - 1] - 1e-10);
    }

    // PHYS-03: Reheat alpha = Math.min(v, 0.3) per step
    for (let i = 0; i < steps.length; i++) {
      const expected = Math.min(steps[i], 0.3);
      // Steps[0] = 0: updateSliders with all zeros triggers a skip (frozen=true, delta=0), so no alpha call
      // For v=0 after initial construction (frozen=false state), it WILL reheat with alpha(0).
      // Actually at v=0, no-reheat applies only if frozen && |delta| < SKIP_THRESHOLD.
      // Since sim is stopped (cache miss path fires restart then we stop), frozen=false.
      // So alpha(0) IS called for v=0 case.
      if (steps[i] > 0) {
        // For non-zero steps, verify capped at 0.3
        expect(reheats[i], `reheat[${i}] (v=${steps[i]}) must be min(v, 0.3)=${expected}`).toBeCloseTo(
          expected,
          10,
        );
      }
    }
  });
});

// =============================================================================
// PHYS-04: setMask does NOT increment tick counter (load-bearing invariant)
// =============================================================================

describe("PHYS-04: setMask does NOT trigger simulation ticks (load-bearing invariant)", () => {
  it("tick counter is unchanged after 10 setMask calls on a frozen (cache-hit) sim", async () => {
    const n = 4;
    // Cache HIT: sim will be stopped immediately after construction
    const cachedPositions = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
      11, 22, 33,
    ]);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    // Install tick counter AFTER construction (sim already stopped by cache hit)
    let tickCount = 0;
    const origOn = sim.on.bind(sim);
    // We register a tick listener directly on the d3 sim
    sim.on("tick.test-counter", () => {
      tickCount++;
    });

    const before = tickCount;

    // Call setMask 10 times
    for (let call = 0; call < 10; call++) {
      physics.setMask((i) => (i % 2 === 0 ? 1.0 : 0.3));
    }

    // PHYS-04: tick counter must not have changed
    expect(tickCount, "setMask must not trigger simulation ticks").toBe(before);

    // PHYS-04: maskVersion must be incremented once per call
    expect(physics.maskVersion, "maskVersion must be 10 after 10 setMask calls").toBe(10);

    // PHYS-04: alphaMask values must reflect last predicate application
    // Float32Array stores 32-bit floats so 0.3 becomes 0.30000001192092896 — use toBeCloseTo.
    expect(physics.alphaMask[0], "alphaMask[0] (even index) must be 1.0").toBeCloseTo(1.0, 5);
    expect(physics.alphaMask[1], "alphaMask[1] (odd index) must be 0.3").toBeCloseTo(0.3, 5);
  });

  it("setMask only mutates alphaMask, never references sim internals", async () => {
    // Additional structural assertion: alpha() should not change after setMask
    const cachedPositions = new Float32Array(4 * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    const alphaBefore = sim.alpha();
    physics.setMask((i) => 0.5);
    const alphaAfter = sim.alpha();

    expect(alphaAfter, "sim.alpha() must not change after setMask").toBe(alphaBefore);
  });
});

// =============================================================================
// PHYS-05: Freeze-on-rest writes positions and stops simulation
// =============================================================================

describe("PHYS-05: Freeze-on-rest — 'end' event triggers savePositions then sim.stop()", () => {
  it("savePositions called exactly once with Float32Array(n*3) after sim reaches alphaMin", async () => {
    const n = 4;
    // Cache MISS (default): sim will run
    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    // Drive the simulation to completion.
    // tick(300) manually advances alpha to near-zero (DECAY_ZERO=0.1, alpha converges in ~55 ticks).
    // The d3-timer internal step() fires "end" via setTimeout when it sees alpha < alphaMin.
    // We wait 10ms for the timer to fire, then flush microtasks for the async "end" handler.
    sim.tick(300);
    await new Promise((r) => setTimeout(r, 10));
    await flushMicrotasks();

    // PHYS-05: savePositions called exactly once
    expect(mockSavePositions, "savePositions must be called exactly once").toHaveBeenCalledTimes(1);

    // PHYS-05: savePositions called with a Float32Array of length n*3
    const callArgs = mockSavePositions.mock.calls[0] as unknown[];
    const passedXyz = callArgs[3] as Float32Array | undefined; // savePositions(connection, cacheKey, nodeIds, xyz)
    expect(passedXyz, "positions arg must be Float32Array").toBeInstanceOf(Float32Array);
    expect(passedXyz?.length, "positions must have length n*3").toBe(n * 3);
  });

  it("sim.stop() is called by the end handler (observable via spy on sim.stop)", async () => {
    const n = 4;
    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    // Spy on sim.stop() BEFORE driving to end
    let stopCallCount = 0;
    const origStop = sim.stop.bind(sim);
    sim.stop = () => {
      stopCallCount++;
      return origStop();
    };

    // Drive sim to alpha < alphaMin (cache-miss path already called alpha(0.3).restart()).
    // tick(300) manually advances alpha to near-zero; the d3 internal timer step fires "end"
    // asynchronously. We wait for it with sufficient microtask flushing.
    sim.tick(300);
    // Allow d3-timer to fire the "end" event via its internal step callback.
    // d3-timer uses setTimeout in node env; two rounds of setTimeout ensure it fires.
    await new Promise((r) => setTimeout(r, 10));

    // The "end" handler in physicsLayer.ts calls sim.stop() (synchronously after the async save).
    // Since the "end" handler is async, we must also wait for savePositions to resolve.
    await flushMicrotasks();

    // PHYS-05: sim.stop() must have been called at least once by the "end" handler
    expect(stopCallCount, "sim.stop() must be called by the end handler").toBeGreaterThan(0);
  });

  it("normalizes the settled spread to LAYOUT_HALF_EXTENT (≈350) before caching", async () => {
    // The e2e suite only smoke-checks finite/non-runaway coordinates (it does NOT
    // wait for freeze). The strong invariant — the "end" handler rescales the raw
    // ANCHOR_RADIUS-scale spread (~16000) down into a fixed cube — lives HERE,
    // deterministically. Seed two far-apart anchors (±16000) so the pre-freeze
    // spread far exceeds 350; after freeze the packed snapshot must have maxAbs≈350.
    const n = 6;
    const dimNames = ["dim-a"];
    const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`);
    const nodes: SimNode[] = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, index: i }));
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = i % 2 === 0 ? 16000 : -16000;
    const targets: TargetArrays = {
      "dim-a": { x, y: new Float32Array(n), z: new Float32Array(n) },
    };
    // slider=1 → forceX pulls nodes toward the ±16000 anchors (spread ≫ 350).
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, { "dim-a": 1 });
    const sim = _capturedSim;

    sim.tick(300);
    await new Promise((r) => setTimeout(r, 10));
    await flushMicrotasks();

    expect(mockSavePositions, "end handler must persist once").toHaveBeenCalledTimes(1);
    const xyz = (mockSavePositions.mock.calls[0] as unknown[])[3] as Float32Array;
    let maxAbs = 0;
    for (const v of xyz) maxAbs = Math.max(maxAbs, Math.abs(v));
    // normalizeNodePositions scales so the largest |coordinate| == halfExtent.
    expect(maxAbs, "settled spread normalized to LAYOUT_HALF_EXTENT").toBeCloseTo(350, 0);
    // And it must NOT remain at the raw anchor scale.
    expect(maxAbs, "raw ANCHOR_RADIUS spread was rescaled down").toBeLessThan(2000);
  });
});

// =============================================================================
// Cache-hit short-circuit
// =============================================================================

describe("Cache-hit: nodes pinned to cached positions, simulation never runs", () => {
  it("nodes have fx/fy/fz pinned to cached values after construction", async () => {
    const n = 4;
    const cachedPositions = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
      11, 22, 33,
    ]);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });

    // PHYS cache-hit: all nodes must be pinned (fx/fy/fz set to cached values)
    expect(nodes[0].fx, "node[0].fx pinned to 10").toBeCloseTo(10, 5);
    expect(nodes[0].fy, "node[0].fy pinned to 20").toBeCloseTo(20, 5);
    expect(nodes[0].fz, "node[0].fz pinned to 30").toBeCloseTo(30, 5);
    expect(nodes[1].fx, "node[1].fx pinned to 40").toBeCloseTo(40, 5);
    expect(nodes[1].fy, "node[1].fy pinned to 50").toBeCloseTo(50, 5);
    expect(nodes[1].fz, "node[1].fz pinned to 60").toBeCloseTo(60, 5);
  });

  it("pinned nodes do not move after sim.tick(10)", async () => {
    const n = 4;
    const cachedPositions = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
      11, 22, 33,
    ]);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    // Record positions before ticking
    const xBefore = nodes[0].x;
    const yBefore = nodes[0].y;
    const zBefore = nodes[0].z;

    // Tick manually — pinned nodes must not move
    sim.tick(10);

    expect(nodes[0].x, "x must not move when pinned").toBeCloseTo(xBefore!, 4);
    expect(nodes[0].y, "y must not move when pinned").toBeCloseTo(yBefore!, 4);
    expect(nodes[0].z, "z must not move when pinned").toBeCloseTo(zBefore!, 4);

    // savePositions must NOT have been called (cache hit skips simulation entirely)
    expect(mockSavePositions, "savePositions must not be called on cache hit").toHaveBeenCalledTimes(0);
  });

  // F.1: positionsVersion bumps on cache-hit restore so the 3D renderer paints
  // the cached layout (not the [-1,1] seed) on its next frame.
  it("positionsVersion is > 0 after cache-hit construction", async () => {
    const n = 4;
    const cachedPositions = new Float32Array([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 11, 22, 33,
    ]);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    expect(physics.positionsVersion, "cache-hit bumps positionsVersion").toBeGreaterThan(0);
  });
});

// =============================================================================
// F.1: positionsVersion increments on tick + cache-hit + post-settle normalize
// -----------------------------------------------------------------------------
// The 3D renderer reads physicsLayer.positionsVersion to gate its self-driving
// renderLoop (plan
// `docs/superpowers/plans/2026-05-26-p0-realtime-graph-motion-throughput.md`,
// F.1). The counter MUST bump every time node x/y/z actually changes, and
// MUST NOT bump from mask mutations (the two buses are independent).
// =============================================================================

describe("F.1: positionsVersion bus", () => {
  it("starts at 0 before any tick or cache restore (cache miss path)", async () => {
    // Cache miss → positions are random-seeded into d3 nodes but the seed write
    // is part of construction-time setup, not a position update — the counter
    // can stay at 0 until the first real tick fires. Either 0 or a small post-
    // construction value is acceptable; the load-bearing assertion is that the
    // counter is finite and non-negative.
    mockLoadCachedPositions.mockResolvedValueOnce(null);
    const { nodeIds, nodes, targets, dimNames } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    expect(Number.isFinite(physics.positionsVersion)).toBe(true);
    expect(physics.positionsVersion).toBeGreaterThanOrEqual(0);
  });

  it("increments as d3's internal timer fires ticks (+ post-settle normalize)", async () => {
    // d3-force's `sim.tick(n)` runs forces but does NOT dispatch "tick" events
    // (events fire only from the internal d3.timer). To observe the increment
    // we let the timer run by waiting a few ms after construction. The "end"
    // handler also bumps positionsVersion once (after normalize), so we just
    // assert "strictly increased" — the exact tick count is timer-driven and
    // non-deterministic in a test environment.
    mockLoadCachedPositions.mockResolvedValueOnce(null);
    const { nodeIds, nodes, targets, dimNames } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const before = physics.positionsVersion;
    // Let the internal timer fire some ticks. DECAY_ZERO is fast at slider=0
    // so this also runs the sim to settle and through the "end" handler.
    await new Promise((r) => setTimeout(r, 50));
    await flushMicrotasks();
    expect(
      physics.positionsVersion,
      "tick/end handlers must have bumped positionsVersion",
    ).toBeGreaterThan(before);
  });

  it("is independent of maskVersion (setMask does NOT bump positionsVersion)", async () => {
    mockLoadCachedPositions.mockResolvedValueOnce(
      new Float32Array(2 * 3).fill(0),
    );
    const { nodeIds, nodes, targets, dimNames } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const beforePos = physics.positionsVersion;
    const beforeMask = physics.maskVersion;
    physics.setMask(() => 0.5);
    physics.setMask(() => 1.0);
    expect(physics.maskVersion, "maskVersion bumps").toBe(beforeMask + 2);
    expect(
      physics.positionsVersion,
      "positionsVersion stays put — mask bus is independent",
    ).toBe(beforePos);
  });
});

// =============================================================================
// Slider micro-drag accumulator (Pattern A "freeze then jump")
// -----------------------------------------------------------------------------
// Symptom (reported by Luis 2026-05-25): on a slow continuous drag of a slider
// thumb, nodes stayed pinned and only jumped after release or after several
// large drags. Radix step=1 on the 0..100 slider → per-rAF-coalesced
// normalized delta = 0.01. Two fixes shipped together:
//
//   1. ACCUMULATOR (commit e9dcaed): measure cumulative delta against the
//      slider state at the LAST REHEAT, not the last call. Sub-threshold ticks
//      accumulate; once their sum crosses SKIP_THRESHOLD the sim reheats.
//   2. SKIP_THRESHOLD = 0.005 (tightened from 0.02): a single 0.01 keystroke
//      now crosses the gate immediately — no cold-start dead zone at the
//      start of a drag. Only sub-keystroke programmatic noise stays filtered.
//
// The accumulator is still load-bearing: programmatic input below 0.005
// (e.g. a slow algorithmic tween) still accumulates correctly across calls.
// =============================================================================

describe("Slider micro-drag accumulator: cumulative deltas reheat across calls", () => {
  it("a single 0.01 keystroke reheats immediately from frozen (no cold-start dead zone)", async () => {
    // Tightened SKIP_THRESHOLD = 0.005 means a Radix one-step nudge (0.01)
    // already crosses the gate. This is the explicit fix for the symptom
    // "I move the slider one notch and nothing happens."
    const n = 4;
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    let restartCount = 0;
    let lastAlphaArg = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCount++;
      return origRestart();
    };
    const origAlpha = sim.alpha.bind(sim);
    sim.alpha = (v?: number) => {
      if (v !== undefined) {
        lastAlphaArg = v;
        return origAlpha(v);
      }
      return origAlpha();
    };

    expect(nodes[0].fx, "cache-hit pin: fx set").not.toBeNull();
    expect(physics.frozen, "starts frozen on cache hit").toBe(true);

    // A single keystroke — must reheat in ONE call now.
    physics.updateSliders({ "dim-activity": 0.01, "dim-recency": 0 });
    expect(restartCount, "single 0.01 keystroke reheats in one call").toBe(1);
    expect(lastAlphaArg, "reheat raises alpha to ≥ ALPHA_REHEAT_FLOOR (0.15)").toBeGreaterThanOrEqual(
      0.15,
    );
    expect(nodes[0].fx, "reheat unpins fx").toBeNull();
    expect(physics.frozen, "reheat flips frozen → false").toBe(false);
  });

  it("accumulates sub-threshold programmatic deltas and reheats once cumulative ≥ SKIP_THRESHOLD", async () => {
    // Below the keystroke granularity. Proves the accumulator gate still
    // works against the anchor — three 0.002 steps against anchor=0 cumulate
    // 0.002 → 0.004 → 0.006 and reheat on the third (0.006 ≥ 0.005).
    const n = 4;
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCount++;
      return origRestart();
    };

    // Call 1: cumulative 0.002 < 0.005 → skip.
    physics.updateSliders({ "dim-activity": 0.002, "dim-recency": 0 });
    expect(restartCount, "call 1: cumulative 0.002 stays below threshold").toBe(0);

    // Call 2: cumulative 0.004 < 0.005 → still skip.
    physics.updateSliders({ "dim-activity": 0.004, "dim-recency": 0 });
    expect(restartCount, "call 2: cumulative 0.004 stays below threshold").toBe(0);

    // Call 3: cumulative 0.006 ≥ 0.005 → REHEAT (anchor was never advanced
    // because no prior call reheated).
    physics.updateSliders({ "dim-activity": 0.006, "dim-recency": 0 });
    expect(restartCount, "call 3: cumulative 0.006 crosses threshold → reheat").toBe(1);
    expect(physics.frozen, "reheat flips frozen → false").toBe(false);
  });

  it("a single large slider jump still reheats immediately (no regression)", async () => {
    // Regression guard for the fast-drag path. A single fat delta MUST cross
    // the gate in one call even with the new cumulative semantics, because
    // the cumulative is computed against the anchor — same as the per-call
    // delta when the anchor is the initial state.
    const n = 4;
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCount++;
      return origRestart();
    };

    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0 });
    expect(restartCount, "single 0.5 jump reheats in one call").toBeGreaterThan(0);
  });
});

// =============================================================================
// No-reheat optimization
// =============================================================================

describe("No-reheat optimization: skip alpha().restart() when frozen and cumulative delta < SKIP_THRESHOLD", () => {
  it("a one-off sub-threshold call against a fresh anchor stays skipped (no thrash)", async () => {
    // Cumulative semantics (accumulator fix): the gate measures delta against
    // _slidersAtLastReheat, not the per-call previous vector. With a fresh anchor
    // (anchor = 0) a single 0.01 nudge is below SKIP_THRESHOLD and must NOT
    // reheat — this is the still-valid scroll-wheel / accidental-nudge guard.
    //
    // The prior test asserted that TWO consecutive 0.01 nudges (cumulative 0.02)
    // also stay skipped. That assertion encoded the bug Luis reported (slow drags
    // never break out of freeze) and is now correctly covered by the
    // "Slider micro-drag accumulator" block above, which proves call 2 reheats.
    const n = 4;
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    let restartCallCount = 0;
    let alphaCallCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCallCount++;
      return origRestart();
    };
    const origAlpha = sim.alpha.bind(sim);
    sim.alpha = (v?: number) => {
      if (v !== undefined) {
        alphaCallCount++;
        return origAlpha(v);
      }
      return origAlpha();
    };

    // Single 0.001 sub-keystroke nudge from anchor=0 → cumulative 0.001
    // < SKIP_THRESHOLD (0.005) → skip. With the tightened threshold, the
    // anti-thrash test value drops below the 0.01 keystroke granularity:
    // a real Radix step (0.01) now reheats immediately and is covered by
    // the "single 0.01 keystroke reheats immediately" spec above.
    physics.updateSliders({ "dim-activity": 0.001, "dim-recency": 0 });
    expect(restartCallCount, "single 0.001 nudge stays below threshold → no reheat").toBe(0);
    expect(alphaCallCount, "no alpha(v) call when skipped").toBe(0);
  });

  it("updateSliders with delta > SKIP_THRESHOLD always reheats even when frozen", async () => {
    const n = 4;
    // Cache HIT: sim starts frozen
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    let restartCallCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCallCount++;
      return origRestart();
    };

    // delta = |0.5 - 0| = 0.5 >> SKIP_THRESHOLD → must reheat even when frozen
    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0 });
    expect(restartCallCount, "large delta must trigger restart even when frozen").toBeGreaterThan(0);
  });
});

// =============================================================================
// Defect A (P0): non-dominant slider move must reheat under a multi-slider preset
// Regression for the sticky-scalar-max bug: the old skip gate compared
// max(allSliders) before/after, so moving a NON-dominant slider (max unchanged)
// was silently skipped and nodes never moved.
// =============================================================================
describe("Defect A: reheat keys off per-dimension delta, not the scalar max", () => {
  it("reheats when a non-dominant slider changes even though max(allSliders) is unchanged", async () => {
    // Cache HIT → frozen from construction (mirrors a reloaded organic view).
    const cachedPositions = new Float32Array(4 * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    // recency is the DOMINANT slider (0.8); activity is non-dominant (0).
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0.8,
    });
    const sim = _capturedSim;

    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCount++;
      return origRestart();
    };

    // Move ONLY the non-dominant slider. max(allSliders) stays 0.8 (recency dominates),
    // so the OLD scalar-max gate skipped this and the graph never moved.
    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0.8 });

    expect(restartCount, "non-dominant slider change must reheat the sim").toBeGreaterThan(0);
  });

  it("still skips a sub-threshold nudge of any single slider when frozen", async () => {
    const cachedPositions = new Float32Array(4 * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0.8,
    });
    const sim = _capturedSim;
    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => {
      restartCount++;
      return origRestart();
    };
    physics.updateSliders({ "dim-activity": 0.001, "dim-recency": 0.8 }); // delta 0.001 < 0.005
    expect(restartCount, "sub-threshold nudge stays skipped (no thrash)").toBe(0);
  });
});

// =============================================================================
// P1.1: Initial sliders applied at construction (organic default layout)
// The very first settle must use the profile forces so the default loaded state
// is volumetric/clustered, not a repulsion globe the user must "fix" with sliders.
// =============================================================================

describe("P1.1: initial sliders applied at construction", () => {
  const STRENGTH_AT_ONE = 0.1;

  it("sets per-dim force strengths from non-zero initialSliders before any updateSliders", async () => {
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0.5,
      "dim-recency": 0.25,
    });
    const sim = _capturedSim;
    sim.stop();

    expect(sim.force("dim-activity-x").strength()()).toBeCloseTo(0.5 * STRENGTH_AT_ONE, 6);
    expect(sim.force("dim-activity-y").strength()()).toBeCloseTo(0.5 * STRENGTH_AT_ONE, 6);
    expect(sim.force("dim-recency-z").strength()()).toBeCloseTo(0.25 * STRENGTH_AT_ONE, 6);
  });

  it("sets alphaDecay from max(initialSliders) so the first settle runs long enough to form structure", async () => {
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0.5,
      "dim-recency": 0.25,
    });
    const sim = _capturedSim;
    sim.stop();
    // lerp(DECAY_ZERO=0.1, DECAY_ONE=0.02, max=0.5) = 0.06
    expect(sim.alphaDecay()).toBeCloseTo(0.06, 6);
  });

  it("preserves the globe fallback when initialSliders are all 0 (strengths 0, fast decay)", async () => {
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;
    sim.stop();
    expect(sim.force("dim-activity-x").strength()()).toBe(0);
    expect(sim.alphaDecay()).toBeCloseTo(0.1, 6);
  });
});

// =============================================================================
// P3.4: Per-node dimension weights (two-bus safe)
// =============================================================================

/**
 * Helper: reads the per-node strength for a given dimension at a given node index.
 * Uses __debugStrength which calls the live strength function (test-only diagnostics).
 * The strength function signature is (_d, i) — only index matters, so we pass null
 * as the node datum safely.
 */
function roleStrengthAt(layer: Awaited<ReturnType<typeof createPhysicsLayer>>, nodeIndex: number): number {
  return (layer as unknown as { __debugStrength(dimId: string, i: number): number }).__debugStrength("role", nodeIndex);
}

function moduleStrengthAt(layer: Awaited<ReturnType<typeof createPhysicsLayer>>, nodeIndex: number): number {
  return (layer as unknown as { __debugStrength(dimId: string, i: number): number }).__debugStrength("module", nodeIndex);
}

describe("physicsLayer — per-node dimension weights", () => {
  function setup(weight1: number) {
    const nodeIds = ["a", "b"];
    const nodes: SimNode[] = nodeIds.map((id, index) => ({ id, index }));
    const targets: TargetArrays = {
      role: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
    };
    const dimWeights = { role: new Float32Array([1, weight1]) };
    return { nodeIds, nodes, targets, dimWeights };
  }

  it("slider 0 → role force strength is 0 for every node (no pull)", async () => {
    const { nodeIds, nodes, targets, dimWeights } = setup(1);
    // initialSliders: 0 means sv=0 → base = 0 × STRENGTH_AT_ONE = 0 → strength = 0 regardless of weight
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 0 }, dimWeights);
    expect(roleStrengthAt(layer, 0)).toBe(0);
    expect(roleStrengthAt(layer, 1)).toBe(0);
    layer.dispose();
  });

  it("slider 1 → strength = STRENGTH_AT_ONE × dimWeight per node", async () => {
    // node 0: weight=1.0 → STRENGTH_AT_ONE(0.1) × 1.0 = 0.1
    // node 1: weight=0   → STRENGTH_AT_ONE(0.1) × 0.0 = 0.0 (availability-gated)
    const { nodeIds, nodes, targets, dimWeights } = setup(0);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 1 }, dimWeights);
    expect(roleStrengthAt(layer, 0)).toBeCloseTo(0.1, 6); // available
    expect(roleStrengthAt(layer, 1)).toBe(0);             // availability-gated
    layer.dispose();
  });

  it("applying weights never touches the MASK bus (two-bus invariant)", async () => {
    const { nodeIds, nodes, targets, dimWeights } = setup(1);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 0.5 }, dimWeights);
    const v0 = layer.maskVersion;
    layer.updateSliders({ role: 1 });
    expect(layer.maskVersion).toBe(v0); // weighting is PHYSICS-bus only
    layer.dispose();
  });
});

// =============================================================================
// P3.5: updateSliders MERGE — target-only dim strength survives partial push
// =============================================================================

describe("P3.5: updateSliders merges — target-only dim strength survives a partial push", () => {
  it("module strength is preserved when updateSliders omits module", async () => {
    const nodeIds = ["a"];
    const nodes: SimNode[] = [{ id: "a", index: 0 }];
    const targets: TargetArrays = {
      role:   { x: new Float32Array([1]), y: new Float32Array([0]), z: new Float32Array([0]) },
      module: { x: new Float32Array([1]), y: new Float32Array([0]), z: new Float32Array([0]) },
    };
    const layer = await createPhysicsLayer(
      nodeIds, nodes, targets, ["role", "module"],
      { role: 0, module: 0.15 },
      { role: new Float32Array([1]), module: new Float32Array([1]) },
    );
    layer.updateSliders({ role: 1 }); // module omitted
    expect(roleStrengthAt(layer, 0)).toBeCloseTo(0.1, 6);     // 1 × 0.1 × 1 = 0.1
    expect(moduleStrengthAt(layer, 0)).toBeCloseTo(0.015, 6); // 0.15 × 0.1 × 1 = 0.015, preserved
    layer.dispose();
  });
});

// =============================================================================
// B.1: Drag-preview mode — active-input lowers the per-tick cost profile
// =============================================================================

describe("B.1: setActiveInput toggles the preview force profile", () => {
  it("setActiveInput(true) detaches repulsion (alphaDecay + velocityDecay preserved)", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(8);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const sim = _capturedSim;
    sim.stop(); // prevent ambient ticks during assertion

    layer.updateSliders({ "dim-activity": 1, "dim-recency": 0 });
    expect(sim.force("repulsion"), "repulsion attached at rest").not.toBeNull();
    expect(sim.alphaDecay(), "full-profile alphaDecay at engaged slider").toBeCloseTo(0.02, 6);
    const alphaDecayBefore = sim.alphaDecay();
    const velocityDecayBefore = sim.velocityDecay();

    layer.setActiveInput(true);

    // PREVIEW ASSERTION 1: repulsion force is detached (the dominant per-tick cost).
    expect(sim.force("repulsion"), "preview detaches repulsion").toBeFalsy();
    // PREVIEW ASSERTION 2: alphaDecay is NOT changed. The natural settle
    // between keystrokes is load-bearing — the 3D renderLoop gates on
    // positions/camera/dirty (F.1, commit 9702034), so keeping positions
    // changing every frame would steal CPU from d3 and NET-LOSE ticks.
    expect(sim.alphaDecay(), "alphaDecay preserved during preview").toBeCloseTo(alphaDecayBefore, 6);
    // PREVIEW ASSERTION 3: velocityDecay is NOT changed. Dropping it makes
    // each tick move nodes farther, which spends more CPU per tick in the
    // 3D renderLoop and was measured at ~20% 3D throughput regression.
    expect(sim.velocityDecay(), "velocityDecay preserved during preview").toBeCloseTo(velocityDecayBefore, 6);
    // PREVIEW ASSERTION 4: target forces (forceX/Y/Z) are UNTOUCHED — layout direction
    // is preserved. We probe via the __debugStrength accessor exposed by physicsLayer.
    const debugStrength = (layer as unknown as Record<string, unknown>)["__debugStrength"] as
      (dim: string, i: number) => number;
    expect(debugStrength("dim-activity", 0), "target-force strength preserved").toBeCloseTo(0.1, 6);

    layer.dispose();
  });

  it("setActiveInput(false) re-attaches repulsion (other engine params preserved)", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(8);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const sim = _capturedSim;
    sim.stop();

    layer.updateSliders({ "dim-activity": 1, "dim-recency": 0 });
    const alphaDecayBefore = sim.alphaDecay();
    const velocityDecayBefore = sim.velocityDecay();
    layer.setActiveInput(true);
    expect(sim.force("repulsion")).toBeFalsy(); // sanity: we ARE in preview

    layer.setActiveInput(false);

    // RESTORE ASSERTION 1: repulsion re-attached (same manyBody instance).
    expect(sim.force("repulsion"), "repulsion re-attached").toBe(_capturedManyBody);
    // RESTORE ASSERTION 2 & 3: other params unchanged across the whole cycle.
    expect(sim.alphaDecay(), "alphaDecay never changed").toBeCloseTo(alphaDecayBefore, 6);
    expect(sim.velocityDecay(), "velocityDecay never changed").toBeCloseTo(velocityDecayBefore, 6);

    layer.dispose();
  });

  it("preview enter→exit cycle preserves node count and produces no NaN positions", async () => {
    // Deterministic seed so this test never flakes on Math.random.
    let s = 0xdeadbeef >>> 0;
    const rng = vi.spyOn(Math, "random").mockImplementation(() => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    });
    try {
      const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(16);
      const beforeCount = nodes.length;
      const layer = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
      const sim = _capturedSim;
      sim.stop();

      // Engage sliders, tick a bit in full-profile, toggle preview, tick in preview,
      // exit preview, tick again. Node count + finite-ness must hold throughout.
      layer.updateSliders({ "dim-activity": 0.5, "dim-recency": 0.5 });
      sim.tick(3);
      layer.setActiveInput(true);
      sim.tick(5); // ticks in preview mode (no repulsion)
      layer.setActiveInput(false);
      sim.tick(3); // ticks back in full profile

      // ASSERTION: node count unchanged.
      expect(nodes.length, "node count is stable across preview cycle").toBe(beforeCount);

      // ASSERTION: every position component is finite (no NaN / no Infinity).
      const xyz = layer.getPositions();
      expect(xyz.length).toBe(beforeCount * 3);
      for (let i = 0; i < xyz.length; i++) {
        expect(Number.isFinite(xyz[i]), `position[${i}] must be finite, got ${xyz[i]}`).toBe(true);
      }

      // ASSERTION: deterministic — same seeded run yields identical positions.
      // Re-run from scratch with the same seed prefix and compare.
      s = 0xdeadbeef >>> 0;
      const f2 = makeFixture(16);
      _capturedSim = null;
      _capturedManyBody = null;
      _registeredForceNames = [];
      const layer2 = await createPhysicsLayer(
        f2.nodeIds, f2.nodes, f2.targets, f2.dimNames, f2.initialSliders,
      );
      const sim2 = _capturedSim;
      sim2.stop();
      layer2.updateSliders({ "dim-activity": 0.5, "dim-recency": 0.5 });
      sim2.tick(3);
      layer2.setActiveInput(true);
      sim2.tick(5);
      layer2.setActiveInput(false);
      sim2.tick(3);
      const xyz2 = layer2.getPositions();
      for (let i = 0; i < xyz.length; i++) {
        expect(xyz2[i]).toBeCloseTo(xyz[i], 5);
      }

      layer.dispose();
      layer2.dispose();
    } finally {
      rng.mockRestore();
    }
  });

  it("idempotent — repeated setActiveInput(true) doesn't re-detach or re-reheat", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(4);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const sim = _capturedSim;
    sim.stop();

    layer.setActiveInput(true);
    const alphaAfterFirst = sim.alpha();
    sim.tick(2); // alpha decays a bit
    const alphaBeforeSecond = sim.alpha();
    layer.setActiveInput(true); // second call — should be a no-op
    expect(sim.alpha(), "second setActiveInput(true) does not reheat").toBeCloseTo(alphaBeforeSecond, 6);
    expect(alphaAfterFirst).toBeGreaterThan(0); // sanity

    layer.dispose();
  });

  it("preview mode survives a slider change without losing the detached-repulsion state", async () => {
    // Real-world flow: user starts dragging → setActiveInput(true) → slider
    // emits multiple updateSliders → idle timer fires → setActiveInput(false).
    // updateSliders MUST NOT re-attach repulsion or re-pin alphaDecay while
    // preview is engaged.
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(4);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const sim = _capturedSim;
    sim.stop();

    layer.setActiveInput(true);
    expect(sim.force("repulsion")).toBeFalsy();

    // Simulate a drag — multiple slider updates while preview is engaged.
    layer.updateSliders({ "dim-activity": 0.2, "dim-recency": 0 });
    layer.updateSliders({ "dim-activity": 0.4, "dim-recency": 0 });
    layer.updateSliders({ "dim-activity": 0.6, "dim-recency": 0 });

    // Preview profile MUST still be in effect — repulsion stays detached even
    // though updateSliders called manyBody.strength on the detached instance.
    expect(sim.force("repulsion"), "repulsion stays detached during drag").toBeFalsy();

    layer.dispose();
  });
});

describe("B.2 accessors", () => {
  it("getTargets returns the targets passed at construction", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    expect(physics.getTargets()).toBe(targets);
    physics.dispose();
  });

  it("getDimWeights returns {} when not provided at construction", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    expect(physics.getDimWeights()).toEqual({});
    physics.dispose();
  });

  it("getDimWeights returns the dimWeights reference passed at construction", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const dimWeights = {
      "dim-activity": new Float32Array([1, 0.5]),
      "dim-recency": new Float32Array([0.25, 1]),
    };
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders, dimWeights);
    expect(physics.getDimWeights()).toBe(dimWeights);
    physics.dispose();
  });

  it("getSliders reflects the latest updateSliders call as a copy", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    physics.updateSliders({ "dim-activity": 0.42 });
    const s = physics.getSliders();
    expect(s["dim-activity"]).toBeCloseTo(0.42, 5);
    // mutating the returned copy must not affect internal state
    s["dim-activity"] = 999;
    expect(physics.getSliders()["dim-activity"]).toBeCloseTo(0.42, 5);
    physics.dispose();
  });

  it("getSliders includes initial slider state at construction (zeros)", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    expect(physics.getSliders()).toEqual({ "dim-activity": 0, "dim-recency": 0 });
    physics.dispose();
  });
});

describe("B.2 syncPositions", () => {
  it("writes xyz into node positions (round-trips via getPositions)", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const next = new Float32Array([1, 2, 3, 4, 5, 6]);
    physics.syncPositions(next);
    const out = physics.getPositions();
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
    physics.dispose();
  });

  it("bumps positionsVersion", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const v0 = physics.positionsVersion;
    physics.syncPositions(new Float32Array([0, 0, 0, 0, 0, 0]));
    expect(physics.positionsVersion).toBeGreaterThan(v0);
    physics.dispose();
  });

  it("does not change maskVersion", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    const m0 = physics.maskVersion;
    physics.syncPositions(new Float32Array([0, 0, 0, 0, 0, 0]));
    expect(physics.maskVersion).toBe(m0);
    physics.dispose();
  });

  it("rejects mismatched buffer length", async () => {
    const { nodeIds, nodes, targets, dimNames, initialSliders } = makeFixture(2);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, initialSliders);
    expect(() => physics.syncPositions(new Float32Array(3))).toThrow(/length/i);
    physics.dispose();
  });
});
