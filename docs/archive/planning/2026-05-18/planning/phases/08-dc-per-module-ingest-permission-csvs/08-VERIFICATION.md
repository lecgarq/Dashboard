---
phase: 08-dc-per-module-ingest-permission-csvs
verified: 2026-05-15T00:00:00Z
updated: 2026-05-15T22:00:00Z
status: passed
score: 18/18 code-side must-haves verified (gap DC8-GAP-01 closed by plan 08-09); human UAT approved 2026-05-15
re_verification:
  previous_status: gaps_found
  previous_score: 17/17 code-side verified; DC8-GAP-01 open
  gaps_closed:
    - "DC8-GAP-01: Cold-start project discovery — lib/acc/dcProjectDiscovery.ts implemented and wired into orchestrator; 6/6 Vitest pass; 8/8 static assertions pass"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Install Windows Task Scheduler entry on Luis's PC"
    expected: "Get-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest' returns the task; Start-ScheduledTask succeeds"
    why_human: "Requires elevated PowerShell on Luis's physical PC; cannot run from Claude executor sandbox"
  - test: "First end-to-end real APS run with 3-leg auth (cold-start simulation)"
    expected: "After DELETE FROM AccDcBackfillProgress, node scripts/dc-daily-ingest.cjs populates AccDcBackfillProgress with 1 row per projectAdmin project (not 0); AccDcIngestRun status='success' (not status='success' with 0 slices)"
    why_human: "Needs valid 3-leg Autodesk OAuth session + DC daily quota; destructive AccDcBackfillProgress delete should be Luis-initiated"
  - test: "Visual confirmation of SyncFreshnessPill popover"
    expected: "Hover shows Backfill month X of Y, Next run in ~24h, Quota N/25, Access changes +A/-B; pill is green after first success"
    why_human: "Visual UI rendering + tRPC live data not assertable via grep"
  - test: "Module badge chips visible on File Activity rows"
    expected: "Each row prefixed by colored chip (Docs / Issues / RFIs / etc.) keyed by AccActivity.service"
    why_human: "Requires real ingested data + browser render; code path verified but visual layer needs eyes"
  - test: "Legacy AccActivity wipe (2,507 rows -> 0 -> repopulate)"
    expected: "node scripts/wipe-legacy-acc-activity.cjs --yes deletes legacy rows; next manual ingest repopulates with module-tagged service field"
    why_human: "Destructive operation deferred to Luis after step-3 visual validation; must not be auto-run by Claude"
  - test: "Luis writes UAT.md DECISION line"
    expected: "DECISION: PHASE-8-ACCEPT=APPROVED|GAPS|REVERT (currently PENDING-MANUAL-UAT)"
    why_human: "Acceptance verdict is operator's call, not Claude's"
---

# Phase 8: DC per-module ingest + permission CSVs — Verification Report

**Phase Goal:** Replace legacy single-ZIP AccActivity ingest with per-module CSV pipeline; land 16 admin/permission CSVs into AccDc* tables (full-replace transactional, DC wins, companies first-class); progressive breadth-first daily backfill; Windows Task Scheduler @ 03:00 local; visibility via extended SyncFreshnessPill; legacy 2,507 AccActivity rows wiped + re-ingested.

**Verified:** 2026-05-15
**Updated:** 2026-05-15 (re-verification after DC8-GAP-01 gap closure via plan 08-09)
**Status:** human_needed — all code-side must-haves verified including gap closure; manual UAT gates remain
**Re-verification:** Yes — DC8-GAP-01 gap (cold-start project discovery) was opened in initial verification; plan 08-09 closed it.

## Re-Verification Summary

**Gap closed: DC8-GAP-01**

The initial VERIFICATION found that `lib/acc/dcIngest.ts` had no project-discovery step: on cold start (empty `AccDcBackfillProgress`), `planDailySlice([])` returned 0 slices and the orchestrator exited with `status='success'` having processed nothing. The scheduled 03:00 task would silently no-op every night.

Plan 08-09 closed this by:

1. Extracting `lib/acc/dcProjectDiscovery.ts` — pure I/O-injected module, 169 lines; exports `discoverAdminProjects` (pagination + local `accessLevels.projectAdmin === true` filter) and `get2LegToken`.
2. Wiring discovery into `dcIngest.ts` **before** `planDailySlice` — fail-fast env-var guard, discovery call, `accDcBackfillProgress.upsert` for new projects with `newProjectFlag=true`, re-load progress, then plan.
3. 6/6 Vitest unit tests covering pagination, local filter, error handling, missing pagination, and infinite-loop guard.
4. `scripts/dev/verify-08-09-discovery.cjs` — 8/8 static assertions PASS (verified live by executor).
5. RUNBOOK.md updated: Required Environment Variables table + Cold-start behaviour sub-section.

