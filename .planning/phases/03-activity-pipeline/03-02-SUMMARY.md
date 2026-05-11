---
phase: 03-activity-pipeline
plan: 02
subsystem: ingestion + tRPC
tags: [cron, streaming, unzipper, csv-parse, trpc, prisma, activity]

# Dependency graph
requires:
  - phase: 03-activity-pipeline
    plan: 01
    provides: AccActivity v2 schema (userEmail, sourceFile, rawAction, @@unique dedup) + UnresolvedAttribution table + unzipper/csv-parse deps
  - phase: 02-core-extraction
    provides: AccProjectMember (autodeskId + email) for inviter attribution + email enrichment
provides:
  - lib/acc/activityCategories.ts (raw action -> category mapping + CATEGORY_TO_RAW_ACTIONS reverse map + INVITATION_ACTIONS)
  - lib/acc/attributeInviter.ts (parseInviteeEmail + attribute() with UnresolvedAttribution side-effect)
  - lib/acc/ingestActivityZip.ts (streaming ZIP -> CSV -> 500-row createMany pipeline with inline autodeskId->email enrichment)
  - scripts/deep-sync-ingest.cjs (Stage-2 cron entry point with --dry-run flag)
  - server/routers/acc-activity.ts (3 protected tRPC procedures: getFileActivityForUser, listForUser, listInvitations)
  - appRouter.accActivity wired in server/routers/root.ts
affects:
  - 03-03 (UI plan: consumes accActivity.getFileActivityForUser via hover prefetch + side-panel)
  - 03-04 (UI plan: consumes accActivity.listInvitations for RecentlyAdded inviter attribution + accActivity.listForUser for drill-down)
  - Railway cron config (operator must wire scripts/deep-sync-ingest.cjs as a 30-min cron job)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tsx/cjs register hook: CJS cron scripts require() TS helpers directly (no separate build step)"
    - "Async-iterator csv-parse consumption: `for await (const row of parser)` honors backpressure without manual pause/resume"
    - "Single-pass autodeskId->email enrichment: per-batch findMany builds a Map<autodeskId, lowercased email> before createMany"
    - "Multi-job APS status reduction: success only if ALL jobs success; any fail/cancel -> failed; else running"
    - "(createdAt, id) compound cursor pagination via OR'd Prisma where clause (Prisma has no row-tuple comparison)"
    - "Batched attribution lookup (single findMany per inviter/invitee set) to avoid N+1 in listInvitations"

key-files:
  created:
    - lib/acc/activityCategories.ts
    - lib/acc/attributeInviter.ts
    - lib/acc/ingestActivityZip.ts
    - scripts/deep-sync-ingest.cjs
    - server/routers/acc-activity.ts
  modified:
    - server/routers/root.ts

key-decisions:
  - "Overlap-guard strategy: a row in status='running' with startedAt within the last 60 min is considered locked by another worker. Anything older is reclaimable. Plan 01 did not add an ingestStartedAt column, so we reuse startedAt as a coarse lock proxy — acceptable because 'running' is only set BY this script (Plan 01's cron leaves rows as 'pending')."
  - "ACTV-03 query strategy: 4 parallel findFirst per file category (view/upload/edit/delete) instead of the take:200 approach in RESEARCH Example 1. Each query is an O(1) lookup against the (userEmail, createdAt DESC) index. Faster + avoids the risk of a category being shadowed below the take:200 cutoff."
  - "listForUser 'other' filter semantics: when categories=['other'] alone, build a NOT IN filter against all known raw action strings. When 'other' appears alongside known categories, treat as no-filter (include everything) — simpler than building a union."
  - "Re-invited users surface as InvitationGroup { primary, others[] }, keyed by lowercased invitee email. Rows without a parseable invitee email get isolated synthetic keys so they still surface as 'Unknown invitee' rows in the UI."
  - "Inline autodeskId->email enrichment (per-batch findMany against AccProjectMember) instead of a post-ingest pass — keeps the pipeline single-pass and avoids a second job. Open Question 4 from RESEARCH resolved in favor of inline."
  - "tsx/cjs hook from the cron script: `require('tsx/cjs')` registers the loader, then `require('lib/acc/ingestActivityZip.ts')` works directly. Same Node 22 process, no spawn, no separate build."

# Metrics
duration: ~5min
completed: 2026-05-11
---

# Phase 3 Plan 2: Activity Ingest Pipeline + tRPC Router Summary

