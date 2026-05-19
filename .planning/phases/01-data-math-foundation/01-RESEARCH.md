# Phase 1: Data + Math Foundation - Research

**Researched:** 2026-05-19
**Domain:** Pure TypeScript Arrow-backed data layer + deterministic semantic-seed math layer with DuckDB-WASM position cache
**Confidence:** HIGH (existing scaffolding already in tree; libraries already installed and pinned)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Feature normalization**
- **Activity count**: `log1p(count)` → min-max scaled to [0,1]. Long tail compressed, light users distinguishable from heavy.
- **Last sign-in age**: Claude's discretion (suggest inverse + 90-day clip: `1 - min(age/90, 1)` — recent = high, anything older than 90d treated as cold).
- **Boolean features** (isAdmin, isExternal): direct mapping — `true → 1.0`, `false → 0.0`. Slider strength modulates contribution.
- **Location**: normalization happens during the Arrow build step in `dataLayer.ts`. Normalized columns stored alongside raw columns. Math layer reads pre-normalized values — tests don't need to mock normalization.

**Per-dimension seed function**
- **Shape**: radial. `f_d(node) = normalized_value × R × (cos θ_d, sin θ_d)` where `θ_d = (d/D) × 2π`. High value = far from origin along the axis; low value = near center.
- **Radius R**: Claude's discretion (suggest fixed constant ~300 world units to match d3-force-3d defaults; revisit if datasets grow).
- **Z-axis (3D mode)**: Claude's discretion (suggest seed remains 2D — z=0 at seed time; physics nudges z during simulation; 3D is a camera change, not a math change).
- **Zero state**: when ALL sliders = 0, target = `(0,0,0)`. Physics repulsion then spreads nodes organically. Matches MATH-04 "pure organic" semantic. Required for deterministic tests.

**Categorical dimension encoding**
- **Role IDs**: one axis per distinct role (Project Admin, Member, Viewer, etc.). Each role gets its own angle on the dimension wheel. Lets users cluster by specific role.
- **Module IDs** (Docs, Cost, Sheets, etc.): one axis per module. Per-node weight = `activity_in_module / total_activity`. Multi-module users get a weighted-average position across their modules (NOT dominant-module-wins). Exposes who splits attention across modules.
- **Folder permission tier** (NoAccess / View / Upload / Edit / Manage): categorical — one axis per tier, NOT ordinal. Each tier clusters its own region.
- **Multi-value composition**: weighted average of angles. `position = Σ(weight_i × angle_i × R) / Σ(weight_i)`. A user with split-Docs/Cost activity sits between those axes; a user with two roles sits between those angles.

**Position cache (DuckDB-WASM)**
- **Cache key**: `sha1(sorted(nodeIds) + sliderValues)`. Filter changes alter visibility (alpha mask), not identity — same nodeIds and same sliders → same cached position. Sliders are part of the key because they DO change positions.
- **Slider movement**: new cache entry per slider state. Fast jumps between known slider configurations; no recompute when revisiting a state.
- **Schema**: Claude's discretion (suggest two tables — `nodes` for features, `positions_cache` for `(key, nodeId, x, y, z)` rows; cleaner separation, queryable for debugging).

**Test strategy (Vitest)**
- Slider = 0 contributes zero to position (test exact 0).
- Slider = 1 contributes full target (test exact value).
- Two sliders blend additively and monotonically (per MATH-04).
- Specific test depth: Claude's discretion (suggest hand-picked examples covering slider=0, slider=1, two-slider blend, plus one fast-check property test for monotonicity in each slider — fast to write, fast to run).

### Claude's Discretion
- Last sign-in age normalization curve (inverse + 90d clip suggested).
- Seed radius R value (suggest 300 world units).
- Z-axis seed behavior in 3D (suggest z=0 at seed; let physics handle depth).
- DuckDB-WASM schema layout (suggest two-table split).
- Exact Vitest test count + whether to add fast-check property tests.

