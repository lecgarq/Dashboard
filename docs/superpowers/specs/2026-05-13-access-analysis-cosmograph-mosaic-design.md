# Access Analysis Spatial Graph — Cosmograph 2.0 / Mosaic redesign

**Date:** 2026-05-13
**Status:** Design approved; spec pending review before plan
**Supersedes:** the freeze-the-cosmos-sim approach in commits `04ef796` `6b689ff` `2e5a041` `52b7ce6` `25cc871`
**Relates to:** `2026-05-13-spatial-graph-similarity-redesign-design.md` (the 2026-05-13 (user, project) instance direction shift)

---

## Why this exists

The current Spatial Graph tab renders 24,285 (user, project) instances at **1 FPS** on the operator's Intel iGPU. The graph is a visually unreadable color blob. Five recent commits attempted to fix this by freezing the cosmos.gl force simulation; all five failed because cosmos.gl beta.9 resets its position textures when `enableSimulation` is toggled mid-load, and because freezing alone does not address the underlying rendering cost.

The stack already installed in the repo — `@cosmos.gl/graph`, `@duckdb/duckdb-wasm`, `apache-arrow`, `@uwdata/mosaic-*`, `@sqlrooms/duckdb`, `@sqlrooms/mosaic` — is the reference architecture Cosmograph publishes for exactly this kind of view: dense GPU-rendered point cloud, crossfilter-driven highlighting, static layout, browser-resident analytics. This spec wires that architecture end to end, and retires the JS-side topology pipeline that the current AccUsersGraph depends on.

## Goals

1. Render all 24,285 (user, project) instances at **30–60 FPS** on an Intel iGPU.
2. Make organisational structure **visually legible at idle** — clusters per project, labeled, distinct.
3. Drive every filter through a single shared Mosaic Selection. Sidebar histograms, lasso area selection, and node click all converge.
4. Preserve **spatial memory** — node positions never change between page loads or selections.
5. Land the Cosmograph 2.0 / Mosaic stack idiomatically so future features extend rather than refactor.

## Non-goals

- 3D rendering (Phase 6 stays deferred until 2D is correct on Intel iGPU).
- Real-time data updates (snapshots load on mount; existing tRPC queries remain authoritative).
- Mobile / touch (desktop dashboard only).
- A complete replacement for the Directory or Activity Audit tabs — this design covers the Spatial Graph tab only.

## Architecture

Four layers, each with a single responsibility.

```
┌────────────────────────────────────────────────────────────────┐
│ TRUTH                                                          │
│ DuckDB-Wasm — registered Arrow tables                          │
│   users               (1,209 rows)                             │
│   user_projects       (24,285 rows — the instance model)       │
│   folder_permissions  (variable)                               │
│   similarity_edges    (precomputed; positional only)           │
│   positions           (24,285 rows: node_id, x, y)             │
└──────────────────────┬─────────────────────────────────────────┘
                       │ SQL ↑↓
┌──────────────────────┴─────────────────────────────────────────┐
│ REACTIVE                                                       │
│ Mosaic Coordinator — single Selection shared across clients    │
└─────┬─────────────────────────────────────┬────────────────────┘
      │                                     │
┌─────┴────────────────────┐     ┌──────────┴───────────────────┐
│ SIDEBAR (Mosaic clients) │     │ CANVAS (Mosaic client)        │
│  vgplot histograms       │     │ cosmos.gl, STATIC             │
│  • Project Membership    │     │  • 24,285 frozen points       │
│  • Role Distribution     │     │  • cluster_id = project_id    │
│  • Activity Recency      │     │  • alpha mask = selection     │
│  • Permission Tier       │     │  • polygon lasso              │
│  • Similarity Dimensions │     │  • cluster-name annotations   │
└──────────────────────────┘     └───────────────────────────────┘
```

### Layer 1 — Truth (DuckDB-Wasm)

The four data tables are already produced by `app/(dashboard)/users/access-analysis/graphTables.ts`. We add a fifth:

- **`positions(node_id TEXT PRIMARY KEY, x REAL, y REAL)`** — written once after the initial cosmos warmup. Read on subsequent mounts to skip the warmup entirely. Cleared when the underlying user/project set changes (detected via row count + hash of `user_projects.node_id` set).

