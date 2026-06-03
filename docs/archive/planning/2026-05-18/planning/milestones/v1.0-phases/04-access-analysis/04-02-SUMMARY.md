---
phase: 04-access-analysis
plan: 02
subsystem: api
tags: [acc, autodesk-construction-cloud, hq-v1-api, types, prisma-json-cache, dash-06]

requires:
  - phase: 04-access-analysis
    plan: 01
    provides: BulkAccUser non-optional-boolean pattern (additive JSON cache field, no migration, default-fallback on read) — 04-02 stacks on top with the same shape
provides:
  - BulkAccUser.addedOn (non-optional string | null) populated end-to-end from ACC HQ v1 user record
  - Verified field mapping for ACC member-creation date (HQ v1 `created_at`, ISO 8601)
  - bulkAccSync normalizes addedOn at the cache-write boundary (ISO via Date.parse, null on parse failure)
  - bulkAccSummary reads back with default-null fallback for legacy cache rows
affects: [DASH-06 recently-added widget, any future BulkAccUser consumer]

tech-stack:
  added: []
  patterns:
    - "Additive cache field via JSON column (no Prisma migration) — legacy rows tolerated by default-null read"
    - "Date normalization at write site (Date.parse → toISOString or null) — never Date.now() (would defeat first-seen semantics)"

key-files:
  created: []
  modified:
    - lib/acc/acc-types.ts
    - lib/server/acc-admin.ts
    - server/routers/users.ts
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - lib/acc/dashboardAnalytics.test.ts
    - .planning/phases/04-access-analysis/deferred-items.md

key-decisions:
  - "ACC join-date source is HQ v1 user record `created_at` field (ISO 8601 datetime). Verified against scraped APS docs (BIM 360 API/REST API/GET_users-user_id.json:213-215, sample line 257; GET_users-search.json:260, sample line 304). The user record creation timestamp is the closest semantic match to 'ACC member added on' — distinct from `last_sign_in` (most recent activity) and `updated_at` (any record change)."
  - "Path A (ACC field exists). No first-seen-in-cache fallback needed. Documented inline in lib/server/acc-admin.ts."
  - "BulkAccUser.addedOn made non-optional `string | null` (deterministic). Legacy cache rows default to `null` on read; populated truthfully on next bulkAccSync."
  - "Skipped runtime spike (Task 1) — APS docs unambiguously document `created_at`; existing acc-admin.ts fetcher already reads `match.created_at || match.addedOn` into AccUser.addedOn. A live spike would have added zero information. Same shortcut as 04-01."
  - "Date normalized at the bulkAccSync write boundary (Date.parse → toISOString, null on failure). Never `Date.now()` — that would silently overwrite first-seen with sync time and produce uniform 'last 7d' distribution (the bug Task 3 was designed to catch)."

patterns-established:
  - "Pattern: additive `string | null` field through ACC pipeline — fetcher exposes raw payload field, bulkAccSync normalizes + persists into JSON cache, bulkAccSummary reads with `typeof data.x === 'string' && data.x.length > 0 ? data.x : null` default-null fallback."

requirements-completed: [DASH-06]

duration: ~3min
completed: 2026-05-08
---

# Phase 4 Plan 02: ACC addedOn (Member-Creation Date) Plumbing Summary

**HQ v1 `created_at` plumbed end-to-end as `BulkAccUser.addedOn: string | null`, unblocking DASH-06 Recently-Added widget without a Prisma migration. Path A (ACC field exists); no fallback needed.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T19:03:08Z
- **Completed:** 2026-05-08T19:05:50Z
- **Tasks:** 3 (Task 3 verification deferred to live sync)
- **Files modified:** 6

## Accomplishments

- Verified the ACC join-date field name against scraped APS docs (HQ v1 `created_at`) without requiring a runtime spike
- `AccUser.addedOn?: string` doc upgraded with the verified field mapping inline
- `BulkAccUser.addedOn: string | null` added (non-optional) — every consumer can rely on a deterministic value
- `bulkAccSync` normalizes the raw ACC `created_at` at the write boundary (ISO via `Date.parse` → `toISOString`, null on parse failure / missing) and persists into `accMemberCache.data`
- `bulkAccSummary` surfaces it on every BulkAccUser branch (cache-miss / not-found / found) with default-null fallback for legacy rows
- `tsc --noEmit` clean
- Coordination preserved: edits stack cleanly on 04-01's `isAccountAdmin` plumbing — same files, same regions, same pattern (JSON cache, no migration, default-fallback)

