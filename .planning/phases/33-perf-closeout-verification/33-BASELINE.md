# Phase 33 Baseline — PERF-06 pair, PERF-05 network evidence, LINK-PERF

Method: `scripts/measure-spatial-graph-baseline.cjs` (Phase 24/28.1 methodology) —
isolated `.next-e2e` webpack prod build served on `:3100`
(`NEXT_PUBLIC_ACC_GRAPH_TEST=1`), Playwright `spatial-graph-baseline` spec,
N=5 loads (run 1 cold), median reported. `:3000` untouched throughout.

## Pre-split (fresh in-phase, Phases 29–32 + PERF-05/33-01 aboard)

Captured 2026-07-16, commit `e7e14e64`, BUILD_ID `l8NiVuD1PGGlXm4C3InkT`,
cosmos.gl 3.3.0 (patch applied).

```json
{
  "runs": [
    { "run": 1, "cold": true,  "firstPaintMs": 824,  "timeToGraphRenderedMs": 10707.5 },
    { "run": 2, "cold": false, "firstPaintMs": 996,  "timeToGraphRenderedMs": 4505.9 },
    { "run": 3, "cold": false, "firstPaintMs": 1092, "timeToGraphRenderedMs": 4446.5 },
    { "run": 4, "cold": false, "firstPaintMs": 1020, "timeToGraphRenderedMs": 5116.4 },
    { "run": 5, "cold": false, "firstPaintMs": 992,  "timeToGraphRenderedMs": 5200.3 }
  ],
  "medianFirstPaintMs": 996,
  "medianTimeToGraphRenderedMs": 5116.4,
  "nodeCount": 22279,
  "featureCount": 22279
}
```

**Pre-split median time-to-graph: 5,116 ms.** Delta vs the 28.1 median
(4,360 ms): **+756 ms (+17.3%)** — drift accumulated across Phases 29–32
(ambient motion layer, link bands, focus choreography, PaCMAP payloads all
aboard). Recorded honestly per locked decision 1; the 29–32 drift alone does
not gate Phase 33 — the in-phase pair below does.

Pre-split chunk sizes (`.next-e2e/static/chunks`, bytes):

- Shell chunk (contains `__ACC_GRAPH_TEST__` bridge): `1332.*.js` = **164,154**
- cosmos.gl chunk: `455a015b.*.js` = **280,384**
- (post-split figures recorded below after the rebuild)

## PERF-05 network evidence (same pre-split `:3100` build)

Authenticated Playwright loads with a `/api/trpc/*` request listener,
20–30 s post-load settle:

- **`/users/spatial-graph` — PASS.** Recorded client tRPC fetches included
  `accSync.*` status polls, `gmail.getRecent`, `project.get`,
  `users.getDirectory`, `users.getOrgDirectory` (background/layout queries).
  **Neither prefetched query (`accDcGraph.bulkUsers` w/ permissionSummary
  input, `accDcGraph.instanceEmbedding`) was refetched** — the check's
  violation list was empty. Full request list re-captured on the post-split
  build below.
- **`/users` — initial FAIL, root-caused and fixed in-phase.**
  `accDcGraph.bulkUsers` (input `{"leanProjects":true}`) was refetched on
  every load, warm or cold, while the other four prefetched queries hydrated
  cleanly. SSR HTML inspection showed the dehydrated bulkUsers entry with
  `status:"error"`, `isInvalidated:true`, an input serialized as a **flight
  module reference** (`$2a` → `I[88879,…]`), and a queryHash missing its
  input.
  **Root cause:** `lib/server/acc-route-hydration.ts` imported
  `BULK_USERS_LEAN_INPUT` from `useUsersDirectoryData.ts`, a `"use client"`
  module — in the built RSC graph every export of a client module imported
  from server code is a client-reference proxy, not the value. The prefetch
  input therefore failed to parse, the SSR prefetch errored, and the client
  refetched the full payload on every `/users` mount. **Pre-existing since
  PERF-03 (v2.4)** — masked until 33-01 fixed hydration (before that, the
  wrapped state hydrated nothing and the client refetched everything anyway).
  In-process repro: direct `createCaller` with an ADMIN session returned
  3,791 rows in 749 ms — the proc itself is healthy; only the RSC-proxied
  input was broken.
  **Fix (33-02):** `BULK_USERS_LEAN_INPUT` moved to the directive-free
  `lib/acc/cachePolicy.ts`; `useUsersDirectoryData.ts` re-exports it for
  client consumers; `acc-route-hydration.ts` imports it from `cachePolicy`.
  Post-fix network evidence recorded below on the post-split build.

