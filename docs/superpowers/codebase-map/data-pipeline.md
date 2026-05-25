# Data Pipeline

> How a node gets from Postgres to the screen. One node per **(user, project)** instance.
> Line numbers are evidence at authoring time — verify before relying.
> See [access-analysis-graph](./access-analysis-graph.md) for the UI half · [dependency-map](./dependency-map.md) for the seam diagram.

## End-to-end flow

```
Postgres (AccDc* + AccActivity + AccRole)
  └─ tRPC: accDcGraph.bulkUsers            server/routers/acc-dc-graph.ts
       └─ getCachedAccDcBulkUsers(db, in)  lib/server/acc-hot-cache.ts   (versioned in-mem cache)
            ├─ permission queries (when includePermissionSummary)
            ├─ AccActivity groupBy (when includeActivityMix)  → foldActivityRows  [P5-C, T1]
            └─ assembleDcUsers(...)         lib/acc/dcUserAssembly.ts  (pure) → BulkAccUser[]
  ── over the wire (React Query / SSR hydration) ──
  AccessAnalysisShell  uses trpc.accDcGraph.bulkUsers.useQuery({ includePermissionSummary, includeActivityMix })
       └─ buildGraphArrowTables(BulkAccUser[])  graphTables.ts → Arrow tables
            └─ DuckDB-WASM: graph_* tables   duckdbClient.ts
                 └─ buildFeatureSnapshot()    featureSnapshot.ts → NodeFeatureSnapshot[]
                      └─ consumers: featureTargets · physicsLayer · nodeColors · sameUserEdges · GraphCanvas2D/3D
```

## 1. Postgres source tables (`prisma/schema.prisma`)

| Model | Line | Role |
|-------|------|------|
| `User` | 11 | Application users / directory. |
| `AccProject` | 436 | ACC projects. |
| `AccActivity` | 532 | Raw activity events (~623k rows). Keyed by `userEmail`, `projectId`, `rawAction`, `createdAt`. **`projectId = ''` (empty-string sentinel) = admin rows**, not null. **`sourceFile = 'project'`** isolates project activity. Indexes do **not** cover `(userEmail, projectId, rawAction)`. |
| `AccDcProjectUser` | 653 | Data-Connector per-project membership (the snapshot the graph is built from). |
| `AccDcIngestRun` | 756 | DC ingest telemetry. (`rowsByModule` known to be 0 — measure from `AccActivity` directly.) |
| `AccRole` | — | `roleId` in `AccDcProjectUserRole` joins to **`AccRole`** (13,711 matches), **not** `AccDcRole` (0) — per the router's documented join-count check (`acc-dc-graph.ts:11-12`). |

## 2. accDcGraph.bulkUsers (`server/routers/acc-dc-graph.ts`)

- `bulkUsers` = `adminProcedure`. Input (all optional, `:21-25`):
  `includePermissionContexts`, `includePermissionSummary`, `includeActivityMix`.
- Body is thin: `return getCachedAccDcBulkUsers(ctx.db, input ?? undefined)` (`:27`). **Router file —
  forbidden casual edit.**

## 3. acc-hot-cache (`lib/server/acc-hot-cache.ts`)

- **`getCachedAccDcBulkUsers(db, input)`** (`:160`) — the workhorse. In-memory cache, TTL
  `ACC_HOT_CACHE_TTL_MS = 10 min` (`:7`).
- **Cache versioning:** composes version specs by DB max-timestamps; adds `ACTIVITY_VERSION_SPECS` when
  `includeActivityMix` (`:171`). **Cache id** is composed from flags (`"ctx"`/`"sum"`/`"act"`, `:176-178`)
  so each flag combo caches separately.
- **Permission path:** `includePermissionContexts` / `includePermissionSummary` drive folder-permission
  queries (`needsFolderPerms`, `:166`).
- **Activity path (P5-C, T1-owned):** when `includeActivityMix` (`:245`), runs a **grouped** `AccActivity`
  query (`groupBy [userEmail, projectId, rawAction]`, `_count`, `_max(createdAt)`), folds via
  `foldActivityRows` → per-instance aggregate, passes into `assembleDcUsers`. **No raw rows shipped.**
- Other exports: `invalidateAccHotCache` (`:140`, fires on restart), `getAccHotCacheStats`,
  `prewarmAccHotCache` (`:746`), `getCachedAccMembersEnrichedUsers`, `getCachedBulkAccSummary`.