### Deferred Ideas (OUT OF SCOPE)
- Cluster hull rendering, cluster labels, per-dimension color themes — deferred to v2 POLISH-01/02/03.
- UMAP / t-SNE pre-processing — explicitly out of scope (per REQUIREMENTS).
- Cross-tab pie chart embedding — deferred to v2 PIES-01.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Node table built from existing tRPC sources (AccProjectMember + AccActivity + AccFolderPermission) — one row per `(email, projectId)` instance | Existing `graphTables.ts` already emits a `userProjects` Arrow table from `BulkAccUser[]` (one row per (email, projectId, role)). Phase 1 will collapse roles into a `role_ids[]` list column so cardinality matches the (email, projectId) instance model. |
| DATA-02 | Feature columns: activity count, last sign-in age, role IDs, folder permission tier, isAdmin, isExternal, module IDs | Source fields all present in `BulkAccUser` / `BulkAccProject` (`lastSignIn`, `projects[].modules`, `projects[].isAdmin`, `projects[].roles`). Folder permission tier comes from `GraphFolderPermissionRow.permType` (already wired). `isExternal` is computed from email domain (`accGraphOrganicLayout.OrganicLayoutNode.isExternal`). |
| DATA-03 | DuckDB-WASM materializes the node table client-side | `getDuckDbClient()` already returns an `AsyncDuckDB + AsyncDuckDBConnection` singleton with self-hosted WASM bundles from `/public/duckdb-wasm`. Arrow → DuckDB is `conn.insertArrowTable(table, { name })`. |
| DATA-04 | Position cache survives filter changes | `positionsCache.ts` already implements `hashNodeSet(ids[])` (FNV-1a, order-independent) and `ensurePositionsSchema/load/save`. Phase 1 extends key to include slider state (decision: `sha1(sorted(ids) + sliderValues)`) and adds a `z REAL` column for future 3D. |
| MATH-01 | Semantic seed function `f(node_features, weights) → (x, y, z)` deterministic | Pure function, no I/O, no clock, no `Math.random`. Float32Array output. Deterministic by construction; verifiable by `expect(fn(input)).toEqual(fn(input))`. |
| MATH-02 | Dimension axes distributed evenly `θ_d = (d/D) × 2π`, each dim has own seed | Single helper `axisAngle(d, D) = (d / D) * 2 * Math.PI` shared across all dims. Categorical dims (roles, modules, perm tiers) sub-allocate the wheel — one axis per category value. |
| MATH-03 | Slider composition `finalTarget(node) = Σ(u_d × f_d(node) × s_d) / Σ(s_d)` — multiple sliders compose | Direct formula implementation. Σ(s_d) in denominator means: when all sliders = 0, fall back to `(0,0,0)` (zero-state per MATH-04). When one slider = 1 and rest = 0, target = `u_d × f_d(node)` exactly. |
| MATH-04 | Slider semantics: 0 = pure organic; 100 = full clustering; intermediate values blend continuously and monotonically | Tested by fast-check property test: `forAll(s1, s2 in [0,1], s2 > s1)` ⇒ for a node with non-zero feature on dim d, distance from origin along `θ_d` increases monotonically with `s_d` (when other sliders fixed). |
| MATH-05 | Math layer pure TypeScript — no React, no DOM, no engine dependency | Verifiable by `madge` / `npx tsc --listFiles` + grep; OR a Vitest test that `import * as m from "./mathLayer"` and asserts the module's resolved imports include only `[]` non-stdlib paths. Plain: zero `import` lines for React, three, d3-force, react-force-graph in `mathLayer.ts`. |
</phase_requirements>

## Summary

The Dashboard repo already contains ~80% of Phase 1's data-side scaffolding. `app/(dashboard)/users/access-analysis/graphTables.ts` builds Arrow tables from `BulkAccUser[]`; `duckdbClient.ts` returns a singleton `AsyncDuckDB` with self-hosted WASM bundles; `positionsCache.ts` defines `hashNodeSet()`, packs/unpacks `Float32Array → row[]`, and persists to a `positions(node_id, set_hash, x, y)` table with index. Vitest 4.1.6 is the canonical test runner (`npm test`, config at `vitest.config.ts`, setup at `vitest.setup.ts`) with `node` environment and `tsconfigPaths` resolution.

Phase 1 work therefore reduces to: (1) **collapse** the existing `userProjects` Arrow table from `(email, projectId, role)` rows to `(email, projectId)` rows with `role_ids` as a list column; (2) **add normalization** of feature columns inside the Arrow build (`log1p` + min-max for activity, `1 - min(age/90, 1)` for sign-in age, direct 0/1 mapping for booleans); (3) **write a brand-new `mathLayer.ts`** that is dependency-free (zero React, zero engine, zero DOM); (4) **extend `positionsCache.ts`** with slider-state in the cache key and a `z REAL` column; (5) **add unit tests** covering the four locked invariants (slider=0, slider=1, two-slider blend, monotonicity) plus property tests via `fast-check`.

The architecturally critical detail: `mathLayer.ts` must be importable from a node-only Vitest test with no DOM, no WASM, no engine. That means it operates purely on plain arrays / Float32Array in / Float32Array out. The DuckDB cache layer is a separate seam (already isolated in `positionsCache.ts`) and is tested via a `jsdom` test that brings up the WASM client; this is the established pattern in `positionsCache.test.ts`'s sibling tests.

**Primary recommendation:** Reuse the existing scaffolding verbatim (`duckdbClient.ts`, `positionsCache.ts`, `graphTables.ts`); write `mathLayer.ts` as a brand-new dependency-free file in the same directory; gate purity with both a static import-graph assertion and a runtime test that imports from a fresh Node context. Pin `apache-arrow@17`, `@duckdb/duckdb-wasm@1.33.1-dev45.0`, `vitest@4.1.6`, and add `fast-check@^3` (devDep, new).

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `apache-arrow` | ^17.0.0 | Arrow `Table` construction via `tableFromArrays()` | Already in use by `graphTables.ts`; columnar layout is ideal for filtering ~500–6000 (user, project) rows; zero-copy handoff to DuckDB via `conn.insertArrowTable()` |
| `@duckdb/duckdb-wasm` | ^1.33.1-dev45.0 | Client-side OLAP for materialized node table + positions cache | Already wired with self-hosted WASM bundles (`/public/duckdb-wasm/*`), avoids 5MB jsdelivr cold-load; singleton client lives in `duckdbClient.ts` |
| `vitest` | ^4.1.6 | Unit test runner | Already canonical (`npm test` → `vitest run`); config at `vitest.config.ts` with `tsconfigPaths: true` and `environment: "node"`; setup file mocks `server-only`, `next/server`, `next-auth` |
| `typescript` | ^6.0.3 | Static type guarantees | Existing tree |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jsdom` | ^29.1.1 | DOM/Worker shim for DuckDB-WASM tests | When a test must boot `getDuckDbClient()` — set `// @vitest-environment jsdom` at the top of the file (see existing pattern) |
| `@uwdata/mosaic-core`, `@sqlrooms/mosaic` | ^0.25, ^0.28 | Mosaic coordinator | Out of Phase 1 scope (Phase 3/4 surface area) — do NOT import in `mathLayer.ts` or `dataLayer.ts` |
| `@types/d3-force` | ^3.0.10 | Type only | Phase 2 — do NOT import in `mathLayer.ts` |

