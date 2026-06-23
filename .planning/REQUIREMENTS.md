# Requirements: LECG Dashboard — v2.1 Concerns Hardening

**Defined:** 2026-06-23
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric derivable from the local Prisma DB and honest about coverage.
**Source:** `.planning/codebase/CONCERNS.md` (8 sections, 22 mapped concerns). Every concern is dispositioned below as in-scope (REQ-ID), deferred (Future), or out-of-scope.

## v2.1 Requirements

In scope for this milestone. Each maps to a roadmap phase (numbering continues from Phase 09).

### Database & Config Hardening (DB)

- [ ] **DB-01**: `AccFolderPermission` gains a standalone `@@index([roleId])` via a Prisma migration; `EXPLAIN ANALYZE` on a role-joined terrain query confirms the new index is used. _(CONCERNS §1.2)_
- [ ] **DB-02**: `scripts/count-acc-data.cjs` no longer sets `ssl:{rejectUnauthorized:false}`; it connects via the project Prisma client / `DATABASE_URL` pool with no TLS-bypass flag. _(§1.3)_
- [ ] **DB-03**: `.env.example` documents `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192`, each with a comment explaining why it is required for access-analysis at scale (pool × workers ≤ `max_connections`). _(§1.4, §1.5)_
- [ ] **DB-04**: the `includePermissionContexts:true` raw-scan branch in `lib/server/acc-hot-cache.ts` carries a warning comment about the ~5M-row heap risk plus a `VERIFY:` note that no active caller enables it. _(§1.1)_

### Layering & Boundary Fixes (BND)

- [ ] **BND-01**: the `app/(dashboard)/access-analysis/coordinationActions.ts` Server Action no longer imports `@/server/db` directly; the clash query runs through a tRPC procedure (`acc-members` or a new `acc-coordination`), and `ast-grep` rule `direct-prisma-in-ui` returns 0 matches. _(§2.1)_
- [ ] **BND-02**: pure classification logic (`classifyActivity`, `donutModules`, `CATEGORY_LABELS`, `n()`) lives in `lib/acc/activityClassification.ts`, re-exported by `moduleOverrides.ts`; the four `scripts/diag-activity-*.cjs` import from `lib/` (the 4 `moduleOverrides` scripts→app dependency-cruiser warnings are cleared). _(§2.2)_
- [ ] **BND-03**: `lib→app` reverse-dependency edges are enumerated via `node scripts/repo-map/check.cjs`, and every edge **not** rooted in `/users/spatial-graph` is eliminated; spatial-graph-coupled edges are documented as deferred. _(§7.1)_
- [ ] **BND-04**: the `app→server` edges are audited; any import from a client component (not a Server Component/Action) is corrected, and the acceptable server-component edges are documented. _(§7.2)_

### Data-Truthfulness Labels (TRUTH)

- [ ] **TRUTH-01**: `/access-analysis` shows Data Connector coverage ("Based on 428 of 1,152 projects with Data Connector access") on the data-freshness panel, and DC-derived metrics are labeled accordingly. _(§5.2)_
- [ ] **TRUTH-02**: activity-timeline charts display a "Data available from [date]" footnote sourced from a `dataFloor` field on the timeline API response (per-project `MIN(createdAt)` from `AccActivityAccds`, ~12-month floor). _(§2.6)_
- [ ] **TRUTH-03**: the module-activity donut on `/access-analysis` carries a footnote/tooltip stating classification is `rawAction`-based and Autodesk's `service` attribution is not yet reconciled (~40.7% disagreement). _(§2.5)_
- [ ] **TRUTH-04**: the `AccDcRole`-empty → `AccRole` fallback (and its DC-conflict behavior) is documented in `.planning/codebase/INTEGRATIONS.md`. _(§2.4, doc)_

### Integration Health & Observability (OBS)

- [ ] **OBS-01**: `scripts/progress-monitor.cjs` reports ACCDS session health and emits `[WARN] ACCDS session expires in <N> hours` (or "session expired") before the crawl token-refresh path runs. _(§5.1)_
- [ ] **OBS-02**: `lib/server/acc-hot-cache.ts` logs a warning when `AccDcRole` is still empty after a cache refresh, making a silent `AccRole`-sync failure observable. _(§2.4, observable)_
- [ ] **OBS-03**: the two stale `TODO[02.5]` defensive-logging guards in `lib/acc/acc-admin.ts` (lines 51, 207) are removed after a one-time confirmation that live field names match. _(§5.3)_

### Type-Safety & Lean-Payload Guards (TYPE)

