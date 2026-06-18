---
phase: "04"
plan: "G1"
subsystem: "users-directory"
tags: ["bugfix", "tdd", "last-active", "kpi", "trpc"]
status: complete

key-decisions:
  - "getAllLastUnifiedActivityByEmail added to unifiedActivitySource.ts (no-email-filter variant) rather than reusing getLastUnifiedActivityByEmail with empty array, because empty array triggers FALSE in the WHERE clause"
  - "Optional 3rd param on buildDirectoryRows preserves backward-compat for all existing tests — uses Map.has() sentinel to distinguish 'no entry → fallback' from 'entry=null → no activity'"
  - "accSummaryMap casing not changed — production emails stored lowercase by ingest; Google directory emails also lowercase in practice; left as noted observation per secondary-check findings"

metrics:
  duration: "~25min"
  completed: "2026-06-18"
  tasks: 5
  files: 5

key-files:
  created:
    - lib/server/unifiedActivitySource.ts (getAllLastUnifiedActivityByEmail — was untracked; now committed)
  modified:
    - server/routers/acc-activity.ts
    - app/(dashboard)/users/directoryTableRow.ts
    - app/(dashboard)/users/useUsersDirectoryData.ts
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/directoryTableRow.test.ts
    - app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx
    - app/(dashboard)/users/useUsersDirectoryData.test.ts
---

# Phase 04 Plan G1: Last Active Column Fix Summary

**One-liner:** Fixed /users "Last active" showing No data for everyone by wiring a new `lastFileActivityByEmailAll` tRPC procedure (one grouped SQL query over 623k rows, ~200ms) into `buildDirectoryRows` via an optional override Map, also fixing the Active-30d KPI from 0.

## Root Cause

The /users directory fetches `BULK_USERS_LEAN_INPUT = { leanProjects: true }`, which the server populates without ever setting `project.lastActivity` on any row. `buildDirectoryRows` derived `lastActivity = max(project.lastActivity)` across all projects — always null. The pre-Phase-4 IntersectionObserver batch approach was dropped when moving to the sortable DataTable column, with no replacement.

## Fix

### 1. New server function: `getAllLastUnifiedActivityByEmail`
`lib/server/unifiedActivitySource.ts` — added `getAllLastUnifiedActivityByEmail(db, { rawActionIn })`. Unlike `getLastUnifiedActivityByEmail` (which takes an `emails` array and pushes `LOWER("userEmail") = ANY(...)` or `FALSE` when empty), this variant omits the email filter entirely — one `GROUP BY LOWER("userEmail")` scan across all unified activity rows.

### 2. New tRPC procedure: `accActivityRouter.lastFileActivityByEmailAll`
`server/routers/acc-activity.ts` — calls `getAllLastUnifiedActivityByEmail` with `FILE_RAW_ACTIONS` (same constant used by `getLastFileActivityBatch` and `usersOrderedByLastFileActivity`; Pitfall 6 guard). Returns `Record<email_lowercase, ISO string | null>`.

### 3. Row builder: optional 3rd param
`directoryTableRow.ts` — `buildDirectoryRows(people, accSummaryMap, lastActivityByEmail?)`. When the map is provided and `map.has(emailKey)` is true, the map value is the authoritative `lastActivity` (null = genuinely no file activity). When the map is absent or has no entry for the email, falls back to project.lastActivity-max (original behavior preserved for backward-compat). `isDormant` is recomputed from the resolved value.

### 4. Data hook: Query 9
`useUsersDirectoryData.ts` — added `trpc.accActivity.lastFileActivityByEmailAll.useQuery(undefined, { staleTime: 300_000, retry: false })`. Returns `Map<string, string | null> | undefined` (undefined while loading). Exposed as `lastActivityByEmail` on `UsersDirectoryData`.

### 5. Shell: KPI + row builder
`UsersDirectoryClient.tsx` — passes `lastActivityByEmail` to `buildDirectoryRows`; rewrites the `active30d` KPI loop to use `lastActivityByEmail.get(email)` instead of the always-null `project.lastActivity` loop.

## TDD Gate Compliance

RED commit: `69e423ad` — 7 failing directoryTableRow tests + 2 failing integration tests + mock update
GREEN commit: `7a1f4fb3` — all 22 unit + 12 integration tests pass

## Test Results

- directoryTableRow.test.ts: 22/22 (7 new G1 cases)
- UsersDirectoryClient.integration.test.tsx: 12/12 (2 new G1 cases)
- useUsersDirectoryData.test.ts: 5/5
- Full /users suite: 1140/1140
- tsc: 0 errors
- repo-map:check: passed

## Secondary Check: accSummaryMap casing

`accSummaryMap` is keyed by `item.email` (raw, not lowercased). Consumers in `useDirectoryRows.ts` (lines 69, 71, 78, 82) and `useUsersDirectoryData.ts` (line 249) call `.get(p.email)` without `.toLowerCase()`. In production, `BulkAccUser.email` comes from `acc-hot-cache.ts` where all emails are lowercased during assembly (line 603: `user.email?.toLowerCase()`). Google Directory emails are also lowercase in practice. No evidence of lookup misses from casing. Left unchanged; noted as a pre-existing low-risk pattern (documented-only, not fixed per secondary-check protocol).

## Deviations from Plan

### Auto-added: `getAllLastUnifiedActivityByEmail` in `unifiedActivitySource.ts`

**Found during:** Server implementation
**Issue:** `getLastUnifiedActivityByEmail` requires a non-empty emails array; passing `[]` generates `WHERE FALSE` and returns no rows.
**Fix:** Added a separate `getAllLastUnifiedActivityByEmail` function that omits the email filter, keeping the existing function's signature and behavior intact.
**Files modified:** `lib/server/unifiedActivitySource.ts`
**Commits:** `7a1f4fb3`

None — plan executed exactly as specified, plus the above deviation (Rule 2: missing correctness requirement).

## Self-Check: PASSED

- `lib/server/unifiedActivitySource.ts` getAllLastUnifiedActivityByEmail: present in commit 7a1f4fb3
- `server/routers/acc-activity.ts` lastFileActivityByEmailAll procedure: present
- `app/(dashboard)/users/directoryTableRow.ts` 3rd param: present
- `app/(dashboard)/users/useUsersDirectoryData.ts` Query 9: present
- `app/(dashboard)/users/UsersDirectoryClient.tsx` KPI + rows wiring: present
- RED commit 69e423ad: confirmed
- GREEN commit 7a1f4fb3: confirmed