**Streaming ZIP -> CSV -> AccActivity ingest pipeline, Stage-2 cron entry point, and accActivity tRPC router with three procedures (lazy file-activity timestamps, paginated drill-down, grouped invitations) — all wired and typechecking clean against Plan 01's schema.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-11T21:46Z
- **Completed:** 2026-05-11T21:51Z
- **Tasks:** 3
- **Files created:** 5 (3 lib/acc helpers + 1 cron script + 1 tRPC router)
- **Files modified:** 1 (server/routers/root.ts)

## Accomplishments

- `lib/acc/activityCategories.ts` ships the raw action -> category mapping plus `CATEGORY_TO_RAW_ACTIONS` reverse map and `INVITATION_ACTIONS` list — single source of truth for ACTV-03, ACTV-04, ACTV-05.
- `lib/acc/attributeInviter.ts` parses the invitee email from `details`, joins to `AccProjectMember` by autodeskId (inviter) and email (invitee, case-insensitive), and writes forensic rows to `UnresolvedAttribution` for `no_email_match` / `no_autodesk_id_match` / `ambiguous_match` cases. Persistence failures are swallowed so they cannot block ingest.
- `lib/acc/ingestActivityZip.ts` streams the signed S3 ZIP (no Authorization header) through `unzipper.Parse({ forceStream: true })`, filters to `project_activities.csv` and `admin_activities.csv`, parses with `csv-parse` (`bom: true` + `trim` + `relax_column_count`), and flushes 500-row batches via `createMany({ skipDuplicates: true })`. Each batch is enriched with `userEmail` via a single `accProjectMember.findMany({ where: { autodeskId: { in: ids } } })`.
- `scripts/deep-sync-ingest.cjs` polls `AccDataConnectorJob` rows in `pending` or `running`, reduces multi-job APS status (success only if all jobs succeed), marks rows `running` before download to claim the overlap lock, handles `503/403` on stale signed URLs by re-polling APS once for a fresh URL (Pitfall 2), and persists a `rowsByFile=… unresolved=…` summary to `SyncMeta('deep').lastError`. `--dry-run` flag verified end-to-end against the live DB.
- `server/routers/acc-activity.ts` exposes three protected procedures:
  - **getFileActivityForUser** (ACTV-03): 4 parallel `findFirst` queries against the `(userEmail, createdAt DESC)` index from Plan 01 — returns `{ lastView, lastUpload, lastEdit, lastDelete }`.
  - **listForUser** (ACTV-05): (createdAt, id) cursor pagination, optional category / project / dateRange filters, returns `{ rows, nextCursor }`.
  - **listInvitations** (ACTV-04 backend): batched inviter+invitee `findMany`, grouped by invitee email for `+N others` surfacing, time-window relaxed when `inviterFilter` is active.
- `appRouter.accActivity` registered in `server/routers/root.ts`.
- `npx tsc --noEmit` over the full project: zero errors.
- `node scripts/deep-sync-ingest.cjs --dry-run` exits 0 against the live DB (found 1 leftover test row with fake `requestId`, gracefully logged the expected 403 from APS, exited cleanly).

## Task Commits

1. **Task 1: Activity ingest primitives (3 lib files)** — `7e9106d` (feat)
2. **Task 2: Stage-2 cron script** — `7e1178e` (feat)
3. **Task 3: accActivity tRPC router + root registration** — `d133296` (feat)

## Files Created/Modified

- `lib/acc/activityCategories.ts` — raw action mapping + reverse map + invitation list (newly created)
- `lib/acc/attributeInviter.ts` — email regex parse + AccProjectMember join + UnresolvedAttribution persistence (newly created)
- `lib/acc/ingestActivityZip.ts` — streaming ZIP -> CSV -> batched createMany pipeline (newly created)
- `scripts/deep-sync-ingest.cjs` — Stage-2 cron entry point with --dry-run (newly created)
- `server/routers/acc-activity.ts` — 3-procedure tRPC router (newly created)
- `server/routers/root.ts` — added `accActivity: accActivityRouter` to appRouter

## Decisions Made

See frontmatter `key-decisions` block — overlap-guard strategy (60-min stale lock against startedAt), ACTV-03 query strategy (4 parallel findFirst vs take:200), listForUser 'other' filter semantics, invitation group keying, and the tsx/cjs hook pattern for CJS-loading-TS.