`positions` is the single source of spatial truth. Cosmos reads it, never writes to it directly. The warmup phase computes it; everything else consumes it read-only.

### Layer 2 — Reactive (Mosaic Coordinator)

A single `@uwdata/mosaic-core` `Coordinator` instance is constructed in `AccessAnalysisContext.tsx` and provided to all descendants via React context. It owns:

- The DuckDB connection (handed in from the existing `getDuckDbClient()` singleton).
- One `Selection` object — the shared crossfilter state.
- The Mosaic Coordinator's standard registration/update lifecycle.

Every child component that participates in selection is a Mosaic `MosaicClient` subclass — either a histogram from `@uwdata/vgplot` or a custom `CosmosCanvasClient` (defined in this design).

### Layer 3a — Sidebar histograms (vgplot)

The current `ChartPanel` rows in `AccessAnalysisPage.tsx` are replaced by `vgplot` histograms. Each histogram is a Mosaic client; crossfilter is automatic. The five panels become:

1. **Project Membership** — `bar(user_projects, x=project_id, y=count_distinct(user_id))` sorted desc, top 20.
2. **Role Distribution** — `bar(user_projects, x=role_id, y=count_distinct(user_id))` sorted desc, top 20.
3. **Activity Recency** — `bar(users, x=recency_bucket, y=count)` over 4 buckets (`0–30d`, `31–90d`, `90d+`, `No sign-in`).
4. **Permission Tier** — `bar(folder_permissions, x=perm_tier, y=count)` over 6 tiers.
5. **Similarity Dimensions** — `bar(similarity_edges, x=dimension, y=count)` over 5 dims.

Selecting bars in any panel updates the shared `Selection`; all other panels and the canvas reactively re-render through Mosaic's `update()` cycle.

### Layer 3b — Canvas (CosmosCanvasClient)

A new class `CosmosCanvasClient extends MosaicClient` (~150 lines, owned by `AccUsersGraph.tsx`) bridges Mosaic and cosmos.gl. Its responsibilities:

- **`query(filter)`** — return a SQL query that selects `node_id` from `user_projects` matching the current Mosaic filter. Mosaic invokes this whenever the Selection changes.
- **`queryResult(rows)`** — receive matching `node_id`s. Convert to a `Uint8Array` mask aligned with the cosmos point index space and apply via the cosmos color/alpha buffer (selected → α=1.0, unselected → α=0.15). **Positions never change.**
- **`fields()`** — declare which columns this client cares about (so Mosaic builds an efficient incremental query).

The cosmos renderer itself is instantiated once with the frozen `positions` table converted to a `Float32Array`. Cosmos's native cluster force is configured with `cluster_id = project_id` but **the force sim never ticks after the initial warmup** — only `render(0)` is called per RAF tick (this is the public cosmos.gl API equivalent of the failed `freezeSimulation` attempts).

### Annotations layer

Project name labels at cluster centroids. Computed once after positions are frozen:

```sql
CREATE OR REPLACE VIEW cluster_centroids AS
SELECT
  project_id,
  any_value(project_name) AS label,
  avg(positions.x)        AS cx,
  avg(positions.y)        AS cy,
  count(*)                AS member_count
FROM user_projects
JOIN positions USING (node_id)
GROUP BY project_id
HAVING member_count >= 3;          -- skip singleton clusters
```

Labels are rendered as DOM elements absolutely positioned over the cosmos canvas (matches the existing label overlay pattern in `CosmosGraphRenderer.drawLabelOverlay`). Font size = `clamp(11px, 11px + log2(member_count) * 1.2px, 22px)`. Z-ordered so they layer above points but below the lasso UI.

### Lasso area selection

Polygonal lasso uses cosmos.gl's built-in `setSelectedPointsByPolygon([x1,y1,...])` paired with a custom canvas-overlay polygon-drawing UI (existing button: `Lasso Off` toggle in `AccUsersGraph.tsx`). On lasso completion: the selected node ids are pushed into the shared Mosaic Selection as a `node_id IN (...)` clause, which then flows through the same crossfilter pipeline as a histogram click.