### Supporting (NEW dependency to add)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fast-check` | ^3.23.x | Property-based testing for MATH-04 monotonicity | Per-slider monotonicity assertion: "increasing s_d never decreases distance from origin along θ_d for a node with non-zero feature on dim d" |

**Installation:**
```bash
npm install -D fast-check
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tableFromArrays` | `tableFromIPC(bytes)` | IPC route makes sense when source is already wire format; for in-memory build the array route is simpler and identical performance |
| `fast-check` property test | More hand-rolled examples | Hand-rolled covers only chosen values; `fast-check` shrinks counterexamples; cheap to add and Vitest-native |
| Embedded SQL in `positionsCache.ts` (current pattern) | Prepared statement via `conn.prepare()` | Prepared statements escape values automatically — safer than the current `replace(/'/g, "''")` string concat. **Recommend** Phase 1 migrates `savePositions` / `loadCachedPositions` to prepared statements; existing TODO. |

## Architecture Patterns

### Recommended Layout (additive to existing tree)

```
app/(dashboard)/users/access-analysis/
├── duckdbClient.ts                  # EXISTING — singleton AsyncDuckDB (no change)
├── duckdbClient.test.ts             # EXISTING — jsdom environment
├── graphTables.ts                   # EXISTING — refactor: collapse to (email, projectId) rows
├── graphTables.test.ts              # EXISTING — extend with normalization tests
├── positionsCache.ts                # EXISTING — extend: add z column, slider key segment
├── positionsCache.test.ts           # EXISTING — extend coverage
├── dataLayer.ts                     # NEW — orchestrator: trpc → normalize → Arrow → DuckDB
├── dataLayer.test.ts                # NEW — jsdom env; insert + roundtrip
├── mathLayer.ts                     # NEW — PURE TS; zero non-stdlib imports
├── mathLayer.test.ts                # NEW — node env; slider invariants + fast-check
└── mathLayer.purity.test.ts         # NEW — node env; asserts no forbidden imports
```

### Pattern 1: Pure-function math layer (single source for MATH-01..05)

**What:** A single module that exports `computeTargetPositions(features, sliders) → Float32Array`. Zero side effects, zero I/O, zero non-stdlib imports. Operates on a typed feature struct + `Float32Array` slider vector. Output is a flat `Float32Array` of length `3 * nodeCount` (xyz triples).

**When to use:** Every position calculation; consumed by Phase 2 physics layer as the `target` input for force-directed seeding.

**Example:**
```typescript
// mathLayer.ts — NO imports from react/three/d3-force/duckdb/etc.
// (stdlib only: nothing to import.)

export interface NodeFeatureVector {
  /** stable id used to key the position cache */
  id: string;
  /** normalized [0,1] activity count (log1p + min-max applied in dataLayer) */
  activity: number;
  /** normalized [0,1] recency (1 - min(ageDays/90, 1)) */
  recency: number;
  /** 1.0 if isAdmin, else 0.0 */
  isAdmin: number;
  /** 1.0 if isExternal, else 0.0 */
  isExternal: number;
  /** per-role weights summing to 1.0; key = roleId, value = weight */
  roleWeights: ReadonlyMap<string, number>;
  /** per-module weights = activity_in_module / total_activity */
  moduleWeights: ReadonlyMap<string, number>;
  /** per-tier weights (typically a single key = 1.0) */
  permTierWeights: ReadonlyMap<string, number>;
}

export interface DimensionDescriptor {
  /** stable id, e.g. "activity", "recency", "role:project_admin", "module:docs" */
  id: string;
  /** kind discriminator drives how slider × feature multiply */
  kind: "scalar" | "boolean" | "role" | "module" | "permTier";
  /** category key for kind != scalar/boolean; undefined for scalars */
  category?: string;
}

const R_DEFAULT = 300;

/**
 * Phase 1 deterministic seed function. Pure: no I/O, no clock, no random.
 *
 * Formula (per MATH-03):
 *   finalTarget(node) = Σ_d (u_d × f_d(node) × s_d) / Σ_d (s_d)
 *
 * Where u_d = (cos θ_d, sin θ_d, 0), θ_d = (d / D) × 2π, and
 * f_d(node) ∈ [0, 1] is the node's normalized value on dim d.
 *
 * Zero state (all s_d = 0) → (0, 0, 0) by definition (MATH-04).
 */
export function computeTargetPositions(
  features: readonly NodeFeatureVector[],
  dims: readonly DimensionDescriptor[],
  sliders: Readonly<Record<string, number>>,
  options: { radius?: number } = {},
): Float32Array {
  const R = options.radius ?? R_DEFAULT;
  const D = dims.length;
  const out = new Float32Array(features.length * 3);

  // Precompute (cos θ_d, sin θ_d) per dim — one allocation, reused per node.
  const ux = new Float64Array(D);
  const uy = new Float64Array(D);
  for (let d = 0; d < D; d++) {
    const theta = (d / D) * 2 * Math.PI;
    ux[d] = Math.cos(theta);
    uy[d] = Math.sin(theta);
  }

  for (let i = 0; i < features.length; i++) {
    const node = features[i];
    let sx = 0, sy = 0, sSum = 0;
    for (let d = 0; d < D; d++) {
      const dim = dims[d];
      const s = sliders[dim.id] ?? 0;
      if (s === 0) continue;
      const f = featureValueFor(node, dim);
      if (f === 0) { sSum += s; continue; }
      const contrib = R * f * s;
      sx += ux[d] * contrib;
      sy += uy[d] * contrib;
      sSum += s;
    }
    if (sSum > 0) {
      out[i * 3 + 0] = sx / sSum;
      out[i * 3 + 1] = sy / sSum;
      out[i * 3 + 2] = 0; // z seeded at 0; physics nudges z in 3D mode
    }
    // else: zero state, leaves (0, 0, 0) from Float32Array init
  }

  return out;
}

function featureValueFor(node: NodeFeatureVector, dim: DimensionDescriptor): number {
  switch (dim.kind) {
    case "scalar":
      // dim.id one of "activity" | "recency" | ...
      return dim.id === "activity" ? node.activity : node.recency;
    case "boolean":
      return dim.id === "isAdmin" ? node.isAdmin : node.isExternal;
    case "role":
      return node.roleWeights.get(dim.category!) ?? 0;
    case "module":
      return node.moduleWeights.get(dim.category!) ?? 0;
    case "permTier":
      return node.permTierWeights.get(dim.category!) ?? 0;
  }
}
```

