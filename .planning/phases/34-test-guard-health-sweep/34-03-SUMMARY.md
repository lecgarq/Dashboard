# Plan 34-03 Summary — PIPE-02 embedding pipeline prunes stale rows

**Status:** COMPLETE — 2026-07-20
**Requirement:** PIPE-02
**Commit:** `feat(pipeline): prune stale AccInstanceEmbedding rows post-gate (PIPE-02)`
(one file: `scripts/compute_instance_embeddings.py`)

## What shipped

- New `_prune(node_ids)` in `scripts/compute_instance_embeddings.py`:
  `DELETE FROM "AccInstanceEmbedding" WHERE NOT ("nodeId" = ANY(%s))` over the
  current run's full snapshot id list; returns `cur.rowcount`. Called in
  `main()` immediately after `_upsert` — strictly AFTER the EMB-05
  trustworthiness gate-pass point, so a gate failure (`sys.exit(1)` at the
  GATE FAIL branch) still aborts before ANY write, including the delete.
- Run summary now prints the prune count in the existing style:
  `Upserted N AccInstanceEmbedding rows / Pruned M stale (...)`.
- Delete-only: no schema change, no soft-delete column, no new dependency
  (psycopg already imported per-function in the script's established style).

## Evidence (real run, SC #5)

- **Before (live count, read-only):** `snapshot_ids=22279 db_rows=23262 stale=983`
  — the 983 audit figure re-verified against the live DB before any code change.
- **Real run 2026-07-20:** `GATE PASS: new >= old.`
  (`trustworthiness(k=10, cosine, sample=5000): old=0.9598 new=0.9598`), then
  `Upserted 22279 AccInstanceEmbedding rows / Pruned 983 stale (12 clusters,
  run 20260720T164707Z-5be11b52) in 37.3s total`.
- **After:** `snapshot_ids=22279 db_rows=22279 stale=0`. **983 → 0 confirmed.**
- Input snapshot: existing `.embedding/instance-features.jsonl` (2026-07-16,
  22,279 ids — matches the live node universe; regeneration not needed).
- Env convention: python does not self-load `.env` (CONCERNS-documented);
  invoked via a node dotenv wrapper mirroring `dc-daily-ingest.cjs`'s
  env-inheriting `execSync` path. No secret values read or displayed.

## Gate outcomes (exact)

- `python -m pytest scripts/test_compute_instance_embeddings.py -q` →
  `17 passed in 4.31s` (pre-existing unit suite unaffected).
- Real-run output + before/after counts above.
- `prisma/schema.prisma` untouched; no new imports.

## Deviations / debt

- None. Nightly `dc-daily-ingest.cjs` path picks the prune up automatically
  (it execSyncs this script).
