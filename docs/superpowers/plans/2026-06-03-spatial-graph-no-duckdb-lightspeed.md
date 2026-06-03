# Plan: spatial-graph "light speed" — remove DuckDB-WASM from the graph critical path

**Date:** 2026-06-03
**Branch:** feat/access-analysis-redesign
**Status:** READY — gated on a live-UAT window (graph-core change; only the owner clicking the graph validates it). Do NOT ship blind.

## Why
After the safe wins shipped 2026-06-03 (hydration-key fix, WASM/Arrow parallelization, instant graph skeleton, cross-module loaders), the remaining floor on `/users/spatial-graph` first load is the **in-browser DuckDB-WASM engine boot (~1–2s)** plus the snapshot query. The graph ships its data INTO a browser SQL engine, waits for it to boot, then queries it back out. Computing the same result in plain JS from the already-hydrated `users` removes that boot from the critical path; DuckDB then loads lazily only for the deferred analytics charts.

## The catch (why it's not one edit)
DuckDB is woven through FOUR places on the critical path:
1. `featureSnapshot.ts` — `buildFeatureSnapshot` runs a DuckDB `GROUP BY` over the Arrow views.
2. `loadNodeIds()` — reads node ids (render order) from a DuckDB view.
3. `AccessAnalysisShell.tsx` (effect ~L458) — `getDuckDbClient` → `registerGraphArrowTables` → `ensurePositionsSchema` → `loadNodeIds` → `buildFeatureSnapshot`.
4. `physicsLayerWorker.ts:63` — `createPhysicsLayerWorker` itself boots DuckDB for the **positions cache** (`loadCachedPositions`/`savePositions`); a cache hit skips simulation (`physicsLayer.test.ts:612`).

## Approach (flag-gated, default OFF)
Add `NEXT_PUBLIC_ACC_JS_SNAPSHOT` (default off). When ON:
1. **New pure module** `graphNodesFromUsers.ts`: `buildGraphNodesFromUsers(users: BulkAccUser[]): { nodeIds: string[]; features: NodeFeatureSnapshot[] }`.
   - Reuse the row construction from `graphTables.ts` (`userIdFor`, `projectRows` per user×project×role) and the row→snapshot mapping + bucket/affiliation/risk/module helpers from `featureSnapshot.ts` (export the pure helpers).
   - Collapse to one node per `userId::projectId` (folder-perm join is currently a no-op — `folderRows: []` — so `permTier` stays null; pick role deterministically, e.g. first sorted role → MORE deterministic than the current arbitrary DuckDB ANY_VALUE).
   - TDD: a fixtures-based test asserting parity with the documented semantics (BigInt→Number, COALESCE defaults, fallback for unknown ids).
2. **Shell**: branch the effect — when flag ON, skip `getDuckDbClient`/register/`ensurePositionsSchema`/`loadNodeIds`/`buildFeatureSnapshot`; use `buildGraphNodesFromUsers(users)`.
3. **Physics**: make the positions cache DuckDB-optional — `createPhysicsLayerWorker` should accept a "no cache" mode (skip `getDuckDbClient`/`loadCachedPositions`/`savePositions`) so the worker spawns without booting DuckDB. Keep existing tests green by gating the new path behind a parameter (default = current behavior).
4. DuckDB stays for the deferred analytics surface (unchanged).

## Verification
- Unit: parity tests for `buildGraphNodesFromUsers`; physics tests stay green (new path additive/parameterized).
- Live: isolated e2e build (`.next-e2e` on :3100, never touches prod :3000) + OWNER UAT clicking the graph (selection, sliders, lasso, colors) with the flag ON.
- Then flip default ON once UAT passes.

## Risk
Touches the graph's data + layout core. Default-OFF flag means zero risk to the live graph until UAT. Heed concurrent-session edits on `GraphCanvas2D.tsx` (renderer — NOT touched by this plan, so low collision).
