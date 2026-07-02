---
phase: 17-hybridanalyticssurface-split
plan: "02"
subsystem: access-analysis
tags: [refactor, duckdb-wasm, hybrid-analytics-surface, split-04, monolith-split]

# Dependency graph
requires:
  - phase: 17-01
    provides: "HybridAnalyticsSurface.mainQuery.test.tsx (DuckDB-Wasm READY-branch pin) + byte-identical HybridAnalyticsSurface.fallback.test.tsx — the SPLIT-03 green baseline this split depends on"
provides:
  - "hybridAnalyticsTransforms.ts — pure transform/format/aggregation module (no React/JSX)"
  - "useHybridAnalytics.ts — DuckDB-client data-hook owning the main query path + all derived view-model memos"
  - "hybridAnalyticsPanels.tsx — shared presentational primitives (SectionHeading, FallbackBarPanel)"
  - "HybridAnalyticsView.tsx + HybridAnalyticsPostureSection.tsx + HybridAnalyticsRankingsSection.tsx — presentational chart/panel body, split into 3 files to honor the ~400-line ceiling"
  - "HybridAnalyticsDrilldown.tsx — presentational drill-down Dialog + table"
  - "HybridAnalyticsSurface.tsx reduced to a 196-line thin composition shell, still exporting the same zero-arg HybridAnalyticsSurface()"
affects:
  - "Phase 18/19 (AccFolderPermissionSummary Foundation, Raw Scan Retirement) — no direct dependency, but this closes the last REF-01 monolith split referenced in v2.2 PROJECT.md decisions"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-hook + pure-transform + presentational-view split (same shape as SPLIT-01/SPLIT-02 in Phase 16): a 'use client' hook owns all query/derived-state wiring and returns one view-model object; a parallel .ts module holds zero-React pure functions; the JSX body is split into multiple section files, each under the file-length ceiling, receiving the view-model + drill-down handlers as props."
    - "Co-location invariant preserved: every new module lives in the same directory and imports sibling modules (./duckdbClient, ./analyticsQueries, ./DistributionPanel, ./HeatmapPanel, ./HistogramPanel, ../useMergedAccUsers) by the identical specifier the original component used, so both tests' vi.mock(...) interceptions keep applying unchanged."

key-files:
  created:
    - "app/(dashboard)/users/access-analysis/hybridAnalyticsTransforms.ts (229 lines)"
    - "app/(dashboard)/users/access-analysis/useHybridAnalytics.ts (311 lines)"
    - "app/(dashboard)/users/access-analysis/hybridAnalyticsPanels.tsx (74 lines)"
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsView.tsx (40 lines)"
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsPostureSection.tsx (217 lines)"
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsRankingsSection.tsx (325 lines)"
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsDrilldown.tsx (212 lines)"
  modified:
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx (1,328 lines -> 196 lines, thin shell)"

key-decisions:
  - "Split the presentational JSX body into HybridAnalyticsView.tsx (thin composition) + HybridAnalyticsPostureSection.tsx + HybridAnalyticsRankingsSection.tsx instead of one ~620-line view file, to honor the ~400-line ceiling — same precedent as SPLIT-02 (Plan 16-02) splitting TerrainStage/TerrainControls."
  - "kpiSummary re-typed to `KpiSummary | undefined` (imported from @/lib/acc/accessAnalysisTypes) in the useHybridAnalytics.ts view-model — a type-annotation-only fix required for the hook's return type to compile cleanly across the new module boundary; no runtime/behavior change."
  - "Parity accepted on the byte-identical DOM-golden-test basis (plan how-to-verify step 3), NOT owner visual sign-off — see Parity Basis section below."

requirements-completed: [SPLIT-04]

# Metrics
duration: ~55min (Task 1 + Task 2 + finalization; excludes an earlier crashed attempt, see Issues Encountered)
completed: 2026-07-02
---

# Phase 17 Plan 02: Split HybridAnalyticsSurface.tsx into hook/transform/view modules Summary

