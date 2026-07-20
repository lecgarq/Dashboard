# Plan 33-02 Summary — PERF-06: pre-split baseline, graph-first split, post-split re-measure (+ PERF-05 network evidence)

**Status:** COMPLETE 2026-07-20 · **Commit:** 65306046

## What shipped

- **Pre-split baseline (task 1, captured 2026-07-16 on `e7e14e64`).**
  Isolated `:3100` median-of-5: **5,116 ms** time-to-graph (vs 28.1 median
  4,360 ms = +17.3% drift from Phases 29–32; recorded, non-gating per locked
  decision 1). Full JSON + chunk sizes in `33-BASELINE.md`.
- **Graph-first split (`AccessAnalysisShell.tsx`).** `Toolbar`,
  `RightPanelStack`, `NeighborMatchesPanel` deferred via `next/dynamic`
  (`ssr:false`) behind geometry-matched quiet placeholders: Toolbar header box
  with an invisible tallest-control copy; rail placeholder at the persisted
  `loadSidebarWidth()` width with the border-l seam. `Toolbar.tsx` /
  `RightPanelStack.tsx` roots gained `motion-safe:animate-in fade-in
  duration-300` — fade-in only, no layout shift, reduced-motion honored.
  Graph canvas mount order and `__ACC_GRAPH_TEST__` bridge untouched.
  `Legend`/`MapClusterLabels` left static (small; the measurable weight was
  framer-motion via the two deferred carriers — post-split shell chunk greps 0
  for framer).
- **Post-split measure (task 4, captured 2026-07-20, BUILD_ID
  `-s2axhf9ZXI7QfXQcQWC8`).** Identical method: median **3,914 ms** —
  **−1,203 ms (−23.5%) vs pre-split = PERF-06 PASS**; also −446 ms (−10.2%)
  vs the 4,360 ms reference. First paint median 996 → 688 ms. Shell chunk
  164,154 → **134,108 bytes (−18.3%)**; cosmos chunk unchanged 280,384.
- **PERF-05 network evidence (task 2) + in-phase root-cause fix.**
  - `/users/spatial-graph`: PASS pre- and post-split — prefetched
    `bulkUsers`(permissionSummary) + `instanceEmbedding` never refetched.
  - `/users`: **initial FAIL** — `bulkUsers` (lean) refetched every load.
    Root cause: `acc-route-hydration.ts` imported `BULK_USERS_LEAN_INPUT`
    from the `"use client"` `useUsersDirectoryData.ts`; in the built RSC
    graph that import is a client-reference proxy, so the prefetch input
    failed to parse and the SSR prefetch errored (pre-existing since PERF-03
    v2.4, masked until 33-01 fixed hydration). **Fix:** constant moved to
    directive-free `lib/acc/cachePolicy.ts`; `useUsersDirectoryData.ts`
    re-exports it; server imports from `cachePolicy`.
  - Post-fix, post-split re-check: temporary spec
    (`perf05-network-evidence.spec.ts`, authenticated, 25 s settle,
    `/api/trpc/*` listener) **1 passed, zero violations on both routes** —
    all five `/users` prefetched procedures hydrate without client refetch.
    Spec deleted after the evidence run per plan (durable net =
    `lib/server/hydrationState.test.ts`); JSON transcribed into
    `33-BASELINE.md`.

## Deviations

1. **Build recipe path trap (environment, no code impact).** Running
   `npx next build --webpack` for `.next-e2e` from Git Bash failed with
   `Debug Failure. Expected C:/LECG/Dashboard/.next-e2e/cache/.tsbuildinfo ===
   C:\LECG\Dashboard\.next-e2e\cache\.tsbuildinfo` (path-style clash with the
   PowerShell-built incremental cache). Deleted the stale `.tsbuildinfo` and
   re-ran via PowerShell per the script header's recipe. Keep isolated builds
   in PowerShell.
2. **BULK_USERS_LEAN_INPUT relocation** was not in the plan's `files_modified`
   (found by task 2's evidence run); smallest root-cause fix, recorded above.

## Gates (all run, exact outcomes)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` (PERF-02) | 27/27 passed |
| `npx vitest run useUsersDirectoryData.test.ts UsersDirectoryClient.integration.test.tsx hydrationState.test.ts` | 20/20 passed (3 files) |
| `npx vitest run app/(dashboard)/users/access-analysis` | 994 passed / 3 failed — the 3 = known pre-existing usePredicateEngine Phase-25 set, reported separately |
| `node scripts/repo-map/check.cjs` | PASS (3 dep-cruiser warnings baselined; ast-grep 248 vs baseline, no blocking rule) |
| Baseline spec N=5 | green in both measurement passes (it is the method) |
| `impeccable` detect (Shell/Toolbar/RightPanelStack) | `[]` — zero findings |
| PERF-06 pass/fail (locked decision 1) | **PASS** — 3,914 < 5,116 ms |

## Durable follow-up debt

- CONCERNS §Ph28.1(2) (shell chunk) can be marked resolved at phase close with
  the −18.3% chunk / −23.5% median evidence.
- ARCHITECTURE.md line "BULK_USERS_LEAN_INPUT … defined in
  useUsersDirectoryData.ts" is now stale — home is `lib/acc/cachePolicy.ts`
  (correct at next codebase-map refresh; note rolled to CONCERNS at close).
