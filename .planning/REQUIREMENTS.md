# Requirements: LECG Dashboard — v2.2 Structural Refactors

**Defined:** 2026-07-01
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric derivable from the local Prisma DB and honest about coverage.
**Source:** the deferred structural refactors seeded by v2.1 (`PROJECT.md` Active → REF-01/REF-02/REF-03), now safe behind the v2.1 characterization tests (TEST-01/TEST-02/TEST-03).
**Prior milestone:** v2.1 Concerns Hardening (20/20 shipped, tagged `v2.1`) — its requirements are preserved in `PROJECT.md` Requirements → Validated and in git HEAD (`REQUIREMENTS.md@ad1e65e4`).

**Overarching guardrail:** every requirement below is **behavior-preserving**. The
characterization test that pins the touched surface must stay green and byte-identical;
the workshop pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`)
must render identically; `/users/spatial-graph` is not touched.

## v2.2 Requirements

In scope for this milestone. Each maps to a roadmap phase (numbering continues from Phase 15).

### Shared Query Extraction (QUERY → REF-02)

- [ ] **QUERY-01**: the base `AccFolderPermission` join is extracted from `lib/server/templateFolderTerrain.ts` into a new `lib/server/folderPermQuery.ts` (owning the TEST-03 contract: 5-column set, row-bound, project-scoped, null-path handling). Both `templateFolderTerrain.ts` (`/template-mty`) and `lib/server/folderPermissionTerrainView.ts` (`/access-analysis`) import the base query from it — no duplicated join SQL. `templateFolderTerrain.sharedQuery.test.ts` (TEST-03) passes unchanged.

### Monolith Splits (SPLIT → REF-01)

- [ ] **SPLIT-01**: `app/(dashboard)/access-analysis/folderTerrain.ts` (1,096 lines) is split into a pure transform module + a thin orchestrator (no single file > ~400 lines). The `folderPermissionTerrainView.test.ts` golden masters (`loadFolderPermissionTerrain` / `loadFolderPermissionOverview` / `loadTerrainProjects`) pass byte-identical.
- [ ] **SPLIT-02**: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` (1,044 lines) is split into a data-hook, a pure transform module, and a thin presentational view. `FolderPermissionTerrain.test.tsx` + the terrain golden masters pass; `/access-analysis` renders identically (owner visual check).
- [ ] **SPLIT-03**: characterization coverage for `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` is widened to pin its **main** DuckDB-Wasm query path (today only `HybridAnalyticsSurface.fallback.test.tsx` covers the fallback). The new/expanded test is green **before** any split.
- [ ] **SPLIT-04**: `HybridAnalyticsSurface.tsx` (1,328 lines) is split into a DuckDB-client data-hook + a pure transform + a thin view. SPLIT-03's tests and the fallback test pass; `/users/access-analysis` renders identically.

### Summary Projection (PROJ → REF-03)

- [ ] **PROJ-01**: an `AccFolderPermissionSummary` Prisma model + migration is added; a backfill script populates it from `AccFolderPermission`; a reconciliation script proves the projection matches the live `includePermissionSummary` GROUP BY aggregate (row counts + spot-checked keys) before any consumer is switched.
- [ ] **PROJ-02**: the `includePermissionSummary` path and its terrain consumers read from `AccFolderPermissionSummary`; the `includePermissionContexts:true` raw-scan branch in `lib/server/acc-hot-cache.ts` is retired or hard-guarded. TEST-01 (OOM aggregate guard) and the terrain golden masters still pass; `/access-analysis` + `/template-mty` render identically.
- [ ] **PROJ-03**: a refresh mechanism keeps `AccFolderPermissionSummary` current — wired into the existing ingest cron (`dc-daily-ingest.cjs` path) or an explicit rebuild step — and the staleness bound is documented in `.planning/codebase/INTEGRATIONS.md`.

## Future Requirements

Tracked but **not** in the v2.2 roadmap. Carried forward from v2.1's deferred seeds.

- **SVC-01**: `service`-override classification refinement — reconcile Build vs Model Coordination for ~966 clash-issue rows (~40.7% disagreement flagged by v2.1 TRUTH-03). Needs a classification design decision.
- **Spatial-graph milestone**: the deferred `/users/spatial-graph` concerns (CONCERNS §3, §8.2/8.3) — DuckDB warm-up, cosmos.gl reheat, 176-action catalog lazy-load, lasso e2e flake, hydration-prefetch test, physics/e2e test splits.
- **DC-01**: unlock the 724 Data-Connector-403 projects via APS Account Admin provisioning (external).
- **DC-02**: resolve the two `dataLayer.ts` TODOs (per-project roles/modules) once the DC CSV `activity_in_module` / `total_activity` join is wired (data-blocked).

## Out of Scope

Explicitly excluded from v2.2. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Any workshop-visible change to charts, tables, labels, or layout | v2.2 is behavior-preserving refactor only; the pages must render identically before/after |
| `/users/spatial-graph` rework | Standing out-of-scope boundary; its concerns are a separate future milestone |
| Cosmos.gl / WebGL changes on `HybridAnalyticsSurface` | It is a DuckDB/Mosaic client surface, not WebGL; the split is a structural refactor, not a graph rework |
| New analytics or new data sources | v2.2 restructures existing paths; no new metrics, no new extraction |
| Full `.planning/` migration + v2.1 archival (`MILESTONES.md`/`milestones/v2.1-*`) | Deferred bookkeeping from the v2.1 close; not gated on v2.2 execution |

## Traceability

| Requirement | Seed | Phase | Status |
|-------------|------|-------|--------|
| QUERY-01 | REF-02 | Phase 15 | Pending |
| SPLIT-01 | REF-01 | Phase 16 | Pending |
| SPLIT-02 | REF-01 | Phase 16 | Pending |
| SPLIT-03 | REF-01 | Phase 17 | Pending |
| SPLIT-04 | REF-01 | Phase 17 | Pending |
| PROJ-01 | REF-03 | Phase 18 | Pending |
| PROJ-02 | REF-03 | Phase 19 | Pending |
| PROJ-03 | REF-03 | Phase 19 | Pending |

**Coverage:**

- v2.2 requirements: 8 total
- Mapped to phases: 8 / 8 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-01 for milestone v2.2 (Structural Refactors)*
*Last updated: 2026-07-01 — roadmap created; all 8 requirements mapped to Phases 15–19.*