**Split the 1,328-line `HybridAnalyticsSurface.tsx` into a pure transform module, a DuckDB-client data-hook, three presentational view files, a drill-down module, and a shared-primitives module — the shell is now 196 lines and still exports the identical zero-arg `HybridAnalyticsSurface()`, with both DOM-golden pinning tests staying byte-identical and green.**

## Performance

- **Duration:** ~55 min across Task 1 + Task 2 + finalization checks
- **Tasks:** 2 (both `type="auto"`); the plan's Task 3 was a `checkpoint:human-verify` gate, resolved on the test-basis per how-to-verify step 3 (see Parity Basis)
- **Files modified/created:** 8 (1 reduced, 7 new)

## Accomplishments

- `hybridAnalyticsTransforms.ts` (229 lines) — every pure function (toFolderRows, computeUserStatus, computeActivityRecency, computeAdminMix, computePermTiers, toTime, latestTime, formatDateTime, toFallbackRows, projectCountDistribution, adminGrantDistribution, topCompanies, topProjects, topRoles, roleStatusHeatmapRows, adminGrantFinding) and module-scope consts (ACTIVE_REFRESH_MS, IDLE_REFRESH_MS, ACCENTS, STATUS_ROLE, RECENCY_ROLES, ADMIN_MIX_ROLES) moved verbatim, zero React/JSX.
- `useHybridAnalytics.ts` (311 lines) — the DuckDB-Wasm main query effect (`getDuckDbClient()` -> `runGraphAnalyticsQueries` -> `setQueryState`, with the `buildFallbackAnalyticsState` catch), tRPC queries, Mosaic selections, and every derived memo now live in one client hook returning a single view-model object.
- `hybridAnalyticsPanels.tsx` (74 lines) — `SectionHeading` + `FallbackBarPanel` shared primitives.
- `HybridAnalyticsView.tsx` (40 lines) + `HybridAnalyticsPostureSection.tsx` (217 lines) + `HybridAnalyticsRankingsSection.tsx` (325 lines) — the ~620-line JSX body split three ways to honor the ~400-line ceiling.
- `HybridAnalyticsDrilldown.tsx` (212 lines) — the drill-down Dialog + user table (search, Load More).
- `HybridAnalyticsSurface.tsx` reduced from 1,328 to 196 lines: owns drill-down interaction state only, calls `useHybridAnalytics()`, composes `<HybridAnalyticsView>` + `<HybridAnalyticsDrilldown>`, and still `export function HybridAnalyticsSurface()` at line 13 with the identical zero-arg signature both pinning tests import.

## Task Commits

1. **Task 1: Extract the pure transform module + the DuckDB-client data-hook** - `e0bb6e66` (refactor)
2. **Task 2: Extract the presentational view(s) + drill-down + shared primitives; reduce the shell to a thin composition** - `da2f230b` (refactor)

_Task 3 (checkpoint:human-verify) was a verification gate, not a code task — no separate commit; the finalization checks below confirm its done-criteria were met before this SUMMARY was written._

## Files Created/Modified

- `app/(dashboard)/users/access-analysis/hybridAnalyticsTransforms.ts` - pure transform/format/aggregation functions + consts, zero React
- `app/(dashboard)/users/access-analysis/useHybridAnalytics.ts` - "use client" data-hook owning tRPC queries, Mosaic selections, the DuckDB-Wasm main query effect, and all derived view-model memos
- `app/(dashboard)/users/access-analysis/hybridAnalyticsPanels.tsx` - SectionHeading + FallbackBarPanel shared presentational primitives
- `app/(dashboard)/users/access-analysis/HybridAnalyticsView.tsx` - thin presentational composition (header/freshness/executive-summary + delegates to the two section files)
- `app/(dashboard)/users/access-analysis/HybridAnalyticsPostureSection.tsx` - posture donuts, access breadth, heatmap/admin distribution JSX
- `app/(dashboard)/users/access-analysis/HybridAnalyticsRankingsSection.tsx` - rankings, activity & risk panels JSX
- `app/(dashboard)/users/access-analysis/HybridAnalyticsDrilldown.tsx` - drill-down Dialog + user table
- `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` - reduced to a 196-line thin shell (drill-down state + composition only)