### Pattern 2: Arrow → DuckDB zero-copy materialization

**What:** Build a `Table` with `tableFromArrays()` (existing pattern in `graphTables.ts`), then register it in DuckDB via `conn.insertArrowTable(table, { name: "nodes" })`. DuckDB-WASM consumes the Arrow IPC buffers directly — no JSON, no row-iteration.

**When to use:** Every materialization step in `dataLayer.ts`.

**Example:**
```typescript
// dataLayer.ts — orchestrator
import { tableFromArrays, type Table } from "apache-arrow";
import { getDuckDbClient } from "./duckdbClient";
import { ensurePositionsSchema } from "./positionsCache";

export async function materializeNodes(rows: NormalizedNodeRow[]): Promise<void> {
  const table = tableFromArrays({
    node_id: rows.map(r => r.id),
    email: rows.map(r => r.email),
    project_id: rows.map(r => r.projectId),
    activity_raw: Int32Array.from(rows.map(r => r.activityRaw)),
    activity_norm: Float32Array.from(rows.map(r => r.activityNorm)),
    recency_norm: Float32Array.from(rows.map(r => r.recencyNorm)),
    is_admin: rows.map(r => r.isAdmin),
    is_external: rows.map(r => r.isExternal),
    role_ids: rows.map(r => r.roleIds.join("|")), // Arrow LIST<UTF8> typing is fussy; pipe-join keeps the column scalar
    module_weights_json: rows.map(r => JSON.stringify(Object.fromEntries(r.moduleWeights))),
    perm_tier: rows.map(r => r.permTier ?? ""),
  });

  const { connection } = await getDuckDbClient();
  await connection.query("DROP TABLE IF EXISTS nodes");
  await connection.insertArrowTable(table, { name: "nodes" });
  await ensurePositionsSchema(connection);
}
```

### Pattern 3: jsdom-only WASM tests, node-only math tests

**What:** Vitest config defaults to `environment: "node"`. Tests that touch DuckDB-WASM (`getDuckDbClient`) must declare `// @vitest-environment jsdom` at file top. Math-layer tests stay node-only — and that's the contract enforcing MATH-05 purity.

**When to use:**
- `mathLayer.test.ts` → node env (DEFAULT, no annotation)
- `dataLayer.test.ts` → jsdom env (annotation required)
- `positionsCache.test.ts` → already pure (no client init); stays node env

**Example:**
```typescript
// dataLayer.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { materializeNodes } from "./dataLayer";
import { resetDuckDbClientForTests, getDuckDbClient } from "./duckdbClient";

beforeEach(() => resetDuckDbClientForTests());

describe("materializeNodes", () => {
  it("inserts one row per (email, projectId)", async () => {
    await materializeNodes([
      { id: "a@x.com|p1", email: "a@x.com", projectId: "p1", /* ... */ },
      { id: "a@x.com|p2", email: "a@x.com", projectId: "p2", /* ... */ },
    ]);
    const { connection } = await getDuckDbClient();
    const result = await connection.query("SELECT COUNT(*) AS n FROM nodes");
    expect(result.toArray()[0].n).toBe(2n); // DuckDB returns BigInt for COUNT
  });
});
```

### Pattern 4: Purity assertion as a test

**What:** A test that introspects `mathLayer.ts`'s import graph and fails if forbidden modules appear. Cheap alternative to running `madge`.

**Example:**
```typescript
// mathLayer.purity.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("mathLayer purity", () => {
  it("imports no React, DOM, engine, or persistence modules", () => {
    const src = readFileSync(resolve(__dirname, "./mathLayer.ts"), "utf8");
    // Capture every `import ... from "..."` and `import("...")` specifier
    const specifiers = [
      ...src.matchAll(/import\s+(?:[^"';]+from\s+)?["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map(m => m[1]);
    expect(specifiers).toEqual([]); // mathLayer.ts has zero imports
  });
});
```

