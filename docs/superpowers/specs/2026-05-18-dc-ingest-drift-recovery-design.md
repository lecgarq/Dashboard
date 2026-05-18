# DC Ingest Drift Recovery — Design

**Date:** 2026-05-18
**Author:** Luis + Claude (brainstorming session)
**Status:** Design approved — pending implementation plan via `superpowers:writing-plans`
**Branch:** TBD (separate from current `feat/access-analysis-redesign`)

---

## Problem statement

The Data Connector activity ingest has been silently failing for ~5 days. The newest row in `AccActivity` is from 2026-05-13, yet `AccDcIngestRun` records have reported `status='success'` for runs on 2026-05-18. Today's two runs (one 9-quota "success", one 6-quota "quarantined") added zero activity rows between them.

Three compounded bugs caused this:

- **Bug A (root cause):** `lib/acc/dcActivityCsvIngest.ts:163-171` writes an `ingestRunId` field into `tx.accActivity.createMany(...)`, but `model AccActivity` in `prisma/schema.prisma:532-549` has no `ingestRunId` column. Every activity insert throws `column "ingestRunId" does not exist`. Confirmed by raw query: `Raw query failed. Code: '42703'. Message: 'column "ingestRunId" does not exist'`.
- **Bug B (silencer):** `lib/acc/dcIngest.ts:979-994` catches the throw, logs it via `console.error`, and `continue`s the slice loop. Run finalizes as `status='success'` with `rowsByModule={admin:0, docs:0, ...}`. This is why nobody noticed for 5 days.
- **Bug C (compound):** `lib/acc/dcIngest.ts:1002-1040` always calls `ingestAdminSnapshot`, even for backward slices. Backward windows naturally have fewer active admin users than forward windows, so the anomaly check (10% threshold) trips and rolls back. Today's backward run quarantined with `User count dropped 12.8% (from 3367 to 2936)`. This also leaves `AccDcBackfillProgress` un-updated because the quarantine path at line 1018 returns before the progress upsert loop at line 1042.

The compound effect: every daily cron run burns 9 quota for zero data; every manual backward retry also burns quota for zero data; the planner's "30-day step backward per run" never actually progresses.

## Decisions locked during brainstorming

1. **Schema-drift fix shape:** Add `ingestRunId String` (nullable) to `AccActivity` + migration. Do NOT backfill the 2507 existing rows — they pre-date the column and `NULL` is the honest value.
2. **Admin snapshot for backward slices:** Skip entirely. The admin tables represent current state, not historical state, so backward windows should not write to them. No anomaly check needed for backward.
3. **Loud-failure policy:** Hard abort on the first exception thrown from `ingestActivityCsv` or `ingestAdminSnapshot` (or any file fetch/parse). Run finalizes as `status='failed'`. No more `continue`-on-error.
4. **Progress reset:** Roll all 428 `AccDcBackfillProgress` rows back to `earliestCovered=NULL`, `latestCovered=NULL`, `newProjectFlag=true`. The window the planner *thought* was covered (2026-04-17 → 2026-05-17) had zero activity rows; pretending otherwise corrupts future planning.
5. **Quota protection:** `.dc-ingest.disabled` kill switch already created at repo root with a reason note. Cron disabled until the verification gate (Section D) passes.
6. **Delivery shape:** One atomic phase shipping all four code fixes + recovery script + tests. Smaller per-phase blast radius isn't worth it for tightly-coupled bugs.

## A. Architecture & file-level changes

