---
phase: 08-dc-per-module-ingest-permission-csvs
verified: 2026-05-15T00:00:00Z
status: human_needed
score: 17/17 code-side must-haves verified; 5 manual-UAT checks awaiting Luis
human_verification:
  - test: "Install Windows Task Scheduler entry on Luis's PC"
    expected: "Get-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest' returns the task; Start-ScheduledTask succeeds"
    why_human: "Requires elevated PowerShell on Luis's physical PC; cannot run from Claude executor sandbox"
  - test: "First end-to-end real APS run with 3-leg auth"
    expected: "AccDcIngestRun row appears with status='success'; AccDcUser/AccDcProject rows populated; AccDcBackfillProgress has 1 row per known project"
    why_human: "Needs valid 3-leg Autodesk OAuth session in Luis's browser + DC daily quota; not available to executor"
  - test: "Visual confirmation of SyncFreshnessPill popover"
    expected: "Hover shows Backfill month X of Y, Next run in Zh, Quota N/25, Access changes +A/-B; pill is green after first success"
    why_human: "Visual UI rendering + tRPC live data not assertable via grep"
  - test: "Module badge chips visible on File Activity rows"
    expected: "Each row prefixed by colored chip (Docs / Issues / RFIs / etc.) keyed by AccActivity.service"
    why_human: "Requires real ingested data + browser render; code path verified but visual layer needs eyes"
  - test: "Legacy AccActivity wipe (2,507 rows -> 0 -> repopulate)"
    expected: "node scripts/wipe-legacy-acc-activity.cjs --yes deletes legacy rows; next manual ingest repopulates with module-tagged service field"
    why_human: "Destructive operation Pitfall-10 deferred to Luis after step-3 visual validation; should not be auto-run by Claude"
  - test: "Luis writes UAT.md DECISION line"
    expected: "DECISION: PHASE-8-ACCEPT=APPROVED|GAPS|REVERT (currently PENDING-MANUAL-UAT)"
    why_human: "Acceptance verdict is operator's call, not Claude's"
notes:
  - "DC8-01..DC8-17 not registered in .planning/REQUIREMENTS.md — confirmed phase-setup gap noted in all 8 SUMMARYs, not an implementation gap. Verified each DC8-* against PLAN must_haves + CONTEXT.md."
  - "Plan 08-07 referenced server/routers/accSync.ts; actual file is server/routers/acc-sync.ts (kebab-case, matches repo convention). tRPC namespace `accSync` is preserved. Cosmetic deviation, not a gap."
---

# Phase 8: DC per-module ingest + permission CSVs — Verification Report

**Phase Goal:** Replace legacy single-ZIP AccActivity ingest with per-module CSV pipeline; land 16 admin/permission CSVs into AccDc* tables (full-replace transactional, DC wins, companies first-class); progressive breadth-first daily backfill; Windows Task Scheduler @ 03:00 local; visibility via extended SyncFreshnessPill; legacy 2,507 AccActivity rows wiped + re-ingested.

