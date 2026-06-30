---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Concerns Hardening
current_phase: 12
current_phase_name: Integration Health & Observability
status: in_progress
stopped_at: Phase 12 plan 12-02 COMPLETE (OBS-02+OBS-03); plan 12-01 (OBS-01) outstanding
last_updated: "2026-06-30T11:40:00.000Z"
last_activity: "2026-06-30 — Plan 12-02 COMPLETE: OBS-02 effective-empty role-resolution warn + OBS-03 stale diagnostic removal. 2 commits (cac1a07e, 72b4079d). tsc clean, 7/7 Vitest pass. mergeRoleNames pure; [ACC-ROLES] warn at loadInstanceView."
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-23)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.1 Concerns Hardening — Phase 12 (Integration Health & Observability)

## Current Position

- **Milestone:** v2.1 — Concerns Hardening (3 of 6 phases complete: 09, 10, 11)
- **Phase:** 12 of 14 — Integration Health & Observability. Phase 11 is complete, verified, and owner-approved on :3000.
- **Plan:** Phase 12 has 2 wave-1 plans: 12-01 (OBS-01 ACCDS session health — outstanding) and 12-02 (OBS-02+OBS-03 — COMPLETE, 12-02-SUMMARY.md created).
- **Status:** Phase 12 in progress — plan 12-02 complete, plan 12-01 outstanding. Milestone v2.1 in progress (Phases 12, 13, 14 remain).
- **Last activity:** 2026-06-30 — Plan 12-02 COMPLETE (OBS-02+OBS-03): shouldWarnEmptyRoleResolution predicate + [ACC-ROLES] warn at loadInstanceView; stale TODO[02.5] diagnostics removed from acc-admin.ts. 2 commits (cac1a07e, 72b4079d).

Progress: [█████░░░░░] 50% (3 of 6 phases complete — 09, 10, 11)

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below). Baseline reset to
  `.planning/` is committed in PROJECT.md/STATE.md; v2.1 builds on it.

## Data Extraction — Verified 2026-06-23

Confirmed read-only against the live local PostgreSQL DB.

### Census (`scripts/count-acc-data.cjs` logic, no-SSL)

| Table / metric | Count |
|----------------|-------|
| AccProject (live API) | 1,153 |
| AccDcProject (Data Connector) | 550 |
| AccFolder | 415,908 |
| AccFolder — sized (contents crawled) | 111,308 |
| AccFolder — total files | 420,096 |
| AccFolder — total size | 3.17 TB |
| AccFolderPermission | 6,040,610 |
| AccProjectMember (live) | 14,566 |
| AccDcProjectUser | 22,835 |
| AccActivity (Data Connector events) | 1,102,030 |
| AccActivityAccds (web-session crawl) | 4,554,785 |
| Distinct projects in AccActivityAccds | 956 |
| Folder-crawl status | 975 ok / 178 inaccessible (= 1,153) |
| Activity by source | project 1,101,159 / admin 871 |
| AccDcIngestRun | 72 |

### Merge integrity (`scripts/verify-accds-merge.cjs`, partitioned mode)

All 5 assertions PASS:

- `accds=4,554,785  dc_backfill=41,714  dc_admin=871`
- Unified total `4,597,370` == merged query `4,597,370` (reconciliation)
- backfill kept (41,714), account-level admin kept (871)
- boundary spot-check (latest-start project) reconciles

### Notes

- Folder total size is **3.17 TB** now vs ~3.4 TB recorded at crawl time — minor
  drift, not a correctness failure.

