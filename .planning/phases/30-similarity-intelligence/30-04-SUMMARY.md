# 30-04 SUMMARY — Live run, edge evidence, phase verification

**Status:** COMPLETE · commits `eef5eaa9` (placeholder-suppression fix) · 2026-07-16

## Live pipeline run (SIM-01/02 shipped to the DB)

- `npx tsx scripts/build-instance-features.ts` → 22,279 rows to
  `.embedding/instance-features.jsonl`.
- `python scripts/compute_instance_embeddings.py` (env inherited via
  `node -r dotenv/config` — the bare shell lacks DATABASE_URL; first attempt
  died at `_fetch_old_coords` with "DIRECT_URL or DATABASE_URL must be set"):
  - `nodes=22279 vocab=473 numeric_cols=8 hybrid_cols=481`
  - `duplicate-rate old=84.4% new=20.4% (unique 3486 -> 17732)`
  - `trustworthiness(k=10, cosine, sample=5000): old=0.9597 new=0.9598 — GATE PASS`
  - **`twin-group sizes: groups=17732 multi-member=1962 max=313 median=1.0 p95=2.0`**
    (resolves the CONTEXT VERIFY: p95=2, but max=313 — the 10-id cap + exact
    count + "+N more" is the right shape; an uncapped list would store 313 ids)
  - `Upserted 22279 rows (12 clusters, run 20260716T182623Z-e6fab986) in 34.8s`
    (Phase 29 run was 20.9s — why-key computation adds ~14s, acceptable for a
    daily offline job).

## Stale-shape fallback — exercised LIVE (before the rerun)

Isolated `:3100` prod harness (webpack build to `.next-e2e`, test bridge env
baked, minted-cookie auth). Driven playwright click on a node while the DB
still held OLD bare-array rows: panel rendered the plain 10-match list
(no twin chip, no why chips), **0 console errors** (`panel-stale.png`).
Incidentally a perfect "before" exhibit: all 10 matches at 100% — the clone
saturation SIM-01 kills.

## v2 live eyeball (after the rerun)

Clicked `a01782427@tec.mx::0ecfb3d5…` (twin count 4): **distinct** matches
(different people/projects), why chips render with live values + coverage
suffixes ("Similar tenure: 582/576 days · 22,279/22,279"), twin chip
"4 identical twins" expands to the member list, **0 console errors**
(`panel-v2.png`).

- **Deviation found & fixed live:** `company:(none)` rendered
  "Same company: (none)" — a shared placeholder presented as a shared
  attribute. Fixed at the shared boundary: `MISSING_STRINGS` exported from
  `dimensionCoverage.ts`, token keys with missing-set values suppressed in
  `resolveWhyKey` (+ test). Commit `eef5eaa9`. The :3100 harness was NOT
  rebuilt for this presentation-only change — behavior is unit-pinned
  (`never presents shared placeholders as explanations`).

## Morph/slider smoke

Group-by → role, "Grouping strength" thumb → End (max): 22,279 nodes intact,
`anyNaN=false`, 0 console errors (`morph-smoke.png`).

## SIM-03 edge evidence + re-tune decision

Measured with a scratchpad script (dedupe → inter/intra split identical to
`similarityEdgeSet.ts` semantics), 18k budget:

| | pre-collapse (old rows) | post-collapse (v2 matches) |
|---|---|---|
| unique edges | 156,686 | 170,305 |
| inter / intra | 17,256 / 139,430 (11.0%) | 24,704 / 145,601 (14.5%) |
| score ≥0.99995 | 52,040 | 47,615 |
| inter p50 | 0.9718 | 0.9912 |
| intra p50 | 0.9991 | 0.9987 |

**Decision: KEEP `interReserveFrac=0.4` and the 18k budget (no code change).**
Rationale: exact-twin edges are gone, but 47,615 edges between *distinct*
near-identical profiles still score ≈1.0 — more than the whole budget — so a
plain top-N remains tie-degenerate (arbitrary tie-breaking, bridges not
guaranteed). The 0.4 reserve guarantees the 7,200 strongest cross-cluster
bridges; post-collapse those bridges are stronger (inter p50 0.9718 → 0.9912),
so the reserve now carries better content at the same setting.

Note: 983 stale old-shape rows remain in `AccInstanceEmbedding` (nodeIds absent
from the current snapshot — leftovers from a prior larger run). The proc
normalizes them; they are invisible to the client graph (no matching feature).

## Gates (final, exact)

- `python -m pytest test_compute_instance_embeddings.py -q` → **17 passed**.
- `npx vitest run lib/acc/embedding whySimilar NeighborMatchesPanel similarityWeb GraphCanvas.test embeddingMapSeam` → **14 files / 79 tests passed** (includes PERF-02 frozen-handle: GraphCanvas.test.ts 25 tests).
- `npx tsc --noEmit` → exit 0.
- `node scripts/repo-map/check.cjs` → passed (2 dep-cruiser warnings + 236 ast-grep findings — pre-existing baseline).
- Pre-existing failures NOT retested (unchanged, tracked): 3 usePredicateEngine
  Phase-25 unit fails; 14 e2e drift fails (node count + old sidebar testids).

## Durable follow-ups (roll to CONCERNS)

1. **983 stale AccInstanceEmbedding rows** with old-shape neighbors and nodeIds
   outside the current snapshot — harmless (normalized, clientless) but the
   pipeline never deletes; consider a prune step when a run's nodeId set shrinks.
2. **`morph-smoke`/e2e slider selectors**: the e2e suite's "User name thumb"
   selector is dead (v2.4 GroupByControls replaced curated sliders) — part of
   the standing e2e re-baseline debt (STATE Deferred #4).
3. Match scores of near-identical distinct profiles read "100%" in the panel
   (0.99995+ rounds up) — honest math, but if UAT reads it as "clone", consider
   one more decimal ("99.99%") in Phase 31's panel polish.
