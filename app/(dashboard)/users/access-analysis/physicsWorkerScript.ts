/**
 * physicsWorkerScript.ts — Web Worker that runs the d3-force-3d simulation
 * off the main thread for the Access Analysis spatial graph.
 *
 * Architecture mirrors accGraphOrganicLayout.worker.ts (proven pattern in this
 * codebase) but adapted for 3D force simulation with per-dimension targets
 * and dimWeights.
 *
 * MESSAGE PROTOCOL
 * ================
 * Main → Worker:
 *   init            — seed nodes, targets, dimWeights, initial sliders, optional cached positions
 *   updateSliders   — apply new slider values and reheat if needed
 *   setActiveInput  — toggle drag-preview mode (detach/reattach repulsion)
 *   syncPositions   — write external positions into d3 nodes (preview exit handoff)
 *   dispose         — stop simulation, clean up
 *
 * Worker → Main:
 *   tick            — position update (Float32Array via Transferable)
 *   frozen          — simulation settled; main thread should cache positions
 *   ready           — initialization complete
 */

import {
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  forceManyBody,
} from "d3-force-3d";

// ---- Types ----------------------------------------------------------------

interface SimNode {
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

/** Serializable target arrays — Float32Arrays are Transferable. */
interface SerializedTargetArrays {
  [dimId: string]: { x: Float32Array; y: Float32Array; z: Float32Array };
}

// ---- Incoming messages ----------------------------------------------------

type WorkerCommand =
  | {
      type: "init";
      nodeCount: number;
      targetDimIds: string[];
      /** Flattened per-dim targets: { dimId: { x: Float32Array, y: Float32Array, z: Float32Array } } */
      targets: SerializedTargetArrays;
      initialSliders: Record<string, number>;
      /** Optional per-dim weights: { dimId: Float32Array } */
      dimWeights: Record<string, Float32Array>;
      /** If set, skip simulation and use these cached positions. */
      cachedPositions?: Float32Array;
    }
  | { type: "updateSliders"; values: Record<string, number> }
  | { type: "setActiveInput"; active: boolean }
  | { type: "syncPositions"; xyz: Float32Array }
  | { type: "dispose" };

// ---- Outgoing messages ----------------------------------------------------

type WorkerEvent =
  | { type: "tick"; xyz: Float32Array; version: number }
  | { type: "frozen"; xyz: Float32Array; sliders: Record<string, number> }
  | { type: "ready" };

// ---- Constants (mirrored from physicsLayer.ts) ----------------------------

const ALPHA_MIN = 0.001;
const ALPHA_MAX_REHEAT = 0.3;
const STRENGTH_AT_ONE = 0.1;
const REPULSION_ZERO = -10;
const REPULSION_ONE = -60;
const DECAY_ZERO = 0.1;
const DECAY_ONE = 0.02;
const SKIP_THRESHOLD = 0.005;
const ALPHA_REHEAT_FLOOR = 0.15;
const VELOCITY_DECAY = 0.4;
const REPULSION_THETA = 1.5;
const REPULSION_DISTANCE_MAX = 200;
const PREVIEW_ENTRY_ALPHA = 0.2;
const LAYOUT_HALF_EXTENT = 350;
const POST_INTERVAL_MS = 16; // 60fps position updates

// ---- Worker state ---------------------------------------------------------

const ctx = self as unknown as {
  postMessage(msg: WorkerEvent, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerCommand>) => void) | null;
};

let nodes: SimNode[] = [];
let sim: ReturnType<typeof forceSimulation> | null = null;
let manyBody: ReturnType<typeof forceManyBody> | null = null;
let targets: SerializedTargetArrays = {};
let dimWeights: Record<string, Float32Array> = {};
let dimNames: string[] = [];
let _sliders: Record<string, number> = {};
let _slidersAtLastReheat: Record<string, number> = {};
let _activeInput = false;
let frozen = false;
let _positionsVersion = 0;
let lastPostAt = 0;

// ---- Helpers --------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function normalizeNodePositions(ns: SimNode[], halfExtent: number): void {
  let maxAbs = 0;
  for (const nd of ns) {
    maxAbs = Math.max(maxAbs, Math.abs(nd.x ?? 0), Math.abs(nd.y ?? 0), Math.abs(nd.z ?? 0));
  }
  if (maxAbs <= 0) return;
  const s = halfExtent / maxAbs;
  for (const nd of ns) {
    if (nd.x != null) nd.x *= s;
    if (nd.y != null) nd.y *= s;
    if (nd.z != null) nd.z *= s;
  }
}

function packPositions(ns: SimNode[]): Float32Array {
  const xyz = new Float32Array(ns.length * 3);
  for (let i = 0; i < ns.length; i++) {
    xyz[i * 3] = ns[i].x ?? 0;
    xyz[i * 3 + 1] = ns[i].y ?? 0;
    xyz[i * 3 + 2] = ns[i].z ?? 0;
  }
  return xyz;
}

function postPositions(force = false): void {
  const now = Date.now();
  if (!force && now - lastPostAt < POST_INTERVAL_MS) return;
  lastPostAt = now;
  const xyz = packPositions(nodes);
  ctx.postMessage(
    { type: "tick", xyz, version: _positionsVersion },
    [xyz.buffer as ArrayBuffer],
  );
}

// ---- Force application ----------------------------------------------------

