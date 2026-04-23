# Phase 8: Graph Layout Cache — pre-computed force positions with dataHash invalidation - Research

**Researched:** 2026-04-23
**Domain:** Prisma schema extension, tRPC procedure design, server-side hashing, React component cache integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cache storage location**
- Store pre-computed positions in the database (new Prisma model), not localStorage
- One global shared cache row — all users and devices share the same layout
- No per-user personalization of node positions
- When a valid cache exists, apply positions as an instant snap (no animation from random)
- Expose a "Refresh Layout" button in the graph toolbar for manual cache invalidation

**Invalidation strategy**
- `dataHash` computed from the full `AccMemberCache` row content (all fields: email, projectId, roles, modules, etc.)
- Cache is invalidated when any field in any row changes — most thorough approach
- New layout computed lazily: on the first graph tab open after invalidation (not during sync)
- No TTL — cache validity is determined purely by `dataHash` comparison
- "Refresh Layout" button also forces cache regeneration regardless of hash match

**Cold cache experience**
- When no valid cache exists: show the live force simulation running and settling (current behavior)
- Once the simulation settles, silently write positions to the DB in the background — no UI notification
- The "Refresh Layout" button: shows a spinner on the button + resets the graph and replays the live simulation, then saves the new positions
- No toast or confirmation after silent background saves

**Filter sensitivity**
- Cache stores only one layout: all nodes (instance, user, role, module)
- Filter toggles (show roles, show modules) simply hide/show nodes from the same cached positions — no separate cached layout per filter state
- Cached positions loaded immediately when the graph tab mounts, before any user interaction

### Claude's Discretion
- Prisma model schema design (table name, column types for position storage)
- tRPC endpoint design (getGraphLayout / saveGraphLayout mutations)
- How the dataHash is computed (e.g., crypto hash of JSON.stringify of sorted rows)
- Error handling if the DB write fails (silent failure acceptable — next load runs simulation again)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 8 adds a DB-backed cache layer under `AccUsersGraph.tsx` so the force simulation does not rerun on every page load. The graph already has a clean hook point: `normalizePositions()` returns a `Float32Array` of `[x, y]` pairs indexed 1-to-1 with `nodesRef.current`. The cache stores that array (serialized to a JSON number array) alongside a `dataHash` fingerprint of the entire `AccMemberCache` table. On mount, the component queries the hash first; if it matches, positions are applied directly to `posRef` and the simulation is skipped. On mismatch the simulation runs as today and the result is written to DB silently.

The project already has an established pattern for all three needed primitives: `crypto.createHash("sha256")` is used in `lod.ts` and `aps-search.ts` (server-side hashing), `accMemberCache.upsert` is used throughout `users.ts` (single-row upsert), and `adminProcedure` with Zod validation is the standard shape for all ACC admin endpoints. The `LodGraphNode` model in `schema.prisma` is a direct precedent for persisting computed Float positions per-graph-node; Phase 8 needs an analogous singleton table instead.

The only non-trivial design choice is serialization format: `Float32Array` cannot be stored as a Prisma `Json` field directly — it must be converted to a plain `number[]` via `Array.from()` before storing and reconstructed via `new Float32Array(data)` when reading back. A `Bytes` column (storing a raw buffer) would be more compact but is harder to introspect; `Float[]` (PostgreSQL float8 array) with `@db.DoublePrecision` is the cleanest Prisma-native option and avoids JSON parsing overhead.

**Primary recommendation:** Add one singleton `AccGraphLayoutCache` Prisma model with `positions Float[]`, `dataHash String`, and `updatedAt DateTime`. Add `getGraphLayout` (query) and `saveGraphLayout` (mutation) as `adminProcedure` entries in `usersRouter`. Compute `dataHash` server-side in `getGraphLayout` by hashing `JSON.stringify` of sorted `AccMemberCache` rows. Integrate in `AccUsersGraph.tsx` via a `useEffect` that checks the hash before calling `runSimulation`.

---

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | `^7.7.0` | DB model + queries | Already the project ORM |
| `@trpc/server` | `^11.0.0` | Endpoint definitions | Already the project RPC layer |
| `zod` | `^4.3.6` | Input validation | Already used on every procedure |
| Node.js `crypto` | built-in | sha256 hashing | Already used in `lod.ts` and `aps-search.ts` |

### No New Installs Required

Everything needed is already installed. No `npm install` step.

---

## Architecture Patterns

### Recommended File Changes

