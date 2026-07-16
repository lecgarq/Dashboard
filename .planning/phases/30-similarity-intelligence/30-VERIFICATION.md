# Phase 30 Verification — Similarity Intelligence (SIM-01..03)

**Date:** 2026-07-16 · **Plans:** 4/4 summarized ·
**Commits:** 29aa6d4f (plans) · 2467f0a9 (30-01) · 6d52e7e9 (30-02) ·
9666da74 (30-03) · eef5eaa9 (30-04 fix)

## Per-requirement coverage

| Req | Status | Shipped evidence |
|---|---|---|
| SIM-01 | ✅ | `scripts/compute_instance_embeddings.py` `structured_neighbors` — kNN over exact-vector twin-group representatives (k=10 DISTINCT matches guaranteed), exact twin summary `{count, ids[≤10]}` per node. Live run `20260716T182623Z-e6fab986` (22,279 rows, 34.8s, trust gate PASS 0.9598≥0.9597; twin groups: 17,732 / multi 1,962 / max 313 / p95 2). Proc `instanceNeighbors` returns the typed normalized payload (`lib/acc/embedding/neighborPayload.ts`); panel renders distinct matches + "N identical twins" chip with capped expandable list + "+N more". Live before/after: stale rows showed 10×100% clones (panel-stale.png); v2 shows distinct people/projects + twin chip (panel-v2.png), 0 console errors both. |
| SIM-02 | ✅ | Python stores exact top-3 contributing dimension keys per match (`top_contribution_keys` — elementwise product on the REAL hybrid matrix, `cov:`/`_missing` excluded, math unit-pinned vs manual numpy). Client `whySimilar.ts` resolves keys → labels + live snapshot values + coverage suffixes via `dimensionCoverage`/`coverageText` (v2.4 convention); permission-derived keys suppressed when either endpoint `permissionCoverage === "unknown"`; shared placeholders ("(none)"/"none"/…) never render as explanations (eef5eaa9). Live chip examples: "Similar tenure: 582/576 days · 22,279/22,279". |
| SIM-03 | ✅ | `similarityEdges` derives from normalized **matches only** — twin edges structurally excluded. Cluster-aware selection **kept at `interReserveFrac=0.4` / 18k budget with recorded evidence** (30-04-SUMMARY table): 47,615 distinct-profile edges still score ≥0.99995 (> whole budget → plain top-N stays tie-degenerate); inter share 11.0%→14.5%, inter p50 0.9718→0.9912 (reserve carries stronger bridges at the same setting). Strength min-max over the real distribution pinned by existing `similarityWeb.test.ts` (lines 25–45). |

## Roadmap success criteria

1. ✅ neighbors = enriched-vector kNN, twins collapsed; panel shows k distinct + honest twin affordance.
2. ✅ every rendered match explains its similarity; DC-sourced attributes carry coverage labels.
3. ✅ web rebuilt from new neighbor sets; selection re-tune decision evidence-recorded; normalization honest.

## Gates actually run (exact outcomes)

- `python -m pytest test_compute_instance_embeddings.py -q` → **17 passed** (5 new Phase-30 tests).
- `npx vitest run lib/acc/embedding whySimilar.test NeighborMatchesPanel.test similarityWeb.test GraphCanvas.test embeddingMapSeam.test` → **14 files / 79 tests passed** (includes PERF-02 frozen-handle GraphCanvas.test.ts, 25 tests).
- `npx tsc --noEmit` → exit 0 (after 30-02, 30-03, 30-04 fix).
- `node scripts/repo-map/check.cjs` → **passed** (2 dep-cruiser warnings, 236 ast-grep findings — pre-existing baseline).
- Live: stale-shape fallback (pre-rerun old rows → graceful plain list, 0 errors), v2 eyeball (distinct matches + twin chip + why chips + coverage, 0 errors), morph smoke (Group-by role → strength End: 22,279 nodes, no NaN, 0 errors). All on isolated `:3100` webpack prod harness; screenshots in session scratchpad.
- Design gate: impeccable source-mode detect scanned every panel/shell edit — no deterministic findings; chrome intentionally modest (Phase 31 owns choreography).

## Deviations (carried from summaries)

- 30-02: 2-line shell compile seam (`.matches`) landed one plan early to keep tsc green; `similarityWeb.test.ts` needed no change (min-max pin pre-existed).
- 30-03: `formatBytes` deliberately NOT imported from the charts-page surface (standing name-collision trap) — 6-line local formatter instead.
- 30-04: python run needs env inherited (`node -r dotenv/config` wrapper) — bare `python scripts/compute_instance_embeddings.py` lacks DATABASE_URL outside dc-daily-ingest. `company:(none)` chip wart found live and fixed (eef5eaa9); :3100 not rebuilt for that presentation-only fix (unit-pinned).

## Over-engineering cut pass

Phase diff: one pure normalizer (2 real call sites), one pure key-resolver
(table-driven switch), panel props, python functions reusing `dedupe_docs`;
`knn_neighbors` deleted. No speculative abstractions. Nothing to cut.

## Pre-existing failures (unchanged, not regressions)

3 usePredicateEngine Phase-25 unit fails; 14 e2e drift fails (node count
16,942→22,279 + old sidebar testids — now including the dead "User name thumb"
selector, see CONCERNS Ph30 roll-forward).

## Remaining VERIFY / gaps

None phase-blocking. Debt rolled to CONCERNS (stale-row prune, e2e selectors,
100%-score display).

## Deploy (autoDeploy: true) — SHIPPED 2026-07-16

Full deploy-sequence run: `LECG Dashboard Local` task stopped, :3000 freed,
`npx tsc --noEmit` clean, `npm run build` (webpack) exit 0 —
**BUILD_ID `SkA5J8kUu0LgER4NcyiJr`** — task restarted (`Running`).

Probe: `/users/spatial-graph` → 307 (auth redirect, expected), `/login` → 200,
**authenticated probe (minted session cookie) → 200**. Live `:3000` now serves
the Phase 30 panel against the v2 neighbors payload
(run `20260716T182623Z-e6fab986`).