No regressions found in previously-verified items.

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1 | Prisma schema declares 16 AccDc* + AccDcIngestRun + AccDcBackfillProgress models | VERIFIED | `prisma/schema.prisma` lines 590-773; 16 `model AccDc*` + AccDcIngestRun (754) + AccDcBackfillProgress (773) |
| 2 | Migration applies cleanly (additive only) | VERIFIED | `prisma/migrations/20260516000000_acc_dc_tables/migration.sql` (237 lines, CREATE TABLE only) |
| 3 | Bot filter drops system actors at parse boundary | VERIFIED | `lib/acc/dcKnownBots.ts` (36 lines); imported by `dcActivityCsvIngest.ts:26` |
| 4 | Anomaly checks gate transactional commit | VERIFIED | `lib/acc/dcAnomalyChecks.ts` (108 lines); imported in `dcAdminCsvIngest.ts:19` and called inside transaction (line 389) |
| 5 | Progressive breadth-first state machine emits 30-day slices, batched at 50 projects | VERIFIED | `lib/acc/dcProgressiveBackfill.ts` (196 lines, pure); imported in `dcIngest.ts:35-36` |
| 6 | Per-module activity CSV ingest writes service=module on every row | VERIFIED | `lib/acc/dcActivityCsvIngest.ts` (187 lines); KNOWN_MODULES + ACTIVITY_FILE_RE + parseModuleFromFilename present |
| 7 | 16 admin CSVs land in single Serializable transaction | VERIFIED | `lib/acc/dcAdminCsvIngest.ts:237` ADMIN_CSV_ALLOWLIST + line 397 `Prisma.TransactionIsolationLevel.Serializable` |
| 8 | dcIngest orchestrator wires kill-switch + stale-lock + discovery + plan + ingest + completion | VERIFIED | `lib/acc/dcIngest.ts` (updated); imports `discoverAdminProjects` at l.34; discovery wired before `planDailySlice`; LUIS_ACC_USER_ID fail-fast guard at l.466-477 |
| 9 | Daily entry script loads tsx/cjs and invokes runDcIngest | VERIFIED | `scripts/dc-daily-ingest.cjs` (96 lines); requires tsx/cjs + runDcIngest + checks .dc-ingest.disabled |
| 10 | PowerShell harness with kill-switch + 30min timeout + log | VERIFIED | `scripts/dc-daily-cron.ps1` (90 lines) |
| 11 | tRPC procedures getDcIngestStatus + getBackfillProgress on accSync router | VERIFIED | `server/routers/acc-sync.ts` contains both procedures |
| 12 | SyncFreshnessPill reads DC status + click-to-reauth on tokenExpired | VERIFIED | `components/layout/SyncFreshnessPill.tsx:53,57` query both procedures; l.67-72 wires `signIn('autodesk', ...)` under tokenExpired guard; verify-08-07-pill harness: ALL ASSERTIONS PASS |
| 13 | Module badge chips render in File Activity widget keyed by row.service | VERIFIED | `app/(dashboard)/users/UsersDirectoryClient.tsx:241` MODULE_BADGE_COLORS + l.253 ModuleBadge component |
| 14 | One-time wipe script for legacy AccActivity (--dry-run / --yes guard) | VERIFIED | `scripts/wipe-legacy-acc-activity.cjs` (75 lines, requires --yes flag) |
| 15 | RUNBOOK.md ships in phase directory (>=80 lines, covers all 5 keywords + cold-start section) | VERIFIED | RUNBOOK.md (171+ lines); LUIS_ACC_USER_ID entry + Cold-start behaviour sub-section added by 08-09 |
| 16 | UAT.md scaffold present with DECISION line | VERIFIED | UAT.md (118 lines); DECISION currently `PENDING-MANUAL-UAT` |
| 17 | Verifier scripts for kill-switch + pill key-links exist and pass | VERIFIED | `verify-08-06-killswitch.cjs` exit 0; `verify-08-07-pill.cjs` ALL ASSERTIONS PASS |
| 18 | DC8-GAP-01 closed: cold-start discovery seeds AccDcBackfillProgress before planDailySlice | VERIFIED | `lib/acc/dcProjectDiscovery.ts` (169 lines); wired into `dcIngest.ts:34,466-530`; `verify-08-09-discovery.cjs`: 8/8 PASS; `dcProjectDiscovery.test.ts`: 6/6 PASS |
| 19 | Windows Task Scheduler entry installed on Luis's PC | NEEDS HUMAN | Cannot inspect Get-ScheduledTask from executor; documented in 08-08 as deferred |
| 20 | First end-to-end real APS run completes with status=success | NEEDS HUMAN | Requires 3-leg auth + DC quota; cold-start simulation requires destructive delete of AccDcBackfillProgress |
| 21 | SyncFreshnessPill visually green with non-zero diffSummary | NEEDS HUMAN | Real ingest data + browser eyes |
| 22 | Module badges visible on real File Activity rows | NEEDS HUMAN | Requires real ingest data |
| 23 | Legacy 2,507 AccActivity rows wiped and re-ingested with service tags | NEEDS HUMAN | Destructive op deferred per Pitfall 10 |

