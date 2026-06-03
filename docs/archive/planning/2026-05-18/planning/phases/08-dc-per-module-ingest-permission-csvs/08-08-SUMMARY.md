---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 08
subsystem: ops-docs
tags: [runbook, uat, scheduler, phase-acceptance, manual-uat]
requires:
  - 08-06-SUMMARY.md  # runDcIngest orchestrator (the thing being scheduled)
  - 08-07-SUMMARY.md  # SyncFreshnessPill (the visual UAT surface) + wipe script (the destructive op)
provides:
  - .planning/phases/08-dc-per-module-ingest-permission-csvs/RUNBOOK.md
  - .planning/phases/08-dc-per-module-ingest-permission-csvs/UAT.md
affects:
  - .planning/STATE.md
  - .planning/ROADMAP.md
tech-stack:
  added: []
  patterns: [docs-only-plan, manual-uat-scaffold, deferred-human-action]
key-files:
  created:
    - .planning/phases/08-dc-per-module-ingest-permission-csvs/RUNBOOK.md
    - .planning/phases/08-dc-per-module-ingest-permission-csvs/UAT.md
    - .planning/phases/08-dc-per-module-ingest-permission-csvs/08-08-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "Per Luis's standing directive (auto-advance, defer manual UAT to phase-end), Task 2 human-action checkpoint was NOT blocked on. Claude shipped the docs (Tasks 1+3 scaffold) and produced an exact copy-pasteable Luis-runnable checklist instead of pausing; Luis owns the schtasks install + visual UAT + wipe execution, with UAT.md DECISION line as the acceptance gate."
  - "UAT.md DECISION line set to PHASE-8-ACCEPT=PENDING-MANUAL-UAT — verdict not fabricated. Luis must manually replace with APPROVED / GAPS / REVERT after running checklist on his PC."
  - "RUNBOOK.md is markdown-only (no screenshots) per CONTEXT.md. 172 lines, covers 11 sections including pause/resume kill-switch, re-auth flow, log locations, 7 common errors, debug invocation, weekly health check, and one-time legacy wipe."
  - "Wipe script invocation deferred to Luis (Pitfall 10): must run only AFTER first successful Phase-8 run validates module-tagged AccActivity rows render correctly in the UI."
metrics:
  duration: 0h 03m
  completed_date: 2026-05-15
  tasks_planned: 3
  tasks_complete_automated: 2  # Task 1 RUNBOOK, Task 3 UAT scaffold
  tasks_deferred_human_action: 1  # Task 2 (install task + run + wipe + DECISION)
---

# Phase 8 Plan 08: Phase 8 Operational Docs + Manual UAT Scaffold Summary

Shipped the operational documentation (RUNBOOK.md) and the manual-UAT scaffold (UAT.md with PENDING-MANUAL-UAT DECISION line) so Luis can install the Windows Scheduled Task + run the validation checklist on his own PC without further Claude involvement; phase 8 is code-complete with manual acceptance gate deferred to Luis.

## What was built

### Task 1 — RUNBOOK.md (commit `e5f83df`)

172-line markdown reference at `.planning/phases/08-dc-per-module-ingest-permission-csvs/RUNBOOK.md`. Sections:

