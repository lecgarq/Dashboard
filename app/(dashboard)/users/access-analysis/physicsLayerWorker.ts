/**
 * physicsLayerWorker.ts — Main-thread proxy that implements PhysicsLayer by
 * forwarding simulation commands to a Web Worker.
 *
 * Architecture:
 * - PHYSICS BUS: Worker owns the d3-force-3d simulation. Position updates
 *   arrive via postMessage at ~60fps and are cached in a local Float32Array.
 * - MASK BUS: Stays on main thread (no physics dependency per PHYS-04).
 * - CACHE: DuckDB reads/writes stay on main thread; cached positions are
 *   passed to the Worker on init, and the Worker posts back positions on
 *   freeze for main-thread cache saves.
 *
 * The PhysicsLayer interface is identical — all downstream code (rAF loop,
 * GraphCanvas, GraphInteractions) works without modification.
 */

import type { PhysicsLayer, TargetArrays } from "./physicsLayer";
import { getDuckDbClient } from "./duckdbClient";
import {
  savePositions,
  loadCachedPositions,
  hashNodeSetAndSliders,
} from "./positionsCache";

// ---- Types ----------------------------------------------------------------

interface SimNode {
  id: string;
  index?: number;
}

// ---- Factory --------------------------------------------------------------

/**
 * Create a PhysicsLayer backed by a Web Worker.
 * The Worker runs d3-force-3d off the main thread; this proxy implements the
 * same PhysicsLayer interface as the direct createPhysicsLayer.
 *
 * Falls back to the direct (main-thread) implementation if Workers are
 * unavailable (SSR, test environment, etc).
 */