```
prisma/
├── schema.prisma                  # +AccGraphLayoutCache model
└── migrations/
    └── 20260423XXXXXX_add_acc_graph_layout_cache/
        └── migration.sql

server/
└── routers/
    └── users.ts                   # +getGraphLayout + saveGraphLayout procedures

app/(dashboard)/users/
└── AccUsersGraph.tsx              # +cache read before runSimulation, +Refresh Layout button
```

### Pattern 1: Singleton Cache Model (Prisma)

**What:** A table that always holds exactly one row, identified by a fixed constant `id` (e.g., `"singleton"`) and upserted — never inserted twice.
**When to use:** Global shared state that has no natural per-entity key. Precedent: `LodGraphNode` stores per-family computed positions using `@unique` on `familyId`.

```prisma
// schema.prisma — new model
model AccGraphLayoutCache {
  id        String   @id @default("singleton")
  positions Float[]                          // Float32Array serialized as Float64 array — acceptable precision loss is negligible
  dataHash  String
  nodeCount Int
  updatedAt DateTime @updatedAt
}
```

**Why `Float[]` not `Json`:** Prisma maps `Float[]` to PostgreSQL `float8[]` — a typed array column with no JSON parsing overhead. Reading back is `new Float32Array(row.positions)`. Storing as `Json` works too but adds parse cost and loses numeric type safety.

**Why `nodeCount`:** The consumer must verify that the cached positions array length matches the current node list before applying. `nodeCount` makes this check explicit without decoding the full array first.

### Pattern 2: Server-side dataHash Computation

**What:** Compute a deterministic fingerprint of the full `AccMemberCache` table on the server, inside the `getGraphLayout` query, before returning cached positions to the client.
**When to use:** Every time `getGraphLayout` is called — the hash is always recomputed from live DB state and compared to the stored hash. The client never computes the hash.

```typescript
// Inside getGraphLayout in users.ts
import crypto from "crypto";

// Fetch all AccMemberCache rows (same query shape bulkAccSummary uses)
const allRows = await ctx.db.accMemberCache.findMany({
  orderBy: { email: "asc" },   // sort for determinism
});

// Hash all fields that affect graph shape
const dataHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(allRows.map(r => ({
    email: r.email,
    data: r.data,
    syncedAt: r.syncedAt.toISOString(),
  }))))
  .digest("hex");
```

**Source:** `crypto.createHash("sha256")` pattern verified in `C:/LECG/Dashboard/server/routers/lod.ts:187-190`.

### Pattern 3: tRPC Endpoint Pair

**What:** Two procedures in `usersRouter` — a query that returns `{ positions, dataHash, nodeCount, hit: boolean }` and a mutation that accepts `{ positions, dataHash, nodeCount }` and upserts.
**When to use:** Consistent with how `getAccProfile` (query) and `bulkAccSync` (mutation) are paired in the same router.

```typescript
// getGraphLayout — adminProcedure.query
getGraphLayout: adminProcedure.query(async ({ ctx }) => {
  // 1. Compute current dataHash from live AccMemberCache
  const allRows = await ctx.db.accMemberCache.findMany({ orderBy: { email: "asc" } });
  const dataHash = crypto.createHash("sha256")
    .update(JSON.stringify(allRows.map(r => ({ email: r.email, data: r.data, syncedAt: r.syncedAt.toISOString() }))))
    .digest("hex");

  // 2. Fetch cached layout
  const cached = await ctx.db.accGraphLayoutCache.findUnique({ where: { id: "singleton" } });

  if (!cached || cached.dataHash !== dataHash) {
    return { hit: false, positions: null, dataHash, nodeCount: 0 };
  }
  return { hit: true, positions: cached.positions, dataHash, nodeCount: cached.nodeCount };
}),

// saveGraphLayout — adminProcedure.mutation
saveGraphLayout: adminProcedure
  .input(z.object({
    positions: z.array(z.number()),   // Float32Array serialized via Array.from()
    dataHash: z.string(),
    nodeCount: z.number().int(),
  }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.accGraphLayoutCache.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", positions: input.positions, dataHash: input.dataHash, nodeCount: input.nodeCount },
      update: { positions: input.positions, dataHash: input.dataHash, nodeCount: input.nodeCount },
    });
    return { ok: true };
  }),
```

### Pattern 4: Cache Integration in AccUsersGraph.tsx

**What:** Before calling `runSimulation`, query `getGraphLayout`. On a cache hit, apply positions directly to `posRef` and skip simulation. On a miss, run simulation then fire `saveGraphLayout` in background (fire-and-forget, no await in render path).
**When to use:** Inside the existing `useEffect([users])` that currently calls `buildGraph` + `runSimulation`.

