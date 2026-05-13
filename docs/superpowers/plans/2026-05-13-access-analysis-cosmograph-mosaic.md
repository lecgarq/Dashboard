# Access Analysis Spatial Graph — Cosmograph 2.0 / Mosaic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render 24,285 (user, project) instances at 30–60 FPS on Intel iGPU by replacing the failing JS-side cosmos.gl warmup+freeze with the DuckDB-Wasm → Mosaic Coordinator → frozen cosmos canvas pattern that the installed stack is built for.

**Architecture:** Four-layer split. DuckDB-Wasm holds Arrow tables as the single source of truth (including a new `positions` table cached after the one-time layout warmup). A `@uwdata/mosaic-core` `Coordinator` owns a shared `Selection` driven by sidebar `@uwdata/vgplot` histograms, a polygonal lasso, and node clicks. The cosmos canvas is a custom `MosaicClient` that converts selection updates into an alpha mask — positions never change after warmup.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · `@cosmos.gl/graph@3.0.0-beta.9` · `@duckdb/duckdb-wasm@^1.33` · `apache-arrow@^17` · `@uwdata/mosaic-core@^0.25` · `@uwdata/mosaic-sql@^0.25` · `@uwdata/vgplot@^0.25` · `@sqlrooms/mosaic@^0.28` · Vitest

**Reference spec:** `docs/superpowers/specs/2026-05-13-access-analysis-cosmograph-mosaic-design.md` (commit `490b266`).

---

## Pre-flight (Task 0)

Before any code changes, confirm the working tree and dev environment are sane.

**Files:** none modified

- [ ] **Step 1: Confirm branch, clean tree on relevant files**

Run:
```bash
git status -s app/ docs/ lib/
```

Expected: only the spec file and unrelated existing changes. No conflicting in-flight edits to `app/(dashboard)/users/`.

- [ ] **Step 2: Confirm dependencies are installed**

Run:
```bash
node -e "console.log(require('@uwdata/mosaic-core/package.json').version, require('@sqlrooms/mosaic/package.json').version, require('@cosmos.gl/graph/package.json').version)"
```

Expected output (versions may be patch-newer):
```
0.25.x 0.28.x 3.0.0-beta.9
```

- [ ] **Step 3: Confirm dev server starts and the Spatial Graph tab renders (even if 1 FPS)**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/users`, click **Spatial Graph** tab. Verify the FPS HUD shows ≥0 (any number means the renderer is alive) and the canvas paints at least one frame.

- [ ] **Step 4: No commit (read-only sanity check)**

---

## Task 1 — Mosaic Coordinator React context

Set up the Coordinator + shared Selection once at the page level so every subsequent task can read them from context.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx`
- Create: `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.test.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx` (wrap root)

**Read first** (~5 min): `node_modules/@uwdata/mosaic-core/dist/src/Coordinator.d.ts` to learn the `Coordinator` constructor + `databaseConnector()` setter, and `Selection.crossfilter()` factory.

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.test.tsx`:

```tsx
import { render, renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Selection } from "@uwdata/mosaic-core";
import {
  MosaicCoordinatorProvider,
  useMosaicCoordinator,
  useMosaicSelection,
} from "./MosaicCoordinatorContext";

vi.mock("./duckdbClient", () => ({
  getDuckDbClient: vi.fn().mockResolvedValue({
    db: {},
    connection: {
      query: vi.fn().mockResolvedValue({ toArray: () => [] }),
    },
  }),
}));

