# Phase 33 Verification — Perf Closeout & Verification

**Written:** 2026-07-20 · **Plans:** 33-01, 33-02, 33-03 (3/3 summarized)
**Commits:** e7e14e64 (33-01), 65306046 (33-02), 682a4176 (33-03) + docs
commits c5643691, e3274a2e, d8126249.

## Requirement coverage

### PERF-05 — shared SSR-hydration boundary fix ✅

- `lib/server/hydrationState.ts` `deserializeHydrationState()` unwraps the
  superjson `{ json, meta }` wrapper before `<HydrationBoundary>`; raw state
  passes through by reference. Applied at **all three** call sites:
  `app/(dashboard)/layout.tsx:46`, `app/(dashboard)/users/page.tsx:14`,
  `app/(dashboard)/users/spatial-graph/page.tsx` (inline 9fb54cb8 fix
  migrated). Unit test `lib/server/hydrationState.test.ts` pins both branches
  (2/2, Date survives superjson round-trip).
- **"Verifiably hydrate" network evidence** (33-02, temporary authenticated
  spec, `/api/trpc/*` listener, 25 s settle): violation lists **empty on both
  routes**. `/users/spatial-graph`: prefetched bulkUsers(permissionSummary) +
  instanceEmbedding never refetched. `/users`: all five prefetched procedures
  hydrate — after the in-phase root-cause fix of `BULK_USERS_LEAN_INPUT`
  (imported from a `"use client"` module by server code = client-reference
  proxy → SSR prefetch errored since PERF-03/v2.4; constant moved to
  directive-free `lib/acc/cachePolicy.ts`).

### PERF-06 — shell chunk code-split + re-measure ✅ (locked-decision-1 pair PASS)

- Graph-first split in `AccessAnalysisShell.tsx`: `Toolbar`,
  `RightPanelStack`, `NeighborMatchesPanel` deferred via `next/dynamic`
  (`ssr:false`) behind geometry-matched quiet placeholders (no layout shift,
  fade-in only, reduced-motion honored). Shell chunk 164,154 → **134,108
  bytes (−18.3%)**; framer-motion fully evicted (grep 0).
- Fresh in-phase pair (`scripts/measure-spatial-graph-baseline.cjs`, isolated
  `:3100`, median-of-5): pre-split **5,116 ms** → post-split **3,914 ms** =
  **−23.5% PASS**. vs 28.1 median 4,360 ms: **−446 ms (−10.2%)** — recorded;
  under the roadmap's original strict reading this also passes. First paint
  996 → 688 ms. Full JSON in `33-BASELINE.md`.

### LINK-PERF (owner-added, best-effort — no fps gate) ✅

- Profiled: JS tick 1.36 ms/draw; causal A/B pinned the ceiling on Canvas2D
  **rasterization** (~40 ms/frame for the 14.2k-bezier web; 60.0 fps Tier-0
  with the overlay blanked vs 17.6 fps drawing).
- Applied (appearance-identical): ambient-only ~10 Hz redraw throttle
  (`AMBIENT_REDRAW_MS=100`; pan/zoom, morph, data and focus changes redraw
  immediately) + lazy per-combo Path2D / empty-stroke skip.
- Full-sample fps (phase32-ambient 10 s gate): **21.35 → 41.33 fps (+94%)**.
  Rejected levers + renderer-rethink v2.6 candidate (OffscreenCanvas worker /
  cosmos-native links / zoom decimation) recorded in `33-BASELINE.md`.
- Phase-32 contract intact: band widths/opacities, ambient<selected<hover
  priority, 25%-floor morph web, tier controller (still degrades <50 fps as
  designed), PERF-02 frozen handle untouched.

## Gate record (all actually run)

| Gate | Outcome |
|---|---|
| `npx tsc --noEmit` | clean (every plan; twice in 33-03) |
| `lib/server/hydrationState.test.ts` | 2/2 passed |
| PERF-02 `GraphCanvas.test.ts` | 27/27 passed (33-02 and 33-03) |
| Focused overlay tests (SimilarityWebOverlay + similarityWeb) | 13/13 passed |
| TEST-01/02/03 characterization | 4 files / 20 tests passed (acc-dc-graph, folderPermissionTerrainView, templateFolderTerrain.sharedQuery, templateFolderTerrain) |
| `npx vitest run app/(dashboard)/users/access-analysis` | 994 passed / 3 failed — known pre-existing usePredicateEngine Phase-25 set (deferred item, reported separately) |
| `node scripts/repo-map/check.cjs` | PASS (3 dep-cruiser warnings baselined — BND-03 group-2 family ratcheted to 3 edges in 33-01; ast-grep 248 vs baseline, no blocking rule) |
| Baseline spec N=5 | green both measurement passes |
| `phase32-ambient.spec.ts` on optimized `:3100` (BUILD_ID `exsSYVkoR31p_Jr47JnH0`) | **4/4 passed** |
| impeccable deterministic hook (Shell/Toolbar/RightPanelStack 33-02; overlay 33-03) | zero findings |
| Ponytail phase-diff review (completion step 2) | net 0 — lean; flag-gated profile counters deliberate keep |

## Deviations carried from summaries

1. **33-01:** repo-map dep-cruiser baseline ratchet for the pre-existing
   Phase-29 `scripts → app` edge (BND-03 group-2 family, now 3 edges).
2. **33-02:** isolated builds are **PowerShell-only** (Git Bash `.tsbuildinfo`
   path-style clash); `BULK_USERS_LEAN_INPUT` relocation was an unplanned
   in-scope root-cause fix.
3. **33-03 INCIDENT:** a Git Bash **double-quoted** PowerShell build command
   expanded `$env:` to empty → built over the live `.next` without the e2e
   flags. Recovered by restarting `LECG Dashboard Local` on the (complete,
   tsc-clean, current-HEAD) accidental build; probe `/login` 200, `/` 307.
   Durable guard gap recorded below.
4. **33-03:** plan's JS-cost hypothesis corrected by profiling (raster-bound,
   not path-rebuild-bound); levers re-ranked accordingly, same intent.

## Remaining gaps / VERIFY items

- None blocking. Pre-existing failure sets stay deferred and documented:
  3 usePredicateEngine Phase-25 unit failures; acc-dc-graph.spec.ts 14-failure
  e2e drift (needs re-baseline, standing deferred item 4).

## Deploy (autoDeploy policy) — SHIPPED 2026-07-20

Full deploy-sequence run 2026-07-20 ~09:41 CST: `LECG Dashboard Local` task
stopped, `:3000` freed, `npx tsc --noEmit` clean, `npm run build` (PowerShell)
passed, task restarted.

- Task state: **Running**; port 3000 listening.
- Production BUILD_ID: **`-zcfnulR0rESok3UDom50`**.
- `/api/health`: 200, `database: connected` (15:41:33 Z).
- Unauthenticated probes: `/login` 200 (no auth "Configuration" error);
  `/users`, `/users/spatial-graph` 307 → login (expected).
- Authenticated Chromium live-route smoke (temporary spec, deleted after):
  **1 passed** — `/users/spatial-graph` rendered the graph shell with the
  similarity-web canvas attached; `/users` rendered the directory search.

**Incident note (same day, pre-deploy):** an earlier mis-quoted PowerShell
command built over the live `.next` without flags; recovered by an interim
task restart on that tsc-clean current-HEAD build (BUILD_ID
`36eF4RQHkFsVWMARlaro2`, probe 200/307). The final deploy above supersedes it.

**Phase 33 = v2.5's last phase → next: `/lecg-close-milestone`.**