## Post-split (graph-first staged load aboard)

Captured 2026-07-20, commit `e7e14e64` + uncommitted 33-02 tree (split +
`BULK_USERS_LEAN_INPUT` relocation), BUILD_ID `-s2axhf9ZXI7QfXQcQWC8`,
cosmos.gl 3.3.0 (patch applied). Identical method: isolated `.next-e2e`
webpack prod build on `:3100`, `spatial-graph-baseline` spec, N=5, run 1 cold.

```json
{
  "runs": [
    { "run": 1, "cold": true,  "firstPaintMs": 628, "timeToGraphRenderedMs": 7666.8 },
    { "run": 2, "cold": false, "firstPaintMs": 496, "timeToGraphRenderedMs": 3703.2 },
    { "run": 3, "cold": false, "firstPaintMs": 692, "timeToGraphRenderedMs": 3873.3 },
    { "run": 4, "cold": false, "firstPaintMs": 688, "timeToGraphRenderedMs": 3913.7 },
    { "run": 5, "cold": false, "firstPaintMs": 688, "timeToGraphRenderedMs": 3981.2 }
  ],
  "medianFirstPaintMs": 688,
  "medianTimeToGraphRenderedMs": 3913.7,
  "nodeCount": 22279,
  "featureCount": 22279
}
```

**Post-split median time-to-graph: 3,914 ms.**

- **vs pre-split 5,116 ms: −1,203 ms (−23.5%) — PERF-06 PASS** (locked
  decision 1: post-split measurably better than pre-split).
- vs the 28.1 median 4,360 ms: **−446 ms (−10.2%)** — the split not only
  recovered the Phases 29–32 drift (+756 ms) but landed below the v2.4
  closeout median. Recorded honestly; non-gating either way.
- Median first paint 996 → 688 ms (−31%).

Post-split chunk sizes (`.next-e2e/static/chunks`, bytes):

- Shell chunk (contains `__ACC_GRAPH_TEST__` bridge):
  `634.e66437de4f0ad9fa.js` = **134,108** (pre-split 164,154 → **−30,046,
  −18.3%**); `grep -c framer` in the chunk = 0 — framer-motion fully evicted
  from the initial shell chunk (deferred with `Toolbar`/`RightPanelStack`/
  `NeighborMatchesPanel` via `next/dynamic`).
- cosmos.gl chunk: `455a015b.d46144c73c81b29a.js` = **280,384** (unchanged —
  the graph stays the priority chunk, untouched by the split).

## PERF-05 network evidence — post-split build (post-fix re-check)

Temporary spec `tests/e2e/perf05-network-evidence.spec.ts` (authenticated
storageState, `/api/trpc/*` request listener, 25 s post-load settle, fresh
context per route; JSON in `test-results/perf05-network-evidence.json`;
spec deleted after this record — the durable net is
`lib/server/hydrationState.test.ts`). Result: **1 passed** —
violation lists empty on BOTH routes.

- **`/users/spatial-graph` — PASS.** Client tRPC traffic was only
  `accDcGraph.similarityEdges` (never prefetched — separate overlay query),
  `accMembers.enrichedUsers`, `accSync.*` polls, `gmail.getRecent`,
  `project.get`, `users.getDirectory`, `users.getOrgDirectory`
  (background/layout queries). Neither prefetched query
  (`accDcGraph.bulkUsers` permissionSummary, `accDcGraph.instanceEmbedding`)
  refetched.
- **`/users` — PASS (was FAIL pre-fix).** After moving
  `BULK_USERS_LEAN_INPUT` to `lib/acc/cachePolicy.ts`, **none** of the five
  prefetched procedures (`accDcGraph.bulkUsers` lean,
  `accMembers.enrichedUsers`, `users.getOrgDirectory`, `users.getDirectory`,
  `accActivity.lastFileActivityByEmailAll`) appear in client traffic — the
  every-load lean bulkUsers refetch is gone. Remaining client traffic:
  coverage/dataVersion/accSync/gmail/project background queries only.

