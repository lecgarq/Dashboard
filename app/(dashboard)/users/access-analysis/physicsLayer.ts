/**
 * physicsLayer.ts — Pure TypeScript physics engine for the Access Analysis spatial graph.
 * No React, no DOM, no rendering. Matches the mathLayer.ts purity discipline.
 *
 * TWO-BUS ARCHITECTURE
 * ====================
 * This module implements two completely independent buses:
 *
 * 1. PHYSICS BUS — owns the d3-force-3d simulation, named per-dimension forces,
 *    position Float32Array, freeze-on-rest cache writes. Only `updateSliders` and
 *    the "end" event handler may touch `sim`.
 *
 * 2. MASK BUS — owns `_alphaMask` Float32Array and `_maskVersion` counter.
 *    Only `setMask` writes to this bus. The simulation is NEVER referenced inside
 *    setMask. This is the load-bearing invariant that Phase 3 (render) and
 *    Phase 4 (interactions) depend on — filter/search/lasso events must never
 *    cause a simulation tick.
 *
 * Requirements satisfied:
 *   PHYS-01: Named per-dimension forces (forceX/Y/Z triplets) + forceManyBody repulsion
 *   PHYS-02: Slider changes use alpha(target).restart() — never bare restart()
 *   PHYS-03: max(sliderValues) drives alphaDecay, manyBody.strength, and reheat alpha atomically
 *   PHYS-04: setMask mutates _alphaMask + bumps _maskVersion; MUST NOT touch simulation
 *   PHYS-05: sim.on("end") packs positions into Float32Array, writes to cache, then stops sim
 */

import {
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  forceManyBody,
} from "d3-force-3d";
import { getDuckDbClient } from "./duckdbClient";
import {
  savePositions,
  loadCachedPositions,
  hashNodeSetAndSliders,
} from "./positionsCache";

// ---- Types ---------------------------------------------------------------

/**
 * A node datum passed to d3-force-3d. Extends the simulation node datum with
 * optional z-axis properties (provided by the d3-force-3d.d.ts shim).
 */
