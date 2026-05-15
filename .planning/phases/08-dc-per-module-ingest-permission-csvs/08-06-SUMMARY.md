---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 06
subsystem: acc-dc-ingest
tags: [acc, data-connector, ingest, orchestrator, cron, kill-switch, quota, 3-leg-oauth]
requires: [08-01, 08-02, 08-03, 08-04, 08-05]
provides: [dcIngest, runDcIngest, isKillSwitchActive, refreshUserToken]
affects: [08-07, 08-08]
tech_stack_added: [tsx/cjs (already in repo), Windows Task Scheduler harness extension]
patterns: [composition-root, kill-switch-gate, stale-lock-reclaim, quota-clean-exit, anomaly-quarantine, 3-leg-token-refresh, pitfall-1-no-auth-on-signed-url, pitfall-6-description-sanitize]
key_files_created:
  - lib/acc/dcIngest.ts
  - lib/server/aps-oauth.ts
  - scripts/dc-daily-ingest.cjs
  - scripts/dc-daily-cron.ps1
  - scripts/dev/verify-08-06-killswitch.cjs
key_files_modified:
  - lib/acc/dcIngest.test.ts
decisions:
  - "Token refresh lifted to lib/server/aps-oauth.ts (NEW file, not lib/server/aps-user-token.ts which imports server-only and uses request-scoped Prisma) so cron + orchestrator can share lifecycle"
  - "QuotaExceededError thrown on HTTP 429 from any APS surface (submit/poll/data-listing/signed-url); orchestrator short-circuits to status='quota-exceeded' and persists progress for tomorrow's resume (DC8-11)"
  - "Non-quota submit failures continue to NEXT slice (mark partial) instead of aborting the entire run -- one bad slice should not prevent admin snapshot for the rest"
  - "AnomalyError from ingestAdminSnapshot maps to status='quarantined' (distinct from 'failed') so SyncFreshnessPill can show a different signal in 08-07"
  - "ingestActivityCsv called OUTSIDE the admin-snapshot transaction (event stream, skipDuplicates handles dedup); ingestAdminSnapshot runs ONCE after all admin files buffered"
  - "Newly-detected projects (DC8-13): post-snapshot scan of AccDcProject vs AccDcBackfillProgress -- any DC project missing a progress row gets one with newProjectFlag=true so next run prioritizes it"
  - "AccDcProject.createdAt nullable fallback: prev row's projectCreatedAt -> AccDcProject.createdAt -> earliest AccActivity.createdAt for that project -> slice.start sentinel (08-03 hand-off honored)"
  - "Stale-lock threshold = 60min (matches Phase 3 03-02 pattern); fresh concurrent run returns status='skipped' (NOT failed) so Task Scheduler does not log a false alarm"
  - "Empty-plan path finalizes status='success' with quotaUsed=0 (fully backfilled is a steady-state success, not a no-op)"
  - "PowerShell harness writes stderr to <log>.err then concatenates into the main log so Task Scheduler operators have a unified pane"
  - "30-min hard timeout in PowerShell harness (CONTEXT.md run-duration budget); exit 124 on timeout matches GNU coreutils convention"
  - "executor model decision: APS HTTP integration NOT unit-tested -- mocking surface too large; smoke test against dev DB in Wave 4 per plan task 1 explicit guidance"
metrics:
  duration_min: 9
  tasks: 2
  files_changed: 6
  tests_added: 6
  date_completed: 2026-05-15
---

# Phase 08 Plan 06: Daily DC Ingest Orchestrator Summary

End-to-end runnable Data Connector pipeline: composes the four Wave-1 pure libraries with the proven APS HTTP protocol from `scripts/dc-ingest-where-i-admin.cjs` into a single `runDcIngest(prisma)` call gated by kill-switch, stale-lock, and quota fallback.

## What Shipped

