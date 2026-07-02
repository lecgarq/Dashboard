---
phase: 17-hybridanalyticssurface-split
plan: "01"
subsystem: access-analysis
tags: [testing, characterization, duckdb-wasm, hybrid-analytics-surface, split-03]
dependency-graph:
  requires: []
  provides:
    - "HybridAnalyticsSurface.mainQuery.test.tsx (READY-branch characterization pin)"
  affects:
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx (pinned, not modified)"
tech-stack:
  added: []
  patterns:
    - "vi.mock(\"./analyticsQueries\", async (importOriginal) => ...) partial-mock pattern to keep EMPTY_ANALYTICS_QUERY_STATE / buildFallbackAnalyticsState / errorToAnalyticsDiagnostic real while overriding runGraphAnalyticsQueries"
key-files:
  created:
    - "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx"
  modified: []
decisions:
  - "Reused the fallback test's mock surface verbatim (trpc, useMergedAccUsers, AccessEventsChart, DistributionPanel, HeatmapPanel, HistogramPanel) and diverged only on ./duckdbClient (resolve instead of reject) and ./analyticsQueries (partial mock overriding only runGraphAnalyticsQueries) to drive the READY branch deterministically."
metrics:
  duration: "~20 minutes"
  completed: "2026-07-02"
status: complete
---

# Phase 17 Plan 01: Pin HybridAnalyticsSurface DuckDB-Wasm main query path Summary

Added `HybridAnalyticsSurface.mainQuery.test.tsx`, a new characterization test that forces the DuckDB-Wasm READY branch (mocked `getDuckDbClient` resolves, mocked `runGraphAnalyticsQueries` resolves a synthetic `status:"ready"` state) and asserts the "DuckDB-Wasm" badge plus the Mosaic panels (DistributionPanel/HeatmapPanel/HistogramPanel) render instead of the local fallback bars — establishing the SPLIT-03 green baseline that the SPLIT-04 split (Plan 17-02) depends on.

## What Was Built

- **New file:** `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx` (192 lines)
  - Mirrors the mock surface of the existing `HybridAnalyticsSurface.fallback.test.tsx` verbatim (trpc, `useMergedAccUsers`, `AccessEventsChart`, `DistributionPanel`, `HeatmapPanel`, `HistogramPanel` — same 1-user/1-folder-row fixture, same `mosaic-*` test ids).
  - Diverges in exactly two mocks to drive the READY path:
    1. `./duckdbClient` — `getDuckDbClient` resolves `{ connection: {} }` instead of rejecting.
    2. `./analyticsQueries` — partial mock via `importOriginal()`; keeps the real `EMPTY_ANALYTICS_QUERY_STATE`, `buildFallbackAnalyticsState`, `errorToAnalyticsDiagnostic` exports, overrides only `runGraphAnalyticsQueries` with a `vi.fn()` resolving a synthetic `status:"ready"` `AnalyticsQueryState`.
  - Test 1: renders `<HybridAnalyticsSurface />`, waits for the "DuckDB-Wasm" badge, asserts `mosaic-distribution` (≥1), `mosaic-heatmap` (≥1), and exactly 3 `mosaic-histogram` test ids are present, and asserts the fallback diagnostic text `/DuckDB-Wasm unavailable/` is absent (`queryByText` returns `null`).
  - Test 2: asserts `runGraphAnalyticsQueries` was called with an object exposing `connection`, an array `users`, and an array `folderRows` — pinning the effect's call contract (HybridAnalyticsSurface.tsx lines 593-625) that SPLIT-04 must preserve when the effect moves into a data hook.

No source file was created, moved, split, or edited. `HybridAnalyticsSurface.tsx` and every sibling module (`duckdbClient.ts`, `analyticsQueries.ts`, `DistributionPanel.tsx`, `HeatmapPanel.tsx`, `HistogramPanel.tsx`) are untouched.

## Verification Evidence

