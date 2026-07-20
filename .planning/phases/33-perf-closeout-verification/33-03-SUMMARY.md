# Plan 33-03 Summary — LINK-PERF: profile + best-effort Canvas2D link-path optimization

**Status:** COMPLETE 2026-07-20

## What shipped

- **Profile (task 1).** Flag-gated `performance.now()` spans added to
  `SimilarityWebOverlay.tsx` (`__SIM_WEB_PROFILE__` counters, compiled in only
  when `NEXT_PUBLIC_ACC_GRAPH_TEST=1` — dead-code-stripped from production
  builds). Result: the JS tick is **1.36 ms/draw** (projection 0.63 /
  path-build 0.49 / stroke calls 0.21 / focus 0.03) — the working
  hypothesis's "path rebuild cost" was wrong. A causal A/B (overlay drawing
  vs zero-area canvas) pinned the ceiling on Canvas2D **rasterization** of
  ~14.2k antialiased beziers: 17.57 fps drawing vs **60.00 fps Tier-0 held**
  with the overlay blanked.
- **Optimizations (task 3).** Two appearance-safe levers in
  `SimilarityWebOverlay.tsx`:
  1. `AMBIENT_REDRAW_MS = 100` — ambient-only drift redraws the web at
     ~10 Hz (sub-pixel motion per interval); pan/zoom, morphs, data and
     focus changes still redraw immediately.
  2. Lazy per-combo `Path2D` allocation + empty bucket×band stroke skip.
- **Before/after (tasks 2+4), full 22,279-node / 14,155-link sample:**
  phase32-ambient 10s gate **21.35 → 41.33 fps (+94%)**; A/B deficit vs
  no-overlay 42.4 → 17.1 fps. No hard fps gate applied (locked decision 4).
- **Renderer-rethink finding recorded** in `33-BASELINE.md` (v2.6 candidate):
  one full-web redraw costs ~40 ms of raster, so main-thread Canvas2D cannot
  hold Tier 0 ≥50 fps with full links at any honest cadence. Candidates:
  OffscreenCanvas worker raster, cosmos-native lines, zoom-based edge
  decimation.
- **Phase-32 appearance/behavior preserved:** band widths/opacities
  (`linkBandStyle` untouched), ambient<selected<hover draw priority, 25%-floor
  morph web (morph bypasses the throttle via `isMorphing`), focus edges bypass
  the throttle, tier controller unchanged (still degrades below 50 fps as
  designed), overlay never touches the cosmos handle (PERF-02).

## Deviations

1. **INCIDENT — accidental build over the live `.next`.** The first
   instrumented rebuild was launched from Git Bash with the PowerShell
   command in **double quotes**; bash expanded `$env:...` to empty, so the
   build ran with neither `NEXT_DIST_DIR=.next-e2e` nor the graph-test flag
   and overwrote the live `:3000` dist (`.next`), deleting the old build's
   chunks. Recovery: since the accidental build was a complete tsc-clean
   build of current HEAD, the `LECG Dashboard Local` task was restarted on
   it (probe: `/login` 200, `/` 307 auth redirect) — effectively an early
   serve of committed 33-02 work; phase-close autoDeploy still runs the full
   sequence. **Trap for the guard + memory:** from Git Bash, PowerShell env
   assignments must be single-quoted; `guard-bash.cjs` does not currently
   deny `powershell ... npx next build` while `:3000` is live.
2. **Working hypothesis corrected by profiling.** The plan's candidate levers
   targeting JS path-rebuild cost (per-edge dirty checks, Path2D reuse) were
   moot at 1.36 ms/draw; the applied levers target raster frequency and
   stroke count instead. Same plan intent (profile ranks, then apply), so no
   scope change.
3. **Temporary evidence specs** (`linkperf-profile.spec.ts`,
   `linkperf-ab.spec.ts`) deleted after the record, matching the 33-02
   pattern. The flag-gated profile counters stay (30 lines, production
   dead code, makes future re-profiling free).

## Gates (all run, exact outcomes)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean (×2: post-instrumentation, post-optimization) |
| `npx vitest run .../GraphCanvas.test.ts` (PERF-02) | 27/27 passed |
| Focused overlay tests (`SimilarityWebOverlay.test.tsx`, `similarityWeb.test.ts`) | 13/13 passed |
| TEST-01/02/03 characterization (`acc-dc-graph.test.ts`, `folderPermissionTerrainView.test.ts`, `templateFolderTerrain.sharedQuery.test.ts` + `templateFolderTerrain.test.ts`) | 4 files / 20 passed |
| `npx vitest run app/(dashboard)/users/access-analysis` | 994 passed / 3 failed — the known pre-existing usePredicateEngine Phase-25 set, reported separately |
| Playwright `phase32-ambient.spec.ts` on optimized `:3100` build (`exsSYVkoR31p_Jr47JnH0`) | 4/4 passed |
| Visual spot-check (test screenshots) | web threads/bands/legend render as Phase 32; morph state normal |
| impeccable deterministic hook on edited TSX | no findings |

## Durable follow-up debt

- **guard-bash gap:** `powershell -Command "... npx next build ..."` bypasses
  the build-while-:3000-live deny rule (and bash double-quote `$env:`
  expansion is the trigger that makes it dangerous). Extend the guard to
  powershell-wrapped next/npm build invocations.
- **v2.6 renderer-rethink candidate** (see 33-BASELINE.md LINK-PERF after):
  OffscreenCanvas worker raster / cosmos-native links / zoom decimation if
  Tier-0-with-full-links ≥50 fps ever becomes a requirement.