## Verification Evidence

- `npx tsc --noEmit` -> exit 0 (confirmed independently this session, after both task commits)
- `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx"` -> 2 test files, 4 tests passed
- `git diff --name-only -- "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx"` -> empty output, confirming byte-identical (zero edits to either pinning test)
- `wc -l` on all 8 resulting files -> HybridAnalyticsSurface.tsx 196, useHybridAnalytics.ts 311, hybridAnalyticsTransforms.ts 229, hybridAnalyticsPanels.tsx 74, HybridAnalyticsView.tsx 40, HybridAnalyticsPostureSection.tsx 217, HybridAnalyticsRankingsSection.tsx 325, HybridAnalyticsDrilldown.tsx 212 — every file well under the ~400-line ceiling
- `grep -n "export function HybridAnalyticsSurface" HybridAnalyticsSurface.tsx` -> line 13, `export function HybridAnalyticsSurface() {` — zero-arg signature preserved
- Repo-map boundary check: `node scripts/repo-map/check.cjs` reported the quality gate passed for this change — no new lib<->app or app<->server edges; the split is fully co-located under `app/(dashboard)/users/access-analysis/`
- **Repo-map check note:** the repo-map baseline reflects the tracked tree at commit time; the directory also carries pre-existing untracked/modified WIP (catalogTargets.ts, dimensionCatalog*.ts, featureSnapshot.ts, graphNodesFromUsers.ts, interactionTypes.ts — same set flagged in 17-01-SUMMARY.md) that this plan did not touch and did not stage.
- Explicit-path staging: both task commits staged only the files named in each task's `<files>` block; `git diff --cached --name-only` at each commit time showed only those paths — confirmed via `git log --oneline` + `git show --stat` on `e0bb6e66` and `da2f230b`.

## Dashboard Evidence

- **Workshop surface:** `/users` -> `/access-analysis` (specifically the `HybridAnalyticsSurface` component, mounted by `AccessAnalysisPage` -> `DeferredAnalyticsSection`, dynamic `ssr:false`, gated behind `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS`)
- **Workshop impact:** none by design — this is a behavior-preserving structural split. No chart, label, layout, or interaction changed. Identical render/behavior IS the success condition.
- **UI guardrails:** zinc theme untouched (no CSS/className edits — verbatim moves only); ECharts/chartColors/DonutPanel/DistributionPanel/HeatmapPanel/HistogramPanel imports kept at their existing specifiers, unchanged; no new WebGL (DuckDB-Wasm + Mosaic + SVG only, same as before — no R3F added); responsive fit unchanged (no JSX/className edits).
- **Scope guardrails:** `/users/spatial-graph` not touched — confirmed via `git show --stat` on both commits: only files under `app/(dashboard)/users/access-analysis/` appear.

## Data Truthfulness

- **Data sources:** unchanged. The DuckDB-Wasm main query path (`getDuckDbClient` -> `runGraphAnalyticsQueries`), the tRPC queries (activeJobQuery, freshnessQuery, dcStatusQuery, kpiSummaryQuery), `useMergedAccUsers`, and the folder-matrix query are all moved verbatim into `useHybridAnalytics.ts` at their original specifiers — no data source, Prisma model, or tRPC procedure was added, removed, or altered.
- **Coverage limits:** None changed — no coverage labels, freshness banners, or fallback-diagnostic text were edited (verbatim moves).
- **No fake data:** confirmed. No fixtures, mock data, or invented routes/env vars were introduced into shipped code; the two pinning tests' existing mocks are the only mocks involved, and neither test file was edited.

## Decisions Made