- `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx"` — 1 test file, 2 tests passed.
- `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"` — 2 test files, 4 tests passed (both new tests + both pre-existing fallback tests green together).
- `git diff --name-only -- "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"` — empty output, confirming byte-identical (zero edits) to the existing pin.
- `git status --short -- "app/(dashboard)/users/access-analysis/"` — the only untracked/new entry is `HybridAnalyticsSurface.mainQuery.test.tsx`; all other modified entries in that directory (`catalogTargets.ts`, `dimensionCatalog*.ts`, `featureSnapshot.ts`, `graphNodesFromUsers.ts`, `interactionTypes.ts`) are pre-existing branch WIP this plan did not touch and did not stage.
- `git diff --cached --name-only` at commit time showed exactly one path: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx`.
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` — empty (no deletions in the commit).
- `npx tsc --noEmit` — exit code 0 (ran as an informational check even though the plan does not require it as a hard gate for a test-only change; confirms the new test type-checks cleanly against the rest of the tree, including the pre-existing branch WIP).
- Commit: `b6084f5f` — `test(17): pin HybridAnalyticsSurface DuckDB-Wasm main query path (SPLIT-03)`.

## Deviations from Plan

None — plan executed exactly as written. Both tasks passed on first attempt; no auto-fixes, no rule-1/2/3 deviations, no architectural decisions needed.

## Workshop Impact & Data Truthfulness

- **Workshop impact:** none. This is a test-only plan. The `/users/access-analysis` surface (HybridAnalyticsSurface) renders and behaves exactly as before — no user-visible change, which is the intended outcome.
- **Data truthfulness:** unaffected. No data sources, Prisma models, tRPC procedures, coverage labels, or env vars were touched. The new test mocks the existing DuckDB-Wasm/tRPC seams using the same fixture pattern as the pre-existing fallback test; it introduces no fixtures that misrepresent live analytics.

## Known Stubs

None. No hardcoded empty/placeholder UI values were introduced; this plan adds test code only.

## Threat Flags

None. Per the plan's threat model, this adds a Vitest characterization test only — no new inputs, endpoints, auth paths, schema, or runtime code.

## Dashboard Self-Check

- **Context:** Loaded `.planning/phases/17-hybridanalyticssurface-split/17-01-PLAN.md`, `.planning/STATE.md` (SPLIT-03 gate directive, explicit-path-commit hazard), `.planning/config.json`, `.claude/skills/lecg-dashboard/SKILL.md`, `./CLAUDE.md`, `dashboard-self-check.md`, the component under test (`HybridAnalyticsSurface.tsx`), the existing pin (`HybridAnalyticsSurface.fallback.test.tsx`), and `analyticsQueries.ts`. All read directly this session; no stale-context gaps.
- **Scope matched:** `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx` only — the `/users` → access-analysis workshop surface. `/users/spatial-graph` not touched (verified: no files under that route in the diff).
- **Exact artifacts:** Test imports (`HybridAnalyticsSurface`, `AnalyticsQueryState`), mock targets (`@/lib/core/trpc`, `../useMergedAccUsers`, `./duckdbClient`, `./analyticsQueries`, `./AccessEventsChart`, `./DistributionPanel`, `./HeatmapPanel`, `./HistogramPanel`), the badge text (`"DuckDB-Wasm"`), and the `mosaic-*` test ids were all verified by direct Read of the source files listed above before writing the test — none invented.
- **Repo roots:** No `src/...` paths used; test co-located at the verified real path `app/(dashboard)/users/access-analysis/`.
- **Data truth:** N/A — no data-surface changes in this plan.
- **UI constraints:** N/A — no UI rendered/changed; zinc theme, ECharts, motion, and card-nesting rules not implicated by a test-only change.
- **Boundary constraints:** No Prisma/tRPC/component boundary changes; the test only mocks existing seams already used by the fallback pin.
- **Gates:** `npx vitest run` on the new test (green), `npx vitest run` on both HybridAnalyticsSurface tests together (green, 4/4), byte-identical git-diff proof on the fallback test (empty), `git status --short` / `git diff --cached --name-only` scope proof (single path), `npx tsc --noEmit` run as an informational check (exit 0) even though not a hard gate for this test-only plan.
- **VERIFY:** none remaining — the synthetic ready-state fixture, the mock pattern, and the call-contract assertion were all finalized and proven green against the live component render this session.

## Self-Check: PASSED

- FOUND: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.mainQuery.test.tsx`
- FOUND: commit `b6084f5f` in `git log --oneline`