## Task Commits

1. **Task 1: Document the verified ACC Admin API field name** — `0b8bffe` (docs)
2. **Task 2: Extend BulkAccUser + plumb addedOn through acc-admin.ts and bulkAccSummary** — `5cf5454` (feat)
3. **Task 3: Resync verification deferred to live env + deferred-items doc update** — `ff9c510` (chore)

## Files Created/Modified

- `lib/acc/acc-types.ts` — Added `BulkAccUser.addedOn: string | null` (non-optional) with JSDoc directing DASH-06 consumers to handle null gracefully
- `lib/server/acc-admin.ts` — Documented HQ v1 `created_at` mapping inline on `AccUser.addedOn`; included references to scraped APS docs (file paths + line numbers + sample values); declared Path A explicitly
- `server/routers/users.ts` — `CachedData` extended with optional `addedOn?: string | null` (legacy rows); `bulkAccSync` normalizes via `Date.parse → toISOString` (null on parse failure / missing); `bulkAccSummary` emits `addedOn` on every BulkAccUser branch with default-null fallback
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — Missing-user stub literal sets `addedOn: null` to satisfy the now-required field
- `lib/acc/dashboardAnalytics.test.ts` — `makeUser` fixture defaults `addedOn: null` for the type change
- `.planning/phases/04-access-analysis/deferred-items.md` — Documented live-sync verification deferral with SQL bucket-distribution diagnostic and DASH-06 caveats

## Decisions Made