export async function createPhysicsLayerWorker(
  nodeIds: string[],
  _nodes: SimNode[],
  targets: TargetArrays,
  dimNames: string[],
  initialSliders: Record<string, number>,
  dimWeights: Record<string, Float32Array> = {},
  /**
   * When false, skip the DuckDB-backed positions cache entirely (no
   * getDuckDbClient boot). Used by the no-DuckDB graph path — layout simply
   * settles fresh each load instead of persisting between visits.
   */
  usePositionsCache = true,
): Promise<PhysicsLayer> {
  const n = nodeIds.length;

  // ---- MASK BUS (stays on main thread) ------------------------------------
  let _maskVersion = 0;
  const _alphaMask = new Float32Array(n).fill(1.0);

  // ---- POSITIONS CACHE (main thread reads Worker updates) -----------------
  let _positionsVersion = 0;
  let _cachedXyz = new Float32Array(n * 3); // updated by Worker messages
  let frozen = false;
  let _sliders: Record<string, number> = { ...initialSliders };

  // ---- DuckDB cache check (main thread) -----------------------------------
  let cachedPositions: Float32Array | undefined;
  if (usePositionsCache) {
    const { connection } = await getDuckDbClient();
    const cacheKey = hashNodeSetAndSliders(nodeIds, initialSliders);
    const cached = await loadCachedPositions(connection, cacheKey, nodeIds);
    if (cached) {
      _cachedXyz = new Float32Array(cached);
      cachedPositions = cached;
      frozen = true;
      _positionsVersion++;
    }
  }

  // ---- Spawn Worker -------------------------------------------------------
  const worker = new Worker(
    new URL("./physicsWorkerScript.ts", import.meta.url),
    { type: "module" },
  );

  // Promise that resolves when the Worker posts 'ready'
  let resolveReady: (() => void) | null = null;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data;

    switch (msg.type) {
      case "tick":
        // Cache the latest positions from the Worker
        _cachedXyz = msg.xyz;
        _positionsVersion = msg.version;
        break;

      case "frozen": {
        // Simulation settled — save to DuckDB cache on main thread
        frozen = true;
        if (usePositionsCache) {
          const frozenXyz: Float32Array = msg.xyz;
          const frozenSliders: Record<string, number> = msg.sliders;
          const key = hashNodeSetAndSliders(nodeIds, frozenSliders);
          void (async () => {
            try {
              const { connection: conn } = await getDuckDbClient();
              await savePositions(conn, key, nodeIds, frozenXyz);
            } catch {
              /* ignore cache save failures */
            }
          })();
        }
        break;
      }

      case "ready":
        resolveReady?.();
        resolveReady = null;
        break;
    }
  };

  // ---- Serialize targets for transfer -------------------------------------
  // TargetArrays contain Float32Arrays which are Transferable
  const serializedTargets: Record<string, { x: Float32Array; y: Float32Array; z: Float32Array }> = {};
  const transferList: Transferable[] = [];

  for (const dimId of dimNames) {
    const t = targets[dimId];
    if (!t) continue;
    // Copy the arrays so the main thread retains read access to targets
    const xCopy = new Float32Array(t.x);
    const yCopy = new Float32Array(t.y);
    const zCopy = new Float32Array(t.z);
    serializedTargets[dimId] = { x: xCopy, y: yCopy, z: zCopy };
    transferList.push(xCopy.buffer as ArrayBuffer, yCopy.buffer as ArrayBuffer, zCopy.buffer as ArrayBuffer);
  }

  // Copy dimWeights for transfer
  const serializedWeights: Record<string, Float32Array> = {};
  for (const [dimId, w] of Object.entries(dimWeights)) {
    const wCopy = new Float32Array(w);
    serializedWeights[dimId] = wCopy;
    transferList.push(wCopy.buffer as ArrayBuffer);
  }

  // Transfer cached positions if available
  let cachedForTransfer: Float32Array | undefined;
  if (cachedPositions) {
    cachedForTransfer = new Float32Array(cachedPositions);
    transferList.push(cachedForTransfer.buffer as ArrayBuffer);
  }

  worker.postMessage(
    {
      type: "init",
      nodeCount: n,
      targetDimIds: dimNames,
      targets: serializedTargets,
      initialSliders,
      dimWeights: serializedWeights,
      cachedPositions: cachedForTransfer,
    },
    transferList,
  );

  await readyPromise;

  // ---- PhysicsLayer interface ---------------------------------------------

  const layer: PhysicsLayer = {
    get alphaMask(): Float32Array {
      return _alphaMask;
    },

    get maskVersion(): number {
      return _maskVersion;
    },

    get positionsVersion(): number {
      return _positionsVersion;
    },

    get frozen(): boolean {
      return frozen;
    },

    updateSliders(values: Record<string, number>): void {
      _sliders = { ..._sliders, ...values };
      frozen = false; // optimistic — Worker will confirm
      worker.postMessage({ type: "updateSliders", values });
    },

    setActiveInput(active: boolean): void {
      worker.postMessage({ type: "setActiveInput", active });
    },

    setMask(predicate: (nodeIndex: number) => number): void {
      // PHYS-04: mask bus is physics-independent, stays on main thread
      for (let i = 0; i < _alphaMask.length; i++) {
        _alphaMask[i] = predicate(i);
      }
      _maskVersion++;
    },

    getPositions(): Float32Array {
      // Return a copy of the cached positions (same semantics as the direct impl)
      return new Float32Array(_cachedXyz);
    },

    getTargets(): TargetArrays {
      return targets;
    },

    getDimWeights(): Record<string, Float32Array> {
      return dimWeights;
    },

    getSliders(): Record<string, number> {
      return { ..._sliders };
    },

    syncPositions(xyz: Float32Array): void {
      const expected = n * 3;
      if (xyz.length !== expected) {
        throw new Error(
          `physicsLayerWorker.syncPositions: length mismatch (got ${xyz.length}, expected ${expected})`,
        );
      }
      // Update local cache immediately
      _cachedXyz = new Float32Array(xyz);
      _positionsVersion++;
      // Transfer a copy to the Worker
      const xyzCopy = new Float32Array(xyz);
      worker.postMessage(
        { type: "syncPositions", xyz: xyzCopy },
        [xyzCopy.buffer as ArrayBuffer],
      );
    },

    dispose(): void {
      worker.postMessage({ type: "dispose" });
      worker.terminate();
    },
  };

  return layer;
}