```typescript
// Replace the existing useEffect body structure:
useEffect(() => {
  if (!users.length) return;
  setSimulationDone(false);
  setIsReady(false);

  const { nodes: rawNodes, edges: rawEdges } = buildGraph(users);
  edgesRef.current = rawEdges;

  const timeoutId = setTimeout(async () => {
    // 1. Try cache
    const layout = await trpc.users.getGraphLayout.query();

    let settled: SimNode[];
    if (layout.hit && layout.positions && layout.nodeCount === rawNodes.length) {
      // Cache hit: apply positions directly, skip simulation
      settled = rawNodes.map((n, i) => ({ ...n }));  // copy without mutation
      const pos = new Float32Array(layout.positions);
      posRef.current = pos;
      nodesRef.current = settled;
    } else {
      // Cache miss: run simulation
      settled = runSimulation(rawNodes, rawEdges);
      nodesRef.current = settled;
      posRef.current = normalizePositions(settled);

      // Silent background save — fire and forget
      trpc.users.saveGraphLayout.mutate({
        positions: Array.from(posRef.current),
        dataHash: layout.dataHash,
        nodeCount: settled.length,
      }).catch(() => { /* silent failure */ });
    }

    // ... rest of existing setup (nodeIndexMapRef, gridRef, sprites, setSimulationDone)
  }, 0);

  return () => clearTimeout(timeoutId);
}, [users]);
```

**Important:** `getGraphLayout` is an `adminProcedure`. The users page already checks for admin — `bulkAccSummary` (which feeds this component) is also `adminProcedure`. No additional auth check needed in the component.

### Pattern 5: Refresh Layout Button

**What:** A new toolbar button that (a) sets a `isRefreshing` ref, (b) clears the graph posRef/nodesRef, (c) forces the simulation to rerun, (d) saves the new layout, (e) clears the `isRefreshing` state.

```typescript
// Invalidation: call saveGraphLayout with a deliberately wrong dataHash ("") 
// OR: add an invalidateGraphLayout mutation that deletes the singleton row.
// Simpler: pass forceRefresh: true to getGraphLayout — but the cleaner approach
// is a dedicated invalidateGraphLayout mutation that just deletes the row.

invalidateGraphLayout: adminProcedure.mutation(async ({ ctx }) => {
  await ctx.db.accGraphLayoutCache.deleteMany({});   // safe — at most one row
  return { ok: true };
}),
```

The "Refresh Layout" button calls `invalidateGraphLayout`, then re-triggers the `useEffect` by resetting a `refreshKey` state counter. The `useEffect` dependency array currently has `[users]`; adding `[users, refreshKey]` makes it re-run when the button is clicked.

### Anti-Patterns to Avoid

- **Don't store `Float32Array` directly in Prisma `Json`:** Prisma serializes it as `{ 0: x0, 1: y0, ... }` (object keys), not an array. Always convert via `Array.from(float32Array)` before storing.
- **Don't compute dataHash client-side:** That would require sending all `AccMemberCache` data to the browser first, defeating the purpose. Hash must be computed in the `getGraphLayout` server procedure.
- **Don't use the node order from `buildGraph` output as the cache key:** Node ordering is deterministic given the same `users` array input (see `buildGraph` implementation — it iterates `users` in array order). The `nodeCount` check is the safety net; the positions are applied by index.
- **Don't await `saveGraphLayout` in the render-blocking path:** This is a background write. Fire-and-forget with `.catch(() => {})`.
- **Don't add a new tRPC router:** All ACC procedures live in `usersRouter` per the established pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deterministic hash of DB rows | Custom checksum / row count | `crypto.createHash("sha256")` | Already in codebase; handles Unicode, ordering, collision resistance |
| Schema migration | Manual SQL DDL | `prisma migrate dev` then `prisma migrate deploy` | Prisma generates the SQL and tracks migration history |
| Position serialization | Binary buffer encoding | `Array.from(float32Array)` → `Float[]` column | Prisma handles pg array marshalling; Float32→Float64 precision loss is 7 decimal digits, far more than needed for normalized [0,1] positions |
| tRPC client call in useEffect | Raw fetch/axios | `trpc.users.getGraphLayout.query()` (vanilla tRPC client call) | Consistent with how `forceRefresh` pattern works in Phase 6 |

**Key insight:** The entire feature is wiring three existing primitives together — Prisma upsert, crypto hash, and a ref-based React bypass. No new libraries, no complex algorithms.

---

## Common Pitfalls

### Pitfall 1: Node order mismatch between cache and current build