## LINK-PERF profile (before)

Captured 2026-07-20 on the post-split `:3100` build rebuilt with flag-gated
`performance.now()` spans in `SimilarityWebOverlay.tsx` (counters compiled in
only when `NEXT_PUBLIC_ACC_GRAPH_TEST=1`; dead code in production builds).
Full sample: 22,279 nodes / 14,155 mapped links.

**JS-side tick breakdown (6s window, ambient running):** 110 draws, 0 parked,
per-draw ms — projection+clear 0.63, path-build 0.49, stroke calls 0.21,
focus 0.03, **total 1.36 ms/draw** (~25 ms/s of JS). The JS loop is NOT the
cost.

**Causal A/B (same build):** fps measured 5s each way after a Tier-0 reset —
overlay drawing: **17.57 fps**; overlay `display:none` (zero-area buffer →
strokes no-op): **60.00 fps, Tier 0 held**. The entire deficit is Canvas2D
**rasterization** of ~14.2k antialiased quadratic beziers per redraw
(~40 ms/frame of raster work invisible to `performance.now()` around
`ctx.stroke()`, which only queues commands).

**Before fps (phase32-ambient 10s gate, this phase):** **21.35 fps**
(elapsed 10,024 ms), Tier 0 → degraded to Tier 2 within the window
(matches Phase 32's recorded 20.68 fps ceiling).

## LINK-PERF (after)

**Applied** (in `SimilarityWebOverlay.tsx`; band widths/opacities, draw
priority, 25%-floor morph web, focus rendering, and the frozen cosmos handle
all untouched):

1. **Ambient-only redraw throttle (`AMBIENT_REDRAW_MS = 100`).** When the
   only change is ambient position drift (no pan/zoom, no morph, no
   data/focus change, opacity settled), the web redraws at ~10 Hz instead of
   every ~33 ms tick. Ambient micro-orbits displace nodes sub-pixel per
   100 ms, so the lag is visually imperceptible; pan/zoom, slider morphs,
   selection and hover changes still redraw immediately on the next tick.
2. **Lazy per-combo Path2D + empty-stroke skip.** Most bucket×band combos are
   empty; they are no longer allocated or stroked, and `strokeStyle` is built
   only for buckets that actually stroke.

**After fps (identical method, rebuilt `:3100`, BUILD_ID
`exsSYVkoR31p_Jr47JnH0`):** **41.33 fps** (10,016 ms) — and 41.45 fps on the
full-suite re-run — vs 21.35 before = **+94%**. A/B on the same build:
overlay drawing 42.93 fps vs hidden 60.04 fps (deficit 42.4 → 17.1 fps).
Profile: 52 draws / 106 parked per 6s (~8.7 redraws/s), per-draw JS
unchanged (~1.5 ms). Playwright `phase32-ambient.spec.ts` **4/4 passed** on
the optimized build — tier controller still degrades below 50 fps as
designed (holds-or-degrades contract intact; `lastWindowFps` ~37.5 at the
10s mark).

**Rejected levers** (recorded per plan):

- Short-segment bezier→line swap — sub-pixel in theory, but appearance-risk
  with unproven gain ("if in doubt, don't").
- Lower overlay canvas dpr — visibly blurs strokes.
- Global tick-rate cut below 30 Hz — would lag pan/zoom tracking, which is
  user-visible-fast.
- OffscreenCanvas/worker rasterization and cosmos-native straight links —
  renderer-level rethink, out of best-effort scope.

**Renderer-rethink finding (v2.6 candidate, per CONTEXT Deferred):**
main-thread Canvas2D fundamentally cannot hold Tier 0 ≥50 fps with the full
14k-link web: one full-web redraw costs ~40 ms of rasterization, so even at
10 Hz ambient cadence the ceiling lands ~42 fps. Candidates: move overlay
rasterization to an OffscreenCanvas worker, or draw links cosmos-native
(straight GPU lines, losing the bezier bow), or decimate drawn edges by
zoom level.