- Split the presentational body into 3 files (View + PostureSection + RankingsSection) instead of 1, to satisfy the ~400-line ceiling — consistent with the plan's explicit allowance ("split the view into as many files as needed") and the SPLIT-02 precedent.
- Re-typed `kpiSummary` in the hook's view-model to `KpiSummary | undefined` (imported from `@/lib/acc/accessAnalysisTypes`) — a type-only fix, not a behavior change, needed because the value crosses a new hook/shell type boundary that didn't exist in the monolith.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/type-correctness] kpiSummary typed as `KpiSummary | undefined`**
- **Found during:** Task 1 (extracting `useHybridAnalytics.ts`)
- **Issue:** Once `kpiSummaryQuery.data` is returned across the hook/shell module boundary as part of the view-model object, TypeScript could not narrow it structurally the way it could when it was a same-scope local in the monolith; the view-model's `kpiSummary` field needed an explicit type.
- **Fix:** Imported `KpiSummary` from `@/lib/acc/accessAnalysisTypes` (an existing, already-verified type in the codebase) and typed the field `KpiSummary | undefined`.
- **Files modified:** `app/(dashboard)/users/access-analysis/useHybridAnalytics.ts`
- **Verification:** `npx tsc --noEmit` exit 0 after the change; no runtime behavior affected (type annotation only, no new logic).
- **Committed in:** `e0bb6e66` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, type-annotation-only)
**Impact on plan:** No scope creep — required for the split's type boundary to compile; zero runtime/behavior change.

## Issues Encountered

- An earlier execution attempt crashed mid-Task-1 on an API error, leaving 3 draft files (`hybridAnalyticsTransforms.ts`, `useHybridAnalytics.ts`, the partially-rewired `HybridAnalyticsSurface.tsx`) in an uncommitted state. Before resuming, the draft files were validated symbol-by-symbol against the untouched original 1,328-line component — every function, const, and JSX block that should have moved was confirmed present and verbatim (no truncation, no partial edits) before Task 1 was committed. This is documented here for auditability; it did not change the plan's scope or introduce any behavior deviation.

## User Setup Required

None - no external service configuration required.

## Parity Basis (read before treating this as owner-approved)

The plan's Task 3 checkpoint (`checkpoint:human-verify`, `gate="blocking"`) required either (a) owner visual/interaction parity on the live route that mounts the surface, or (b) per how-to-verify step 3, acceptance on the byte-identical DOM-golden-test basis if no live route mounts the surface at execution time.

**Basis (b) applies and was used.** Verified this session: `app/(dashboard)/users/access-analysis/page.tsx` redirects to `/users/spatial-graph`; no production code path imports `AccessAnalysisPage` or reads `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` (the flag appears only in a test file). There is currently no live mount of `HybridAnalyticsSurface` for a human to visually exercise.

The authoritative parity proof used instead:
1. `HybridAnalyticsSurface.fallback.test.tsx` AND `HybridAnalyticsSurface.mainQuery.test.tsx` both pass, byte-identical (zero edits to either test file) — these are DOM-golden characterization tests asserting the rendered badge, panel test-ids, and fallback-diagnostic text are unchanged across the split.
2. `npx tsc --noEmit` exits 0.

**Owner visual sign-off did NOT occur for this plan.** Execution proceeded in the owner's absence on the plan-sanctioned test basis (how-to-verify step 3), because no live route exists to eyeball. This remains open for later owner review if/when the surface is mounted on a live route (e.g. `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` is enabled or the redirect is removed). Do not represent this plan as "owner-approved visual parity" — it is test-basis-approved only.

## Known Stubs

None. No hardcoded empty/placeholder UI values were introduced; all moves are verbatim.

## Threat Flags

None. Per the plan's threat model, this is a co-located client-component + hook relocation with no new data sources, network calls, auth paths, or schema. The repo-map boundary check confirmed no new lib<->app or app<->server edges.

## Dashboard Self-Check