**Verified:** 2026-05-15
**Status:** human_needed (all code-side must-haves verified; manual UAT gates explicitly deferred per 08-08 design)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1 | Prisma schema declares 16 AccDc* + AccDcIngestRun + AccDcBackfillProgress models | VERIFIED | `prisma/schema.prisma` lines 590-773; 16 `model AccDc*` matches + AccDcIngestRun (754) + AccDcBackfillProgress (773) |
| 2 | Migration applies cleanly (additive only) | VERIFIED | `prisma/migrations/20260516000000_acc_dc_tables/migration.sql` (237 lines, CREATE TABLE only) |
| 3 | Bot filter drops system actors at parse boundary | VERIFIED | `lib/acc/dcKnownBots.ts` (36 lines); imported by `dcActivityCsvIngest.ts:26` |
| 4 | Anomaly checks gate transactional commit | VERIFIED | `lib/acc/dcAnomalyChecks.ts` (108 lines); imported in `dcAdminCsvIngest.ts:19` and called inside transaction (line 389) |
| 5 | Progressive breadth-first state machine emits 30-day slices, batched at 50 projects | VERIFIED | `lib/acc/dcProgressiveBackfill.ts` (196 lines, pure); imported in `dcIngest.ts:35-36` |
| 6 | Per-module activity CSV ingest writes service=module on every row | VERIFIED | `lib/acc/dcActivityCsvIngest.ts` (187 lines); KNOWN_MODULES + ACTIVITY_FILE_RE + parseModuleFromFilename present |
| 7 | 16 admin CSVs land in single Serializable transaction | VERIFIED | `lib/acc/dcAdminCsvIngest.ts:237` ADMIN_CSV_ALLOWLIST + line 397 `Prisma.TransactionIsolationLevel.Serializable` |
| 8 | dcIngest orchestrator wires kill-switch + stale-lock + plan + ingest + completion | VERIFIED | `lib/acc/dcIngest.ts` (898 lines); exports runDcIngest (line 420) + isKillSwitchActive (line 109) |
| 9 | Daily entry script loads tsx/cjs and invokes runDcIngest | VERIFIED | `scripts/dc-daily-ingest.cjs` (96 lines); requires tsx/cjs + runDcIngest + checks .dc-ingest.disabled |
| 10 | PowerShell harness with kill-switch + 30min timeout + log | VERIFIED | `scripts/dc-daily-cron.ps1` (90 lines) |
| 11 | tRPC procedures getDcIngestStatus + getBackfillProgress on accSync router | VERIFIED | `server/routers/acc-sync.ts` contains both (note: kebab-case filename, plan said camelCase — cosmetic) |
| 12 | SyncFreshnessPill reads DC status + click-to-reauth on tokenExpired | VERIFIED | `components/layout/SyncFreshnessPill.tsx:53,57` query both procedures; line 67-72 wires `signIn('autodesk', ...)` under tokenExpired guard |
| 13 | Module badge chips render in File Activity widget keyed by row.service | VERIFIED | `app/(dashboard)/users/UsersDirectoryClient.tsx:241` MODULE_BADGE_COLORS + line 253 ModuleBadge component |
| 14 | One-time wipe script for legacy AccActivity (--dry-run / --yes guard) | VERIFIED | `scripts/wipe-legacy-acc-activity.cjs` (75 lines, requires --yes flag) |
| 15 | RUNBOOK.md ships in phase directory (>=80 lines, covers all 5 keywords) | VERIFIED | `.planning/phases/08-.../RUNBOOK.md` (171 lines) |
| 16 | UAT.md scaffold present with DECISION line | VERIFIED | `.planning/phases/08-.../UAT.md` (118 lines); DECISION currently `PENDING-MANUAL-UAT` |
| 17 | Verifier scripts for kill-switch + pill key-links exist | VERIFIED | `scripts/dev/verify-08-06-killswitch.cjs` + `scripts/dev/verify-08-07-pill.cjs` |
| 18 | Windows Task Scheduler entry installed on Luis's PC | NEEDS HUMAN | Cannot inspect Get-ScheduledTask from executor; documented in 08-08 as deferred |
| 19 | One end-to-end real APS run completes with status=success | NEEDS HUMAN | Requires 3-leg auth + DC quota; deferred per 08-08 Task 2 |
| 20 | SyncFreshnessPill visually green with non-zero diffSummary | NEEDS HUMAN | Real ingest data + browser eyes |
| 21 | Module badges visible on real File Activity rows | NEEDS HUMAN | Requires real ingest data |
| 22 | Legacy 2,507 AccActivity rows wiped and re-ingested with service tags | NEEDS HUMAN | Destructive op deferred per Pitfall 10 |