## Data flow

```
        ┌───────────────┐    1. mount      ┌────────────────────┐
        │ tRPC: users + │ ───────────────► │ buildGraphArrowTab │
        │ project data  │                  │ les() (existing)   │
        └───────────────┘                  └─────────┬──────────┘
                                                     │ 2. register
                                                     ▼
                                           ┌────────────────────┐
                                           │ DuckDB-Wasm        │
                                           │ users, user_projec │
                                           │ ts, etc.           │
                                           └─────────┬──────────┘
                                                     │ 3. positions table cached?
                                ┌────────────────────┤
                                │ NO                 │ YES
                                ▼                    │
                  ┌────────────────────────┐         │
                  │ COSMOS WARMUP          │         │
                  │  setPointClusters(     │         │
                  │    cluster_id)         │         │
                  │  start(α=1) for 2s     │         │
                  │  getPointPositions()   │         │
                  │  INSERT INTO positions │         │
                  └────────────┬───────────┘         │
                               │                     │
                               └─────────┬───────────┘
                                         ▼
                              ┌────────────────────┐
                              │ COSMOS STEADY-STATE│
                              │  setPointPositions │
                              │    (from DuckDB)   │
                              │  render(0) on RAF  │
                              └─────────┬──────────┘
                                        │ 4. selection cycle
                                        ▼
   ┌────────────────────┐ Mosaic ┌────────────────┐ alpha ┌──────────────┐
   │ histogram click /  ├───────►│ Coordinator    ├──────►│ cosmos       │
   │ lasso polygon /    │  SQL   │ Selection      │  mask │ alpha buffer │
   │ node click         │        │ broadcasts     │       │ update       │
   └────────────────────┘        └────────────────┘       └──────────────┘
```

## Performance plan

| Metric                  | Today      | Target     | Mechanism                                                      |
|-------------------------|------------|------------|----------------------------------------------------------------|
| First paint             | ~3s        | <2s        | Skip cosmos warmup when `positions` is cached in DuckDB         |
| Cold load (no cache)    | ~5s        | <4s        | 2s sim warmup + 1s DuckDB hydration in parallel                |
| Idle FPS @ 24k          | 1          | 30–60      | `render(0)` per RAF, sim never ticks after warmup              |
| Selection latency       | ~500ms     | <100ms     | Mosaic incremental SQL + alpha mask (no rebuild)               |
| Memory                  | ~250MB     | <300MB     | Arrow zero-copy into DuckDB; no JS-side fan-out duplication    |
| Edge rendering          | always on  | off / opt  | No edges by default; folder-hub edges revealed only on demand  |

## What changes in the codebase

### New files

- `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx` — React context wrapping the Mosaic Coordinator + Selection.
- `app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts` — `MosaicClient` subclass bridging Mosaic to cosmos.
- `app/(dashboard)/users/access-analysis/positionsCache.ts` — pure module for reading/writing the `positions` DuckDB table; hash-keyed by user/project set.
- `app/(dashboard)/users/access-analysis/clusterAnnotations.tsx` — DOM-overlay component for project labels.
- `app/(dashboard)/users/access-analysis/HistogramPanel.tsx` — thin vgplot wrapper for the five sidebar panels.

### Modified files

- `app/(dashboard)/users/AccUsersGraph.tsx` — major surgery. Cosmos init keeps its current scaffolding but: (a) reads positions from DuckDB instead of JS-built `posRef`; (b) wires `CosmosCanvasClient` into the Mosaic Coordinator on mount; (c) removes the `usePhysicsRef` / freeze / sim-config branches; (d) replaces the React filter panel with the Mosaic histograms.
- `app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx` — `queryChartData` retired; `ChartPanel` rows replaced by `HistogramPanel`. `selection` state hoisted to the Mosaic Coordinator context.
- `app/(dashboard)/users/access-analysis/graphTables.ts` — add a fifth Arrow table builder for `positions` (read path).

### Files removed or made dead

