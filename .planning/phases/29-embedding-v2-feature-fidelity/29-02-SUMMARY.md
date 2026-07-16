# 29-02 Summary — PaCMAP hybrid pipeline (python half)

**Status:** COMPLETE · **Commit:** `12140386` · **Requirements:** EMB-02 (python), EMB-03, EMB-04, EMB-05 (mechanics)

## VERIFY resolutions (recorded facts, not memory)

- **VERIFY-A (pacmap 0.9.1 API)** — installed live: `pacmap 0.9.1 + faiss-cpu 1.14.3`.
  Signature: `PaCMAP(n_components=2, n_neighbors=10, MN_ratio=0.5, FP_ratio=2.0, ...,
  distance='euclidean', apply_pca=True, random_state=None, knn_backend='faiss')`.
  Allowed distances per docstring: **euclidean, manhattan, angular, hamming** —
  `"angular"` is the cosine-family option, used. `apply_pca=True` PCAs >100-dim input
  before pair construction — we pre-reduce with TruncatedSVD(100) ourselves (works on
  sparse, deterministic) and pass `apply_pca=False`. **Determinism proven live**: two
  runs, 300×50 synthetic, `random_state=42`, `np.allclose == True`.
- **VERIFY-B (memory at 22k × vocab)** — TF-IDF stays sparse; TruncatedSVD densifies to
  100 comps (22k×100 float32 ≈ 9 MB) before PaCMAP. `sklearn.trustworthiness` builds an
  n² distance matrix, so the gate samples a seeded subset (`TRUST_SAMPLE=5000`,
  RandomState(42), SAME rows for old and new sides). Full-n never materialized.

## What shipped

- **`scripts/compute_instance_embeddings.py`** rewritten:
  - `normalize_numerics` — log1p+max-scale (accessibleDataBytes, activityTotal,
    folderBreadth, membershipAgeDays), /5 ordinals (permissionStrength, riskScore),
    paired `_missing` 0/1 indicators for membershipAgeDays + permissionStrength
    (missing ≠ zero there); other nulls → 0 with `cov:` token carrying crawl truth —
    all documented in-code.
  - `build_hybrid_matrix` — numeric block scaled by mean-row-norm ratio vs TF-IDF block
    (balanced hybrid, CONTEXT §2), sparse hstack.
  - `project_pacmap` — full-set PaCMAP(angular, seed 42, n_neighbors=10); <10-row SVD
    fallback preserved verbatim; SVD-100 densification.
  - Dedupe-then-expand **retired from the position path**; `dedupe_docs` survives as the
    duplicate-rate measurement; `residual_jitter` moves ONLY rows whose tokens+raw-numerics
    key repeats (EMB-04).
  - EMB-05 gate in `main()`: duplicate-rate old/new definition printed; old coords read
    from `AccInstanceEmbedding` pre-overwrite; trustworthiness(k=10, cosine) old vs new on
    the same seeded sample; `new < old` → print FAIL + `sys.exit(1)` **before** upsert;
    first-run (no stored coords) → explicit printed skip note. Runtime printed.
  - kNN unchanged in payload shape, now computed on the hybrid matrix (Phase 30 owns any
    redesign).
- **`scripts/test_compute_instance_embeddings.py`** — 13 tests total (5 pre-existing kept
  green + 8 new: normalization rules/indicators, ordinal-magnitude survival, block-norm
  equalization, residual-jitter only-duplicates + determinism, hybrid dup keys,
  PaCMAP shape/finite/deterministic on 60-row synthetic, small-N fallback, loader
  backward-compat with old-shape jsonl lines).
- **`scripts/dc-daily-ingest.cjs:~140`** — log now `features → PaCMAP` (true). Staged
  surgically via hand-built single-hunk `git apply --cached`; the 2 lines of pre-existing
  WIP (deleted eslint-disable comments) remain **unstaged** in the working tree, preserved.

## Gate outcomes (exact)

- `python -m pytest test_compute_instance_embeddings.py -q` → **`13 passed in 4.28s`**.
- `npx tsc --noEmit` not re-run: this plan touched no TypeScript (py + cjs only); the
  tree's tsc was clean at 29-01 minutes earlier (narrowest-gate rule).

## Deviations

- Plan offered "commit ingest file with WIP named in body" as fallback — not needed, the
  single-hunk staging worked cleanly.

## Follow-ups / debt

- PaCMAP MN_ratio/FP_ratio left at package defaults (0.5/2.0); revisit ONLY if 29-03's
  live map misses the tight-islands look — record any change there.