**`lib/acc/dcIngest.ts`** (~620 lines, ~280 effective LOC after types)
- `runDcIngest(prisma): Promise<RunResult>` — top-level orchestrator (12-step pipeline)
- `isKillSwitchActive(repoRoot): boolean` — pure file-existence check
- `QuotaExceededError` class — bubbled from any APS surface returning 429
- Internal APS protocol: `dcSubmit` (4-attempt 5xx exponential backoff 10/20/40/80s), `dcPollJobs`, `reduceJobsStatus`, `dcDataListing`, `dcSignedUrl`, `fetchSignedUrlAsStream` (Pitfall 1: NO auth header on signed URL)
- Pitfall 6 sanitizer: `safeDescription()` strips description to alnum+space+dash, slices ≤200 chars
- `RunStatus` union: `success | partial | quota-exceeded | quarantined | failed | killed | skipped`

**`lib/server/aps-oauth.ts`** (NEW, ~115 lines)
- `refreshUserToken(prisma, { userEmail })` — 3-leg refresh with 5-min freshness buffer
- CLI/CJS-safe (no `server-only` import); injects PrismaClient instead of using `@/server/db`
- Persists `access_token` + rotated `refresh_token` + `expires_at` + `scope` back to `Account` row
- DC scope: `openid data:read data:create viewables:read user:read account:read`

**`scripts/dc-daily-ingest.cjs`** (NEW, ~95 lines)
- `tsx/cjs` register hook -> `require('../lib/acc/dcIngest').runDcIngest`
- Pre-flight kill-switch check (in addition to runtime check) -> exit 0 fast-path
- PrismaClient initialised with PrismaPg adapter (max=2; mirrors `dc-ingest-where-i-admin.cjs`)
- Exit 0 on `{success, killed, skipped}`; exit 1 otherwise
- Logs final RunResult line by line (status, projectsProcessed, quotaUsed, rowsByModule, rowsByAdminCsv, diffSummary, unknownModulesSeen)

**`scripts/dc-daily-cron.ps1`** (NEW, ~75 lines — replaces ad-hoc local file)
- Pre-spawn kill-switch gate -> exit 0 + log "Kill switch present"
- `Start-Process node --env-file=.env scripts/dc-daily-ingest.cjs` with 30-min hard timeout
- Stdout + stderr unified to `logs/dc-ingest-YYYY-MM-DD.log`
- Exit 124 on timeout; passes through `$Proc.ExitCode` otherwise

**`scripts/dev/verify-08-06-killswitch.cjs`** (NEW, ~165 lines)
- Test 1 (Node entry): writes `.dc-ingest.disabled`, spawns `node scripts/dc-daily-ingest.cjs`, asserts exit=0 + stdout contains "Kill switch active" + AccDcIngestRun count unchanged (skipped if no DB env)
- Test 2 (PowerShell entry): probes `pwsh`; if present, spawns the harness, asserts exit=0 + log file written + log contains "Kill switch present"; if missing, warns + skips (Linux CI safe)
- `clearKillSwitch()` in finally blocks -- never leaves cron disabled

## Run-Status State Machine

```
                    +-----------+
                    | (start)   |
                    +-----+-----+
                          |
            kill-switch?  +-> killed (exit 0)
                          |
            stale-lock <60min? -> skipped (exit 0)
                          |
            stale-lock >=60min? -> reclaim prev to 'failed', proceed
                          |
            open AccDcIngestRun (status=running)
                          |
            planDailySlice -> 0 slices? -> success (steady state)
                          |
            for each slice:
              token-refresh -> dcSubmit -> 429? -> quota-exceeded (persist + exit)
              poll until terminal -> failed status? -> next slice (partial)
              data-listing + downloads -> 429? -> quota-exceeded
              activity files -> ingestActivityCsv (event stream)
              admin files   -> buffer for one-shot snapshot
                          |
            ingestAdminSnapshot (atomic 16-table tx)
              AnomalyError? -> quarantined
              other throw?  -> failed
                          |
            applySliceCompletion -> upsert AccDcBackfillProgress per project
            scan AccDcProject for newly-detected -> upsert with newProjectFlag=true (DC8-13)
                          |
            completedSlices == slices? -> success ELSE partial
```