function applySliderForces(values: Record<string, number>): number {
  if (!sim || !manyBody) return 0;
  const maxSlider = Math.max(0, ...Object.values(values));
  for (const [dimId, sv] of Object.entries(values)) {
    const base = sv * STRENGTH_AT_ONE;
    const w = dimWeights[dimId];
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

// ---- Initialization -------------------------------------------------------

function initSimulation(cmd: Extract<WorkerCommand, { type: "init" }>): void {
  const n = cmd.nodeCount;
  targets = cmd.targets;
  dimWeights = cmd.dimWeights;
  dimNames = cmd.targetDimIds;
  _sliders = { ...cmd.initialSliders };
  _slidersAtLastReheat = { ...cmd.initialSliders };
  _activeInput = false;
  frozen = false;
  _positionsVersion = 0;
  lastPostAt = 0;

  // Create nodes
  nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: String(i), index: i });
  }

  // Build simulation
  manyBody = forceManyBody<SimNode>()
    .strength(REPULSION_ZERO)
    .theta(REPULSION_THETA)
    .distanceMax(REPULSION_DISTANCE_MAX);

  sim = forceSimulation<SimNode>(nodes, 3)
    .alphaMin(ALPHA_MIN)
    .alphaDecay(DECAY_ZERO)
    .velocityDecay(VELOCITY_DECAY)
    .force("repulsion", manyBody);

  // Register per-dimension forces
  for (const dimId of dimNames) {
    const t = targets[dimId];
    if (!t) continue;
    sim
      .force(`${dimId}-x`, forceX<SimNode>((d) => t.x[d.index!]).strength(0))
      .force(`${dimId}-y`, forceY<SimNode>((d) => t.y[d.index!]).strength(0))
      .force(`${dimId}-z`, forceZ<SimNode>((d) => t.z[d.index!]).strength(0));
  }

  // Apply initial slider forces
  applySliderForces(_sliders);

  // Tick handler — bump version and post positions
  sim.on("tick", () => {
    _positionsVersion++;
    postPositions();
  });

  // End handler — simulation settled
  sim.on("end", () => {
    frozen = true;
    _slidersAtLastReheat = { ..._sliders };
    normalizeNodePositions(nodes, LAYOUT_HALF_EXTENT);
    _positionsVersion++;

    const xyz = packPositions(nodes);
    // Post final positions for cache save on main thread
    ctx.postMessage(
      { type: "frozen", xyz: new Float32Array(xyz), sliders: { ..._sliders } },
      // Don't transfer xyz — we need it for the 'frozen' copy; send a separate copy
    );
    // Also post as a tick so the renderer paints the settled layout
    ctx.postMessage(
      { type: "tick", xyz, version: _positionsVersion },
      [xyz.buffer as ArrayBuffer],
    );
    sim!.stop();
  });

  // Check for cached positions
  if (cmd.cachedPositions) {
    const cached = cmd.cachedPositions;
    for (let i = 0; i < n; i++) {
      nodes[i].x = cached[i * 3];
      nodes[i].y = cached[i * 3 + 1];
      nodes[i].z = cached[i * 3 + 2];
      nodes[i].fx = nodes[i].x;
      nodes[i].fy = nodes[i].y;
      nodes[i].fz = nodes[i].z;
    }
    sim.stop();
    frozen = true;
    _positionsVersion++;
    postPositions(true);
  } else {
    // Seed random positions and start
    for (const nd of nodes) {
      nd.x = Math.random() * 2 - 1;
      nd.y = Math.random() * 2 - 1;
      nd.z = Math.random() * 2 - 1;
    }
    sim.alpha(ALPHA_MAX_REHEAT).restart();
  }

  ctx.postMessage({ type: "ready" });
}

// ---- Message handler ------------------------------------------------------

ctx.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      initSimulation(msg);
      break;

    case "updateSliders": {
      if (!sim) break;
      _sliders = { ..._sliders, ...msg.values };
      const maxSlider = applySliderForces(_sliders);
      const newAlpha = Math.max(
        ALPHA_REHEAT_FLOOR,
        Math.min(maxSlider, ALPHA_MAX_REHEAT),
      );

      const anchor = _slidersAtLastReheat;
      let maxDelta = 0;
      for (const k of new Set([...Object.keys(anchor), ...Object.keys(_sliders)])) {
        maxDelta = Math.max(maxDelta, Math.abs((_sliders[k] ?? 0) - (anchor[k] ?? 0)));
      }
      const skip = frozen && maxDelta < SKIP_THRESHOLD;
      if (!skip) {
        _slidersAtLastReheat = { ..._sliders };
        frozen = false;
        for (const nd of nodes) {
          nd.fx = null;
          nd.fy = null;
          nd.fz = null;
        }
        sim.alpha(newAlpha).restart();
      }
      break;
    }

    case "setActiveInput": {
      if (!sim || !manyBody) break;
      if (msg.active === _activeInput) break;
      _activeInput = msg.active;
      if (msg.active) {
        sim.force("repulsion", null);
        if (frozen) {
          for (const nd of nodes) {
            nd.fx = null;
            nd.fy = null;
            nd.fz = null;
          }
          frozen = false;
        }
        if (sim.alpha() < PREVIEW_ENTRY_ALPHA) {
          sim.alpha(PREVIEW_ENTRY_ALPHA).restart();
        }
      } else {
        sim.force("repulsion", manyBody);
      }
      break;
    }

    case "syncPositions": {
      const xyz = msg.xyz;
      for (let i = 0; i < nodes.length; i++) {
        const j = i * 3;
        nodes[i].x = xyz[j];
        nodes[i].y = xyz[j + 1];
        nodes[i].z = xyz[j + 2];
      }
      _positionsVersion++;
      postPositions(true);
      break;
    }

    case "dispose":
      sim?.stop();
      sim = null;
      manyBody = null;
      nodes = [];
      break;
  }
};