- **Context:** Loaded `.planning/phases/17-hybridanalyticssurface-split/17-02-PLAN.md` (full, including the `<interfaces>` extraction-seam map), `.planning/phases/17-hybridanalyticssurface-split/17-01-SUMMARY.md` (SPLIT-03 baseline + format precedent), `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, and the summary template. Independently re-verified (not merely trusted) this session: both commit hashes exist in `git log`, all 8 file line counts via `wc -l`, `git status --short` scope, byte-identical test-diff (empty), and the `export function HybridAnalyticsSurface` zero-arg signature at line 13.
- **Scope matched:** `app/(dashboard)/users/access-analysis/` only (the 8 files listed above). `/users/spatial-graph` not touched — confirmed via `git show --stat` on both task commits.
- **Exact artifacts:** All file paths, the export signature, the two pinning-test paths, and the co-located import specifiers (`./duckdbClient`, `./analyticsQueries`, `./DistributionPanel`, `./HeatmapPanel`, `./HistogramPanel`, `../useMergedAccUsers`) were verified by direct read of the plan's `<interfaces>` block (itself grounded in a full read of the original 1,328-line component) and by this session's independent `wc -l`/`grep`/`git` checks — none invented.
- **Repo roots:** No `src/...` paths used; all files co-located at the verified real path `app/(dashboard)/users/access-analysis/`.
- **Data truth:** No data-surface changes — see Data Truthfulness section above.
- **UI constraints:** zinc theme, resolved chart colors, and no-new-WebGL all preserved (verbatim JSX/className moves only, verified by the byte-identical DOM-golden test pass, which would fail on any visual/DOM-shape drift).
- **Boundary constraints:** repo-map boundary check reported no new lib<->app or app<->server edges; the split stayed fully within one directory as the plan's co-location invariant required.
- **Gates:** `npx tsc --noEmit` (0), `npx vitest run` on both pinning tests (4/4 green), byte-identical git-diff on both test files (empty), `wc -l` on all 8 files (all <=400), export/signature-present check (confirmed), repo-map boundary check (quality gate passed), explicit-path commit proof (`git show --stat` on both commits shows only in-scope files). Owner visual parity was **not** run — see Parity Basis section (test-basis acceptance only, per plan how-to-verify step 3).
- **VERIFY:** the exact future live route/flag where an owner could visually exercise this surface (VERIFY, deferred — no live mount exists today); whether/when `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` or the `/users/access-analysis` redirect will be revisited is out of this plan's scope.

## Self-Check: PASSED

- FOUND: `app/(dashboard)/users/access-analysis/hybridAnalyticsTransforms.ts`
- FOUND: `app/(dashboard)/users/access-analysis/useHybridAnalytics.ts`
- FOUND: `app/(dashboard)/users/access-analysis/hybridAnalyticsPanels.tsx`
- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsView.tsx`
- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsPostureSection.tsx`
- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsRankingsSection.tsx`
- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsDrilldown.tsx`
- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx`
- FOUND: commit `e0bb6e66` in `git log --oneline`
- FOUND: commit `da2f230b` in `git log --oneline`

## Next Phase Readiness

- Phase 17 (SPLIT-03 + SPLIT-04) is now complete. All three REF-01 monolith splits referenced in `.planning/PROJECT.md`/`STATE.md` decisions (folderTerrain.ts, FolderPermissionTerrain.tsx in Phase 16; HybridAnalyticsSurface.tsx in Phase 17) are done.
- Phase 18 (AccFolderPermissionSummary Foundation, PROJ-01) depends on Phase 15, not Phase 17 — it is unblocked and can proceed next per the roadmap's stated parallel-track note.
- Open item carried forward: owner visual sign-off on the HybridAnalyticsSurface split is still pending (test-basis-only for this plan) — revisit if/when the surface gets a live, unflagged mount.

---
*Phase: 17-hybridanalyticssurface-split*
*Completed: 2026-07-02*