## Decisions Diverging from `dc-ingest-where-i-admin.cjs`

| Reference behavior                             | Plan 08-06 behavior                                                | Why                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Hardcoded `LUIS_ACC_USER_ID` + `listProjectAdminProjects` | None — driven by `AccDcBackfillProgress` rows                      | Phase 8 backfill is hub-wide via DC, not user-scoped admin enumeration       |
| `DC_DAYS=30` env-driven window                 | `planDailySlice` derives slice per project from progress rows      | Progressive backfill sliding window (CONTEXT.md key design choice)           |
| Per-batch `AccDataConnectorJob` row            | Single `AccDcIngestRun` row (Wave-1 schema; supersedes legacy job table) | Phase 8 schema is the new source of truth                                    |
| `+0 race-skip` re-read pattern                 | Single-writer guarantee from stale-lock + Task Scheduler           | Cron is single-writer; race only existed because two manual scripts could run |
| Always exit 0                                  | Exit 1 on quota-exceeded/quarantined/failed                        | Task Scheduler should surface real failures; cron is daily not 30-min       |
| `csv-parse` inline                             | Delegated to Wave-1 `ingestActivityCsv` + `ingestAdminSnapshot`    | DC8-01..06 already shipped pure modules                                      |
| 1 hour POLL_TIMEOUT                            | Same (kept)                                                        | APS DC job times empirically observed 5-15min                                |
| `BATCH_SIZE=500`                               | Inherited via Wave-1 modules                                       | Same Railway memory budget                                                   |

## Verification

- `npx vitest run lib/acc/dcIngest.test.ts` -> 6/6 GREEN (kill-switch absent, kill-switch present, concurrent fresh, stale-reclaim, empty-plan + fetch-not-called)
- `npx tsc --noEmit` -> clean
- `node scripts/dev/verify-08-06-killswitch.cjs` -> all assertions PASS (Test 1 full, Test 2 skipped due to pwsh missing in sandbox)

## Smoke-Test Results

- Node entry exit code 0 with kill-switch present: PASS
- Stdout contains "Kill switch active": PASS
- AccDcIngestRun count unchanged: deferred (no DB env in sandbox; harness asserts when DATABASE_URL/DIRECT_URL present)
- PowerShell entry: deferred to manual run on Luis's PC (`pwsh` or `powershell.exe` present there)

## Hand-off to Wave 3 (08-07 / 08-08)

- `AccDcIngestRun` rows now appear with one of 7 statuses; SyncFreshnessPill extension reads `findFirst({orderBy: { startedAt: 'desc' }})` and maps:
  - `success` -> green
  - `partial` -> amber
  - `quota-exceeded` -> amber-with-clock (resumes tomorrow, expected)
  - `quarantined` -> red (data integrity, operator action required)
  - `failed` -> red
  - `killed` / `skipped` -> grey (operator suspended)
- `unknownModulesSeen` array surfaces any 10th-module appearance for runtime visibility (DC8-04 next)
- `diffSummary` JSON powers the daily-changes badge (DC8-12 next)

## Deviations from Plan

**None — plan executed exactly as written.** No Rule 1-4 deviations triggered. The pwsh-not-available skip in the verification harness is the documented behavior in the plan's own commented spec block (do NOT fail on Linux CI).

## Self-Check: PASSED

- `lib/acc/dcIngest.ts` exists
- `lib/server/aps-oauth.ts` exists
- `scripts/dc-daily-ingest.cjs` exists
- `scripts/dc-daily-cron.ps1` exists
- `scripts/dev/verify-08-06-killswitch.cjs` exists
- Commit `775a1e5` exists (Task 1)
- Commit `a869446` exists (Task 2)