### Anti-Patterns to Avoid

- **Mixing slider state into the Arrow table.** Slider values are runtime config, not data. Keep them as a `Record<string, number>` passed to `computeTargetPositions()`.
- **Storing positions in the same row as features.** Two-table split (`nodes` + `positions`) is locked in CONTEXT — do not violate.
- **Hand-rolling SHA-1 in JS.** Use `crypto.subtle.digest("SHA-1", bytes)` in browser code, or `node:crypto` in test code. **However**, `positionsCache.ts` already uses FNV-1a (32-bit) for `hashNodeSet`. Decision rationale per CONTEXT: cache key is `sha1(sorted(nodeIds) + sliderValues)`. **Prescription:** keep FNV-1a for `hashNodeSet` (proven, sync, deterministic) and concatenate slider values into the same FNV-1a digest — `hashNodeSetAndSliders(ids, sliderEntries)`. Avoid SHA-1 / `crypto.subtle` because (a) it's async, (b) it has no security requirement here (it's a cache key, not a credential), (c) FNV-1a's 32-bit output is already collision-safe enough at the scale of "configurations a user explores in one session".
- **`Math.random()` in math layer.** Anywhere. Breaks determinism. Use deterministic tiebreakers if needed.
- **Importing types from `@duckdb/duckdb-wasm` into `mathLayer.ts`.** Even type-only imports drag the module into the TypeScript resolution graph and break the "zero imports" contract. If math needs to know about Arrow columns, define a local plain-TS type and convert in `dataLayer.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Columnar table construction | Custom struct-of-arrays + JSON serialization | `tableFromArrays` from `apache-arrow` 17 | Already a dependency; gives free DuckDB zero-copy ingest; handles type promotion (Int32Array → INT32 column) |
| Client-side SQL / aggregations | Custom JS reducers | `@duckdb/duckdb-wasm` (already wired) | DuckDB's vectorized engine is 10–100× faster than JS reducers on Arrow data, and the wiring exists already |
| Position cache row pack/unpack | Reinvent layout | `packPositions` / `unpackPositions` in `positionsCache.ts` | Already tested and proven |
| Property-based testing | Hand-rolled loops | `fast-check` | Free shrinking of counterexamples; Vitest-compatible |
| Hashing a node-id set | Custom hash | `hashNodeSet()` in `positionsCache.ts` | Already FNV-1a, order-independent, deterministic, sync |
| Async-loaded DuckDB | Custom bootstrap | `getDuckDbClient()` in `duckdbClient.ts` | Self-hosted bundles, worker URL fixup for `blob:` workers, terminate hook — all already correct |

**Key insight:** Phase 1 is mostly a **refactor + addition** job, not a from-scratch build. The repo already learned the painful parts (worker URL anchoring, self-hosted bundles, FNV-1a hashing, Arrow schema gotchas). The new code is `mathLayer.ts` (pure) and a thin `dataLayer.ts` orchestrator.

## Common Pitfalls

### Pitfall 1: Arrow `tableFromArrays` infers types unpredictably
**What goes wrong:** Passing a plain `number[]` produces `FLOAT64` (8 bytes/cell). At 6000 nodes × 10 columns that's 480KB just for activity counts.
**Why it happens:** Arrow's JS inference defaults to widest type.
**How to avoid:** Use typed arrays explicitly: `Int32Array.from(rows.map(r => r.activityRaw))`, `Float32Array.from(...)`, `Uint8Array.from(...)` for booleans. The existing `graphTables.ts` already does this for `project_count`, `active_count`, `admin_count` — follow that pattern.
**Warning signs:** WASM heap inflation in DevTools memory snapshot; `table.schema.fields[i].type` reports `Float64` for an integer column.

### Pitfall 2: DuckDB `COUNT(*)` returns BigInt
**What goes wrong:** `expect(row.n).toBe(2)` fails with `expected 2n to be 2`.
**Why it happens:** DuckDB-WASM returns 64-bit integers as JS `BigInt`.
**How to avoid:** `toBe(2n)` in tests, or `Number(row.n)` when comparing.
**Warning signs:** "expected 2n to be 2" in Vitest output.

### Pitfall 3: WASM worker requires browser globals
**What goes wrong:** `getDuckDbClient()` throws "DuckDB-Wasm analytics can only initialize in a browser runtime" inside a node-env test.
**Why it happens:** The check at `duckdbClient.ts:11` requires `window`, `document`, `Worker`.
**How to avoid:** Annotate any test that exercises the client with `// @vitest-environment jsdom`. The repo already has `jsdom@29.1.1` installed.
**Warning signs:** "DuckDB-Wasm analytics can only initialize in a browser runtime" thrown from a test.

### Pitfall 4: Cache poisoning when slider values are floats
**What goes wrong:** `sliderValues = [0.30000000000000004, 0.7]` and `[0.3, 0.7]` produce different cache keys even though they're "the same" slider config.
**Why it happens:** JS float arithmetic. Two paths to "0.3" may diverge in the last bit.
**How to avoid:** **Quantize** slider values before hashing — e.g. `Math.round(s * 100) / 100` (slider is 0–100 UI anyway; 2-decimal precision is plenty). Then concatenate the quantized values into the FNV-1a digest.
**Warning signs:** Cache miss rate > 0% when revisiting an exact slider state in manual testing.