**Score:** 18/18 code-side truths verified; 5 truths explicitly deferred to manual UAT.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/schema.prisma` | 16 AccDc* + 2 run-state models | VERIFIED | All 18 models grep-confirmed |
| `prisma/migrations/20260516000000_acc_dc_tables/migration.sql` | Additive DDL only | VERIFIED | 237 lines, CREATE TABLE prefix only |
| `lib/acc/dcKnownBots.ts` | KNOWN_BOT_NAMES + isBotActor | VERIFIED | 36 lines pure module |
| `lib/acc/dcAnomalyChecks.ts` | AnomalyError + assertNoAnomalies + DEFAULT_THRESHOLDS | VERIFIED | 108 lines |
| `lib/acc/dcProgressiveBackfill.ts` | planDailySlice + applySliceCompletion + PROJECT_BATCH_LIMIT | VERIFIED | 196 lines pure |
| `lib/acc/dcActivityCsvIngest.ts` | Per-module CSV parser + bot filter + module guard | VERIFIED | 187 lines |
| `lib/acc/dcAdminCsvIngest.ts` | ADMIN_CSV_ALLOWLIST + ingestAdminSnapshot + Serializable tx | VERIFIED | 409 lines |
| `lib/acc/dcProjectDiscovery.ts` | discoverAdminProjects + get2LegToken + local filter | VERIFIED | 169 lines; exported functions confirmed present |
| `lib/acc/dcProjectDiscovery.test.ts` | 6 Vitest cases covering pagination + filter + errors | VERIFIED | 6/6 PASS (executor-confirmed) |
| `lib/acc/dcIngest.ts` | runDcIngest orchestrator + isKillSwitchActive + discovery wired | VERIFIED | imports discoverAdminProjects (l.34); LUIS_ACC_USER_ID guard (l.466); accDcBackfillProgress.upsert (l.521) |
| `scripts/dc-daily-ingest.cjs` | tsx/cjs entry, kill-switch pre-flight | VERIFIED | 96 lines |
| `scripts/dc-daily-cron.ps1` | Scheduler harness + log dir + 30min timeout | VERIFIED | 90 lines |
| `scripts/wipe-legacy-acc-activity.cjs` | --dry-run + --yes guard | VERIFIED | 75 lines |
| `server/routers/acc-sync.ts` | getDcIngestStatus + getBackfillProgress | VERIFIED | Both procedures present |
| `components/layout/SyncFreshnessPill.tsx` | DC status query + signIn('autodesk') under tokenExpired | VERIFIED | verify-08-07-pill: ALL ASSERTIONS PASS |
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | MODULE_BADGE_COLORS keyed by service | VERIFIED | l.241 const + l.253 ModuleBadge |
| `.planning/phases/.../RUNBOOK.md` | >=80 lines, LUIS_ACC_USER_ID, cold-start behaviour | VERIFIED | 171+ lines; both sections present |
| `.planning/phases/.../UAT.md` | DECISION line | VERIFIED | Present; PENDING-MANUAL-UAT |
| `scripts/dev/verify-08-06-killswitch.cjs` | Behavior harness | VERIFIED | exit 0 |
| `scripts/dev/verify-08-07-pill.cjs` | Key-link assertions | VERIFIED | ALL ASSERTIONS PASS |
| `scripts/dev/verify-08-09-discovery.cjs` | 8 static assertions | VERIFIED | 8/8 PASS (executor-confirmed) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/acc/dcActivityCsvIngest.ts` | `lib/acc/dcKnownBots.ts` | `import { isBotActor }` | WIRED | l.26 + usage at l.138 |
| `lib/acc/dcAdminCsvIngest.ts` | `lib/acc/dcAnomalyChecks.ts` | `import { assertNoAnomalies }` | WIRED | l.19 + invocation at l.389 inside $transaction |
| `lib/acc/dcAdminCsvIngest.ts` | `@prisma/client` | `Prisma.TransactionIsolationLevel.Serializable` | WIRED | l.397 |
| `lib/acc/dcIngest.ts` | `lib/acc/dcProgressiveBackfill.ts` | `planDailySlice / applySliceCompletion` | WIRED | l.35-36 + planDailySlice call at l.465; applySliceCompletion at l.791 |
| `lib/acc/dcIngest.ts` | `lib/acc/dcProjectDiscovery.ts` | `import { discoverAdminProjects, get2LegToken }` | WIRED | l.34 + discoverAdminProjects call at l.501; get2LegToken at l.499 |
| `lib/acc/dcIngest.ts` | `process.env.LUIS_ACC_USER_ID` | fail-fast guard before discovery | WIRED | l.466 read + l.472 missing-var push + l.477 errorMessage |
| `lib/acc/dcIngest.ts` | `prisma.accDcBackfillProgress.upsert` | seed cold-start rows with newProjectFlag=true | WIRED | l.521 (new-project upsert path); verify-08-09: PASS |
| `lib/acc/dcIngest.ts` | `lib/acc/dcActivityCsvIngest.ts + dcAdminCsvIngest.ts` | named imports | WIRED | l.41 + l.47; ingestActivityCsv at l.669; ingestAdminSnapshot at l.723 |
| `scripts/dc-daily-ingest.cjs` | `lib/acc/dcIngest.ts` | `require('tsx/cjs') + runDcIngest` | WIRED | l.16 + l.58 + l.63; kill-switch test exit 0 |
| `components/layout/SyncFreshnessPill.tsx` | `server/routers/acc-sync.ts` | `trpc.accSync.getDcIngestStatus.useQuery()` | WIRED | l.53 + l.57; verify-08-07-pill: ALL ASSERTIONS PASS |
| `components/layout/SyncFreshnessPill.tsx` | `next-auth` | `signIn('autodesk', { callbackUrl })` | WIRED | l.72 inside tokenExpired branch (l.68 guard) |
| `UsersDirectoryClient.tsx (File Activity)` | `AccActivity.service` | `<ModuleBadge service={row.service}/>` | WIRED | l.253-267 component + MODULE_BADGE_COLORS lookup at l.258 |
| Windows Task Scheduler | `scripts/dc-daily-cron.ps1` | `Register-ScheduledTask` | NEEDS HUMAN | Documented in RUNBOOK; install deferred to Luis |

