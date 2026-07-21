# 37-03 Summary — Embedding runtime estimate (SCALE-01 track c)

**Status:** COMPLETE 2026-07-21
**Requirement:** SCALE-01 (offline embedding runtime estimate at activity grain)

## What ran

`scripts/spike_activity_embedding_estimate.py` (committed `6a3e99f6`) on the workshop
machine — REAL `AccActivityAccds` samples via `TABLESAMPLE SYSTEM` (read-only, SELECT only),
~51-dim Phase-38-shaped feature matrix (hashed one-hot author/verb/project/objectType +
cyclic month + recency), pacmap 0.9.1 + faiss-cpu 1.14.3, `random_state=42`.

## Measured results (2026-07-21, full JSON in 37-BASELINE.md)

| n | fit wall-clock | peak RSS |
|---|---|---|
| 100,000 | 16.5 s | 333 MB |
| 500,000 | 128.5 s | 714 MB |
| 1,000,000 | **379.8 s (~6.3 min)** | 1,246 MB |

- **Determinism: identical** — 100k re-fit with same seed → same checksum (EMB-07 seed
  discipline holds at this grain).
- **Full-corpus full-fit estimate: ~34 min** (n log n extrapolation from the measured 1M
  point — labeled extrapolation, NOT measured). RSS extrapolates to roughly ~6 GB
  (linear trend, estimate) — inside the 8 GB heap-class machine budget but worth watching.
- **faiss kNN projection (IndexFlatL2, k=10, 950k index / 50k holdout): 840 rows/s
  measured → ~77 min for the 3.86M remainder (extrapolation).**

## The load-bearing finding for Phase 38 (EMB-07 decision input)

With a BRUTE-FORCE flat index, sample-fit + projection (~6 min + ~77 min) is SLOWER than
the extrapolated full fit (~34 min). Full-fit PaCMAP at 4.86M looks tractable outright.
If Phase 38 still wants projection (e.g. for incremental refresh), an ANN index
(IVF/HNSW) is the known ~10–100× lever — evidence-gated Phase-38 tuning, not assumed here.

## Deviations

- None against plan tasks. All three ladder sizes ran (no cap skip triggered).

## Gates

- Script end-to-end on workshop machine: **exit 0**, JSON to stdout + scratchpad.
- Determinism spot-check: **identical** (in-run re-fit).
- No DB writes: script is SELECT-only by construction (no INSERT/UPDATE/CREATE present).

## Follow-ups / debt

- Phase 38: if projection path chosen, benchmark IVF/HNSW before committing; flat-index
  numbers above are the honest floor. RSS at full fit is an estimate — measure before
  productionizing.