- [ ] **TYPE-01**: the `bulkUsers` return type marks `roles`/`modules` as always-empty lean-payload fields (`never[]` and/or an explicit comment), so consumers cannot silently expect populated arrays. _(§4.1)_
- [ ] **TYPE-02**: `app/(dashboard)/users/accGraphFilters.ts` has a compile-time assert (`satisfies` / `AssertExtends`) that fails if the two filter union types drift. _(§4.2)_

### Test Coverage & Characterization (TEST)

- [ ] **TEST-01**: a Vitest test covers the `AccFolderPermission` `GROUP BY` aggregate in `lib/server/acc-hot-cache.ts`, asserting it returns ≤ `n_roles × n_projects` rows (not raw permissions) — guarding the dominant OOM regression. _(§8.1)_
- [ ] **TEST-02**: characterization tests pin the current tRPC-boundary outputs and pure transforms of the access-analysis monoliths (`FolderPermissionTerrain.tsx`, `folderTerrain.ts`); the files carry a "split-pending" warning comment. _(§2.3 guardrail; split deferred → REF-01)_
- [ ] **TEST-03**: a characterization test pins the shared `AccFolderPermission` terrain query output used by both `/template-mty` and `/access-analysis`, so the deferred `folderPermQuery` extraction can proceed safely later. _(§6.1 guardrail; extraction deferred → REF-02)_

## Future Requirements

Tracked but **not** in the v2.1 roadmap. v2.1 ships the characterization tests that make the refactors safe.

### Structural Refactors (deferred — behind v2.1 characterization tests)

- **REF-01**: split `FolderPermissionTerrain.tsx` (1,041 lines), `folderTerrain.ts` (1,093), and `HybridAnalyticsSurface.tsx` (1,326) into data-hook / transform / thin-view modules. _(§2.3)_
- **REF-02**: extract `lib/server/folderPermQuery.ts` owning the base `AccFolderPermission` join; template + access-analysis import from it. _(§6.1)_
- **REF-03**: materialise an `AccFolderPermissionSummary` view / indexed projection to retire the raw-scan path entirely. _(§1.1, long-term)_

### Blocked on external / data dependencies

- **DC-01**: unlock the 724 Data-Connector-403 projects via APS Account Admin provisioning. _(§5.2, external)_
- **DC-02**: resolve the two `dataLayer.ts` TODOs (populate per-project roles/modules) once the DC CSV `activity_in_module` / `total_activity` join is wired. _(§4.1)_
- **SVC-01**: the `service`-override classification refinement (reconcile Build vs Model Coordination for ~966 clash-issue rows) — needs design approval. _(§2.5)_

## Out of Scope

Explicitly excluded from v2.1. Documented to prevent scope creep.

| Concern | Reason |
|---------|--------|
| Spatial-graph DuckDB warm-up, cosmos.gl reheat, 176-action catalog lazy-load (§3.1–3.3) | `/users/spatial-graph` is out of scope per PROJECT.md; deferred to a future spatial-graph milestone |
| Lasso e2e 120s flake + hydration-prefetch regression test (§3.4, §3.5) | spatial-graph surface; same boundary |
| Spatial-graph physics/e2e test splits — `physicsLayer.test.ts`, `GraphCanvas3D.test.ts`, `acc-dc-graph.spec.ts` (§8.2, §8.3) | spatial-graph surface; same boundary |
| Moving `internalDomains.ts` / `graphNodesFromUsers.ts` / `instanceFeatureTokens.ts` into `lib/` (part of §2.2, §7.1) | touches spatial-graph route files; deferred with the spatial-graph scope (BND-02/BND-03 cover only non-spatial-graph edges) |

## Traceability

Populated during roadmap creation (Phase 09+).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | TBD | Pending |
| DB-02 | TBD | Pending |
| DB-03 | TBD | Pending |
| DB-04 | TBD | Pending |
| BND-01 | TBD | Pending |
| BND-02 | TBD | Pending |
| BND-03 | TBD | Pending |
| BND-04 | TBD | Pending |
| TRUTH-01 | TBD | Pending |
| TRUTH-02 | TBD | Pending |
| TRUTH-03 | TBD | Pending |
| TRUTH-04 | TBD | Pending |
| OBS-01 | TBD | Pending |
| OBS-02 | TBD | Pending |
| OBS-03 | TBD | Pending |
| TYPE-01 | TBD | Pending |
| TYPE-02 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |
| TEST-03 | TBD | Pending |

**Coverage:**
- v2.1 requirements: 20 total
- Mapped to phases: 0 (roadmapper to fill)
- Unmapped: 20 ⚠️ (resolved at roadmap creation)

---
*Requirements defined: 2026-06-23 for milestone v2.1 (Concerns Hardening)*
*Last updated: 2026-06-23 after initial definition*
