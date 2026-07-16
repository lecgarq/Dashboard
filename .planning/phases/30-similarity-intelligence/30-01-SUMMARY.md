# 30-01 SUMMARY — Python twin collapse + why keys

**Status:** COMPLETE · commit `2467f0a9` · 2026-07-16

## What shipped

- `scripts/compute_instance_embeddings.py`:
  - `TWIN_ID_CAP = 10`, `WHY_KEYS = 3` constants.
  - `twin_groups(dup_keys)` — exact-vector groups via existing `dedupe_docs` on
    `hybrid_dup_keys` output (tokens + raw numerics; same grouping residual
    jitter uses). Deterministic first-seen order.
  - `top_contribution_keys(row_a, row_b, dim_keys, top=3)` — elementwise
    product of the two hybrid rows; all blocks non-negative so ranking by raw
    product == ranking by cosine-contribution share. Excludes `*_missing` and
    `cov:*` keys; positive contributions only; ties broken by key for
    determinism.
  - `structured_neighbors(matrix, node_ids, dup_keys, k, twin_cap, dim_keys)` —
    kNN (cosine) over one representative row per twin group; per-group match
    list computed ONCE and shared by all members (vectors byte-identical, math
    exact). Payload per node:
    `{"v": 2, "matches": [{nodeId, score(4dp), why[≤3]}], "twins": {count: exact, ids: [≤10 other members]}}`.
  - `main()`: prints twin-group size distribution
    (`groups / multi-member / max / median / p95`) — resolves the CONTEXT
    VERIFY on group-size bounds at run time (numbers land in 30-04); passes
    `dim_keys = vocab + num_cols`.
  - `knn_neighbors` deleted (no remaining callers; `rg` clean).
- `scripts/test_compute_instance_embeddings.py`: 5 new tests
  (`twin_groups_exact_vector_only`, `distinct_matches_and_twin_summary`,
  `twin_cap`, `top_contribution_keys_math` vs manual numpy,
  `payload_shape`); old `knn_neighbors` test removed with the function.

## Gates

- `python -m pytest scripts/test_compute_instance_embeddings.py -q` → **17 passed** (was 13; −1 removed, +5 added).
- Coordinates / cluster / trust-gate path untouched (diff-inspected).

## Deviations

None. Payload contract exactly as pinned in 30-01-PLAN.

## Notes for downstream plans

- Old bare-array rows remain in the DB until 30-04's live run — 30-02's
  normalizer is load-bearing until then.
- Perf: why-key computation is per unique-group pair (~17.7k groups × k=10
  sparse row products) — measured cost lands in the 30-04 run line.