**Score:** 17/17 code-side truths verified; 5 truths explicitly deferred to manual UAT by 08-08 design.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `prisma/schema.prisma` | 16 AccDc* + 2 run-state models | VERIFIED | All 18 models grep-confirmed; @@unique/index per plan |
| `prisma/migrations/20260516000000_acc_dc_tables/migration.sql` | Additive DDL only | VERIFIED | 237 lines, CREATE TABLE prefix only |
| `lib/acc/dcKnownBots.ts` | KNOWN_BOT_NAMES + isBotActor | VERIFIED | 36 lines pure module |
| `lib/acc/dcAnomalyChecks.ts` | AnomalyError + assertNoAnomalies + DEFAULT_THRESHOLDS | VERIFIED | 108 lines |
| `lib/acc/dcProgressiveBackfill.ts` | planDailySlice + applySliceCompletion + PROJECT_BATCH_LIMIT | VERIFIED | 196 lines pure |
| `lib/acc/dcActivityCsvIngest.ts` | Per-module CSV parser + bot filter + module guard | VERIFIED | 187 lines; isBotActor + csvParse imports confirmed |
| `lib/acc/dcAdminCsvIngest.ts` | ADMIN_CSV_ALLOWLIST + ingestAdminSnapshot + Serializable tx | VERIFIED | 409 lines; allowlist iterates 16 entries; Serializable confirmed |
| `lib/acc/dcIngest.ts` | runDcIngest orchestrator + isKillSwitchActive | VERIFIED | 898 lines; imports all 4 Wave-1 modules |
| `scripts/dc-daily-ingest.cjs` | tsx/cjs entry, kill-switch pre-flight | VERIFIED | 96 lines |
| `scripts/dc-daily-cron.ps1` | Scheduler harness + log dir + 30min timeout | VERIFIED | 90 lines |
| `scripts/wipe-legacy-acc-activity.cjs` | --dry-run + --yes guard | VERIFIED | 75 lines |
| `server/routers/acc-sync.ts` | getDcIngestStatus + getBackfillProgress | VERIFIED | Both procedures present (filename is kebab-case acc-sync.ts; plan referenced accSync.ts — same router export, cosmetic) |
| `components/layout/SyncFreshnessPill.tsx` | DC status query + signIn('autodesk') under tokenExpired | VERIFIED | trpc.accSync.getDcIngestStatus.useQuery (l.53) + signIn under tokenExpired guard (l.67-72) |
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | MODULE_BADGE_COLORS keyed by service | VERIFIED | l.241 const + l.253 ModuleBadge component |
| `.planning/phases/.../RUNBOOK.md` | >=80 lines, covers schtasks/kill-switch/re-auth/logs/errors | VERIFIED | 171 lines |
| `.planning/phases/.../UAT.md` | DECISION line | VERIFIED | Present; PENDING-MANUAL-UAT awaiting Luis |
| `scripts/dev/verify-08-06-killswitch.cjs` | Behavior harness | VERIFIED | Present |
| `scripts/dev/verify-08-07-pill.cjs` | Key-link assertions | VERIFIED | Present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/acc/dcActivityCsvIngest.ts` | `lib/acc/dcKnownBots.ts` | `import { isBotActor }` | WIRED | Line 26 + usage at line 138 |
| `lib/acc/dcAdminCsvIngest.ts` | `lib/acc/dcAnomalyChecks.ts` | `import { assertNoAnomalies }` | WIRED | Line 19 + invocation at line 389 inside $transaction |
| `lib/acc/dcAdminCsvIngest.ts` | `@prisma/client` | `Prisma.TransactionIsolationLevel.Serializable` | WIRED | Line 397 |
| `lib/acc/dcIngest.ts` | `lib/acc/dcProgressiveBackfill.ts` | `planDailySlice / applySliceCompletion` | WIRED | Lines 35-36 + planDailySlice call at l.465; applySliceCompletion at l.791 |
| `lib/acc/dcIngest.ts` | `lib/acc/dcActivityCsvIngest.ts + dcAdminCsvIngest.ts` | named imports | WIRED | l.41 + l.47; ingestActivityCsv called at l.669; ingestAdminSnapshot at l.723 |
| `scripts/dc-daily-ingest.cjs` | `lib/acc/dcIngest.ts` | `require('tsx/cjs') + runDcIngest` | WIRED | l.16 + l.58 + l.63 |
| `components/layout/SyncFreshnessPill.tsx` | `server/routers/acc-sync.ts` | `trpc.accSync.getDcIngestStatus.useQuery()` | WIRED | l.53 + l.57 |
| `components/layout/SyncFreshnessPill.tsx` | `next-auth` | `signIn('autodesk', { callbackUrl })` | WIRED | l.72 inside tokenExpired branch (l.68 guard) |
| `UsersDirectoryClient.tsx (File Activity)` | `AccActivity.service` | `<ModuleBadge service={row.service}/>` | WIRED | l.253-267 component + MODULE_BADGE_COLORS lookup at l.258 |
| Windows Task Scheduler | `scripts/dc-daily-cron.ps1` | `schtasks /Create` (Register-ScheduledTask) | NEEDS HUMAN | Documented in RUNBOOK; install deferred to Luis |

### Requirements Coverage

DC8-01..DC8-17 are NOT registered in `.planning/REQUIREMENTS.md` (confirmed 0 matches). All 8 SUMMARYs flagged this as a phase-setup gap. Per task scope: verified against PLAN frontmatter + CONTEXT.md.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DC8-01 | 08-04 | Per-module activity CSV ingest with service tagging | SATISFIED | `dcActivityCsvIngest.ts` writes `service: module` on every row |
| DC8-02 | 08-02, 08-04 | Bot-actor filter at parse boundary | SATISFIED | `dcKnownBots.ts` + import in activity ingest |
| DC8-03 | 08-04 | 10th-module guard (unknown -> log + skip, no ingest) | SATISFIED | `dcActivityCsvIngest.ts` returns `unknownModule` early; createMany not called |
| DC8-04 | 08-07, 08-08 | Wipe + re-ingest legacy 2,507 AccActivity rows | PARTIAL | Wipe script shipped (08-07); execution deferred to manual UAT (08-08) |
| DC8-05 | 08-01, 08-05 | 16 admin CSVs into new AccDc* tables | SATISFIED | Schema (18 models) + ADMIN_CSV_ALLOWLIST length 16 |
| DC8-06 | 08-05 | Transactional full-replace snapshot | SATISFIED | $transaction with Serializable + assertNoAnomalies inside |
| DC8-07 | 08-03, 08-06 | Progressive breadth-first slice algorithm | SATISFIED | `dcProgressiveBackfill.ts` + orchestrator wiring |
| DC8-08 | 08-01, 08-06 | AccDcIngestRun + AccDcBackfillProgress state | SATISFIED | Models present; orchestrator creates rows |
| DC8-09 | 08-02 | Anomaly auto-quarantine (block tx commit) | SATISFIED | assertNoAnomalies throws inside Serializable tx |
| DC8-10 | 08-06 | Kill-switch via .dc-ingest.disabled flag file | SATISFIED | isKillSwitchActive in lib + script + ps1 layered |
| DC8-11 | 08-03, 08-06 | Quota fallback (graceful 429 abort + resume) | SATISFIED | RunResult status `quota-exceeded` + persist progress (orchestrator) |
| DC8-12 | 08-06, 08-08 | Windows Task Scheduler 03:00 local | PARTIAL | Harness ps1 + RUNBOOK install command shipped; actual schtasks install NEEDS HUMAN |
| DC8-13 | 08-03, 08-06 | Newly-detected projects accelerated backfill | SATISFIED | newProjectFlag in progress model + planDailySlice new-project branch |
| DC8-14 | 08-07 | SyncFreshnessPill DC awareness (state machine + popover) | SATISFIED | Pill extended with DC fields; backfill/quota/diff in popover |
| DC8-15 | 08-07 | Click-to-reauth on tokenExpired | SATISFIED | signIn('autodesk', ...) wired under tokenExpired guard |
| DC8-16 | 08-07 | Module badge chips in File Activity widget | SATISFIED | MODULE_BADGE_COLORS + ModuleBadge component |
| DC8-17 | 08-08 | RUNBOOK.md ships in phase directory | SATISFIED | 171 lines, all 5 keyword checks pass |

**Orphaned requirements:** None (no REQUIREMENTS.md mapping to cross-check).
**Phase-setup gap (NOT implementation gap):** Register DC8-01..DC8-17 in `.planning/REQUIREMENTS.md` retroactively for traceability.

### Anti-Patterns Found

None blocking. Spot-checks of key files for TODO/FIXME/placeholder/stub patterns yielded no anomalies. The `expect.fail('NOT YET IMPLEMENTED')` placeholders from 08-01 were correctly replaced by Wave 1 plans (test files all >50 lines with real assertions).

### Human Verification Required

See frontmatter `human_verification` block. Summary:

1. **Install scheduled task** — `Register-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'` on Luis's PC (elevated PowerShell)
2. **First end-to-end real APS run** — `Start-ScheduledTask` then watch log; expects status='success' in AccDcIngestRun
3. **Visual pill UAT** — hover pill, confirm popover shows backfill/quota/diff, color is green
4. **Visual module-badge UAT** — confirm chips render on File Activity rows after real ingest
5. **Legacy wipe** — `node scripts/wipe-legacy-acc-activity.cjs --yes` AFTER step 3 confirms new pipeline tags `service`; then trigger one more ingest
6. **UAT.md DECISION** — Luis writes APPROVED / GAPS / REVERT (currently PENDING-MANUAL-UAT)

### Gaps Summary

**No implementation gaps.** Every code-side must-have across 8 plans (1 schema + 6 lib modules + 3 scripts + 2 UI surfaces + 2 docs + 2 verifier harnesses) is present, substantive, and wired.

**Deferred (by design, not gaps):**
- Manual UAT steps in 08-08 Task 2 — Windows elevation + 3-leg APS auth + browser eyes are intentionally outside Claude's executor sandbox per project's standing directive (auto-advance, defer human work to phase-end).
- DC8-01..DC8-17 registration in REQUIREMENTS.md — phase-setup gap noted in all 8 SUMMARYs; recommend a one-line follow-up commit registering the IDs for downstream traceability, but does not block phase acceptance.

**Status rationale:** `human_needed` rather than `passed` because the goal explicitly includes "scheduled via Windows Task Scheduler at 03:00 local on Luis's PC" and "legacy 2,507 AccActivity rows wiped + re-ingested" — both require Luis-only operations that have NOT yet executed. All groundwork to enable those operations is shipped and verified.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
