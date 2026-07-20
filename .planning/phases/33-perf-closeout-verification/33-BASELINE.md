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

## LINK-PERF (to be recorded)

_Pending: 33-03 profile + before/after fps._
