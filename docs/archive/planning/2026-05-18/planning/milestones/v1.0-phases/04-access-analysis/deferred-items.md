# Phase 04 — Deferred Items

Items discovered during execution that are out-of-scope for the current task per
the GSD SCOPE BOUNDARY rule (only auto-fix issues directly caused by the current
task's changes).

## Pre-existing TypeScript errors (discovered during 04-04 tsc run)

Surfaced 2026-05-08 while verifying `server/routers/workspace.ts` compiles. None
of these are in files modified by 04-04; they belong to other in-flight DASH
plans.

1. **`lib/acc/nameSimilarity.test.ts(13,8)`** — Cannot find module `./nameSimilarity`.
   Plan 04-03 (DASH-04 token-overlap) appears to have committed the test file
   but not the implementation module.

2. **`lib/server/acc-admin.ts(156,7)`, `(208,16)`** — `AccUser` type now requires
   `isAccountAdmin` but the fetcher in this file has not been updated to
   populate it. Likely from a partial DASH-07 (account-admin plumbing) commit.

3. **`app/(dashboard)/users/UsersDirectoryClient.tsx(630,49)`** — `BulkAccUser[]`
   shape mismatch on the same `isAccountAdmin` field. Same root cause as #2.

These should be resolved by the plan that introduced `isAccountAdmin` to the
shared types (likely 04-01 or a Wave 0 data-pipeline plan).

---

## Update from 04-01 execution (2026-05-08)

- Items #2 and #3 above are **RESOLVED** by 04-01: `fetchAccUserByEmail` and
  `fetchAllAccUsers` now populate `AccUser.isAccountAdmin` from HQ v1 `role`,
  and `UsersDirectoryClient`'s missing-stub literal includes `isAccountAdmin: false`.
- Item #1 (`nameSimilarity.test.ts` missing module) appears resolved as well
  (`lib/acc/nameSimilarity.ts` is present on disk).

### Outstanding after 04-01

1. **`lib/acc/dashboardAnalytics.test.ts(15,8)`** — Cannot find module
   `./dashboardAnalytics`. Test fixture from Plan 04-03 (DASH-03/04/05/09)
   scaffolded ahead of its implementation module. Fixture's `makeUser` was
   updated by 04-01 to include `isAccountAdmin: false` so it will compile
   cleanly once 04-03 lands `dashboardAnalytics.ts`.

### Live verification deferred (04-01 Task 3)

Task 3 required triggering a fresh ACC sync and confirming the account-admin
count is non-zero AND distinct from the project-admin count. This needs a
live admin OAuth session + DB access and cannot be performed by the autonomous
executor.

**Verification commands (run by user after next ACC sync):**

```sql
-- Postgres: account-admin count
SELECT COUNT(*) FROM "AccMemberCache"
WHERE (data->>'isAccountAdmin')::boolean = true;

-- Compare to any-projectAdmin count (must DIFFER to prove field semantics)
SELECT COUNT(DISTINCT email) FROM "AccMemberCache"
WHERE jsonb_path_exists(data, '$.projects[*] ? (@.isAdmin == true)');
```

**Expected:** account-admin count > 0 AND ≠ project-admin count. If
account-admin count is 0 unexpectedly, log distinct values of `accUser.role`
inside `bulkAccSync` to triage the field name.

---

## Update from 04-02 execution (2026-05-08)

Plan 04-02 (ACC join-date / addedOn plumbing for DASH-06) lands the same
shape as 04-01: Path A (HQ v1 `created_at`) verified against scraped APS docs;
no first-seen-in-cache fallback needed. `BulkAccUser.addedOn: string | null`
non-optional; written by `bulkAccSync`, read by `bulkAccSummary` with
default-null fallback for legacy rows. `tsc --noEmit` clean.

### Live verification deferred (04-02 Task 3)

Triggering a fresh ACC sync requires admin OAuth + DB access not available to
the autonomous executor. Run the queries below after the next `Sync All to
ACC` run to confirm the addedOn distribution makes sense.

**Verification commands (run by user after next ACC sync):**

```sql
-- Postgres: bucket distribution by addedOn vs now()
SELECT
  COUNT(*) FILTER (WHERE data->>'addedOn' IS NULL OR data->>'addedOn' = '')                                      AS null_count,
  COUNT(*) FILTER (WHERE (data->>'addedOn')::timestamptz >= now() - interval '7 days')                            AS last_7d,
  COUNT(*) FILTER (WHERE (data->>'addedOn')::timestamptz >= now() - interval '30 days'
                     AND (data->>'addedOn')::timestamptz <  now() - interval '7 days')                            AS prev_8_30d,
  COUNT(*) FILTER (WHERE (data->>'addedOn')::timestamptz >= now() - interval '90 days'
                     AND (data->>'addedOn')::timestamptz <  now() - interval '30 days')                           AS prev_31_90d,
  COUNT(*) FILTER (WHERE (data->>'addedOn')::timestamptz <  now() - interval '90 days')                           AS older_than_90d
FROM "AccMemberCache"
WHERE (data->>'found')::boolean = true;
```

**Expected (Path A — ACC `created_at` is real history):** distribution should
span all buckets, NOT collapse into "last 7d". If 100% of rows fall into
last_7d, the field is likely being overwritten with sync time — investigate
`bulkAccSync`'s `normalizedAddedOn` block in `server/routers/users.ts` (the
`Date.parse` should be reading `accUser.addedOn`, not `Date.now()`).

**Caveat for downstream DASH-06 widget:** legacy cache rows synced before
04-02 surface as `addedOn: null`. Until those rows are refreshed by the next
sync, the Recently-Added widget will under-count: a user added 5 days ago
whose cache row predates this commit shows null, not "5d". The widget should
either (a) display null users in a separate "unknown join date" tier, or
(b) prompt for a Sync on first load.