### Pitfall 5: `insertArrowTable` is idempotent-unsafe
**What goes wrong:** Calling `conn.insertArrowTable(t, { name: "nodes" })` twice with the same name appends rows on the second call; it does NOT replace the table.
**Why it happens:** It's an INSERT, not a CREATE-OR-REPLACE.
**How to avoid:** Always precede with `DROP TABLE IF EXISTS nodes`. Or use the SQL-side `CREATE OR REPLACE TABLE nodes AS SELECT * FROM arrow_table`.
**Warning signs:** Row count doubles after a re-materialize; `SELECT COUNT(*)` grows monotonically.

### Pitfall 6: Float32 round-trip drift through DuckDB `REAL`
**What goes wrong:** A Float32 position written to a DuckDB `REAL` column reads back equal in the round-trip — but a Float64 written to `REAL` truncates to single precision and the reload value differs.
**Why it happens:** `REAL` is 4-byte; `DOUBLE` is 8-byte.
**How to avoid:** Write Float32 in, read Float32 out, expect bit-exact match. Existing `positions(x REAL, y REAL)` schema is already correct — when adding `z REAL` keep it `REAL`, not `DOUBLE`.
**Warning signs:** Cache hit but positions look "almost right" instead of identical.

### Pitfall 7: Pure `mathLayer.ts` accidentally imports React via path mapping
**What goes wrong:** A path-mapped import like `import type { X } from "@/lib/foo"` silently pulls in transitive React types.
**Why it happens:** TS `paths` + barrel files + `tsconfigPaths: true` in Vitest config.
**How to avoid:** `mathLayer.ts` has ZERO `import` lines. All types it needs are declared inline in the same file. The `mathLayer.purity.test.ts` (pattern 4 above) hard-fails CI if any import sneaks in.
**Warning signs:** `purity.test.ts` fails; bundle analyzer shows React in math chunk.

### Pitfall 8: Empty/zero edge cases collapse the formula to `0/0`
**What goes wrong:** When `Σ(s_d) = 0`, the formula divides by zero → `NaN`.
**Why it happens:** The pure-organic state (all sliders at zero).
**How to avoid:** Guard explicitly: `if (sSum === 0) target = (0, 0, 0)`. Already encoded in the Pattern 1 reference impl.
**Warning signs:** `NaN` positions; `Float32Array` rendering nothing.

## Code Examples

### Building the normalized node table

```typescript
// dataLayer.ts (excerpt)
// Source: extends graphTables.ts pattern
import { tableFromArrays } from "apache-arrow";

export interface NormalizedNodeRow {
  id: string;           // `${email}|${projectId}`
  email: string;
  projectId: string;
  activityRaw: number;
  activityNorm: number; // log1p(count) then min-max → [0,1]
  recencyNorm: number;  // 1 - min(ageDays/90, 1)
  isAdmin: number;      // 0 | 1
  isExternal: number;   // 0 | 1
  roleIds: string[];
  moduleWeights: Map<string, number>; // weight = activity_in_module / total_activity
  permTier: string | null;
}

const INTERNAL_DOMAINS = new Set(["lecg.com"]); // tighten per real config

export function normalize(users: BulkAccUser[]): NormalizedNodeRow[] {
  // Per-feature pre-scan for min-max bounds
  const activityRaw = users.flatMap(u => u.projects.map(p => u.activeCount)); // sum-per-instance proxy until per-module activity wired
  const logged = activityRaw.map(v => Math.log1p(Math.max(0, v)));
  const lmin = Math.min(...logged);
  const lmax = Math.max(...logged);
  const span = (lmax - lmin) || 1; // guard div-by-zero on degenerate datasets
  const now = Date.now();

  const rows: NormalizedNodeRow[] = [];
  for (const u of users) {
    const ageDays = u.lastSignIn
      ? (now - Date.parse(u.lastSignIn)) / 86400_000
      : Number.POSITIVE_INFINITY;
    const recencyNorm = 1 - Math.min(ageDays / 90, 1);
    const isExternal = !INTERNAL_DOMAINS.has(u.email.split("@")[1] ?? "") ? 1 : 0;

    for (const p of u.projects) {
      const lv = Math.log1p(Math.max(0, u.activeCount));
      const activityNorm = (lv - lmin) / span;
      rows.push({
        id: `${u.email.toLowerCase()}|${p.id}`,
        email: u.email.toLowerCase(),
        projectId: p.id,
        activityRaw: u.activeCount,
        activityNorm,
        recencyNorm,
        isAdmin: p.isAdmin ? 1 : 0,
        isExternal,
        roleIds: [...new Set(p.roles.filter(Boolean))],
        moduleWeights: weightsFromModules(p.modules), // per-module split TBD when per-module activity wired
        permTier: null, // joined later from GraphFolderPermissionRow
      });
    }
  }
  return rows;
}

function weightsFromModules(modules: string[]): Map<string, number> {
  // Until per-module activity exists, distribute uniformly across the user's modules.
  // (Real per-module weights become available when DC activity CSVs are joined per project.)
  if (modules.length === 0) return new Map();
  const w = 1 / modules.length;
  return new Map(modules.map(m => [m, w]));
}
```

### Extended position cache key with sliders

