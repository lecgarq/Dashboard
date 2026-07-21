# Phase 39 Verification — Activity Universe Swap

**Date:** 2026-07-21 · Commits: `f5514155` (39-01), `d1bda10d` (39-02),
`f805a887` (39-03), `22bf4ee9` (ponytail cuts)

## Requirement coverage

### ACT-01 — one node per activity event at the shipped rung ✅

- `/users/spatial-graph` (and the `/users/access-analysis` redirect into it)
  renders the activity universe: 4,904,886 events resident client-side from
  `/api/activity-universe/payload` (binary, shared codec now at
  `lib/acc/columnarPayload.ts`), rendered by the production `GraphCanvas2D`
  frozen-mode canvas. Evidence: `activity/ActivityUniverseShell.tsx`,
  `AccessAnalysisShellClient.tsx` mount swap (`f5514155`).
- Rung L2 (owner decision 4): deterministic uniform sample stride 10 →
  490,489 far-zoom points; viewport-exact detail ≤500k via the
  `setPointSet`/`screenToSpace` seam on debounced interaction-end; honest
  captions both states (`lodSample.ts` + vitest).
- First-paint color-by = module/serviceGroup (owner decision 3), 7 dict labels
  in the established module color language, legend with full-set counts
  (`moduleColors.ts` + vitest). Sizing from real event data (monthId recency
  ramp, `activitySizes.ts`). Organic PaCMAP layout as computed — no grid.
- Verb/module/objectType/folder/project/month resolution: resident int columns
  + meta dicts; ROADMAP's "module via activityClassification.ts" is satisfied
  upstream — the pipeline's serviceGroup dict IS the module attribution at
  this grain (activityClassification remains the chart-side verb→module
  authority; hover shows the honest serviceGroup).

### ACT-03 — instance path fully retired ✅

- 32 files deleted (`f805a887`, −8,936 lines): instance procedures
  (graphSnapshot/instanceEmbedding/instanceNeighbors/similarityEdges),
  snapshot compression codec, compact-payload node builder, kNN chain,
  similarity web, 3D mode (GraphCanvas3D + lasso3d + 2D/3D switch — owner
  decision 1), instance shell/interactions/test bridge, offline
  instance-embedding pipeline + its nightly ingest block.
- No orphaned loader ships bytes: `prefetchAccessAnalysisRouteData` removed;
  spatial-graph page is prefetch-free (payload is client-fetched with
  ETag/304). `/users` hydration seam untouched.
- Kept-for-Ph40 machinery (sliders/catalog/physics/labels) compiles unmounted
  (owner decision 2); single severing edit (MapClusterLabels type re-home).
- `AccInstanceEmbedding` table intact (drop = milestone-close item);
  person-graph and /users directory consumers verified green.
- repo-map check green after honest baseline ratchet-down (deleted script's 3
  warning edges removed; live single Phase-38 edge now visible, BND-03 family).

### ACT-04 — hover/click tells the event's story ✅

- Hover: zero-fetch tooltip (resident ints + dicts + projectNames map) — verb,
  module, project NAME, month, author email/role/company
  (`activityEventLabels.ts` + vitest incl. year-boundary month math).
- Click: `ActivityDetailRail` — on-demand event story by payload row index
  (object name, folder name, project, exact timestamp, source) +
  `UserProfilePanel` (rail variant, email-driven) for resolved authors;
  authorId 0 → explicit "Unknown author" card. Failure paths all have honest
  copy ("details unavailable (reason)").
- Index→id resolution: build-time meta `idAnchors` (491 = ceil(4.9M/10k)) +
  ≤10k OFFSET on the AccActivityEmbedding PK. **Live probe: 1–9 ms warm, both
  id spaces (`accds:` and DC cuid) hit, global-OFFSET cross-check agrees.**
  Table drift answers `{stale, reason}` — never a confidently wrong event.
  No `LOWER()` on activity tables.
- Lasso: reused `LassoOverlay` + `findPointsInPolygon` over the rendered
  subset (visible = selectable at L2); honest count "N of rendered ~500k
  selected"; Escape closes rail then clears selection.
- ACT-02 surface obligation: coverage caption "author resolution 94.41% ·
  unknown authors 5.59%" from meta (not hardcoded).

### Standing guardrails ✅

- Reduced motion: canvas is frozen-mode static (no ambient tier mounts this
  phase by design); interaction motion none >200 ms.
- Zinc theme intact (bg #09090B dark, theme-resolved); honest empty/error
  states (loading skeleton, 404 card, stale-detail copy).
- No WebGL added beyond the already-approved graph canvas; 3D REMOVED.

## Gates actually run (exact outcomes)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean (run after each plan + after cuts) |
| Focused vitest (new/moved transforms) | 39-01: 13/13 · 39-02: 15/15 · post-cuts: 12/12 activity dir |
| Full `npm test` | **2543 passed / 1 skipped (336 files)** — no new failures; TEST-01/02/03 pins green |
| `node scripts/repo-map/check.cjs` | PASS (after `npm run repo-map:check` regen — map genuinely stale post-deletion) |
| `node --check scripts/dc-daily-ingest.cjs` | clean |
| Live DB probe (eventDetail resolution) | 1–9 ms warm, cross-check agrees (39-02 SUMMARY) |
| Artifact rebuild | 4,904,886 rows, 149.7 MB, 69.3 s, meta idAnchors 491 |
| Design gate | impeccable hook scanned every touched surface file — no deterministic findings |

## Deviations (carried from summaries)

- `/users/access-analysis/page.tsx` already redirects to spatial-graph — no
  second mount point to edit.
- Real embedding id spaces are `accds:`-prefix / plain cuid; the `"a:"/"d:"`
  comment on the AccActivityEmbedding Prisma model is stale (comment-only).
- Plan's `activityLasso.ts` unnecessary — LassoOverlay props fit unchanged.
- Ponytail pass post-completion: −38 lines (`22bf4ee9`).

## Recorded expected breakage (Phase 41, E2E-03)

`acc-dc-graph.spec.ts`, `spatial-graph-baseline.spec.ts`, lasso,
cluster-labels, ambient e2e specs assert the retired 22,279-node instance
universe + `window.__ACC_GRAPH_TEST__`. They fail until re-baselined against
`window.__ACTIVITY_UNIVERSE_TEST__` (`isReady()`/`getState()`). Playwright
specs import no app modules — tsc/vitest unaffected.

## Remaining VERIFY

- VERIFY (owner-visual, at deploy probe): sampled ~490k density reads as
  organic regions on the live iGPU, not noise (39-CONTEXT flagged; UI hint =
  owner sees the live universe).

## Deploy (autoDeploy: true)

See appended probe result below after /lecg-ship.