| File | Change | Why |
|---|---|---|
| `prisma/schema.prisma` (AccActivity model) | Add `ingestRunId String?` field. Add `@@index([ingestRunId])`. Do NOT add `ingestRunId` to the `@@unique` (dedup must remain run-agnostic — same logical event from any run must still dedupe). | Closes Bug A by aligning DB with what the writer already passes. |
| `prisma/migrations/20260518_<slug>/migration.sql` (new) | `ALTER TABLE "AccActivity" ADD COLUMN "ingestRunId" TEXT;` (nullable). `CREATE INDEX "AccActivity_ingestRunId_idx" ON "AccActivity"("ingestRunId");` | Additive, reversible. Existing rows stay NULL. |
| `lib/acc/dcActivityCsvIngest.ts` | No code change needed once the column exists. Update file header comment that misleadingly says "Pure-ish — depends on csv-parse and Prisma types only" — it actually depends on the AccActivity column set, which is what hid this bug from review. | Documentation accuracy. |
| `lib/acc/dcIngest.ts:933-934` (data-listing catch) | Replace `console.error + continue` with `return finalize(..., status='failed', errorMessage)`. | Bug B fix. |
| `lib/acc/dcIngest.ts:979-994` (activity file-loop catch) | Same: replace `console.error + continue` with hard abort. The existing `QuotaExceededError` early-return path is preserved unchanged. | Bug B fix. |
| `lib/acc/dcIngest.ts:1002-1040` (admin snapshot block) | Compute `nonBackwardCompleted = completedSlices.filter(s => s.reason !== 'backward')`. Only run `ingestAdminSnapshot` when `nonBackwardCompleted.length > 0 AND adminCsvParts.size > 0`. Admin CSVs collected during backward slices are discarded. | Bug C fix. |
| `scripts/dc-reset-progress.cjs` (new) | One-shot reset. See Section C. | Recovery for the 5-day gap. |
| `.dc-ingest.disabled` | Already created. Removed only when Section D gate passes. | Quota protection. |
| `lib/acc/dcActivityCsvIngest.test.ts` | Add: happy-path test asserts `ingestRunId` is set on each inserted row. | Catches Bug A regression. |
| `lib/acc/dcIngest.test.ts` | Add: any `throw` inside the file-loop causes `status='failed'` (not `'success'`). | Catches Bug B regression. |
| `lib/acc/dcIngest.backward.test.ts` (new) | Add: a backward-only slice list produces zero `ingestAdminSnapshot` calls AND zero anomaly checks AND progress rows ARE updated. | Catches Bug C regression. |

**Files explicitly NOT changed:**

- `lib/acc/dcAnomalyChecks.ts` — the check itself is correct for forward slices.
- `lib/acc/dcProgressiveBackfill.ts` — planner is correct; the bug was downstream.
- `lib/acc/dcQuota.ts` — quota policy unchanged.
- `lib/acc/ingestAdminSnapshot.ts` — admin snapshot logic is correct for its intended (forward) use case.

## B. Runtime control flow (post-fix)

**Per-slice flow (inside the slice loop, dcIngest.ts:800-1000):**

```
For each slice in runnableSlices:
  1. refreshUserToken                     → throw → finalize(status='failed')
  2. dcSubmit (consumes 1 quota)          → throw → finalize(status='failed')
                                          → QuotaExceededError → finalize(status='quota-paused') [unchanged]
  3. dcPoll until ready                   → throw → finalize(status='failed')
  4. listFilesForRequest                  → throw → finalize(status='failed')   ← BUG B fix
  5. For each file:
       a. fetchSignedUrlAsStream          → throw → finalize(status='failed')   ← BUG B fix
       b. router:
            - ACTIVITY_FILE_RE            → ingestActivityCsv (writes AccActivity with ingestRunId)
                                          → throw → finalize(status='failed')   ← BUG B fix
            - ADMIN_CSV_ALLOWLIST         → appendAdminCsvPart (buffers in memory)
            - else                        → drainSkippedStream
  6. completedSlices.push(slice)
```

**Post-loop admin snapshot:**

```
nonBackwardCompleted = completedSlices.filter(s => s.reason !== 'backward')

if nonBackwardCompleted.length > 0 AND adminCsvParts.size > 0:
  ingestAdminSnapshot(...)                → AnomalyError → finalize(status='quarantined')
                                          → other throw  → finalize(status='failed')
else:
  // skip — Bug C fix; adminCsvParts is discarded
```

**Post-snapshot progress update (unchanged):**

```
For each slice in completedSlices (forward, backward, or new-project):
  upsert AccDcBackfillProgress (extend earliestCovered backward / latestCovered forward)
```

**Key semantic shifts:**