- `app/(dashboard)/users/AccUsersGraph.tsx` — the JS topology paths (`buildAccTopologyGraph` callers, `projectTopologyLinksToIndexPairs`, the warmup-then-freeze branches added in commits `04ef796` `6b689ff` `2e5a041` `52b7ce6` `25cc871`).
- `app/(dashboard)/users/cosmosUtils.ts` — keep `buildNodeColorBuffer` and friends; remove the per-edge color buffer plumbing once edges are off by default.
- The Phase 7 React filter panel (`Topology` section in `AccUsersGraph.tsx`) — its responsibilities move to the Mosaic histograms.

## Error handling

The page must continue to render even if any layer fails. Failure modes:

- **DuckDB-Wasm init fails** (already handled in `duckdbClient.ts` with a thrown error). UI: full-page error banner with "Reload" affordance. Falls back to nothing — no JS-side computation path.
- **`positions` cache stale or missing** — warmup path runs. User sees a brief loading state ("Computing layout…") for ~2s.
- **Mosaic Coordinator fails to register a client** — that client renders an inline error chip; other clients continue working.
- **cosmos WebGL2 unavailable** (no GPU support) — fall back to canvas2d like the current code already does, but render at lower fidelity (no clusters, no annotations).
- **Query exceeds DuckDB memory** (very large selections) — Mosaic backpressure caps result set at 50,000 rows; canvas degrades gracefully (some selections under-counted).

## Testing strategy

- **Pure module tests** (Vitest): `positionsCache.ts` hash-keying, `clusterAnnotations` centroid math, `CosmosCanvasClient` query/mask logic with a stubbed cosmos handle.
- **DuckDB SQL tests** (Vitest with in-memory DuckDB): each histogram's SQL, the `cluster_centroids` view, the `positions` round-trip.
- **Mosaic integration tests** (Vitest + jsdom): Coordinator with two histograms and a stub canvas client — verify a click in one histogram updates the other's bars and the canvas's alpha mask.
- **Manual UAT** (existing pattern): FPS at idle (24,285 nodes), selection latency on 5 successive histogram clicks, lasso correctness, label legibility at 75% zoom.

## Migration plan (rough — actual phase plan comes after spec approval)

The build is sequenced so each step is independently testable in the browser without breaking the existing AccUsersGraph for users who haven't flipped the flag.

1. Add `@uwdata/mosaic-core` Coordinator + Selection to `MosaicCoordinatorContext`, wrap `AccessAnalysisPage`.
2. Add `positions` Arrow table + cache module + DuckDB round-trip.
3. Refactor cosmos init in AccUsersGraph: warmup → freeze → read-from-DuckDB positions.
4. Add `CosmosCanvasClient` with a static Selection (no histograms yet). Verify alpha mask works.
5. Replace one sidebar ChartPanel with a `HistogramPanel` (Project Membership). Verify crossfilter into canvas.
6. Add cluster_centroids view + annotations overlay.
7. Add polygonal lasso → Selection adapter.
8. Migrate remaining four ChartPanels to HistogramPanel.
9. Retire dead code paths (JS topology, edge color buffer, freeze attempts).
10. Performance pass: verify 30–60 FPS at 24k, <100ms selection latency, <2s warm load.

## Open questions

None at design time. Open questions surface during planning if they do.

## Decisions log

- **Node model:** one node per (user, project) instance (~24,285). Confirmed 2026-05-13 over the alternative collapsed-user model.
- **Selection model:** fixed-position crossfilter (Mosaic-standard). Reverses an earlier in-conversation answer once the user pointed to the Cosmograph Mosaic Integration example as the target pattern.
- **Edges by default:** off. Similarity is positional-only (long-standing memory rule); folder/role-hub edges available on demand but not in the default scene.
- **Annotations:** DOM overlay, not WebGL text. Matches existing label overlay pattern in `CosmosGraphRenderer.drawLabelOverlay`.
- **Position cache:** keyed by `hash(sort(user_projects.node_id))`. Invalidates automatically when the underlying instance set changes.
- **Sim freeze:** achieved by `render(0)` per RAF after warmup, not by `pause()` / config toggle (the latter triggers the position-reset bug observed in cosmos.gl beta.9).