export interface SimNode {
  id: string;
  index?: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

/**
 * Per-dimension target coordinate arrays — produced by the caller via mathLayer's
 * computeTargetPositions using the per-dim derivation pattern (option a):
 *   for each dim d, call computeTargetPositions with slider[d]=1, all others=0,
 *   then split the resulting Float32Array(n*3) into { x, y, z }.
 *
 * This keeps mathLayer's API unchanged and computes targets once at construction;
 * slider changes only mutate force.strength(), not target arrays.
 */
export type TargetArrays = Record<
  string,
  { x: Float32Array; y: Float32Array; z: Float32Array }
>;

/**
 * Public API surface returned by createPhysicsLayer.
 * Callers (Phase 3 render, Phase 4 interactions) only interact through this interface.
 */
export interface PhysicsLayer {
  /** Current alphaMask — render reads this directly for GPU upload */
  readonly alphaMask: Float32Array;
  /** Monotonic version counter; incremented by setMask only — never by simulation ticks */
  readonly maskVersion: number;
  /**
   * True once the simulation has settled (frozen) or positions were restored
   * from cache. The render layer reads this to perform a one-shot rescale/fit
   * to the settled spread (positions can extend far beyond the seed range).
   */
  readonly frozen: boolean;
  /**
   * Update ALL slider strengths at once.
   * Recalculates alphaDecay, manyBody.strength, and reheat alpha atomically (PHYS-02, PHYS-03).
   */
  updateSliders(values: Record<string, number>): void;
  /**
   * Mutate alphaMask via predicate and increment maskVersion.
   * PHYS-04 invariant: this method MUST NOT touch the simulation.
   */
  setMask(predicate: (nodeIndex: number) => number): void;
  /**
   * Snapshot current node positions into a new Float32Array(n*3) [x,y,z,...].
   * Safe to call at any time (reads from d3 node objects, stride-3).
   */
  getPositions(): Float32Array;
  /** Stop the simulation timer and release resources. */
  dispose(): void;
}

// ---- Constants (locked decisions from CONTEXT.md) -----------------------

/** Alpha threshold below which d3 fires the "end" event — do not change. */
const ALPHA_MIN = 0.001;
/** Maximum reheat alpha on slider change — gentle reheat, never a full-restart shock. */
const ALPHA_MAX_REHEAT = 0.3;
/** d3 forceX/Y/Z strength at slider = 1.0 (d3 default). Slider scales linearly to [0, 0.1]. */
const STRENGTH_AT_ONE = 0.1;
/** Baseline manyBody repulsion when all sliders are 0 (nodes pack tight). */
const REPULSION_ZERO = -10;
/** Max manyBody repulsion when sliders are fully engaged (nodes spread for cluster legibility). */
const REPULSION_ONE = -60;
/** Fast alphaDecay when sliders are at 0 — sim freezes quickly. */
const DECAY_ZERO = 0.1;
/** Slow alphaDecay when sliders are engaged — user sees motion while clusters separate. */
const DECAY_ONE = 0.02;
/** Skip reheat if frozen and the largest per-dimension slider delta < this threshold (prevents scroll-wheel thrashing). */
const SKIP_THRESHOLD = 0.02;
/** Reheat alpha floor — any material slider change reheats to at least this so motion is always visible. */
const ALPHA_REHEAT_FLOOR = 0.15;
/** Velocity damping — locked at d3 default (CONTEXT.md). */
const VELOCITY_DECAY = 0.4;

// ---- Helpers -------------------------------------------------------------

/** Linear interpolation clamped to [a, b]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Target half-extent for the settled layout. forceManyBody repulsion has no
 * containment, so the raw spread grows unbounded with node count (~±7500 for
 * ~17k nodes). Normalizing the frozen layout into a fixed cube keeps both the
 * 2D (cosmos spaceSize) and 3D (fixed sphere radius) renderers in a sane scale.
 */
const LAYOUT_HALF_EXTENT = 350;

/** Scale settled node positions in-place so the largest coordinate ≈ halfExtent. */
function normalizeNodePositions(nodes: SimNode[], halfExtent: number): void {
  let maxAbs = 0;
  for (const nd of nodes) {
    maxAbs = Math.max(maxAbs, Math.abs(nd.x ?? 0), Math.abs(nd.y ?? 0), Math.abs(nd.z ?? 0));
  }
  if (maxAbs <= 0) return;
  const s = halfExtent / maxAbs;
  for (const nd of nodes) {
    if (nd.x != null) nd.x *= s;
    if (nd.y != null) nd.y *= s;
    if (nd.z != null) nd.z *= s;
  }
}

// ---- Factory -------------------------------------------------------------

/**
 * Create a PhysicsLayer for the given node set.
 *
 * @param nodeIds - Stable string IDs for cache keying (must match order in `nodes`).
 * @param nodes   - d3 node objects; positions written in-place by simulation.
 * @param targets - Per-dimension target arrays produced by the caller via mathLayer.
 * @param dimNames - Dimension identifiers (e.g. ["activity", "recency", "role", ...]).
 * @param initialSliders - Initial slider state (all zeros at construction time).
 * @param dimWeights - Optional slider-INDEPENDENT per-node weights per dimension
 *   (confidence × availability × transformer), from dimensionWeights.buildDimensionWeights.
 *   Omitted → every node weights 1.0 (back-compat). PHYSICS-bus only.
 */
export async function createPhysicsLayer(
  nodeIds: string[],
  nodes: SimNode[],
  targets: TargetArrays,
  dimNames: string[],
  initialSliders: Record<string, number>,
  dimWeights: Record<string, Float32Array> = {},
): Promise<PhysicsLayer> {
  // ---- MASK BUS (completely separate from simulation) ---------------------

  let _maskVersion = 0;
  const _alphaMask = new Float32Array(nodes.length).fill(1.0);

  // ---- PHYSICS BUS --------------------------------------------------------

  // PHYS-01: Register one forceManyBody baseline + three named forces per dimension.
  const manyBody = forceManyBody<SimNode>().strength(REPULSION_ZERO);

  // PHYS-01: forceSimulation<SimNode>(nodes, 3) — second arg MUST be 3 (Pitfall 1).
  const sim = forceSimulation<SimNode>(nodes, 3)
    .alphaMin(ALPHA_MIN)
    .alphaDecay(DECAY_ZERO) // fast freeze until user engages sliders
    .velocityDecay(VELOCITY_DECAY)
    .force("repulsion", manyBody);

  // PHYS-01: Named per-dimension forces — strength(0) at startup (Pitfall 6 in RESEARCH: init to 0, not 0.1).
  for (const dimId of dimNames) {
    const t = targets[dimId];
    if (!t) continue;
    // Accessor uses d.index! not closure-over-index (Pitfall 3).
    sim
      .force(
        `${dimId}-x`,
        forceX<SimNode>((d) => t.x[d.index!]).strength(0),
      )
      .force(
        `${dimId}-y`,
        forceY<SimNode>((d) => t.y[d.index!]).strength(0),
      )
      .force(
        `${dimId}-z`,
        forceZ<SimNode>((d) => t.z[d.index!]).strength(0),
      );
  }

  // P1.1: apply slider strengths + engine params to the live simulation. Shared by
  // construction (so the FIRST settle is organic) and updateSliders. PHYSICS-bus
  // only — never touches alpha/restart or the mask bus. Returns max(sliderValues).
  // P3.4: per-node strength folds in dimWeights (confidence × availability ×
  // transformer). Nodes with weight=0 (availability-gated) get zero pull even at
  // full slider, so they never drag toward a dim pole they have no value for.
  function applySliderForces(values: Record<string, number>): number {
    const maxSlider = Math.max(0, ...Object.values(values));
    for (const [dimId, sv] of Object.entries(values)) {
      const base = sv * STRENGTH_AT_ONE;
      const w = dimWeights[dimId];
      // strengthFn uses only `i` (node index); `_d` is unused but required by d3's
      // function-strength overload. Cast to `number` forces the scalar overload which
      // accepts any numeric-returning function via `as unknown`.
      const strengthFn = (_d: unknown, i: number): number =>
        w ? base * w[i] : base;
      (sim.force(`${dimId}-x`) as ReturnType<typeof forceX> | null)?.strength(strengthFn as unknown as number);
      (sim.force(`${dimId}-y`) as ReturnType<typeof forceY> | null)?.strength(strengthFn as unknown as number);
      (sim.force(`${dimId}-z`) as ReturnType<typeof forceZ> | null)?.strength(strengthFn as unknown as number);
    }
    manyBody.strength(lerp(REPULSION_ZERO, REPULSION_ONE, maxSlider));
    sim.alphaDecay(lerp(DECAY_ZERO, DECAY_ONE, maxSlider));
    return maxSlider;
  }

  let frozen = false;
  let _sliders: Record<string, number> = { ...initialSliders };
  // P1.1: seed the simulation with the initial profile so the FIRST settle already
  // expresses structure (volumetric clusters), not a featureless repulsion globe.
  applySliderForces(_sliders);

  // PHYS-05: Register "end" handler BEFORE cache check (ensures it fires if sim runs).
  // Handler packs positions synchronously into Float32Array BEFORE the async save
  // to avoid render-race (Pitfall 5 in RESEARCH).
  sim.on("end", async () => {
    frozen = true; // set synchronously so render loop sees it immediately
    // Containment: the simulation has no centering force, so normalize the
    // settled spread into a fixed cube before snapshotting/caching.
    normalizeNodePositions(nodes, LAYOUT_HALF_EXTENT);
    // Pack positions synchronously into snapshot (Pitfall 5 guard).
    const xyz = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      xyz[i * 3 + 0] = nodes[i].x ?? 0;
      xyz[i * 3 + 1] = nodes[i].y ?? 0;
      xyz[i * 3 + 2] = nodes[i].z ?? 0;
    }
    const cacheKey = hashNodeSetAndSliders(nodeIds, _sliders);
    const { connection } = await getDuckDbClient();
    // PHYS-05: Write to DuckDB-WASM positions cache, then halt tick counter.
    await savePositions(connection, cacheKey, nodeIds, xyz);
    sim.stop(); // halts tick counter — satisfies PHYS-05 freeze-on-rest criterion
  });