1. What this pipeline does (3-paragraph overview of breadth-first backfill + 16 admin CSVs + 9 activity CSVs).
2. Where it runs (Luis's PC, Task Scheduler, NOT Railway, NOT in-process cron).
3. Files involved (table mapping each `lib/acc/dc*.ts` + `scripts/dc-daily-*` file to its role).
4. How to install the scheduled task (copy-pasteable elevated-PowerShell `Register-ScheduledTask` block + verify + manual-trigger commands).
5. How to pause / resume (quick = `.dc-ingest.disabled` flag file; long = `Disable-ScheduledTask`).
6. How to re-authenticate Autodesk (red pill → click → `signIn` OAuth → next 03:00 picks it up).
7. Log locations (PowerShell harness daily file + DB `AccDcIngestRun` SQL).
8. Common errors and fixes — 7-row table covering 429 quota, 401 token, 504 backend, anomaly quarantine (with `dcAnomalyChecks.ts` threshold pointer), stale lock (with reclaim SQL), unknown-module (with `KNOWN_MODULES` + `MODULE_BADGE_COLORS` registration steps), gray-pill no-runs.
9. Manual debug invocation (`node scripts/dc-daily-ingest.cjs`).
10. Weekly health check (hover pill → green + last-success-<24h + backfill advancing + quota 1-5 + access deltas).
11. One-time legacy wipe steps (Pitfall-10-aware: dry-run first, then `--yes`, then re-trigger).

Verification keywords all present: `Register-ScheduledTask`, `dc-ingest.disabled`, `signIn`, `AccDcIngestRun`, `KNOWN_MODULES`.

### Task 3 (scaffold portion) — UAT.md (commit `60a9b93`)

118-line scaffold at `.planning/phases/08-dc-per-module-ingest-permission-csvs/UAT.md`. Contains:

- PENDING-MANUAL-UAT status banner explaining why Claude couldn't auto-execute (Windows elevation + 3-leg APS session + visual pill inspection unavailable in executor sandbox).
- Manual checklist sections A-E (install task, trigger run, verify dashboard, wipe legacy, run final SQL counts) — every command copy-pasteable.
- 9-row Pass/Fail check table (A → G) Luis fills in after running the checklist.
- Unknown modules SQL snippet for the `unknownModulesSeen` field.
- DECISION line currently `PHASE-8-ACCEPT=PENDING-MANUAL-UAT` with explicit instructions to replace with one of `APPROVED` / `GAPS` / `REVERT`.

### Task 2 — DEFERRED to Luis (human-action checkpoint)

Per Luis's standing directive (`continue with next waves, don't wait for verification, we will verify it at the end` + the spawn-message escalation rules), Task 2 was NOT blocked on. The four genuinely-human steps are documented in UAT.md sections A-D and RUNBOOK.md sections 4 + 11:

| Step | Why human-only | Doc reference |
|------|----------------|---------------|
| Install Windows Scheduled Task | Requires elevated PowerShell on Luis's PC | UAT.md §A, RUNBOOK §4 |
| Trigger first manual run | Requires Luis's 3-leg APS refresh token | UAT.md §B, RUNBOOK §9 |
| Visually verify pill + module badges | Requires Luis's eyes on dashboard | UAT.md §C |
| Run wipe + repopulate | Destructive (Pitfall 10) — must be Luis's gate after C confirms | UAT.md §D, RUNBOOK §11 |
| Replace DECISION line in UAT.md | Verdict not fabricated by Claude | UAT.md DECISION section |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Task 2 reordering / non-blocking treatment**
- **Found during:** initial plan parse vs spawn-message directive
- **Issue:** Plan declares Task 2 as `checkpoint:human-action gate="blocking"` and Task 3 says "BEFORE pausing in Task 2, create the UAT.md scaffold"; literal interpretation would have us pause indefinitely waiting for Luis.
- **Fix:** Per spawn-message directive, executed Task 1 (RUNBOOK), then the scaffold portion of Task 3 (UAT.md as PENDING-MANUAL-UAT), then deferred Task 2's manual ops to Luis with full doc support. Phase plan is therefore complete-with-deferred-manual-tasks rather than blocked.
- **Files modified:** none (process deviation only)
- **Commit:** N/A

### Out-of-scope discoveries (none)

No additional deferred items to log.

## Authentication Gates

None during this plan. Plan is docs-only — no APS calls made.

The first **scheduled** run on Luis's PC will exercise the auth path; if his refresh token has decayed since the last DC interaction (2026-05-13), he'll see a red pill on first dashboard load and need to click-to-reauth per RUNBOOK §6.

## Phase 8 — Status at end of plan 08

Code paths shipped (waves 1-5 across plans 08-01 → 08-08):
- Schema: `AccDc*` tables + `AccDcIngestRun` + `AccDcBackfillProgress` (08-01).
- Library modules: `dcIngest`, `dcAdminCsvIngest`, `dcActivityCsvIngest`, `dcAnomalyChecks`, `dcBackfillScheduler` (08-02 → 08-05).
- Orchestrator entry: `scripts/dc-daily-ingest.cjs` + `scripts/dc-daily-cron.ps1` (08-06).
- Visibility: `SyncFreshnessPill` DC-aware + module badge chips + `wipe-legacy-acc-activity.cjs` (08-07).
- Operational docs + UAT scaffold (08-08, this plan).

**Manual gate remaining:** Luis runs UAT.md checklist sections A-D and writes the DECISION line. Phase 8 ROADMAP row stays at "code-complete; manual UAT pending" until that line lands.

## Self-Check: PASSED

Verified files exist:
- FOUND: `.planning/phases/08-dc-per-module-ingest-permission-csvs/RUNBOOK.md` (172 lines, all 5 keywords present)
- FOUND: `.planning/phases/08-dc-per-module-ingest-permission-csvs/UAT.md` (DECISION line present, token = PENDING-MANUAL-UAT)
- FOUND: `.planning/phases/08-dc-per-module-ingest-permission-csvs/08-08-SUMMARY.md` (this file)

Verified commits exist:
- FOUND: `e5f83df` docs(08-08): ship RUNBOOK.md for Phase 8 ingest operations
- FOUND: `60a9b93` docs(08-08): scaffold UAT.md with PENDING-MANUAL-UAT DECISION line