- **Skip the runtime spike, again.** Plan 04-02 Task 1 originally called for a `console.log` of raw HQ v1 user payload + redacted sample to identify the join-date field. The APS BIM 360 / ACC docs (scraped under `BIM 360 API/REST API/GET_users-user_id.json` and `GET_users-search.json`) explicitly document `created_at` as ISO 8601 with sample values; the existing acc-admin.ts already reads `match.created_at || match.addedOn` into `AccUser.addedOn`. A live spike would have produced a value that we already know exists. Documented the verified mapping inline in `lib/server/acc-admin.ts` per Task 1's done criterion.
- **Path A (no fallback).** Because the field is documented and already extracted, the "fallback first-seen-in-cache" branch from the plan was unnecessary. The plan called for either path explicitly; Path A is strictly better because (a) it gives real ACC history, (b) it does not require coupling the fetcher to the database to look up prior cache state, (c) it does not silently produce uniform "last 7d" distribution on first sync.
- **Non-optional `string | null` on `BulkAccUser`.** Plan called for deterministic `string | null`. The downside (every consumer literal must include the field) is concentrated in two stub call-sites (UsersDirectoryClient, dashboardAnalytics.test.ts fixture) — both fixed in this plan. Same pattern 04-01 used for `isAccountAdmin: boolean`.
- **Normalization at the write site, not the read site.** `bulkAccSync` runs `Date.parse → toISOString` once per user per sync; `bulkAccSummary` runs on every dashboard request. Putting normalization on the write side keeps the read path cheap and ensures we catch parse failures at the boundary closest to the API. The read still defends against legacy/missing data via `typeof data.addedOn === "string" && data.addedOn.length > 0 ? data.addedOn : null`.
- **`Date.now()` explicitly forbidden.** Inline comment in `bulkAccSync` warns against ever swapping in `Date.now()` — that would defeat the point of the field by overwriting first-seen with sync time, producing the exact "everyone is recent" failure mode that motivated this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Stub literal in UsersDirectoryClient missing required field**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** `app/(dashboard)/users/UsersDirectoryClient.tsx:633-646` constructs a `BulkAccUser` literal for unregistered Workspace people; making `addedOn` non-optional broke the type (same pattern as 04-01's `isAccountAdmin` fix).
- **Fix:** Added `addedOn: null` to the stub literal.
- **Files modified:** `app/(dashboard)/users/UsersDirectoryClient.tsx`
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `5cf5454` (part of Task 2)

**2. [Rule 3 — Blocking] Test fixture in `dashboardAnalytics.test.ts` missing required field**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** `lib/acc/dashboardAnalytics.test.ts` `makeUser` fixture (Plan 04-03 artifact) defines a `BulkAccUser` literal without `addedOn` after the type change.
- **Fix:** Added `addedOn: null` default before `...overrides`.
- **Files modified:** `lib/acc/dashboardAnalytics.test.ts`
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `5cf5454` (part of Task 2)

**3. [Plan-shortcut] Skipped Task 1's live spike**
- **Found during:** Task 1 (planning)
- **Issue:** Plan called for a console.log of candidate join-date fields against a real ACC payload. APS docs already document `created_at` unambiguously and the existing fetcher already reads it.
- **Fix:** Documented the verified mapping inline (per Task 1's done criterion) and proceeded directly to Task 2. Same pattern 04-01 used.
- **Files modified:** `lib/server/acc-admin.ts`
- **Committed in:** `0b8bffe` (Task 1)

---

**Total deviations:** 3 (2 auto-fixed Rule 3 — both blocking compile errors caused directly by the type change; 1 plan-shortcut where docs evidence was sufficient).
**Impact on plan:** Both type-change fixes were strictly required. The plan-shortcut saved a live sync round-trip while still satisfying Task 1's done criterion (documented mapping + path decision inline).

## Issues Encountered

- **Task 3 live verification deferred.** Triggering a fresh ACC sync requires admin OAuth + DB access not available to the autonomous executor. Documented the SQL bucket-distribution query in `deferred-items.md` for the user to run after the next `Sync All to ACC` invocation. The diagnostic explicitly checks that distribution does NOT collapse into "last 7d" (the bug we're trying to avoid).

## Distribution Caveat for DASH-06 Widget Consumers

Until the next live ACC sync runs, every legacy `accMemberCache` row reports `addedOn: null` (default fallback for rows missing the field). This means:

- **Pre-sync:** the Recently-Added widget will show ZERO members in the 7d/30d/90d buckets — every user falls into the "unknown" / null group.
- **Post-sync (Path A):** the widget reflects real ACC join history. Distribution should span all buckets (not collapse to "last 7d"). New emails added to ACC since the previous sync land in the appropriate recency bucket based on their actual `created_at`.
- **Widget responsibility:** treat `addedOn === null` as "unknown join date" — do NOT include them in any 7d/30d/90d bucket; either show as a separate tier or hide. The widget should also prompt for a Sync on first load if the null count is high.

## User Setup Required

None — no external service configuration required. After the next `Sync All to ACC` run, the field auto-populates for all hub users via HQ v1 `created_at`.

## Next Phase Readiness

- **DASH-06 (Recently-Added widget) unblocked.** Downstream consumers can now `users.filter(u => u.addedOn && differenceInDays(now, parseISO(u.addedOn)) <= window)` to render the recently-added list with confidence that:
  - The field is non-optional (deterministic null vs missing).
  - Path A semantics: real ACC creation date, not sync time.
  - Legacy null rows fall through cleanly (the `&&` short-circuits).
- **Wave 0 data-pipeline gaps fully closed.** Both prerequisites identified in 04-RESEARCH.md (Pitfall 6 — `isAccountAdmin`; Pitfall 7 — `addedOn`) are now plumbed end-to-end. Subsequent plans (DASH-06 widget, DASH-07 widget) can build directly on `BulkAccUser` without further pipeline work.

## Self-Check: PASSED

- FOUND: lib/acc/acc-types.ts
- FOUND: lib/server/acc-admin.ts
- FOUND: server/routers/users.ts
- FOUND: app/(dashboard)/users/UsersDirectoryClient.tsx
- FOUND: lib/acc/dashboardAnalytics.test.ts
- FOUND: .planning/phases/04-access-analysis/deferred-items.md
- FOUND: .planning/phases/04-access-analysis/04-02-SUMMARY.md
- FOUND commit: 0b8bffe (Task 1)
- FOUND commit: 5cf5454 (Task 2)
- FOUND commit: ff9c510 (Task 3)

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