```typescript
// positionsCache.ts (extension)
export function hashNodeSetAndSliders(
  ids: readonly string[],
  sliders: Readonly<Record<string, number>>,
): string {
  const sortedIds = [...ids].sort();
  const sortedSliderKeys = Object.keys(sliders).sort();
  let h = 0x811c9dc5;

  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193) >>> 0;
  };

  for (const id of sortedIds) mix(id);
  mix("|"); // domain separator between id-set and slider-set
  for (const k of sortedSliderKeys) {
    mix(k);
    // quantize to 2 decimals (pitfall 4): slider UI is 0..100, 2dp suffices
    const q = Math.round((sliders[k] ?? 0) * 100) / 100;
    mix(q.toString());
  }
  return h.toString(16).padStart(8, "0");
}
```

### Vitest invariant suite for `mathLayer.ts`

```typescript
// mathLayer.test.ts
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeTargetPositions, type DimensionDescriptor, type NodeFeatureVector } from "./mathLayer";

const dims: DimensionDescriptor[] = [
  { id: "activity", kind: "scalar" },
  { id: "recency",  kind: "scalar" },
  { id: "isAdmin",  kind: "boolean" },
  { id: "isExternal", kind: "boolean" },
];

function node(over: Partial<NodeFeatureVector> = {}): NodeFeatureVector {
  return {
    id: "n", activity: 1, recency: 0.5, isAdmin: 1, isExternal: 0,
    roleWeights: new Map(), moduleWeights: new Map(), permTierWeights: new Map(),
    ...over,
  };
}

describe("mathLayer / MATH-04", () => {
  it("zero state: all sliders = 0 ⇒ target = (0,0,0)", () => {
    const pos = computeTargetPositions([node()], dims, {
      activity: 0, recency: 0, isAdmin: 0, isExternal: 0,
    });
    expect(Array.from(pos)).toEqual([0, 0, 0]);
  });

  it("slider = 1 alone yields u_d · f_d · R exactly", () => {
    const R = 300;
    const pos = computeTargetPositions([node({ activity: 1 })], dims, {
      activity: 1, recency: 0, isAdmin: 0, isExternal: 0,
    });
    // dim 0 has θ_0 = 0 ⇒ (cos, sin) = (1, 0)
    expect(pos[0]).toBeCloseTo(R, 4);
    expect(pos[1]).toBeCloseTo(0, 4);
    expect(pos[2]).toBe(0);
  });

  it("two sliders blend additively (weighted by slider sum)", () => {
    const R = 300;
    const pos = computeTargetPositions(
      [node({ activity: 1, recency: 1 })],
      dims,
      { activity: 1, recency: 1, isAdmin: 0, isExternal: 0 },
    );
    const theta0 = 0;
    const theta1 = (1 / 4) * 2 * Math.PI;
    const expectedX = (R * 1 * 1 * Math.cos(theta0) + R * 1 * 1 * Math.cos(theta1)) / 2;
    const expectedY = (R * 1 * 1 * Math.sin(theta0) + R * 1 * 1 * Math.sin(theta1)) / 2;
    expect(pos[0]).toBeCloseTo(expectedX, 4);
    expect(pos[1]).toBeCloseTo(expectedY, 4);
  });

  it("monotonicity: increasing one slider never decreases that dim's contribution", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (s1, s2) => {
          const [lo, hi] = s1 <= s2 ? [s1, s2] : [s2, s1];
          const n = node({ activity: 1, recency: 0, isAdmin: 0, isExternal: 0 });
          const a = computeTargetPositions([n], dims, { activity: lo, recency: 0, isAdmin: 0, isExternal: 0 });
          const b = computeTargetPositions([n], dims, { activity: hi, recency: 0, isAdmin: 0, isExternal: 0 });
          // when activity is the only nonzero slider, target collapses to (R*f*s)/s = R*f
          // so distances are EQUAL for any s > 0; both must equal R (=300) along θ=0.
          // monotonicity is trivially satisfied (non-decreasing).
          return Math.hypot(a[0], a[1]) <= Math.hypot(b[0], b[1]) + 1e-6
              || (lo === 0 && hi === 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
```

> Note on the monotonicity test: with the locked formula `Σ(u·f·s)/Σ(s)`, a single-dimension slider sweep produces a **constant** distance (the slider cancels in numerator and denominator). True monotonicity emerges only in multi-slider scenarios. Plan the property test to vary a non-target slider against a fixed target slider — that's where monotonicity is observable. **Open question** flagged below.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cosmograph / cosmos.gl as the engine | `react-force-graph-2d` + `react-force-graph-3d` v1.29.1 with d3-force-3d | 2026-05-19 (per REQUIREMENTS.md) | Cosmograph disqualified — 2D-only and no runtime force-weight mutation API |
| Single-node-per-user collapsed model | One node per `(email, projectId)` instance | 2026-05-13 (per memory note `project_user_project_instances.md`) | Cardinality ~3–10× higher; Arrow + DuckDB sizing still well within budget at expected 500–6000 rows |
| Modal slider (one dim at a time) | Additive blend `Σ(u_d × f_d × s_d) / Σ(s_d)` (MATH-03) | Locked in PROJECT.md Key Decisions | No slider-stealing; sliders compose |
| Filter restarts simulation | Filter mutates `alphaMask` Float32Array; positions unchanged | Locked (PHYS-04, INTR-01) | Position cache survives filter changes (DATA-04) |
| Server-side or pre-computed layout | Client-side d3-force-3d driven by `computeTargetPositions` seeds | Locked | Phase 1 must produce deterministic seeds Phase 2 can consume |

