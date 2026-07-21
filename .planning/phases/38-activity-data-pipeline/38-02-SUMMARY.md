# 38-02 SUMMARY — Full-corpus activity embedding pipeline (EMB-07)

**Completed:** 2026-07-21 · commits `eaf402cb` (pipeline) + `267edf29` (tz fix) +
`a7519a9c` (RSS cap 24 GB, owner-approved) + `7a6ff68e` (durability fix)

## What shipped

- `scripts/compute_activity_embeddings.py` — unified-corpus read (verbatim
  `UNIFIED_ACTIVITY_CTE` boundary semantics + its id convention `accds:`-prefixed /
  plain DC id — plan's `a:`/`d:` prefixes dropped for consistency, deviation), hashed
  one-hot author+event feature matrix (71 dims: author 16 / verb 8 / project 16 /
  objectType 8 / folder 8 / role 4 / company 4 / modules 4 + cyclic month 2 +
  recency 1; author role/company/modules joined from the 38-01 sidecar — EMB-07
  "author's properties shape the layout" holds), full-fit PaCMAP seed 42,
  determinism proof ×2, quality gate, TRUNCATE+COPY, fresh-connection durability
  proof. `--limit` smoke mode never writes.
- `scripts/test_compute_activity_embeddings.py` — 7 pytest pins (hash buckets,
  dictionaries, month/cyclic encoding, coord normalization, tz normalization).

## Measured evidence (final run `20260721T210323Z-80e4cff2`)

| metric | measured |
|---|---|
| corpus streamed | 4,904,886 (== SQL count == 38-01 coverage total) |
| stream / feature build | 28.9 s / 37.3 s (matrix 4,904,886×71, 1,328 MB) |
| **fit#1 / fit#2** | **50.0 min / 50.4 min** (37-BASELINE ~34 min extrapolation was low) |
| peak RSS | 15.7 GB (63.4 GB machine) |
| determinism | **identical** (full-scale byte-compare, proven twice) |
| trustworthiness(k=10, n=5000) | 0.8085 — stored baseline (`activity-embedding-gate.json`); rerun gate PASS (new ≥ baseline) |
| COPY | 84.3 s, 4,904,886 rows, fresh-connection verified |
| table sanity | dc_rows 42,585 (= 41,714 backfill + 871 admin ✓); authorId=0 exactly 77 (null-email rows) |

Dictionaries persisted to `.embedding/activity-universe-dicts.json` (verb 210 union
labels class, objectType, module, project, author 2,313+, role, company, month floor
2024-12 / 20 months; folder = int codes only, no label dict by design).

## Deviations (all recorded)

1. **RSS cap 12 → 24 GB (owner-approved 2026-07-21).** The 12 GB cap (derived from
   the 37-BASELINE ~6 GB estimate ×2) tripped a SUCCESSFUL 58.7-min fit at 15.45 GB
   on a 63.4 GB machine — cap was miscalibrated, not the fit. Owner picked "raise to
   24 GB, keep full fit" over sample-fit+ANN pivot and over skipping the second
   determinism fit. Fallback clause (>90 min or >24 GB) stays armed.
2. **Mixed tz-aware/naive timestamps** between `AccActivity` (aware) and
   `AccActivityAccds` (naive) crashed run #1 after streaming; normalized to naive
   UTC (`to_naive_utc`, regression-pinned). Smoke's `--limit` only reaches the
   first source — full-corpus failure modes need the full run.
3. **🔑 DATA-LOSS TRAP (run #2): psycopg3 implicit-transaction savepoint rollback.**
   Early SELECTs opened an implicit transaction; `with conn.transaction()` then
   created a SAVEPOINT, not a top-level tx; `conn.close()` without `commit()`
   rolled back the entire 4.9M-row COPY *after* a same-connection post-write count
   reported success ("COPY wrote 4904886 rows … DONE", table durably 0). Cost: one
   full ~112-min pipeline run. Fix: explicit `conn.commit()` + durability count on
   a FRESH connection. Same family as v2.6's "counters aren't visual proof" —
   in-session verification can lie; verify from outside the session.
4. moduleId = serviceGroup dictionary code (plan's allowance taken): verb→module
   `activityClassification` stays single-sourced in TS; Phase 39 derives module
   labels client-side from verbId where finer classification is needed.

## Follow-ups / debt

- Full pipeline rerun costs ~102 min wall-clock (two fits for the determinism
  proof). If reruns become frequent, revisit single-fit + stored-checksum proof.
- `trustworthiness` 0.8085 at activity grain (instance-grain runs scored ~0.9+):
  acceptable first baseline; Phase 40 dimension work may motivate feature-weight
  tuning — gate protects against regression.