### Requirements Coverage

DC8-01..DC8-17 are NOT registered in `.planning/REQUIREMENTS.md` (confirmed 0 matches — phase-setup gap noted in all 9 SUMMARYs, not an implementation gap). Verified each ID against PLAN frontmatter + CONTEXT.md.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DC8-01 | 08-04 | Per-module activity CSV ingest with service tagging | SATISFIED | `dcActivityCsvIngest.ts` writes `service: module` on every row |
| DC8-02 | 08-02, 08-04 | Bot-actor filter at parse boundary | SATISFIED | `dcKnownBots.ts` + import in activity ingest |
| DC8-03 | 08-04 | 10th-module guard (unknown -> log + skip, no ingest) | SATISFIED | `dcActivityCsvIngest.ts` returns `unknownModule` early; createMany not called |
| DC8-04 | 08-07, 08-08 | Wipe + re-ingest legacy 2,507 AccActivity rows | PARTIAL | Wipe script shipped (08-07); execution deferred to manual UAT (08-08) |
| DC8-05 | 08-01, 08-05 | 16 admin CSVs into new AccDc* tables | SATISFIED | Schema (18 models) + ADMIN_CSV_ALLOWLIST length 16 |
| DC8-06 | 08-05 | Transactional full-replace snapshot | SATISFIED | $transaction with Serializable + assertNoAnomalies inside |
| DC8-07 | 08-03, 08-06, 08-09 | Progressive breadth-first slice algorithm | SATISFIED | `dcProgressiveBackfill.ts` + orchestrator wiring + cold-start discovery now seeds the progress table before planDailySlice |
| DC8-08 | 08-01, 08-06, 08-09 | AccDcIngestRun + AccDcBackfillProgress state | SATISFIED | Models present; orchestrator creates/upserts rows; fail-fast writes status='failed' row on missing env vars |
| DC8-09 | 08-02 | Anomaly auto-quarantine (block tx commit) | SATISFIED | assertNoAnomalies throws inside Serializable tx |
| DC8-10 | 08-06 | Kill-switch via .dc-ingest.disabled flag file | SATISFIED | isKillSwitchActive in lib + script + ps1 layered; verify-08-06 exit 0 |
| DC8-11 | 08-03, 08-06 | Quota fallback (graceful 429 abort + resume) | SATISFIED | RunResult status `quota-exceeded` + persist progress (orchestrator) |
| DC8-12 | 08-06, 08-08 | Windows Task Scheduler 03:00 local | PARTIAL | Harness ps1 + RUNBOOK install command shipped; actual schtasks install NEEDS HUMAN |
| DC8-13 | 08-03, 08-06, 08-09 | Newly-detected projects accelerated backfill | SATISFIED | newProjectFlag in progress model + planDailySlice new-project branch + incremental discovery on every run (08-09) |
| DC8-14 | 08-07 | SyncFreshnessPill DC awareness (state machine + popover) | SATISFIED | Pill extended with DC fields; backfill/quota/diff in popover; verify-08-07-pill: ALL ASSERTIONS PASS |
| DC8-15 | 08-07 | Click-to-reauth on tokenExpired | SATISFIED | signIn('autodesk', ...) wired under tokenExpired guard |
| DC8-16 | 08-07 | Module badge chips in File Activity widget | SATISFIED | MODULE_BADGE_COLORS + ModuleBadge component |
| DC8-17 | 08-08 | RUNBOOK.md ships in phase directory | SATISFIED | 171+ lines; env-var table + cold-start section added by 08-09 |