1. No more `continue` inside the file-loop. Any throw bubbles to the outer catch and finalizes `failed`.
2. `quarantined` is now a forward-only terminal status. Backward runs cannot quarantine.
3. Backward slices that succeed now actually update progress rows (today's quarantine return skips the update at line 1042).
4. `completedSlices` is the explicit source of truth for "what to acknowledge".

## C. One-shot recovery (`scripts/dc-reset-progress.cjs`)

Mirrors conventions of other `scripts/dc-*.cjs` (tsx/cjs loader, PrismaPg adapter, env-file).

```
1. Pre-flight: refuse without --confirm.
2. Pre-flight: refuse if .dc-ingest.disabled is NOT present (race-condition guard).
3. Dry-run summary:
     SELECT COUNT(*),
            COUNT(*) FILTER (WHERE earliestCovered IS NOT NULL),
            COUNT(*) FILTER (WHERE latestCovered IS NOT NULL),
            COUNT(*) FILTER (WHERE newProjectFlag)
       FROM "AccDcBackfillProgress"
4. With --confirm:
     UPDATE "AccDcBackfillProgress"
        SET earliestCovered = NULL,
            latestCovered   = NULL,
            newProjectFlag  = true,
            updatedAt       = NOW()
      WHERE earliestCovered IS NOT NULL
         OR latestCovered IS NOT NULL
         OR newProjectFlag = false;
5. Print post-state summary; exit 0.
```

**What we do NOT do:**

- Delete progress rows (preserves `projectCreatedAt` floor).
- Touch `AccActivity` (existing 2507 rows kept; new column NULL for them).
- Rewrite `AccDcIngestRun` history (forensic evidence).
- Auto-fire a recovery slice (manual verification probe is Section D).

**Idempotency:** `WHERE` clause makes re-running a no-op.

**Failure modes:**

- DB unreachable → atomic single UPDATE; no partial state.
- Migration not yet applied → unrelated; script touches `AccDcBackfillProgress` which exists in migration `20260516000000_acc_dc_tables`.
- Run without `--confirm` → dry-run, exit 0, no DB writes.
- Run while cron enabled → refuses; non-zero exit; message references the kill switch.

## D. Verification gate before re-enabling cron

Run **in order**. Stop on first failure.

**Pre-merge (CI / local):**

1. `npm.cmd run test -- lib/acc/dcActivityCsvIngest.test.ts lib/acc/dcIngest.test.ts lib/acc/dcIngest.backward.test.ts` — all pass.
2. `npm.cmd run build` — passes.
3. `npx prisma migrate status` — new migration applied; no drift.
4. SQL spot check: `\d "AccActivity"` shows `ingestRunId` column nullable.

**Post-merge, pre-reset (cron still disabled):**

5. `node scripts/dc-reset-progress.cjs` (no `--confirm`) — dry-run summary shows 428 rows in dishonest state.
6. `node scripts/dc-reset-progress.cjs --confirm` — performs the reset. Post-state summary: 0 with_earliest, 0 with_latest, 428 already_new.

**Probe slice:**

7. Quota check: read today's `AccDcIngestRun` and confirm `25 - SUM(quotaUsed) ≥ 1`. The probe only needs at least one slice through to validate; 1 slice = 50 projects = expected ≥ 200 rows. If today's UTC day is already saturated (≤ 0 hard-cap remaining), wait until the next UTC day. Note: realistically the fix lands tomorrow at earliest, by which time quota resets to 0/25.
8. Manually fire `node --env-file=.env scripts/dc-daily-ingest.cjs` once. Cron stays disabled.
9. Tail the log live. Expectations:
   - Discovery: `428 admin projects; 0 newly seeded`.
   - Planner emits ~9 `new-project` slices.
   - 6 run; 3 defer to tomorrow (or all 9 if quota allows).
   - Per-slice log shows non-zero `rowsInserted` for at least one module.
   - Final status: `success` or `quota-paused`. Never `quarantined`. Never `failed`.

**Post-probe DB verification:**

10. `SELECT status, sum(quotaUsed) FROM "AccDcIngestRun" WHERE startedAt::date = current_date GROUP BY 1` — confirms today's run finished cleanly.
11. `SELECT COUNT(*), MAX("createdAt") FROM "AccActivity" WHERE "ingestRunId" IS NOT NULL` — new rows landed and carry the new column.
12. `SELECT COUNT(*) FROM "AccActivity" WHERE "createdAt" >= '2026-05-14'` — the 5-day gap is at least partially closed.

**Gate decision:**

- All 12 steps green → `Remove-Item .dc-ingest.disabled`. Cron resumes tomorrow at 10:00 UTC.
- Any step red → kill switch stays. File the failure, treat the run record as the next debugging starting point. **Do NOT delete the kill switch "to see what happens"** — that's how we lost 5 days last time.

## Acceptance criteria

- ✅ No `success` run reports `sum(rowsByModule) === 0` while `quotaUsed > 0`. (Bug B regression check.)
- ✅ At least one backward slice completes with `status='success'`, no quarantine, progress rows updated. (Bug C fix validation.)
- ✅ `AccActivity` row count grows by ≥ 200 after the probe. (Bug A fix validation.)
- ✅ `.dc-ingest.disabled` is deleted only after all gate steps pass.

## Out of scope (explicitly deferred)

- Ingesting the 46-files-per-module sub-entity CSVs (`activities_submittals_target_steps.csv` etc.). The headline `activities_<module>_activities.csv` is sufficient for current dashboard needs. Sub-entity ingest can be a future phase once a consumer exists.
- Reworking the anomaly threshold for forward slices. The 10% threshold is fine for daily forward increments.
- Replaying historical activity rows older than 2026-04-17. The progressive backfill state machine will walk backward naturally over the coming weeks once cron is re-enabled.
- Adding a `status='success-with-warnings'` enum. The hard-abort policy means there are no warnings to surface — failures fail.
