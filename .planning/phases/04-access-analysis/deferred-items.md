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