## 4. dcUserAssembly (`lib/acc/dcUserAssembly.ts`)

- **`assembleDcUsers(input)`** — **pure** function: DB rows → `BulkAccUser[]` (each with `projects`,
  roles, products, company). Accepts optional `includePermissionContexts` and (P5-C) an
  `activityByInstance` map keyed `userId::projectId`. Types in **`acc-types.ts`** (`BulkAccUser`,
  `BulkAccProject`).

## 5. graphTables (`graphTables.ts`)

- **`buildGraphArrowTables(input)`** (`:104`) → `GraphArrowTables` (apache-arrow). Input
  `BuildGraphArrowTablesInput` includes the `BulkAccUser[]` + folder permission rows. Also
  `buildSimilarityInputFromUsers`. These Arrow tables become the DuckDB **`graph_*`** tables.
- P5-C adds activity columns here (`activity_mix_json`, `activity_total`, `last_activity`) — **T1-owned.**

## 6. DuckDB-WASM tables (`duckdbClient.ts`)

- The Arrow tables are registered into DuckDB-WASM as **`graph_*`** tables in the browser. `featureSnapshot`
  runs SQL against them. (Browser-side; a non-atomic table swap previously crashed — fixed with
  `CREATE OR REPLACE TABLE`.)

## 7. featureSnapshot → NodeFeatureSnapshot (`featureSnapshot.ts`, `interactionTypes.ts`)

- **`buildFeatureSnapshot(options)`** (`:131`) — runs the DuckDB query, returns
  `ReadonlyArray<NodeFeatureSnapshot>`. Also the bucketers: `bucketActivity`, `bucketMembership`,
  `bucketRecency`, `bucketSignin`, `parseModuleSignature`. Risk flags computed here (`computeRiskFlags`);
  `highActivityHighPerm` becomes reachable once `activityTotal` is real (P5-C).
- **`NodeFeatureSnapshot`** (`interactionTypes.ts:24`) — the per-node feature record consumed by the whole
  client graph. `interactionTypes.ts` also defines `GraphEventHandlers`, `PredicateInputs`,
  `GraphInteractionState`.

## 8. Activity-mix path (P5-C) — **T1-owned, ACTIVE**

- **`lib/acc/activityAggregate.ts`** — `foldActivityRows(rows)` (`:17`): grouped rows → `Map<key,
  InstanceActivity>` (`mix`/`total`/`lastActivity`), key `userEmail::projectId` lowercased. Types
  `RawActivityGroupRow`, `InstanceActivity`.
- **`lib/acc/activityCategories.ts`** — `categorize(rawAction) → ActivityCategory` (view/upload/edit/…).
- This path is **landed** (the shell passes `includeActivityMix: true`). Documented here for understanding;
  **do not edit as docs-only T2.** See [active-wip-boundaries.md](./active-wip-boundaries.md).

## 9. Renderer / interaction consumers

`NodeFeatureSnapshot[]` feeds: `featureTargets.buildFeatureTargets` (layout anchors) →
`physicsLayer.createPhysicsLayer` (forces) → positions; `nodeColors.buildNodeColors` (color buffers);
`sameUserEdges.deriveSameUserEdges` + `linkEmphasis` (edge buffers); all rendered by `GraphCanvas2D/3D`.
See [access-analysis-graph](./access-analysis-graph.md) §6–9.

## Flags summary

| Flag | Adds | Path owner |
|------|------|-----------|
| `includePermissionContexts` | raw folder-permission contexts | shared |
| `includePermissionSummary` | per-project permission strength (no raw contexts) | shared — **the established path** |
| `includeActivityMix` | per-instance activity mix/total/last-activity (grouped, no raw rows) | **T1 (P5-C) — landed/active** |

## Known fragile points

- **Empty-string sentinel:** `AccActivity.projectId = ''` means admin, not null — filtering on `not null`
  would aggregate admin events into bogus instances.
- **Identity:** node id is `userId::projectId`. Anything that changes it breaks edges, selection, e2e count.
- **e2e node count (16,942)** is asserted exactly — a pipeline change that shifts it is a regression unless
  intended.
- **Cache-key correctness:** every new flag must extend both the version spec and the cache id, or stale
  data leaks across flag combos.
