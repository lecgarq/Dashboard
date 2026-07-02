---
phase: 17-hybridanalyticssurface-split
type: verification
status: passed
verified: 2026-07-02
requirements: [SPLIT-03, SPLIT-04]
verifier: inline (gsd-verifier crashed twice on a transient API error; orchestrator ran the goal-backward checks directly against the codebase)
---

# Phase 17 Verification — HybridAnalyticsSurface Split (SPLIT-03, SPLIT-04)

**Status: PASSED** — the phase goal is achieved. `HybridAnalyticsSurface.tsx` was
characterized then split behavior-preservingly into a pure transform, a DuckDB-client
data-hook, presentational view/section/drill-down modules, shared primitives, and a
thin composition shell — every resulting file ≤ ~400 lines, both pinning tests
byte-identical and green, `tsc --noEmit` = 0, and `/users/spatial-graph` untouched.

## Verification basis

The `gsd-verifier` subagent was spawned twice and both runs died on a transient
`Connection closed mid-response` API error before writing this report (the same
error also killed the first 17-02 executor run). Rather than gamble on a third
crash-prone spawn, the orchestrator ran the goal-backward checks inline against the
actual codebase (commands + evidence below). This is a verification of real source
wiring and product guardrails, not of SUMMARY claims.

## Must-have verification

| # | Must-have | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | SPLIT-03: a new characterization test pins the DuckDB-Wasm **ready** path (badge + Mosaic panels; fallback diagnostic absent) | ✅ | `HybridAnalyticsSurface.mainQuery.test.tsx` present (192 lines added in `b6084f5f`); asserts "DuckDB-Wasm" badge + `mosaic-distribution`/`mosaic-heatmap`/3× `mosaic-histogram`, and absence of "DuckDB-Wasm unavailable"; green in the suite run below |
| 2 | SPLIT-03: fallback pin byte-identical; NO source moved in 17-01 | ✅ | `git show --stat b6084f5f` = **1 file changed** (the new test only), +192/-0; fallback test byte-identical (empty `git diff --name-only`) |
| 3 | SPLIT-04: `HybridAnalyticsSurface.tsx` is a thin shell (≤ ~400 lines) still `export function HybridAnalyticsSurface()` zero-arg at the same path | ✅ | 196 lines; `export function HybridAnalyticsSurface()` at line 13 |
| 4 | SPLIT-04: DuckDB-Wasm main query path lives in `useHybridAnalytics.ts` | ✅ | hook imports `getDuckDbClient`/`canInitializeDuckDbInBrowser` from `"./duckdbClient"` (L12) and `runGraphAnalyticsQueries` et al. from `"./analyticsQueries"` (L19) — same specifiers → both tests' `vi.mock(...)` still intercept |
| 5 | SPLIT-04: pure helpers in `hybridAnalyticsTransforms.ts` (no React, no JSX) | ✅ | no `react` import, no JSX (grep clean; the one grep hit was the TS annotation `Array<Date \| string ...>`, not JSX) |
| 6 | SPLIT-04: no resulting file exceeds ~400 lines | ✅ | shell 196 · hook 311 · transforms 229 · panels 74 · view 40 · postureSection 217 · rankingsSection 325 · drilldown 212 (max 325) |
| 7 | SPLIT-04: both pinning tests byte-identical AND green | ✅ | `git diff --name-only` on both pins prints nothing; `npx vitest run` on both → **Test Files 2 passed, Tests 4 passed** |
| 8 | SPLIT-04: `npx tsc --noEmit` exits 0 | ✅ | exit 0 (re-verified after all edits) |
| 9 | Requirement traceability: SPLIT-03 + SPLIT-04 accounted | ✅ | `REQUIREMENTS.md` — both `[x]` complete; traceability table: SPLIT-03 `b6084f5f`, SPLIT-04 `e0bb6e66`/`da2f230b` |

## Dashboard product guardrails

- **Scope / repo roots:** all changed source is under `app/(dashboard)/users/access-analysis/`; no generic `src/...` paths introduced.
- **`/users/spatial-graph` fence:** `git diff --name-only 49ea11f9..HEAD -- "app/(dashboard)/users/spatial-graph/"` is empty — not touched.
- **No new WebGL on the data surface:** the split moves the existing DuckDB-Wasm/Mosaic + SVG rendering verbatim; no R3F/WebGL added.
- **Zinc theme + resolved chart colors:** verbatim JSX/className moves; no theme drift (behavior-preserving).
- **Boundary check:** `node scripts/repo-map/check.cjs` → "Repo-map quality gate passed." The 2 dependency-cruiser warnings + 278 ast-grep findings are pre-existing (checked against baseline; `no-scripts-to-app` on `scripts/build-instance-features.ts`, unrelated to this phase). No new lib↔app / app↔server edges from the co-located split.
- **Data truthfulness:** structural relocation only — no data source, coverage label, Prisma model, tRPC procedure, DuckDB query, or env var changed.
- **Commit hygiene:** all commits (`b6084f5f`, `ef1be469`, `e0bb6e66`, `da2f230b`, `e6c2ccf2`) staged by explicit path; no unrelated branch WIP, no `.planning` deletions, no `/users/spatial-graph` files entered any commit.

## Open item (non-blocking, carried forward)

**Owner visual parity was NOT obtained.** `/users/access-analysis` unconditionally
redirects to `/users/spatial-graph`, and no production code mounts `AccessAnalysisPage`
or reads `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` (that flag appears only in a test). With no
live route mounting the surface, there is nothing to visually exercise in the running
app. Parity was therefore accepted on the plan-sanctioned byte-identical-DOM-golden-test
basis (17-02 how-to-verify step 3): the two DOM-golden characterization tests (ready +
fallback branches) plus `tsc` = 0. If a live mount is later wired, an owner visual pass
should confirm the surface renders and behaves identically. This does not block Phase 17
closure or Phase 18.

## Conclusion

All 9 must-haves verified against the codebase; all Dashboard guardrails hold.
**Phase 17 PASSED.** Next: `/gsd:plan-phase 18` (PROJ-01, `AccFolderPermissionSummary`
Foundation — depends on Phase 15, already shipped).
