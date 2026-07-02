# Phase 19: Raw Scan Retirement & Refresh - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Orchestrator inference from ROADMAP + code grounding (owner away at prompt time; two forking decisions resolved with Dashboard-native defaults, revisitable)

<domain>
## Phase Boundary

Final v2.2 phase. REF-03 completion: switch the `includePermissionSummary`
aggregate consumers off the live `$queryRaw` GROUP BY and onto Phase 18's
materialized `AccFolderPermissionSummary` projection, retire/guard the
`includePermissionContexts:true` raw-scan branch, and keep the projection
current. Behavior-preserving — the four workshop pages must render identically;
the v2.1 characterization tests (TEST-01 OOM guard, TEST-02 terrain golden
masters) are the safety net.

**In scope:**
- PROJ-02 — consumer switch + raw-scan retirement in `lib/server/acc-hot-cache.ts`.
- PROJ-03 — projection refresh mechanism + staleness-bound documentation.

**Out of scope:** any change to what the workshop pages *show*; new analytics;
`/users/spatial-graph`; theme/WebGL changes; the Phase 18 projection schema
(already shipped, reconciled 22,082 == 22,082 / 0 mismatches).
</domain>

<decisions>
## Implementation Decisions

### PROJ-02 — Consumer switch (LOCKED by roadmap SC#1)
- Replace the `$queryRaw` GROUP BY in the `includePermissionSummary` else-branch
  (`lib/server/acc-hot-cache.ts:304-317`) with a `db.accFolderPermissionSummary.findMany`
  read that rebuilds the same `folderSummaryByProjectRole` Map keyed
  `${projectId}::${roleId}` → `{ folderCount, totalBytes, permTypes }`.
  The projection was backfilled byte-identical to this aggregate (Phase 18),
  including the `folderCrawlStatus IN ('ok','partial')` coverage filter, so the
  Map contents must be unchanged.
- Consumers of the `includePermissionSummary:true` path (must be re-verified by
  the planner, do not assume completeness):
  `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:507`,
  `app/(dashboard)/users/access-analysis/RightPanelStack.tsx:109`,
  `lib/server/acc-route-hydration.ts:56`.

### PROJ-02 — Raw-scan branch: HARD-GUARD (owner-away default; revisitable)
- The `includePermissionContexts:true` branch (`acc-hot-cache.ts:288-302`) does a
  `db.accFolderPermission.findMany` over ~5–6M rows — the exact OOM window TEST-01
  guards. Grep confirms **no non-test caller** enables it.
- Decision: **hard-guard the DB-scan so it throws on activation** rather than
  delete it. Rationale: preserves the WS2 edge-feed / per-folder-ACL capability
  for a future deliberate re-enable, fails loudly instead of silently OOMing,
  matches v2.2's risk-managed "behind characterization tests" philosophy, keeps
  rollback trivial.
- Guard placement: at the DB-scan in `acc-hot-cache.ts` (the thing that OOMs),
  NOT in the pure `assembleDcUsers` contexts path — so `dcUserAssembly.test.ts`
  (passes raw rows directly, no DB) stays green. The one DB-level test that
  activates it (`lib/server/acc-hot-cache.test.ts:112`) flips to assert the throw.
- VERIFY: exact test edits and whether any hard-guard should be flag-gated
  (env) vs unconditional throw — planner to specify.

### PROJ-03 — Refresh: AUTO-REFRESH IN CRON (owner-away default; revisitable)
- Decision: re-run the idempotent server-side aggregate
  (`scripts/backfill-folder-perm-summary.cjs` logic — `TRUNCATE + INSERT…SELECT…
  GROUP BY`, which its own header notes "Phase 19 owns incremental refresh") from
  inside `scripts/dc-daily-ingest.cjs`, after a successful ingest, using the same
  wrapped-in-try/catch "non-fatal rebuild" pattern the cron already uses for
  person-graph and instance-embedding builds.
- Rationale: matches the established "sync is automatic, no manual sync UI"
  principle; bounds staleness to ≤1 ingest cycle; the projection never lags the
  raw tables silently.
- MUST stay server-side (never `findMany` the raw table into Node — re-opens the
  OOM window). Prefer factoring the aggregate into a reusable helper the cron and
  the standalone backfill both call, over duplicating SQL. Planner to decide
  helper location/shape.
- Document the staleness bound (≤1 daily ingest) + the manual rebuild fallback
  in `.planning/codebase/INTEGRATIONS.md` (SC#4).

### Claude's Discretion
- Exact helper extraction for the shared aggregate (cron + backfill).
- Whether the guard throws unconditionally or behind an explicit env escape hatch.
- Test-file edits to keep `npm test` green while asserting the new guard.
</decisions>

<specifics>
## Specific Ideas / Grounded Files

- Consumer switch target: `lib/server/acc-hot-cache.ts` (else-branch 303-327;
  raw branch 288-302; input flags 186-190).
- Projection model: `AccFolderPermissionSummary` (`prisma/schema.prisma`),
  populated by `scripts/backfill-folder-perm-summary.cjs`, verified by
  `scripts/verify-folder-perm-summary.cjs`.
- Cron: `scripts/dc-daily-ingest.cjs` (post-ingest non-fatal rebuild block at tail).
- Safety-net tests: TEST-01 = `lib/server/acc-hot-cache.test.ts` (OOM guard);
  TEST-02 = `lib/server/__tests__/folderPermissionTerrainView.test.ts`,
  `lib/server/__tests__/templateFolderTerrain.test.ts`,
  `templateFolderTerrain.sharedQuery.test.ts`.
- Workshop surfaces affected: `/access-analysis` and `/template-mty` (must render
  identically — SC#3, owner visual check).

## Boundary risk the planner MUST resolve (do not assume)
- Roadmap SC#1 lists "terrain files" as consumers to switch, but the terrain
  views (`lib/server/folderPermissionTerrainView.ts`,
  `lib/server/templateFolderTerrain.ts`) read folder permissions through Phase 15's
  shared `folderPermQuery` and need **per-folder tier** granularity, whereas
  `AccFolderPermissionSummary` is a per-`(projectId, roleId)` rollup.
  → Planner must determine whether terrain can actually read the projection
  without losing granularity. If it cannot, scope 19-01 to the
  `includePermissionSummary` aggregate consumers the projection genuinely serves,
  and record the terrain path as `VERIFY:`/out-of-scope with evidence rather than
  forcing a lossy switch. Do NOT break the TEST-02 golden masters.
</specifics>

<deferred>
## Deferred Ideas

- None new. If the terrain-vs-projection granularity gap turns out to need a
  second (per-folder) projection, that is a future-milestone seed, not Phase 19.
</deferred>

---

*Phase: 19-raw-scan-retirement-refresh*
*Context gathered: 2026-07-02 via plan-phase orchestrator inference (research disabled per v2.2 config)*