**What goes wrong:** The cache stores positions indexed by node order from `buildGraph`. If `users` array order changes (e.g., new user added, sort order changed), position indices no longer align with node ids.
**Why it happens:** `buildGraph` assigns positions by iterating `users` in input order. The cache has no node-id-to-index mapping.
**How to avoid:** The `nodeCount` field catches size mismatches. For order stability: `buildGraph` currently iterates `users` in the order received from `bulkAccSummary`, which is `orderBy: { name: "asc" }`. This is deterministic. However, the `dataHash` covers all row content — any change invalidates the cache before the order question arises. If `dataHash` matches, the user list is identical and order is stable.
**Warning signs:** Graph renders but nodes appear in wrong cluster positions.

### Pitfall 2: Async useEffect with setTimeout creates race condition

**What goes wrong:** The existing `useEffect` wraps `runSimulation` in a `setTimeout(..., 0)`. Converting to `async` inside `setTimeout` works but the cleanup `return () => clearTimeout(timeoutId)` does not cancel in-flight async work after the timeout fires.
**Why it happens:** `clearTimeout` only prevents the callback from starting; once started, the async chain runs to completion.
**How to avoid:** Add an `aborted` flag inside the `setTimeout` callback and check it before writing to refs after any `await`. Example:
```typescript
const timeoutId = setTimeout(async () => {
  let aborted = false;
  // cleanup captured in closure — set aborted = true in cleanup
  const layout = await trpc.users.getGraphLayout.query();
  if (aborted) return;
  // ...
}, 0);
return () => { clearTimeout(timeoutId); /* set aborted = true */ };
```
Simplest approach: use a captured boolean `let cancelled = false` in the outer `useEffect` scope, set it in cleanup, check it after every `await`.
**Warning signs:** React warning "Can't perform a state update on an unmounted component" in dev mode.

### Pitfall 3: Prisma `Float[]` column vs `Json` column confusion

**What goes wrong:** Developer uses `data Json` (like `AccMemberCache.data`) instead of `positions Float[]`, then tries to `new Float32Array(row.positions)` — this fails because `row.positions` is a `JsonValue` (object/array of `unknown`), not `number[]`.
**Why it happens:** The `AccMemberCache` model uses `Json` for flexible schema-less data. Positions are typed numeric data.
**How to avoid:** Use `Float[]` explicitly in schema. When reading back: `new Float32Array(row.positions as number[])`. The Prisma-generated type for `Float[]` is `number[]` — direct cast is safe.
**Warning signs:** TypeScript error on `new Float32Array(row.positions)` at compile time.

### Pitfall 4: "Refresh Layout" button triggers double-simulation

**What goes wrong:** Button click invalidates cache AND increments `refreshKey`, which triggers `useEffect`. Inside the effect, `getGraphLayout` is called — but the cache was just invalidated so it returns `hit: false` and `dataHash` (newly computed). Simulation runs and saves correctly. But if the button is clicked again before the first save completes, two concurrent simulations write different positions.
**Why it happens:** No in-flight guard on the simulation.
**How to avoid:** Use an `isRefreshing` ref (not state) to block concurrent runs. Set it `true` at the start of the effect and `false` in the finally block. The Refresh button checks this ref before triggering.
**Warning signs:** Console log shows two "saveGraphLayout" calls in quick succession.

### Pitfall 5: Railway/production migration requiring direct DB connection

**What goes wrong:** `prisma migrate deploy` fails in Railway because the connection string points to the pgbouncer pooler (port 6543) which rejects DDL.
**Why it happens:** Known issue documented in `STATE.md` — Phase 6 Plan 01 hit this exact problem.
**How to avoid:** Use the direct Supabase connection (port 5432) for migration, not the pooler URL. Railway env var must be set to direct URL for migration step. This is already established procedure.
**Warning signs:** `Error: prepared statement "s0" already exists` during migrate.

---

## Code Examples

### Prisma migration SQL (what `prisma migrate dev` will generate)

```sql
-- CreateTable
CREATE TABLE "AccGraphLayoutCache" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "positions" DOUBLE PRECISION[] NOT NULL,
    "dataHash" TEXT NOT NULL,
    "nodeCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccGraphLayoutCache_pkey" PRIMARY KEY ("id")
);
```

### Float32Array round-trip

```typescript
// Serialize for DB storage
const positions: number[] = Array.from(posRef.current);  // Float32Array -> number[]

// Deserialize from DB
const posRef = new Float32Array(row.positions as number[]);
// Precision: Float32 has ~7 significant decimal digits; [0,1] normalized coords
// stored as Float64 (Prisma Float[]) lose no meaningful precision.
```