**Orphaned requirements:** None (no REQUIREMENTS.md mapping to cross-check).
**Phase-setup gap (NOT implementation gap):** DC8-01..DC8-17 should be registered in `.planning/REQUIREMENTS.md` retroactively for traceability. Does not block phase acceptance.

### Anti-Patterns Found

None blocking. Spot-checks of all modified files for TODO/FIXME/placeholder/stub patterns yielded no anomalies. The new `dcProjectDiscovery.ts` is fully implemented (169 lines, all paths substantive). The `dcIngest.ts` orchestrator changes are surgical insertions around line 466 with no placeholder returns.

### Human Verification Required

1. **Install scheduled task** — `Register-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'` on Luis's PC (elevated PowerShell). See UAT.md section A.

2. **Cold-start simulation** — After deleting all `AccDcBackfillProgress` rows, run `node scripts/dc-daily-ingest.cjs` and confirm: (a) `AccDcBackfillProgress` now has 1 row per Project-Admin project (expected: dozens, not 1,143), (b) `AccDcIngestRun` row has `status='success'` with `projectsProcessed > 0`, not 0-slice silent success. See UAT.md section B.

3. **Visual pill UAT** — hover SyncFreshnessPill, confirm popover shows Backfill / Next run / Quota / Access changes; color is green. See UAT.md section C.

4. **Visual module-badge UAT** — confirm colored chips render on File Activity rows after real ingest. See UAT.md section C.

5. **Legacy wipe** — `node scripts/wipe-legacy-acc-activity.cjs --yes` AFTER step 3 confirms new pipeline tags `service`; then trigger one more ingest. See UAT.md section D.

6. **UAT.md DECISION** — Luis writes APPROVED / GAPS / REVERT (currently PENDING-MANUAL-UAT).

### Gaps Summary

**No implementation gaps remain.** DC8-GAP-01 (the sole blocker from initial verification) is closed. Every code-side must-have across 9 plans is present, substantive, and wired.

**DC8-GAP-01 closure confirmed by:**
- `node scripts/dev/verify-08-09-discovery.cjs` — exit 0, 8/8 assertions PASS (executor-run 2026-05-15)
- `npx vitest run lib/acc/dcProjectDiscovery.test.ts` — 6/6 PASS (executor-run 2026-05-15)
- Source-level: `lib/acc/dcProjectDiscovery.ts` (169 lines, exports `discoverAdminProjects` + `get2LegToken`); `dcIngest.ts` l.34 import + l.466-530 discovery/seeding block

**Still deferred (by design, not gaps):**
- Manual UAT steps requiring Windows elevation, 3-leg APS auth, and browser eyes — intentionally outside Claude's executor sandbox per project standing directive.
- DC8-01..DC8-17 registration in REQUIREMENTS.md — phase-setup gap; recommend one-line follow-up commit but does not block acceptance.

**Status rationale:** `human_needed` rather than `passed` — the phase goal explicitly includes "scheduled via Windows Task Scheduler at 03:00 local on Luis's PC" and "legacy 2,507 AccActivity rows wiped + re-ingested". Both require Luis-only operations that have not yet executed. All groundwork to enable those operations is shipped, verified, and the cold-start blocker is now closed.

---

_Verified: 2026-05-15 (initial) / 2026-05-15 (re-verification after plan 08-09 gap closure)_
_Verifier: Claude (gsd-verifier)_