  // Pattern 6: Check cache before running. On hit: pin nodes and skip simulation entirely.
  const { connection } = await getDuckDbClient();
  const cacheKey = hashNodeSetAndSliders(nodeIds, _sliders);
  const cached = await loadCachedPositions(connection, cacheKey, nodeIds);

  if (cached) {
    // Cache hit: write positions into d3 node objects and pin via fx/fy/fz.
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = cached[i * 3];
      nodes[i].y = cached[i * 3 + 1];
      nodes[i].z = cached[i * 3 + 2];
      nodes[i].fx = nodes[i].x; // pin to prevent d3 from moving them
      nodes[i].fy = nodes[i].y;
      nodes[i].fz = nodes[i].z;
    }
    sim.stop();
    frozen = true;
  } else {
    // Cache miss: seed random positions in [-1, 1]^3 and let simulation run.
    for (const n of nodes) {
      n.x = Math.random() * 2 - 1;
      n.y = Math.random() * 2 - 1;
      n.z = Math.random() * 2 - 1;
    }
    // PHYS-02: alpha(target).restart() — never bare restart() (Pitfall 4).
    // At construction, sliders are all zero so alphaDecay is DECAY_ZERO (fast freeze).
    // We need a non-zero alpha to actually run; use ALPHA_MAX_REHEAT as initial seed alpha.
    sim.alpha(ALPHA_MAX_REHEAT).restart();
  }

  // ---- Public API ---------------------------------------------------------

  const layer: PhysicsLayer = {
    get alphaMask(): Float32Array {
      return _alphaMask;
    },

    get maskVersion(): number {
      return _maskVersion;
    },

    get frozen(): boolean {
      return frozen;
    },

    // PHYS-02 + PHYS-03: Update all slider strengths + engine params atomically, then reheat.
    updateSliders(values: Record<string, number>): void {
      const prev = _sliders;                  // reference to the previous slider vector
      _sliders = { ..._sliders, ...values };  // merge: preserve target-only dims (e.g. module)
      // PHYS-01 + PHYS-03: set per-dim strengths + engine params atomically (shared
      // with construction via applySliderForces). Returns max(sliderValues).
      const maxSlider = applySliderForces(_sliders);
      // Reheat to at least the floor so even a small change is visibly animated; a
      // sticky-high preset still yields a healthy alpha via maxSlider.
      const newAlpha = Math.max(
        ALPHA_REHEAT_FLOOR,
        Math.min(maxSlider, ALPHA_MAX_REHEAT),
      );

      // CHANGE-DETECTION FIX (P0): key the skip on the PER-DIMENSION delta, not the
      // scalar max. Multi-slider presets make max(allSliders) sticky, so a
      // non-dominant slider move left maxSlider unchanged and was silently skipped
      // (force field changed, sim never restarted → nodes never moved).
      let maxDelta = 0;
      for (const k of new Set([...Object.keys(prev), ...Object.keys(_sliders)])) {
        maxDelta = Math.max(maxDelta, Math.abs((_sliders[k] ?? 0) - (prev[k] ?? 0)));
      }
      const skip = frozen && maxDelta < SKIP_THRESHOLD;
      if (!skip) {
        frozen = false;
        // Unpin nodes before reheat so forces can move them.
        for (const n of nodes) {
          n.fx = null;
          n.fy = null;
          n.fz = null;
        }
        // PHYS-02: alpha(target).restart() — never simulation.restart() bare (Pitfall 4).
        sim.alpha(newAlpha).restart();
      }
    },

    setMask(predicate: (nodeIndex: number) => number): void {
      // PHYS-04 invariant: this method MUST NOT touch the simulation.
      // Filter, search, and lasso events route exclusively through this method.
      for (let i = 0; i < _alphaMask.length; i++) {
        _alphaMask[i] = predicate(i);
      }
      _maskVersion++;
    },

    getPositions(): Float32Array {
      // Snapshot current d3 node positions into stride-3 Float32Array(n*3) (Pitfall 7).
      const xyz = new Float32Array(nodes.length * 3);
      for (let i = 0; i < nodes.length; i++) {
        xyz[i * 3 + 0] = nodes[i].x ?? 0;
        xyz[i * 3 + 1] = nodes[i].y ?? 0;
        xyz[i * 3 + 2] = nodes[i].z ?? 0;
      }
      return xyz;
    },

    dispose(): void {
      sim.stop();
    },
  };

  // TEST-ONLY diagnostics attached outside the PhysicsLayer typed surface so the
  // public interface stays clean. Render/interaction code MUST NOT use this.
  //
  // Reads the per-node effective strength for a given dimension at a given node
  // index by calling the live strength function installed on the forceX force.
  // The strength function is (_d, i) => base * w[i]; it uses only `i`, so calling
  // with (null, nodeIndex) is safe. Re-installed on every applySliderForces call,
  // so this always reflects the current slider + weight state.
  //
  // Why not read d3's internal `.strengths` array? That closure variable is not
  // exposed on the force object. Calling the function directly is equivalent and
  // reflects the identical computation d3 would run on tick.
  (layer as unknown as Record<string, unknown>)["__debugStrength"] = (
    dimId: string,
    nodeIndex: number,
  ): number => {
    const f = sim.force(`${dimId}-x`) as ReturnType<typeof forceX> | null;
    if (!f) return NaN;
    const fn = f.strength() as unknown as ((_d: unknown, i: number) => number);
    return fn(null, nodeIndex);
  };

  return layer;
}