### dataHash computation (server-side)

```typescript
// Source: verified pattern from C:/LECG/Dashboard/server/routers/lod.ts:187-190
import crypto from "crypto";

const allRows = await ctx.db.accMemberCache.findMany({
  orderBy: { email: "asc" },
});

const dataHash = crypto
  .createHash("sha256")
  .update(
    JSON.stringify(
      allRows.map((r) => ({
        email: r.email,
        data: r.data,
        syncedAt: r.syncedAt.toISOString(),
      }))
    )
  )
  .digest("hex");
```

### Upsert singleton row

```typescript
// Source: verified pattern from C:/LECG/Dashboard/server/routers/users.ts:894
await ctx.db.accGraphLayoutCache.upsert({
  where: { id: "singleton" },
  create: {
    id: "singleton",
    positions: input.positions,
    dataHash: input.dataHash,
    nodeCount: input.nodeCount,
  },
  update: {
    positions: input.positions,
    dataHash: input.dataHash,
    nodeCount: input.nodeCount,
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `runSimulation()` blocks every mount | `getGraphLayout` query short-circuits on hit | First paint after cached: near-instant (no 130-iteration loop) |
| localStorage position cache | DB-backed shared cache | Shared across all users/devices; survives browser clear |
| No invalidation signal | `dataHash` from live `AccMemberCache` | Cache self-invalidates on any ACC sync |

---

## Open Questions

1. **Should `getGraphLayout` be `adminProcedure` or `protectedProcedure`?**
   - What we know: `bulkAccSummary` (which feeds `AccUsersGraph`) is `adminProcedure`. Non-admins never see the graph tab.
   - What's unclear: Could a non-admin somehow reach `AccUsersGraph`? The component is only rendered from the Users page which is admin-gated by the parent component.
   - Recommendation: Use `adminProcedure` for consistency. If the graph is ever opened to non-admins, revisit.

2. **Is `Float[]` (`DOUBLE PRECISION[]`) supported in Prisma 7.7 without extensions?**
   - What we know: The existing `LodEmbedding` model uses `vector Float[]` stored as `Float[]` in PostgreSQL. The project already has this working.
   - What's unclear: Whether `@db.DoublePrecision` annotation is needed or if `Float[]` maps cleanly without it.
   - Recommendation: Use `Float[]` without annotation first (Prisma default maps to `float8[]`). If migration fails, add `@db.DoublePrecision` attribute. The `LodEmbedding.vector Float[]` in the existing schema is evidence this works without annotation.

3. **How large is the positions array in practice?**
   - What we know: ~1197 users in the hub. Each found user with projects generates N instance nodes (one per project). Plus role hubs (~15-20) and module hubs (~10). Rough estimate: 1000-3000 nodes total = 2000-6000 Float values = 16-48 KB as Float64 array in DB. Well within PostgreSQL limits.
   - Recommendation: No pagination or chunking needed.

---

## Sources

### Primary (HIGH confidence)

- `C:/LECG/Dashboard/server/routers/lod.ts:187-190` — `crypto.createHash("sha256")` pattern, verified in codebase
- `C:/LECG/Dashboard/server/routers/users.ts:894,933,982,1015` — `accMemberCache.upsert` pattern, verified in codebase
- `C:/LECG/Dashboard/prisma/schema.prisma:375-384` — `LodGraphNode` Float position storage precedent
- `C:/LECG/Dashboard/app/(dashboard)/users/AccUsersGraph.tsx:411-424` — `normalizePositions()` output is `Float32Array`, verified
- `C:/LECG/Dashboard/app/(dashboard)/users/AccUsersGraph.tsx:504-540` — existing `useEffect` structure for simulation, verified integration point
- `C:/LECG/Dashboard/.planning/STATE.md` — Phase 6 Plan 01 Railway migration pitfall documented

### Secondary (MEDIUM confidence)

- Prisma `Float[]` maps to `DOUBLE PRECISION[]` in PostgreSQL — inferred from `LodEmbedding.vector Float[]` working without special config in existing schema
- `Float32Array` → `number[]` round-trip via `Array.from()` is lossless for normalized [0,1] values at Float64 storage precision — standard JavaScript behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new installs
- Architecture patterns: HIGH — all patterns verified against existing codebase code
- Pitfalls: HIGH (race condition, migration URL) — both verified from STATE.md history; MEDIUM (node order mismatch) — logical deduction from code inspection
- Prisma `Float[]` column type for positions: MEDIUM — works by analogy with `LodEmbedding`, not independently verified against Prisma 7.7 docs

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable domain — no fast-moving dependencies)
