# Phase 29 Verification — Embedding v2: Feature Fidelity & PaCMAP

**Verified:** 2026-07-16 · **Plans:** 3/3 summarized · **Commits:** `1c657773` (plans),
`31ecc672` (29-01), `12140386` (29-02) · **Live run:** `20260716T173543Z-345c0e14`

## Per-requirement coverage

| Req | Status | Shipped evidence |
|---|---|---|
| EMB-01 | ✅ | Hybrid vector: 8 categorical token groups + `cov:` token + 6 raw numerics in jsonl (`instanceFeatureNumerics.ts`, `31ecc672`). In-code rationale table lists every included/excluded dim (project identity per D5; signinBucket, membershipBucket, moduleFlags, riskFlags, activityMix/actionCounts each one-lined). |
| EMB-02 | ✅ | Magnitude survives: log1p+max-scale (bytes/counts/days), /5 ordinals, paired missing indicators; block-scaled to equal mean row-norm. Unit-pinned BOTH sides: TS extractor 3 tests (null vs falsy-zero), python `test_normalize_numerics_*` incl. explicit "permstr 5 closer to 4 than to 0" assertion. Live hybrid: vocab=473 + 8 numeric cols = 481. |
| EMB-03 | ✅ (as amended) | PaCMAP 0.9.1 + faiss-cpu 1.14.3 (`12140386`), `distance="angular"`, `random_state=42`, determinism proven live (two identical runs); small-N (<10) SVD fallback preserved; SVD-100 densification. Ingest log now `features → PaCMAP` (truthful). Owner amendment UMAP→PaCMAP recorded in REQUIREMENTS.md/29-CONTEXT.md. |
| EMB-04 | ✅ | Full 22,279-row projection, dedupe-then-expand retired from the position path. Duplicate rate measured: **84.3% (tokens) → 20.4% (tokens+numerics)**, unique 3,488 → 17,732. Jitter residual-only for still-identical rows (`residual_jitter`, unit-pinned: distinct rows untouched). Measured baseline 84.3% vs the ~87% estimate — data growth since the estimate, reported honestly. |
| EMB-05 | ✅ | Pipeline-emitted gate, same input snapshot, same seeded 5,000-row sample both sides: **trustworthiness(k=10, cosine) old=0.9388 new=0.9597 → GATE PASS**; upsert conditional (exit 1 before write on regression). Neighbor-purity deliberately NOT a gate (owner decision §4 — numerics legitimately separate same-role users). |
| EMB-06 | ✅ | Live-DB run recorded (`20260716T173543Z-345c0e14`, 22,279 rows, 12 clusters, 20.9 s). Graph renders new coords on :3000 (tight islands, zero console errors, zero (0,0) fallbacks). Anchor-morph smoke: Role 0→60→0 round trip morphs and settles. Ingest wiring untouched beyond the log string — still non-fatal try/catch. |

## Gates actually run (exact outcomes)

- `npx vitest run instanceFeatureNumerics.test.ts instanceFeatureTokens.test.ts` →
  **2 files / 8 tests passed** (vitest 4.1.10).
- `npx tsc --noEmit` → **exit 0** (after 29-01, the phase's only TS change).
- `python -m pytest test_compute_instance_embeddings.py -q` → **13 passed in 4.28s**.
- `npx vitest run "GraphCanvas.test"` (PERF-02 frozen-handle invariant) →
  **1 file / 25 tests passed**.
- Live pipeline run + DB spot check + browser smoke — outputs verbatim in 29-03-SUMMARY.
- Repo-map gate not required: no router/Prisma/import-architecture change (leaf module +
  offline scripts).

## Roadmap success criteria

SC1–SC4 all TRUE (SC2 in its owner-amended PaCMAP form; SC3's "neighbor-purity" clause
superseded by CONTEXT decision §4 — trustworthiness + duplicate-rate are the recorded
gate). Phase ROADMAP box checked.

## Over-engineering cut pass

Phase diff reviewed under the ladder: one leaf module (extractor + rationale), one
focused pipeline rewrite reusing every surviving pure function, zero new abstractions,
zero npm deps (pacmap/faiss are the pre-approved python-only change). Nothing to delete.

## Deploy per policy (autoDeploy: true)

**Rebuild skipped with rationale:** the phase changed offline scripts and script-only
modules — zero app-runtime diff (`instanceFeatureTokens/Numerics` imported only by
`scripts/build-instance-features.ts`; verified by grep). New coordinates are DATA and are
already live: :3000's running build renders them through the untouched
`accDcGraph.instanceEmbedding` path. **Route probe (live):**
`/users/spatial-graph` rendered the new map in-browser — 22,279 nodes, new islands
layout, morph functional, console clean (screenshots in-session 2026-07-16). A no-diff
rebuild would only risk the always-on service.

## Deviations carried from summaries

- Python needs env vars in-process for manual runs (nightly ingest provides them);
  wrapper used, no code change.
- dc-daily-ingest.cjs staged via single-hunk `git apply --cached`; its 2 lines of
  pre-existing WIP remain unstaged and preserved.

## Remaining / rolled forward

- PaCMAP MN_ratio/FP_ratio at package defaults — revisit only on owner UAT ask
  (→ CONCERNS.md, phase-29 tagged).
- Owner eyeball UAT of the new map remains the final acceptance (explicitly NOT the
  gate per CONTEXT §4); ready whenever Luis looks at /users/spatial-graph.
- Pre-existing, not this phase: 14 acc-dc-graph e2e drift failures (node count + testids),
  3 usePredicateEngine unit failures (STATE Deferred Items).
