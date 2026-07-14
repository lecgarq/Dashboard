# Phase 24 Baseline — `/users/spatial-graph` (PERF-04)

**This is a first-class contract, not a scratch note.** Phase 28's PERF-04
no-regression check judges against the numbers in this file. Do not cite the
stale pre-milestone ~0.46s figure — it is explicitly superseded (see caveats).

## The judged metric

**Median time-to-graph-rendered: 6193.2 ms (~6.19s)**

This is the number Phase 28 compares against. First-paint is recorded below as
supporting context only.

Supporting context — median first-paint (FCP): **644 ms**

## Per-run data (N=5, isolated `:3100` prod build)

| Run | Cold? | First-paint (ms) | Time-to-graph-rendered (ms) | Node count |
|-----|-------|-------------------|------------------------------|------------|
| 1   | yes   | 476               | 6111.2                       | 22,279     |
| 2   | no    | 640               | 6542.5                       | 22,279     |
| 3   | no    | 732               | 6176.8                       | 22,279     |
| 4   | no    | 644               | 6193.2                       | 22,279     |
| 5   | no    | 680               | 6440.1                       | 22,279     |
| **Median** | — | **644** | **6193.2** | — |

Each run used a fresh browser context (independent client cache); the server
process (and its data cache — see the "First load builds your full access
dataset" DuckDB warm-up, CONCERNS.md §3.1) was warm for runs 2-5. Run 1 is the
cold run (fresh server, fresh context) and is flagged but NOT excluded from the
median (N=5, middle value = run 4's 6193.2ms).

## Conditions of measurement

- **cosmos.gl:** `3.3.0` (`@cosmos.gl/graph` per `package.json`), patch
  `patches/@cosmos.gl+graph+3.3.0.patch` applied (confirmed present on disk;
  `package.json`'s `postinstall` runs `patch-package`).
- **Node count observed:** 22,279 (matches the expected post-`0bfe0962`
  drifted count exactly — sanity check passed).
- **Isolated build:** `.next-e2e/BUILD_ID` = `M4ACuFnpy71p8oqGdM-Di`.
- **Commit:** `33d6e58fdfa5763fa98db3318cf44ce69fe6a4fc` (this plan's Task 1
  commit — the isolated `:3100` build was produced from the working tree at
  this commit). A follow-up commit (`f98ae362`, Task 2 deviation) widened a
  test-tooling timeout in the spec **after** this build/measurement ran; it
  does not touch any rendering/app code and does not invalidate these numbers.
- **Build/serve:** `next build --webpack` (prod) served by `next start -p
  3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, `NEXT_DIST_DIR=.next-e2e`.
- **Date:** 2026-07-14 (environment recorded 2026-07-14T22:13:53.859Z;
  measurement completed 2026-07-14T22:14:29.056Z).
- **Live `:3000` verified untouched:** `.next/BUILD_ID` mtime
  (`1784064791` / 2026-07-14 15:33:11 -0600) and content (`csNkdoorEZwNlxHOsJJt_`)
  identical before and after the isolated build and the full measurement run.

### Working-tree condition (data-truthfulness disclosure)

The working tree carried **pre-existing, uncommitted WIP unrelated to Phase
24** at build time — small feature-branch changes under
`app/(dashboard)/users/access-analysis/` (line-ending normalization, a few new
ordinal-dim bucketers in `catalogTargets.ts`, a `projectStatus` field threaded
through `featureSnapshot.ts`/`interactionTypes.ts`/`graphNodesFromUsers.ts`,
and export-visibility narrowing in `dimensionRegistry.ts` /
`hybridAnalyticsTransforms.ts` / `HybridAnalyticsView.tsx`). Verified via
`git diff` inspection: **none of it touches `groupByDimensions.ts`'s
`PRESETS` array, `nodeColors.ts`'s `COLOR_MODES` array, or creates
`dimensionIdSpace.ts`** — i.e. Plan 24-02's DIM-03/DIM-06 unification has
definitively **not** run, satisfying this plan's "measure before anything
changes" requirement for the id-space work. The isolated build was produced
from this exact working-tree state (committed HEAD `33d6e58f` + that
uncommitted WIP), since a real `next build` always builds the working tree,
not just HEAD. Recorded here for honesty; it is not expected to materially
affect graph render timing (none of the touched functions are on the
3-option `PRESETS`-driven render path this milestone holds pixel-identical).

## Honesty caveats (verbatim — do not paraphrase away)

1. With `NEXT_PUBLIC_ACC_GRAPH_TEST="1"`, `GraphCanvas.tsx` forces the GPU 2D
   sim OFF (`ENABLE_GPU_2D_SIM` requires `NEXT_PUBLIC_ACC_GRAPH_TEST !== "1"`,
   around lines 137-139) — the frozen/static-layer path runs instead. This
   measures that path, **not** live `:3000` behavior (which runs the GPU sim
   by default). Valid for regression comparison only via re-running this
   **identical** script (Phase 28 does), not as an absolute live-UX number.
2. The stale pre-milestone **~0.46s figure is superseded** (it measured a
   different code path/dataset, per the MEMORY.md perf-fix record) and **must
   not be cited** as a comparison point going forward. This file is the only
   valid PERF-04 baseline.

## Re-run instructions for Phase 28

From the repo root (PowerShell), with the live `:3000` app running (Task
Scheduler) — this build/serve mechanism never touches `.next`:

```powershell
$env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
$env:NEXT_DIST_DIR=".next-e2e"; npx next start -p 3100
```

Wait until `http://localhost:3100/login` responds, then:

```powershell
node scripts/measure-spatial-graph-baseline.cjs
```

This re-runs `tests/e2e/spatial-graph-baseline.spec.ts` (N=5, same metrics)
and prints the merged JSON (environment record + medians). Compare its
`medianTimeToGraphRenderedMs` against this file's 6193.2ms. Kill the `:3100`
process when done; verify `.next/BUILD_ID` is unchanged before and after.

## Dashboard self-check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `24-CONTEXT.md`,
  `24-01-PLAN.md`, `playwright.verify.config.ts`, `playwright/global-setup.ts`,
  `graphTestBridge.ts`, `tests/e2e/acc-dc-graph.spec.ts` read before writing.
- **Evidence:** all paths/commands/line refs verified against the live repo
  (`git diff`, `cat package.json`, `stat .next/BUILD_ID`, actual script output
  above — no invented numbers; this run either measured for real or this file
  would not exist).
- **Constraints:** measurement-only; no runtime source under `app/`,
  `components/`, `lib/`, `server/` was edited by this plan (the pre-existing
  WIP predates this plan and is disclosed above, not authored by it); live
  `:3000` verified untouched; zinc theme / UI unaffected (no UI changed).
- **Gates:** `npx tsc --noEmit` green; `.next/BUILD_ID` unchanged verified
  twice (pre/post build, and again post-measurement).
- **VERIFY:** none outstanding for this artifact — all figures above are from
  the actual measured run, not estimated.
