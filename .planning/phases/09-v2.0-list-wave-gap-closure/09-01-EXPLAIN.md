# 09-01 — EXPLAIN ANALYZE: Phase 09 LIST-03 batch + sort queries

**Measured:** 2026-05-18
**DB:** dev (DATABASE_URL from `.env`)
**Table:** `AccActivity`
**Row count at measurement:** **2,507**
**Distinct emails sampled:** 75 (capped by `SELECT DISTINCT "userEmail" LIMIT 200`)
**Index available:** `AccActivity_rawAction_idx` on `(rawAction)` + composite `(userEmail, createdAt DESC)` per SCHEMA-02

Driver: `scripts/dev/09-01-explain-analyze.cjs` (Prisma + PrismaPg adapter; safe to re-run, read-only).

---

## Query A — `getLastFileActivityBatch` (display path)

### SQL

```sql
EXPLAIN ANALYZE
SELECT LOWER("userEmail") AS email, MAX("createdAt") AS lastActivity
FROM "AccActivity"
WHERE LOWER("userEmail") = ANY($1::text[])      -- 75 distinct emails
  AND "rawAction" = ANY($2::text[])             -- 18 file raw actions
GROUP BY LOWER("userEmail");
```

### Plan

```
HashAggregate  (cost=113.46..114.40 rows=75 width=40) (actual time=90.565..90.579 rows=70 loops=1)
  Group Key: lower("userEmail")
  Batches: 1  Memory Usage: 24kB
  ->  Index Scan using "AccActivity_rawAction_idx" on "AccActivity"
        (cost=0.47..110.69 rows=555 width=40)
        (actual time=7.808..89.484 rows=1471 loops=1)
        Index Cond: ("rawAction" = ANY ('{File Viewed, Document Viewed, File Downloaded, view-entity, view-existing-review, download-entity, File Uploaded, Document Version Created, upload-entity, File Edited, Markup Created, Comment Added, edit-office-file, lock-entity, unlock-entity, File Deleted, File Restored, delete-entity}'::text[]))
        Filter: (lower("userEmail") = ANY (<75 emails>))
Planning Time: 4.301 ms
Execution Time: 98.407 ms
```

**Observations:**

- Planner chose `AccActivity_rawAction_idx` to satisfy the `rawAction = ANY(...)` predicate (selective enough given 18 file actions over 2,507 rows).
- The composite `(userEmail, createdAt DESC)` index is NOT used by the planner here because the email predicate is wrapped in `LOWER(...)` (functional expression — only a matching functional index would be picked). The `LOWER("userEmail") = ANY(...)` becomes a post-index filter; with 2,507 rows this is acceptable.
- Net wall time: **98.4 ms** (well under the 200 ms ceiling).

---

## Query B — `usersOrderedByLastFileActivity` (sort path)

### SQL

```sql
EXPLAIN ANALYZE
SELECT LOWER("userEmail") AS email, MAX("createdAt") AS lastActivity
FROM "AccActivity"
WHERE "userEmail" IS NOT NULL
  AND "rawAction" = ANY($1::text[])            -- 18 file raw actions
GROUP BY LOWER("userEmail")
ORDER BY MAX("createdAt") DESC NULLS LAST, LOWER("userEmail") ASC
LIMIT 200;
```

### Plan

```
Limit  (cost=112.39..112.57 rows=75 width=40) (actual time=4.950..4.960 rows=70 loops=1)
  ->  Sort  (cost=112.39..112.57 rows=75 width=40) (actual time=4.948..4.952 rows=70 loops=1)
        Sort Key: (max("createdAt")) DESC NULLS LAST, (lower("userEmail"))
        Sort Method: quicksort  Memory: 29kB
        ->  HashAggregate  (cost=109.11..110.05 rows=75 width=40)
              Group Key: lower("userEmail")
              Batches: 1  Memory Usage: 24kB
              ->  Index Scan using "AccActivity_rawAction_idx" on "AccActivity"
                    (cost=0.28..101.71 rows=1481 width=40)
                    (actual time=0.050..1.719 rows=1471 loops=1)
                    Index Cond: ("rawAction" = ANY (<18 file actions>))
                    Filter: ("userEmail" IS NOT NULL)
Planning Time: 0.158 ms
Execution Time: 6.216 ms
```

**Observations:**

- Same `AccActivity_rawAction_idx` index scan strategy (1,471 rows visited, 70 groups produced).
- In-memory `quicksort` on 70 groups → trivial.
- Net wall time: **6.2 ms** (an order of magnitude under the ceiling; effectively free).

---

## Verdict

**ACCEPTABLE**

- Both queries complete well under the 200 ms threshold (98 ms batch / 6 ms sort) against the current dev dataset (2,507 rows; ~70 active emails).
- `AccActivity` is below the 100 k row threshold cited in the plan as the alternative acceptance criterion.
- Phase 08 DC ingest will multiply this table substantially over coming months. Two mitigations should be tracked as follow-ups (NOT this phase):
  1. **Functional index on `LOWER("userEmail")`** (`CREATE INDEX ... ON "AccActivity" (LOWER("userEmail"))`) — would let the planner satisfy the `LOWER(...) = ANY(...)` predicate without a post-filter scan, lowering the cost of Query A when the email list is short relative to total rows.
  2. **Covering index on `(rawAction, userEmail, createdAt DESC)`** — would let both queries skip the heap entirely.
- Acceptable for v2.0 close-out to ship with the existing indexes and revisit if Execution Time crosses 200 ms after Phase 08's first full backfill lands.

**Recommended follow-up trigger:** Re-measure after first successful DC ingest (`scripts/dc-daily-ingest.cjs`) populates 30 days of activity across all admin projects. Open a v2.x perf ticket if either query exceeds 200 ms.