describe("MosaicCoordinatorProvider", () => {
  it("exposes a Coordinator and a shared crossfilter Selection", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MosaicCoordinatorProvider>{children}</MosaicCoordinatorProvider>
    );

    const coordHook = renderHook(() => useMosaicCoordinator(), { wrapper });
    const selHook = renderHook(() => useMosaicSelection(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(coordHook.result.current).not.toBeNull();
    expect(selHook.result.current).toBeInstanceOf(Selection);
  });

  it("throws if hooks are used outside the provider", () => {
    expect(() => renderHook(() => useMosaicCoordinator())).toThrow(
      /MosaicCoordinatorProvider/,
    );
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.test.tsx
```

Expected: FAIL with `Cannot find module './MosaicCoordinatorContext'`.

- [ ] **Step 3: Implement the provider + hooks**

Create `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Coordinator, Selection } from "@uwdata/mosaic-core";
import { getDuckDbClient } from "./duckdbClient";

interface MosaicContextValue {
  coordinator: Coordinator | null;
  selection: Selection;
}

const Ctx = createContext<MosaicContextValue | null>(null);

export function MosaicCoordinatorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const selection = useMemo(() => Selection.crossfilter(), []);

  useEffect(() => {
    let cancelled = false;
    const c = new Coordinator();
    (async () => {
      const { connection } = await getDuckDbClient();
      // Mosaic Connector adapter — minimal shape: query(sql) returning Arrow.
      c.databaseConnector({
        query: async (query) => {
          // query is { type: 'arrow' | 'json' | 'exec', sql: string }
          if (query.type === "exec") {
            await connection.query(query.sql);
            return undefined;
          }
          const result = await connection.query(query.sql);
          return query.type === "json" ? result.toArray() : result;
        },
      });
      if (!cancelled) setCoordinator(c);
    })().catch((err) => {
      console.error("[Mosaic] coordinator init failed:", err);
    });
    return () => {
      cancelled = true;
      c.clear();
    };
  }, []);

  const value = useMemo<MosaicContextValue>(
    () => ({ coordinator, selection }),
    [coordinator, selection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMosaicCoordinator(): Coordinator | null {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useMosaicCoordinator must be used inside MosaicCoordinatorProvider");
  }
  return v.coordinator;
}

export function useMosaicSelection(): Selection {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useMosaicSelection must be used inside MosaicCoordinatorProvider");
  }
  return v.selection;
}
```

- [ ] **Step 4: Run test — expect pass**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Wrap `AccessAnalysisPage` with the provider**

In `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx`, find the `export function AccessAnalysisPage()` and wrap the returned JSX:

Replace:
```tsx
  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[720px] flex-col bg-background">
```

With:
```tsx
import { MosaicCoordinatorProvider } from "./MosaicCoordinatorContext";

// ...inside the component, replace the outer <div ...> with:
  return (
    <MosaicCoordinatorProvider>
    <div className="flex h-[calc(100vh-4rem)] min-h-[720px] flex-col bg-background">
```

And close `</MosaicCoordinatorProvider>` after the matching `</div>` at the end.

- [ ] **Step 6: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: 0 errors. If mosaic-core typings expose `databaseConnector` differently, adapt the call signature — the `Connector` interface in `node_modules/@uwdata/mosaic-core/dist/src/connectors/Connector.d.ts` is the source of truth.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx \
        app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.test.tsx \
        app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): Mosaic Coordinator + crossfilter Selection context"
```

---

## Task 2 — Positions cache (DuckDB round-trip)

The performance win comes from computing the 24k positions exactly once. This module owns the `positions` table and a hash-keyed cache so reloads skip the warmup.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/positionsCache.ts`
- Create: `app/(dashboard)/users/access-analysis/positionsCache.test.ts`

- [ ] **Step 1: Write the failing test (pure logic only — no DuckDB yet)**

Create `app/(dashboard)/users/access-analysis/positionsCache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashNodeSet, packPositions, unpackPositions } from "./positionsCache";

describe("hashNodeSet", () => {
  it("is order-independent", () => {
    expect(hashNodeSet(["a", "b", "c"])).toEqual(hashNodeSet(["c", "a", "b"]));
  });
  it("differs when the set differs by one element", () => {
    expect(hashNodeSet(["a", "b", "c"])).not.toEqual(hashNodeSet(["a", "b", "d"]));
  });
  it("is stable across calls (deterministic)", () => {
    const h1 = hashNodeSet(["foo", "bar"]);
    const h2 = hashNodeSet(["foo", "bar"]);
    expect(h1).toBe(h2);
  });
});

describe("packPositions / unpackPositions", () => {
  it("round-trips a Float32Array of (x, y) pairs", () => {
    const ids = ["a", "b", "c"];
    const xy = new Float32Array([1, 2, 3, 4, 5, 6]);
    const rows = packPositions(ids, xy);
    expect(rows).toEqual([
      { node_id: "a", x: 1, y: 2 },
      { node_id: "b", x: 3, y: 4 },
      { node_id: "c", x: 5, y: 6 },
    ]);

    const back = unpackPositions(rows, ids);
    expect(Array.from(back)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("handles rows in a different order than ids", () => {
    const rows = [
      { node_id: "b", x: 3, y: 4 },
      { node_id: "a", x: 1, y: 2 },
    ];
    const xy = unpackPositions(rows, ["a", "b"]);
    expect(Array.from(xy)).toEqual([1, 2, 3, 4]);
  });

  it("returns null when a required id is missing from rows", () => {
    const rows = [{ node_id: "a", x: 1, y: 2 }];
    expect(unpackPositions(rows, ["a", "b"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/positionsCache.test.ts
```

Expected: FAIL with `Cannot find module './positionsCache'`.

- [ ] **Step 3: Implement the pure logic + DuckDB helpers**

Create `app/(dashboard)/users/access-analysis/positionsCache.ts`:

```ts
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface PositionRow {
  node_id: string;
  x: number;
  y: number;
}

/**
 * Stable, order-independent 32-bit FNV-1a-derived hex hash of a node id set.
 * Used as a cache key: when the set of (user, project) instance ids changes,
 * the cached positions are invalidated automatically.
 */
export function hashNodeSet(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  let h = 0x811c9dc5;
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function packPositions(ids: readonly string[], xy: Float32Array): PositionRow[] {
  if (xy.length !== ids.length * 2) {
    throw new Error(`packPositions: xy length ${xy.length} != 2 * ids.length ${ids.length}`);
  }
  const rows: PositionRow[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    rows[i] = { node_id: ids[i], x: xy[i * 2], y: xy[i * 2 + 1] };
  }
  return rows;
}

export function unpackPositions(
  rows: readonly PositionRow[],
  ids: readonly string[],
): Float32Array | null {
  const map = new Map<string, PositionRow>();
  for (const row of rows) map.set(row.node_id, row);
  const xy = new Float32Array(ids.length * 2);
  for (let i = 0; i < ids.length; i++) {
    const row = map.get(ids[i]);
    if (!row) return null;
    xy[i * 2] = row.x;
    xy[i * 2 + 1] = row.y;
  }
  return xy;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS positions (
    node_id TEXT PRIMARY KEY,
    set_hash TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS positions_set_hash_idx ON positions(set_hash);
`;

export async function ensurePositionsSchema(conn: AsyncDuckDBConnection): Promise<void> {
  for (const stmt of SCHEMA_SQL.split(";")) {
    const sql = stmt.trim();
    if (sql) await conn.query(sql);
  }
}

export async function loadCachedPositions(
  conn: AsyncDuckDBConnection,
  setHash: string,
  ids: readonly string[],
): Promise<Float32Array | null> {
  const result = await conn.query(
    `SELECT node_id, x, y FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`,
  );
  const rows = result.toArray() as PositionRow[];
  if (rows.length !== ids.length) return null;
  return unpackPositions(rows, ids);
}

export async function savePositions(
  conn: AsyncDuckDBConnection,
  setHash: string,
  ids: readonly string[],
  xy: Float32Array,
): Promise<void> {
  await conn.query(`DELETE FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`);
  const rows = packPositions(ids, xy);
  // DuckDB-Wasm batch insert via a prepared statement is cleaner; for clarity
  // we use a single INSERT INTO ... VALUES expression chunked to avoid
  // exceeding the statement size limit.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice
      .map(
        (r) =>
          `('${r.node_id.replace(/'/g, "''")}', '${setHash}', ${r.x}, ${r.y})`,
      )
      .join(",");
    await conn.query(
      `INSERT INTO positions (node_id, set_hash, x, y) VALUES ${values}`,
    );
  }
}
```

- [ ] **Step 4: Run test — expect pass**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/positionsCache.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/users/access-analysis/positionsCache.ts \
        app/(dashboard)/users/access-analysis/positionsCache.test.ts
git commit -m "feat(access-analysis): positions cache (hash + Float32 pack/unpack + DuckDB schema)"
```

---

## Task 3 — Cosmos warmup → freeze sequence in AccUsersGraph

The biggest single-task FPS win. Replace the current "let sim run forever from a static seed" path with: load cached positions if available, otherwise warm up the sim for 2 seconds, capture positions, save to DuckDB, then never tick the sim again.

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (specifically the cosmos init block at lines ~1580–1660, the "cosmos-create.then" branch)
- Reference (do not modify): `node_modules/@cosmos.gl/graph/dist/index.d.ts` for `setPointPositions`, `getPointPositions`, `pause`, `render`, `setPointClusters`.

**Read first** (~5 min):
- `app/(dashboard)/users/AccUsersGraph.tsx:1570–1660` to see the current init path.
- `node_modules/@cosmos.gl/graph/dist/index.d.ts:113–141`, `:318`, `:351`, `:530–561` for the cosmos lifecycle API.

- [ ] **Step 1: Identify the init block to replace**

Open `app/(dashboard)/users/AccUsersGraph.tsx`. Find the `cosmosRendererRef.current = renderer` line (around line 1589). The following block (down to `// Apply the current slider values immediately…`, ~line 1656) is the init logic this task rewrites.

- [ ] **Step 2: Add a helper function above the component (after existing imports)**

Insert near the top of the file (after the existing `import` block):

```ts
import {
  ensurePositionsSchema,
  hashNodeSet,
  loadCachedPositions,
  savePositions,
} from "./access-analysis/positionsCache";
import { getDuckDbClient } from "./access-analysis/duckdbClient";

async function loadOrComputePositions(
  renderer: { getPointPositions(): number[] },
  nodeIds: string[],
  warmupMs: number,
  onWarmupTick: () => void,
): Promise<Float32Array> {
  const { connection } = await getDuckDbClient();
  await ensurePositionsSchema(connection);
  const setHash = hashNodeSet(nodeIds);
  const cached = await loadCachedPositions(connection, setHash, nodeIds);
  if (cached) return cached;

  // No cache: let the warmup loop tick for `warmupMs`, then snapshot.
  await new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      onWarmupTick();
      if (performance.now() - start >= warmupMs) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  const fresh = Float32Array.from(renderer.getPointPositions());
  await savePositions(connection, setHash, nodeIds, fresh);
  return fresh;
}
```

- [ ] **Step 3: Rewrite the post-create branch**

Replace the existing block (from line ~1607 `if (usePhysicsRef.current) {` down to ~line 1656 `renderer.setSimulationConfig(...)`) with this:

```ts
        // The simulation runs ONCE during warmup, then is permanently frozen.
        // Subsequent reloads skip the warmup by reading positions from DuckDB.
        organicWorkerRef.current?.postMessage({ type: "pause", paused: true });
        usePhysicsRef.current = true; // cosmos owns positions

        const nodeIds = nodesRef.current.map((n) => n.id);
        if (nodeIds.length === 0) {
          // Empty data path — nothing to warm up.
          renderer.setSimulationConfig({ ...DEFAULT_SIM_CONFIG });
          markGraphDirty();
        } else {
          // Push the precomputed cache as the initial seed so frame 1 is recognizable.
          if (posRef.current.length > 0) renderer.setInitialPositions(posRef.current);

          const clusterIds = buildClusterIdsFromNodes(nodesRef.current, "project");
          if (clusterIds.length > 0) renderer.setPointClusters(clusterIds);

          // Topology links (Phase 7 plan 07-06 path).
          if (nodeIndexMapRef.current.size > 0) {
            const topology = buildExtendedTopology(nodesRef.current);
            linksRef.current = projectTopologyLinksToIndexPairs(
              topology.links,
              nodeIndexMapRef.current,
              { linkColor: colorForTopologyLink },
            );
          }
          renderer.setSimulationConfig(controlsToSimulationConfig(graphControlsRef.current));

          // Warmup or restore from cache.
          loadOrComputePositions(
            renderer,
            nodeIds,
            2000, // ms of sim before snapshot
            () => markGraphDirty(),
          )
            .then((xy) => {
              renderer.setPointPositions(xy, /* dontRescale */ true);
              renderer.pause(); // stop the force tick; render(0) per frame from here on
              markGraphDirty();
              resetStability();
              if (perfHudEnabled) {
                console.log(
                  "[cosmos] frozen at",
                  xy.length / 2,
                  "nodes; positions cached:",
                  hashNodeSet(nodeIds),
                );
              }
            })
            .catch((err) => {
              console.error("[cosmos] warmup/restore failed:", err);
            });
        }
```

- [ ] **Step 4: Update the RAF render loop to call `render(0)` not `render()` after pause**

Find the rAF tick (search for `renderer.render(` in the same file). The current code may call `renderer.render()` with no arg. After pause, we must pass `0` so cosmos does not advance the sim. Modify the render call:

```ts
// Before:
//   renderer.render();
// After:
   const isFrozen = (renderer as { isSimulationRunning?: () => boolean }).isSimulationRunning?.() === false;
   renderer.render(isFrozen ? 0 : undefined);
```

If `isSimulationRunning` is not on the public surface, add a state ref instead:

```ts
const isFrozenRef = useRef(false);
// set isFrozenRef.current = true inside loadOrComputePositions.then(...) above
// then in the RAF tick:
renderer.render(isFrozenRef.current ? 0 : undefined);
```

- [ ] **Step 5: Manual UAT — measure FPS at idle**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/users`, click **Spatial Graph**, wait for the warmup (~2s shows the sim animating), then watch the FPS HUD for 10 seconds at idle.

Expected: FPS climbs to ≥30 on Intel iGPU, stays steady. Sim α reads near 0 once frozen (consistent with the inverted alpha note in your memory `[Cosmos alpha inversion]`).

- [ ] **Step 6: Manual UAT — reload uses cache**

Hard-reload the page (Ctrl+Shift+R). Expected: graph appears within ~500ms (no 2s warmup). The cached positions are reused.

- [ ] **Step 7: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(graph): warmup-then-freeze cosmos sim, cache positions in DuckDB"
```

---

## Task 4 — `CosmosCanvasClient` (MosaicClient subclass)

This is the bridge between Mosaic Selection updates and the cosmos alpha buffer. When the selection changes, this client receives a list of matching `node_id`s and dims everything else.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts`
- Create: `app/(dashboard)/users/access-analysis/CosmosCanvasClient.test.ts`
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (register the client on mount)

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/users/access-analysis/CosmosCanvasClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Selection } from "@uwdata/mosaic-core";
import { CosmosCanvasClient } from "./CosmosCanvasClient";

function makeHandle(nodeIds: string[]) {
  return {
    nodeIds,
    setAlphaMask: vi.fn(),
  };
}

describe("CosmosCanvasClient", () => {
  it("builds an alpha mask: 1.0 for selected, 0.15 for unselected", () => {
    const handle = makeHandle(["a", "b", "c", "d"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });

    client.queryResult({ toArray: () => [{ node_id: "b" }, { node_id: "d" }] });

    expect(handle.setAlphaMask).toHaveBeenCalledTimes(1);
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    expect(Array.from(mask)).toEqual([0.15, 1.0, 0.15, 1.0]);
  });

  it("dims everything when the selection result is empty", () => {
    const handle = makeHandle(["a", "b"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });
    client.queryResult({ toArray: () => [] });
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    expect(Array.from(mask)).toEqual([0.15, 0.15]);
  });

  it("returns full opacity when the selection has no clauses (idle state)", () => {
    const handle = makeHandle(["a", "b"]);
    const sel = Selection.crossfilter();
    const client = new CosmosCanvasClient({ handle, selection: sel, sourceTable: "user_projects" });
    // Mosaic calls queryResult with all rows when no filter is active.
    client.queryResult({ toArray: () => [{ node_id: "a" }, { node_id: "b" }] });
    const mask = handle.setAlphaMask.mock.calls[0][0] as Float32Array;
    expect(Array.from(mask)).toEqual([1.0, 1.0]);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/CosmosCanvasClient.test.ts
```

Expected: FAIL with `Cannot find module './CosmosCanvasClient'`.

- [ ] **Step 3: Implement the client**

Create `app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts`:

```ts
import { MosaicClient, Selection } from "@uwdata/mosaic-core";
import { Query } from "@uwdata/mosaic-sql";

export interface CosmosCanvasHandle {
  /** Ordered array of node ids matching cosmos's point index space. */
  readonly nodeIds: readonly string[];
  /** Applies an alpha mask aligned with nodeIds. */
  setAlphaMask(mask: Float32Array): void;
}

export interface CosmosCanvasClientOptions {
  handle: CosmosCanvasHandle;
  selection: Selection;
  /** DuckDB table that contains a `node_id` column. */
  sourceTable: string;
}

const DIM_ALPHA = 0.15;
const LIT_ALPHA = 1.0;

export class CosmosCanvasClient extends MosaicClient {
  private readonly handle: CosmosCanvasHandle;
  private readonly source: string;

  constructor(options: CosmosCanvasClientOptions) {
    super(options.selection);
    this.handle = options.handle;
    this.source = options.sourceTable;
  }

  query(filter?: unknown) {
    // Always return the matching node_ids; alpha mask diffs against handle.nodeIds.
    const q = Query.from(this.source).select({ node_id: "node_id" }).distinct();
    if (filter) q.where(filter as never);
    return q;
  }

  queryResult(data: unknown): this {
    const rows = ((data as { toArray?: () => Array<{ node_id: string }> })?.toArray?.() ?? []) as Array<{
      node_id: string;
    }>;
    const lit = new Set<string>();
    for (const row of rows) lit.add(row.node_id);

    const mask = new Float32Array(this.handle.nodeIds.length);
    for (let i = 0; i < this.handle.nodeIds.length; i++) {
      mask[i] = lit.has(this.handle.nodeIds[i]) ? LIT_ALPHA : DIM_ALPHA;
    }
    this.handle.setAlphaMask(mask);
    return this;
  }
}
```

- [ ] **Step 4: Run test — expect pass**

Run:
```bash
npx vitest run app/(dashboard)/users/access-analysis/CosmosCanvasClient.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Add an alpha buffer to cosmos in `AccUsersGraph.tsx`**

Above the component body, near other refs, add:
```ts
const alphaBufRef = useRef<Float32Array | null>(null);
```

In the cosmos init block (next to `setPointPositions`), add a per-frame alpha override. Find the existing per-point color buffer (`buildNodeColorBuffer` call) and patch it to consume the alpha buffer:

```ts
// After setPointPositions(xy, true):
const handle = {
  nodeIds: nodesRef.current.map((n) => n.id),
  setAlphaMask: (mask: Float32Array) => {
    alphaBufRef.current = mask;
    markGraphDirty();
  },
};
cosmosCanvasHandleRef.current = handle;
```

In the RAF tick where colors are built per frame, multiply the alpha channel by the mask before pushing to cosmos:

```ts
if (alphaBufRef.current) {
  const colors = buildNodeColorBuffer(/* existing args */);
  const mask = alphaBufRef.current;
  for (let i = 0; i < mask.length; i++) {
    colors[i * 4 + 3] *= mask[i]; // 4 components per point: r,g,b,a
  }
  renderer.setPointColors(colors);
}
```

- [ ] **Step 6: Register the client when both the handle and the coordinator are ready**

Add a `useEffect` near the bottom of `AccUsersGraph` (assumes the component is wrapped in `MosaicCoordinatorProvider`):

```ts
import { CosmosCanvasClient } from "./access-analysis/CosmosCanvasClient";
import { useMosaicCoordinator, useMosaicSelection } from "./access-analysis/MosaicCoordinatorContext";

// inside the component:
const coordinator = useMosaicCoordinator();
const selection = useMosaicSelection();

useEffect(() => {
  if (!coordinator) return;
  const handle = cosmosCanvasHandleRef.current;
  if (!handle) return;
  const client = new CosmosCanvasClient({
    handle,
    selection,
    sourceTable: "user_projects",
  });
  coordinator.connect(client);
  return () => coordinator.disconnect(client);
}, [coordinator, selection, cosmosReady]);
```

- [ ] **Step 7: Manual UAT — alpha mask round-trip**

Run `npm run dev`. In the dev tools console:
```js
const { Selection } = await import("@uwdata/mosaic-core");
// Find the Selection on window (you'll wire this up; for now: read from the React DevTools tree).
```

For this iteration, manual verification is: confirm the dev server starts, no console errors on opening Spatial Graph, and the graph renders the same as Task 3. Crossfilter wiring is verified in Task 5 once a histogram exists.

- [ ] **Step 8: Type-check + commit**

```bash
npx tsc --noEmit
git add app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts \
        app/(dashboard)/users/access-analysis/CosmosCanvasClient.test.ts \
        app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(access-analysis): CosmosCanvasClient (MosaicClient → alpha mask)"
```

---

## Task 5 — First histogram (Project Membership) via VgPlotChart

Replace one of the existing five `ChartPanel` rows in the sidebar with a real Mosaic histogram. Once this works, Tasks 8 migrate the remaining four with the same pattern.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/HistogramPanel.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx` (replace the Project Membership panel)

- [ ] **Step 1: Implement `HistogramPanel` wrapping `VgPlotChart`**

Create `app/(dashboard)/users/access-analysis/HistogramPanel.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Selection, Spec, VgPlotChart, vg } from "@sqlrooms/mosaic";
import { useMosaicSelection } from "./MosaicCoordinatorContext";

export interface HistogramPanelProps {
  title: string;
  /** DuckDB table to query. */
  table: string;
  /** Column to group by on the X axis. */
  groupBy: string;
  /** Optional alias / display label for the column. */
  groupLabel?: string;
  /** Aggregation expression; default is `count_distinct(user_id)`. */
  agg?: string;
  /** Max bars to render. */
  topN?: number;
  /** Optional override for the shared selection. */
  selection?: Selection;
}

export function HistogramPanel({
  title,
  table,
  groupBy,
  groupLabel,
  agg = "count(distinct user_id)",
  topN = 20,
  selection,
}: HistogramPanelProps) {
  const sharedSelection = useMosaicSelection();
  const sel = selection ?? sharedSelection;

  const spec = useMemo<Spec>(
    () =>
      vg.plot(
        vg.barX(
          vg.from(table, { filterBy: sel }),
          {
            x: vg.sum(agg),
            y: groupBy,
            fill: "steelblue",
            sort: { y: "-x", limit: topN },
          },
        ),
        vg.toggleY({ as: sel, channels: ["y"] }),
        vg.marginLeft(120),
        vg.height(Math.min(40 + topN * 18, 460)),
        vg.style({ fontSize: "11px" }),
      ),
    [table, groupBy, agg, topN, sel],
  );

  return (
    <section className="min-h-[160px] rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {groupLabel && <span className="text-[10px] text-muted-foreground">{groupLabel}</span>}
      </div>
      <VgPlotChart spec={spec} />
    </section>
  );
}
```

- [ ] **Step 2: Replace the Project Membership `ChartPanel` in `AccessAnalysisPage.tsx`**

Find the `<ChartPanel title="Project Membership" ... />` element and replace it with:

```tsx
<HistogramPanel
  title="Project Membership"
  table="user_projects"
  groupBy="project_name"
  groupLabel="users per project"
  topN={20}
/>
```

Import at the top:
```tsx
import { HistogramPanel } from "./HistogramPanel";
```

- [ ] **Step 3: Manual UAT — crossfilter round-trip**

Run `npm run dev`. Open Spatial Graph. The Project Membership panel should now show a horizontal bar chart driven by DuckDB. Click a bar.

Expected:
- The bar visibly toggles selected/unselected.
- The cosmos canvas dims unselected nodes; selected (project's user instances) light up.
- Click the same bar again: full opacity returns.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add app/(dashboard)/users/access-analysis/HistogramPanel.tsx \
        app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx
git commit -m "feat(access-analysis): first Mosaic histogram (Project Membership) wired to canvas"
```

---

## Task 6 — Cluster centroid annotations

The graph is more legible with a project name floating at the center of each cluster.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/clusterAnnotations.tsx`
- Create: `app/(dashboard)/users/access-analysis/clusterAnnotations.test.ts`
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (render the overlay)

- [ ] **Step 1: Write the failing test (pure centroid math)**

Create `app/(dashboard)/users/access-analysis/clusterAnnotations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeCentroidsFromMemory } from "./clusterAnnotations";

describe("computeCentroidsFromMemory", () => {
  it("groups (node_id, cluster) by cluster and averages x/y", () => {
    const result = computeCentroidsFromMemory([
      { node_id: "a", cluster: "P1", label: "ProjA", x: 0, y: 0 },
      { node_id: "b", cluster: "P1", label: "ProjA", x: 10, y: 20 },
      { node_id: "c", cluster: "P2", label: "ProjB", x: 100, y: 100 },
    ]);
    expect(result).toEqual([
      { cluster: "P1", label: "ProjA", cx: 5, cy: 10, count: 2 },
      { cluster: "P2", label: "ProjB", cx: 100, cy: 100, count: 1 },
    ]);
  });

  it("filters singletons when minMembers > 1", () => {
    const result = computeCentroidsFromMemory(
      [
        { node_id: "a", cluster: "P1", label: "ProjA", x: 0, y: 0 },
        { node_id: "b", cluster: "P2", label: "ProjB", x: 5, y: 5 },
        { node_id: "c", cluster: "P1", label: "ProjA", x: 10, y: 10 },
      ],
      3,
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run app/(dashboard)/users/access-analysis/clusterAnnotations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the centroid module + overlay component**

Create `app/(dashboard)/users/access-analysis/clusterAnnotations.tsx`:

```tsx
"use client";

import { useMemo } from "react";

export interface ClusterMemberRow {
  node_id: string;
  cluster: string;
  label: string;
  x: number;
  y: number;
}

export interface ClusterCentroid {
  cluster: string;
  label: string;
  cx: number;
  cy: number;
  count: number;
}

export function computeCentroidsFromMemory(
  rows: readonly ClusterMemberRow[],
  minMembers = 3,
): ClusterCentroid[] {
  const acc = new Map<string, { label: string; sx: number; sy: number; n: number }>();
  for (const row of rows) {
    const cur = acc.get(row.cluster) ?? { label: row.label, sx: 0, sy: 0, n: 0 };
    cur.sx += row.x;
    cur.sy += row.y;
    cur.n += 1;
    acc.set(row.cluster, cur);
  }
  const out: ClusterCentroid[] = [];
  for (const [cluster, v] of acc) {
    if (v.n < minMembers) continue;
    out.push({ cluster, label: v.label, cx: v.sx / v.n, cy: v.sy / v.n, count: v.n });
  }
  return out;
}

interface ClusterAnnotationsProps {
  centroids: readonly ClusterCentroid[];
  /** Convert world (cosmos) coords to screen pixels. */
  worldToScreen: (x: number, y: number) => { sx: number; sy: number };
  /** Pixel dims of the canvas — used for clipping off-screen labels. */
  width: number;
  height: number;
}

export function ClusterAnnotations({
  centroids,
  worldToScreen,
  width,
  height,
}: ClusterAnnotationsProps) {
  const items = useMemo(() => {
    return centroids
      .map((c) => {
        const { sx, sy } = worldToScreen(c.cx, c.cy);
        const fontPx = Math.max(11, Math.min(22, 11 + Math.log2(Math.max(2, c.count)) * 1.2));
        const visible = sx > -50 && sx < width + 50 && sy > -20 && sy < height + 20;
        return { ...c, sx, sy, fontPx, visible };
      })
      .filter((c) => c.visible);
  }, [centroids, worldToScreen, width, height]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {items.map((c) => (
        <span
          key={c.cluster}
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none rounded bg-white/70 px-1.5 py-0.5 font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:bg-slate-900/70 dark:text-slate-100"
          style={{ left: `${c.sx}px`, top: `${c.sy}px`, fontSize: `${c.fontPx}px` }}
        >
          {c.label}
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            {c.count.toLocaleString()}
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/(dashboard)/users/access-analysis/clusterAnnotations.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Wire centroids into `AccUsersGraph`**

After the warmup completes in Task 3's `loadOrComputePositions(...).then(...)`, query DuckDB for the centroid view and pass into the overlay:

```ts
import { ClusterAnnotations, computeCentroidsFromMemory } from "./access-analysis/clusterAnnotations";

// state:
const [centroids, setCentroids] = useState<ClusterCentroid[]>([]);

// inside .then(...) of loadOrComputePositions:
const { connection } = await getDuckDbClient();
const rows = (await connection.query(`
  SELECT
    up.node_id,
    up.project_id AS cluster,
    up.project_name AS label,
    p.x,
    p.y
  FROM user_projects up
  JOIN positions p USING (node_id)
`)).toArray() as ClusterMemberRow[];
setCentroids(computeCentroidsFromMemory(rows, 3));

// in JSX, render OVER the cosmos canvas wrapper:
<div className="relative h-full w-full">
  {/* existing canvas */}
  <ClusterAnnotations
    centroids={centroids}
    worldToScreen={(x, y) => {
      const t = cosmosRendererRef.current?.spaceToScreenPosition([x, y]);
      return t ? { sx: t[0], sy: t[1] } : { sx: -9999, sy: -9999 };
    }}
    width={canvasWidth}
    height={canvasHeight}
  />
</div>
```

- [ ] **Step 6: Manual UAT — labels appear at cluster centers**

Open Spatial Graph. Expected: ~30–50 project name labels float over the canvas, each near the centroid of its cluster. Larger projects render at larger font size.

- [ ] **Step 7: Type-check + commit**

```bash
npx tsc --noEmit
git add app/(dashboard)/users/access-analysis/clusterAnnotations.tsx \
        app/(dashboard)/users/access-analysis/clusterAnnotations.test.ts \
        app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(access-analysis): project name annotations at cluster centroids"
```

---

## Task 7 — Polygonal lasso → Mosaic Selection

The current lasso button exists in `AccUsersGraph` but isn't wired to a SQL filter. Hook it up.

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (lasso completion handler)

- [ ] **Step 1: Find the existing lasso polygon completion callback**

In `AccUsersGraph.tsx`, search for `Lasso Off` button and follow the `onClick` handler — it should toggle `lassoMode` state. There's likely a polygon-completion handler that produces an array of point indices.

- [ ] **Step 2: On polygon completion, publish a selection clause**

Where the polygon-completion handler currently fires (probably calls something like `setSelectedNodes(indices)`), add:

```ts
import type { SelectionClause } from "@uwdata/mosaic-core";

// inside the polygon-complete handler:
const lassoedIds = indices.map((i) => nodesRef.current[i]?.id).filter(Boolean) as string[];
const clause: SelectionClause = {
  source: "lasso",
  schema: { type: "intersect" },
  clients: new Set(), // mosaic fills this
  value: lassoedIds,
  predicate: {
    type: "list",
    column: "node_id",
    op: "IN",
    value: lassoedIds,
  },
};
selection.update(clause);
```

Where `selection` is from `useMosaicSelection()` already wired in Task 4. The exact `SelectionClause` shape comes from `node_modules/@uwdata/mosaic-core/dist/src/SelectionClause.d.ts` — read it before coding.

- [ ] **Step 3: Manual UAT — lasso selects and dims**

Click the **Lasso Off** button to turn it on. Drag a polygon around a cluster. On release: expected — those nodes stay lit, everything else dims. Click outside the polygon: selection clears.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(access-analysis): polygonal lasso publishes a SelectionClause"
```

---

## Task 8 — Migrate the remaining four histograms

Replicate the Task 5 pattern for Role Distribution, Activity Recency, Permission Tier, and Similarity Dimensions. Each one is a single `<HistogramPanel>` swap.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx`

- [ ] **Step 1: Replace each remaining `<ChartPanel>` element**

Find each remaining ChartPanel and replace with:

```tsx
{/* Role Distribution */}
<HistogramPanel
  title="Role Distribution"
  table="user_projects"
  groupBy="role_id"
  groupLabel="users per role"
  topN={20}
/>

{/* Activity Recency — uses a computed bucket; build a view first */}
<HistogramPanel
  title="Activity Recency"
  table="user_activity_buckets"
  groupBy="bucket"
  groupLabel="users by recency"
  agg="count(distinct user_id)"
  topN={4}
/>

{/* Permission Tier */}
<HistogramPanel
  title="Permission Tier"
  table="folder_permissions"
  groupBy="perm_tier"
  agg="count(*)"
  topN={6}
/>

{/* Similarity Dimensions */}
<HistogramPanel
  title="Similarity Dimensions"
  table="similarity_edges"
  groupBy="dimension"
  agg="count(*)"
  topN={5}
/>
```

- [ ] **Step 2: Create the `user_activity_buckets` SQL view**

Add to `graphSql.ts` (or a new `views.ts`):

```ts
export async function registerActivityBucketsView(conn: AsyncDuckDBConnection): Promise<void> {
  await conn.query(`
    CREATE OR REPLACE VIEW user_activity_buckets AS
    SELECT
      email AS user_id,
      CASE
        WHEN last_sign_in IS NULL                              THEN 'No sign-in'
        WHEN epoch_ms(now()) - last_sign_in <= 30  * 86400000  THEN '0-30d'
        WHEN epoch_ms(now()) - last_sign_in <= 90  * 86400000  THEN '31-90d'
        ELSE '90d+'
      END AS bucket
    FROM users
  `);
}
```

Call this from `MosaicCoordinatorContext` after the connector is set up. Same pattern can pre-register a `user_projects_with_names` view that joins `user_projects` ↔ `projects` for the `project_name` group label.

- [ ] **Step 3: Manual UAT — all five histograms crossfilter**

Run `npm run dev`. Click bars in any combination of panels.

Expected: every click narrows the alpha mask further (intersect resolution). Multiple selections in a single panel union. Clear-all reverts to full opacity.

- [ ] **Step 4: Remove the dead `queryChartData` + `ChartPanel` definitions**

Delete `queryChartData`, `EMPTY_QUERY_STATE`, `buildFallbackState`, `ChartPanel`, and all the `fallback*` helpers from `AccessAnalysisPage.tsx`. The page is now a thin shell.

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx \
        app/(dashboard)/users/access-analysis/graphSql.ts \
        app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx
git commit -m "feat(access-analysis): migrate all five sidebar charts to Mosaic histograms"
```

---

## Task 9 — Retire dead code paths

With the Mosaic crossfilter live, the legacy JS topology + freeze-attempt branches are dead. Delete them.

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`
- Modify: `app/(dashboard)/users/cosmosUtils.ts`

- [ ] **Step 1: Remove the dual-path cosmos topology builders**

In `AccUsersGraph.tsx`, search for these symbols and remove their call sites (keep the imports only if used elsewhere; `npx tsc --noEmit` after each deletion will tell you):

- The `PATH-A` / `PATH-B` `if (perfHudEnabled) console.log("[02-05-DEBUG] cosmos-create.then: PATH-A built links...")` blocks
- Any remaining `freezeSimulation` references (the comment is now obsolete — remove)
- The Topology React filter panel section (the JSX in the sidebar that includes the View mode toggle + Show folders switch + permTier/simDim checkboxes); those responsibilities moved to Mosaic histograms

- [ ] **Step 2: Remove the per-edge color buffer plumbing (if unused)**

`projectTopologyLinksToIndexPairs(... { linkColor })` and the `buildLinkColorBuffer(... { perEdgeColors })` overrides — if no path still passes `linkColor`, drop the parameter. If any path still needs it, leave it.

- [ ] **Step 3: Verify the test suite still passes**

```bash
npx vitest run
```

Expected: green.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add app/(dashboard)/users/AccUsersGraph.tsx app/(dashboard)/users/cosmosUtils.ts
git commit -m "chore(graph): retire legacy JS topology + freeze-sim branches"
```

---

## Task 10 — Performance verification + PERF-REPORT.md

Validate that the goals are met. Document.

**Files:**
- Create: `.planning/phases/07.1-positional-only-similarity-redesign-filter-ui-reshape/MOSAIC-PERF-REPORT.md`

- [ ] **Step 1: Capture idle FPS**

Run `npm run dev`. Open Spatial Graph. Wait 10 seconds. Record the FPS HUD value 5 times at 2-second intervals.

Acceptance: median ≥30, no sample below 20.

- [ ] **Step 2: Capture selection latency**

Open Chrome DevTools Performance tab. Record a 5-second trace while clicking five different histogram bars. Measure time from click to first frame with the new alpha mask applied.

Acceptance: 5-of-5 selections complete in <150ms (target <100ms; budget allows 50ms slack).

- [ ] **Step 3: Capture cold load time**

Hard-reload with Disable Cache on. Measure `performance.timing.loadEventEnd - navigationStart` and time-to-first-cosmos-frame.

Acceptance: load ≤4s, time-to-first-cosmos-frame ≤4s.

- [ ] **Step 4: Capture warm load time (positions cached)**

Soft-reload (Ctrl+R, cache enabled). Same metrics.

Acceptance: load ≤2s, time-to-first-cosmos-frame ≤1.5s.

- [ ] **Step 5: Write the perf report**

Create `.planning/phases/07.1-positional-only-similarity-redesign-filter-ui-reshape/MOSAIC-PERF-REPORT.md` with sections:
- Hardware (GPU string, OS, browser version)
- Idle FPS (5 samples + median)
- Selection latency (5 samples + median)
- Cold load (timings)
- Warm load (timings)
- Decision line: `MOSAIC-MIGRATION-ACCEPT=APPROVED` or `MOSAIC-MIGRATION-ACCEPT=GAPS` with a list of gaps.

- [ ] **Step 6: Commit**

```bash
git add .planning/phases/07.1-positional-only-similarity-redesign-filter-ui-reshape/MOSAIC-PERF-REPORT.md
git commit -m "docs(perf): MOSAIC-PERF-REPORT for cosmograph/mosaic redesign"
```

---

## Self-review notes

**Spec coverage:**
- DuckDB / Arrow / Mosaic Coordinator / Selection / VgPlotChart wiring: Tasks 1, 4, 5, 8.
- 24k frozen positions: Tasks 2, 3.
- Annotations: Task 6.
- Lasso: Task 7.
- Dead-code retirement: Task 9.
- Perf validation: Task 10.
- No edges by default: covered by Task 9 removing the per-edge color buffer override; the default cosmos render path draws points only when `linksRef.current` is empty or `setLinks` is not called.
- Cluster-by-column: Task 3 step 3 calls `setPointClusters(clusterIds)` keyed on `project`.

**Open items (deliberately out of scope for this plan):**
- 3D rendering (deferred per spec non-goal).
- Mosaic Coordinator `databaseConnector` adapter polish (current adapter is a minimal stub; if cold-load perf is bad, refactor to use `@sqlrooms/duckdb` connector wrapper).
- The `cosmosCanvasHandleRef`, `canvasWidth`, `canvasHeight`, and `spaceToScreenPosition` symbols referenced in Tasks 4 and 6 — these exist on the cosmos renderer but the exact name may differ in beta.9. Engineer should grep the cosmos `.d.ts` for the right method (`zoomTransform`, `transformedPoint`, etc.) and adjust.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-05-13-access-analysis-cosmograph-mosaic.md`.

**Two execution options:**

1. **Subagent-Driven** *(recommended)* — A fresh subagent executes one task at a time. I review between tasks. Fast iteration, smaller blast radius.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batched checkpoints for review.

Which approach?