- All other figures match the recorded activity re-extraction gates to the row (4.55M activity
  rows, 956 projects, 111,308 sized folders).

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.1 scope lock: spatial-graph excluded, guardrails+labels first, research skipped
- Phase 09 starts with DB work + TEST-01 (OOM regression guard) together
- Phase 11 (TRUTH labels) depends on Phase 09 only — independent of boundary fixes
- Phases 13/14 depend on Phase 10 (boundary fixes first, then type guards + char tests)
- Plan 09-01: .env.example committed via !.env.example gitignore exception (opt-in pattern, no secrets)
- Plan 09-01: TEST-01 is a pinning test (OOM fix already shipped); passes immediately in GREEN (expected)
- Plan 09-01: DB-04 guardrail is comment-only on includePermissionContexts branch; no behavior change
- Plan 09-02: DB-01 index applied via pg Client + prisma migrate resolve (not migrate dev — pgvector choke); Bitmap Index Scan proven on low-frequency roleId (count=1)
- Plan 09-02: EXPLAIN ANALYZE chose Bitmap Index Scan (not plain Index Scan) — both confirm acc_folder_permission_role_id_idx is used; success criterion met
- Plan 11-01: TRUTH-04 — mergeRoleNames lives in lib/server/accessInstanceView.ts; AccDcRole empty → AccRole fallback; DC wins on conflict (documented in INTEGRATIONS.md)
- Plan 11-02: AccProject names take precedence over AccDcProject in merged name map (AccProject is live API superset, fresher); fallback = "Unknown project" (never raw GUID); pure resolver exported for Vitest isolation
- Plan 11-02: DB verified — AccProject covers 100% of 956 ACCDS projectIds; AccDcProject covers only 495 (52%); zero residual after merge
- Plan 12-02: OBS-02 — effective-empty predicate shouldWarnEmptyRoleResolution + [ACC-ROLES] warn at loadInstanceView; warns ONLY when both AccDcRole+AccRole yield zero names; by-design AccDcRole-empty alone stays silent
- Plan 12-02: OBS-03 — stale TODO[02.5] diagnostic removal from acc-admin.ts code-grounded; companyRole/lastSignIn resolution intact; field names confirmed 2026-05-18

### Blockers/Concerns

None blocking Phase 12 planning/execution. Key risks to track:

- Run `npx tsc --noEmit` before any rebuild; full `npm run build` must go
  through the Task Scheduler stop/start deploy sequence or
  `node scripts/gsd-self-gate.cjs --rebuild`.
- BND-02/BND-03: spatial-graph-coupled `lib→app` edges are documented-deferred, not fixed.
- Phase 12 OBS-02: `lib/server/acc-hot-cache.ts` does not reference `AccDcRole`;
  place the warning at the verified role-resolution/cache boundary instead of
  following the stale roadmap path blindly.
- Phase 12 OBS-01: ACCDS session state lives in gitignored
  `scratch/acc-session.json`; never print cookie contents while adding health
  visibility.
- **RESOLVED (plan 11-02, 2026-06-30):** "Folder Activity by Role" GUID leak fixed. AccProject (1,153) merged into name resolution. DB verified: AccProject covers all 956 ACCDS projectIds (100%). Fallback = "Unknown project". 7-test Vitest pinned.
- **RESOLVED (plan 11-04, 2026-06-30):** mainCharts.tsx tsc error was already resolved by 11-03's commit 926c57dc. tsc clean confirmed at start and end of 11-04 execution.

## Next Action

Plan 12-02 COMPLETE (OBS-02+OBS-03). Milestone v2.1 continues with **Phase 12 Plan 12-01 — OBS-01 ACCDS session health**.

**Next = execute plan 12-01 (ACCDS session-expiry warning in scripts/progress-monitor.cjs)**.

Phase 12 scope (from ROADMAP): ACCDS session-health in `scripts/progress-monitor.cjs`
(warn before crawl token-refresh), `AccDcRole`-empty warning after cache refresh, and
remove stale `TODO[02.5]` guards. Requirements: OBS-01, OBS-02, OBS-03.

Remaining v2.1 phases after 12: Phase 13 (Type-Safety Guards), Phase 14 (Characterization Tests).

---
*Last updated: 2026-06-30 — Phase 11 complete + verified (4/4 must-haves; 11-VERIFICATION.md, status human_needed→owner-approved) + owner-approved rebuild on :3000 (build exit 0, /api/health 200). Note: `gsd-tools phase complete` again mis-reported is_last_phase:true / next_phase:null / total_phases:3 / status:completed (known CLI bug); STATE frontmatter + body repaired manually to 3 of 6 phases done, milestone in_progress, current_phase 12.*

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 11-data-truthfulness-labels P01 | 1 | 2 tasks | 1 files |
| Phase 11-data-truthfulness-labels P02 | 4 | 3 tasks | 2 files |
| Phase 11 P03 | 6 | 3 tasks | 6 files |
| Phase 11 P04 | 10 | 3 tasks | 6 files |
| Phase 12 P02 | ~15min | 2 tasks | 3 files |

## Session

**Last session:** 2026-06-30T11:40:00.000Z
**Stopped at:** Plan 12-02 COMPLETE (OBS-02+OBS-03 — 2 commits: cac1a07e, 72b4079d); plan 12-01 (OBS-01) outstanding
**Resume file:** .planning/phases/12-integration-health-observability/12-01-PLAN.md