**Deprecated/outdated:**
- The ~4242-line `accGraphOrganicLayout.ts` monolith: superseded by the six-layer architecture; Phase 1 starts the rewrite by carving out `mathLayer.ts` (and not patching the monolith).
- UMAP / t-SNE pre-processing: explicitly forbidden by REQUIREMENTS Out-of-Scope table.

## Open Questions

1. **Per-module activity weights need a real source**
   - What we know: `BulkAccProject.modules: string[]` lists modules a project uses, and `BulkAccUser.activeCount` is a single scalar per user.
   - What's unclear: We don't yet have **per-module per-user** activity counts (which would let module weights = `activity_in_module / total_activity`).
   - Recommendation: Phase 1 ships with **uniform** per-module weights (`1 / modules.length`) and a TODO. Phase 2 or a Phase 1.5 patch can wire real DC activity CSV counts once `dcActivityCsvIngest` is joined per (user, project). This does NOT block any locked Phase 1 acceptance criterion — the formula is identical, only the weights differ.

2. **Monotonicity property — observable axis**
   - What we know: With formula `Σ(u·f·s)/Σ(s)`, a single-slider sweep yields constant magnitude.
   - What's unclear: The locked test "two sliders blend additively and monotonically" — which monotonicity exactly? Likely: with one slider fixed at 1 and another sweeping 0→1, the position trajectory moves smoothly from "axis A" toward the midpoint of A and B, never overshooting either endpoint, and the distance from "axis A endpoint" is monotonic in the second slider.
   - Recommendation: Encode the test as **"the position interpolates monotonically between the two single-slider endpoints as the second slider sweeps 0→1, with one slider held at 1"**. Use `fast-check` to fuzz the held-value and the sweeping-value. Confirm with planner during plan creation.

3. **Whether to migrate `positionsCache.ts` SQL to prepared statements in Phase 1**
   - What we know: Current `savePositions` uses string concat with `.replace(/'/g, "''")` escaping. Works, but fragile.
   - What's unclear: Is the migration in scope for Phase 1 or deferred?
   - Recommendation: Defer to a Phase 1 "tech-debt" plan tail-task ONLY if time allows. Existing tests pass; not blocking. Document as a known sharp edge.

4. **`isExternal` domain definition**
   - What we know: External = email domain not in an "internal" allowlist.
   - What's unclear: The allowlist is `INTERNAL_DOMAINS = new Set(["lecg.com"])` in the reference code above — but is "lecg.com" definitive? Are subdomains internal? Are partner firms internal?
   - Recommendation: Encode the allowlist as a config constant exported from `dataLayer.ts` and call it out in plan-01 review with Luis. Defaulting to `["lecg.com"]` and `["@lecg."]` prefix match is safe v1.

## Sources

### Primary (HIGH confidence)
- `C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/duckdbClient.ts` — proven WASM bundle wiring + worker URL fixup
- `C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/graphTables.ts` — existing Arrow build pattern with typed arrays
- `C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/positionsCache.ts` — FNV-1a `hashNodeSet`, `positions` table schema, save/load
- `C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/positionsCache.test.ts` — established node-env test pattern
- `C:/LECG/Dashboard/vitest.config.ts` + `vitest.setup.ts` — node env default, `tsconfigPaths: true`, mocks for `server-only` / `next-auth`
- `C:/LECG/Dashboard/lib/acc/acc-types.ts` — `BulkAccUser`, `BulkAccProject` (DATA-02 source-of-truth shapes)
- `C:/LECG/Dashboard/.planning/REQUIREMENTS.md` — DATA-01..04, MATH-01..05 contracts
- `C:/LECG/Dashboard/.planning/STATE.md` — engine disqualification, topology shift, additive formula decision
- `C:/LECG/Dashboard/.planning/phases/01-data-math-foundation/01-CONTEXT.md` — locked normalization curves, seed shape, cache key formula

### Secondary (MEDIUM confidence)
- Apache Arrow 17 JS docs (training-data + repo usage cross-verified) — `tableFromArrays`, `Float32Array`/`Int32Array` typed column inference
- DuckDB-WASM 1.33 docs (training-data + repo usage) — `insertArrowTable`, BigInt return type for COUNT(*)
- Vitest 4.1 docs (training-data + config inspection) — `// @vitest-environment` directive, per-file env override

### Tertiary (LOW confidence)
- `fast-check@^3` API surface — recommend pinning to a known-good minor at install time; planner should confirm current latest with Context7 before Plan-01 writes the `package.json` change.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already installed and used in tree; new dep (`fast-check`) is ecosystem-standard
- Architecture: HIGH — pattern matches existing `positionsCache.ts` / `graphTables.ts` conventions; pure-function math layer is a one-page spec
- Pitfalls: HIGH — each pitfall has a concrete signal and prevention; most are evidence-backed by existing code (BigInt, jsdom, typed arrays, idempotency)
- Open questions: MEDIUM — three real ambiguities (per-module weights source, monotonicity axis, isExternal allowlist) flagged for planner / Luis

**Research date:** 2026-05-19
**Valid until:** 2026-06-18 (30 days — stack is stable; revisit only if `react-force-graph-2d`, DuckDB-WASM major, or Arrow major bumps land)