## Open Questions / Validation Pending

- **Actual distinct raw `action` strings observed on first ingest:** UNAVAILABLE — `AccActivity` has 0 rows in the live DB. Validation against the `MAP` in `activityCategories.ts` is deferred to the first real ingest run, after Railway picks up the cron. Plan 03 / Plan 04 UI work can begin immediately; any unmapped raw strings will land in the `other` bucket lossless and surface in the drill-down, then a follow-up commit can extend `MAP`.
- **Memory peak during ingest:** UNAVAILABLE — pending Railway logs from the first production run. Pattern is designed for O(BATCH × row size) ≈ 500 KB peak; will verify after first 400 MB+ ZIP.
- **Plan 03 + Plan 04 contract confirmed:**
  - `getFileActivityForUser({ email })` returns `{ lastView, lastUpload, lastEdit, lastDelete }` (Date | null per field).
  - `listForUser({ email, categories?, projectId?, dateRange?, cursor?, limit? })` returns `{ rows: AccActivity[], nextCursor: { createdAt, id } | null }`.
  - `listInvitations({ windowDays: 7|30|90, inviterFilter?, limit? })` returns `{ invitations: InvitationGroup[] }` where each group exposes `primary: InvitationRow` + `others: InvitationRow[]` for the `+N others` UI requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JSDoc comment containing `*/30` cron syntax terminated the comment block prematurely**
- **Found during:** Task 2 verification (`node scripts/deep-sync-ingest.cjs --dry-run`)
- **Issue:** First run failed with `SyntaxError: Unexpected token '*'` at line 4 because the JSDoc header included `Schedule: */30 * * * *` — the `*/` closed the comment block, exposing `30 * * * *` as code.
- **Fix:** Replaced with `Schedule: every 30 min (cron "*\/30 * * * *")` so the `/` is escaped and stays inside the comment.
- **Files modified:** scripts/deep-sync-ingest.cjs
- **Verification:** Dry-run completed cleanly; exited with code 0.
- **Committed in:** 7e1178e (Task 2 commit) — fix applied before commit.

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking, trivial syntax issue caught immediately by verify step)
**Impact on plan:** None — fix was a one-line comment edit.

## Deferred Items

None for Plan 02 itself. Deferred to first-ingest validation:
- Distinct raw `action` strings observed (compare against `MAP` in `activityCategories.ts`; extend if needed).
- Memory peak during real-world 400 MB+ ZIP ingest (Railway logs).

## Issues Encountered

- `Schedule: */30 ...` cron-syntax-in-JSDoc caused the comment block to terminate prematurely (documented above). Resolved by escaping the `/`.

## User Setup Required

- **Railway cron config:** Operator must wire `scripts/deep-sync-ingest.cjs` as a Railway cron job. Recommended cadence: every 30 min (`*/30 * * * *`). Lower-frequency (e.g. hourly) is acceptable; the script is idempotent and re-poll-safe.
- **No new env vars** — script reuses `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, and `DATABASE_URL`/`DIRECT_URL` already configured for `scripts/deep-sync.cjs`.

## Next Phase Readiness

- Plan 03 (UI: per-user file activity columns + side-panel drill-down) can consume `trpc.accActivity.getFileActivityForUser` and `trpc.accActivity.listForUser` directly.
- Plan 04 (UI: RecentlyAdded WHO-added-WHOM stacked avatars + filter pill) can consume `trpc.accActivity.listInvitations`. The `InvitationGroup` shape already exposes the `+N others` data the widget needs.
- Schema-side, Plan 01's `(userEmail, createdAt DESC)` index, `@@unique` dedup, and `UnresolvedAttribution` table all light up here for the first time.

## Self-Check: PASSED

- FOUND: lib/acc/activityCategories.ts
- FOUND: lib/acc/attributeInviter.ts
- FOUND: lib/acc/ingestActivityZip.ts
- FOUND: scripts/deep-sync-ingest.cjs
- FOUND: server/routers/acc-activity.ts
- FOUND: server/routers/root.ts (modified: appRouter.accActivity registered — verified via grep)
- FOUND: .planning/phases/03-activity-pipeline/03-02-SUMMARY.md
- FOUND commit: 7e9106d (Task 1)
- FOUND commit: 7e1178e (Task 2)
- FOUND commit: d133296 (Task 3)

---
*Phase: 03-activity-pipeline*
*Completed: 2026-05-11*
