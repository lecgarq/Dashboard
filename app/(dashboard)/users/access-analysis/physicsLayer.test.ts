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
});

// =============================================================================
// No-reheat optimization
// =============================================================================

describe("No-reheat optimization: skip alpha().restart() when frozen and delta < SKIP_THRESHOLD", () => {
  it("consecutive small-delta updateSliders calls do not trigger restart on a frozen sim", async () => {
    const n = 4;
    // Use cache HIT so frozen=true from construction and never changes until a big-delta call.
    // Cache-hit path: sim.stop() is called + frozen=true. prevMax=0.
    //
    // Two-call scenario:
    //   Call 1: slider=0.01, delta = |0.01 - 0| = 0.01 < SKIP_THRESHOLD → SKIP (frozen=true stays).
    //   Call 2: slider=0.02, delta = |0.02 - 0.01| = 0.01 < SKIP_THRESHOLD → SKIP.
    // Both calls skip → restart never called.
    const cachedPositions = new Float32Array(n * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(n);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0,
    });
    const sim = _capturedSim;

    // Spy on restart
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

    // Call 1: tiny delta from prevMax=0 → skip
    physics.updateSliders({ "dim-activity": 0.01, "dim-recency": 0 });
    expect(restartCallCount, "call 1 (delta=0.01 from 0) must NOT restart").toBe(0);

    // Call 2: tiny delta from prevMax=0.01 → skip
    physics.updateSliders({ "dim-activity": 0.02, "dim-recency": 0 });
    expect(restartCallCount, "call 2 (delta=0.01 from 0.01) must NOT restart").toBe(0);
    expect(alphaCallCount, "neither call may invoke alpha(v)").toBe(0);
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
